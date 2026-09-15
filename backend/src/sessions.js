'use strict';

// Store de sessões com persistência durável.
//
// Por que existe: um `new Map()` morre junto com o processo. No Render, qualquer
// restart/redeploy zera o Map e todo mundo é chutado para o login. Aqui:
//
//   • Com DATABASE_URL (Supabase no Render): a tabela `sessions` é a fonte da
//     verdade e este módulo funciona como cache de leitura. O token sumiu do
//     cache? get() reidrata do banco. O servidor caiu? O token continua no
//     Supabase — o login sobrevive ao restart.
//   • Sem DATABASE_URL (dev local): persiste em backend/sessions.json com
//     gravação atômica (escreve no .tmp e renomeia — nunca sobra JSON pela metade).
//
// A API é a de um Map (get/set/delete/size), então nenhuma rota precisou mudar.
// get() e delete() são async porque podem falar com o banco.

const fs = require("fs");
const path = require("path");
const { getPool, usingPostgres } = require("./config/database");

const FILE = path.join(__dirname, "..", "sessions.json");
const FLUSH_INTERVAL_MS = 30 * 1000;   // limpa vencidas + grava pendências
const REVALIDATE_MS = 60 * 1000;       // reconfere o cache contra o banco (logout em outra instância)
const UPSERT_MAX_ATTEMPTS = 5;         // desiste de gravar um token no banco após N falhas
const SHUTDOWN_GRACE_MS = 2000;        // espera máxima pelas gravações ao desligar

// Mesma consulta do requireAuth antigo: token → usuário → cargo.
const SELECT_SESSION = `
    SELECT s.token, s.expires_at, u.username, u.name, u.email, u.theme, r.name AS role
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE s.token = $1 LIMIT 1`;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class SessionStore {
    constructor() {
        this.map = new Map();        // token → sessão (cache de leitura)
        this.pending = new Map();    // token → { session, attempts } aguardando upsert
        this.inflight = new Set();   // escritas em andamento (esperadas no shutdown)
        this.dirty = false;          // há mudanças para gravar no arquivo (modo JSON)
        this.permissionLoader = null;
        this.drainTimer = null;      // agendador da descarga imediata da fila (Postgres)

        if (!usingPostgres()) this.loadFromFile();

        this.timer = setInterval(() => {
            this.purge();
            this.flush();
        }, FLUSH_INTERVAL_MS);
        if (this.timer.unref) this.timer.unref(); // não segura o processo vivo só por causa do timer

        this.bindShutdown();
    }

    // Permissões vêm das tabelas de RBAC (injetado pelo server.js: permissionsForRole).
    setPermissionLoader(fn) { this.permissionLoader = fn; }

    // ── leitura ────────────────────────────────────────────────
    async get(token) {
        if (!token) return undefined;
        const cached = this.map.get(token);
        if (cached) {
            if (this.isExpired(cached)) { this.delete(token); return undefined; }
            // Multi-instância: outra instância pode ter apagado o token (logout).
            // Reconfere no banco a cada 60s SEM bloquear a resposta atual — mas
            // só para sessões que já existem no Supabase (pg=true após o upsert),
            // senão uma sessão recém-criada levaria "delete" antes de persistir.
            if (usingPostgres() && cached.pg && Date.now() - (cached.checkedAt || 0) > REVALIDATE_MS) {
                cached.checkedAt = Date.now();
                this.revalidate(token).catch(() => {});
            }
            return cached;
        }
        if (!usingPostgres()) return undefined;
        return this.rehydrate(token);
    }

    // Cache frio → Supabase. É o que mantém o login vivo após um restart.
    async rehydrate(token) {
        try {
            const r = await getPool().query(SELECT_SESSION, [token]);
            const row = r.rows[0];
            if (!row) return undefined;
            const expiresAt = new Date(row.expires_at).getTime();
            if (!(expiresAt > Date.now())) { this.pgDelete(token); return undefined; }
            let permissions;
            if (this.permissionLoader) {
                try { permissions = await this.permissionLoader(row.role); } catch (_) { permissions = undefined; }
            }
            const session = {
                usuario: row.username, nome: row.name, email: row.email,
                tipo: row.role, role: row.role, theme: row.theme || "light",
                permissions, expiresAt, pg: true, checkedAt: Date.now()
            };
            this.map.set(token, session);
            return session;
        } catch (_) {
            return undefined; // banco fora do ar → 401 (mesmo comportamento de antes)
        }
    }

    // Logout na instância A precisa matar a sessão na instância B.
    async revalidate(token) {
        try {
            const r = await getPool().query(`SELECT expires_at FROM sessions WHERE token = $1`, [token]);
            const row = r.rows[0];
            if (!row || new Date(row.expires_at).getTime() <= Date.now()) this.map.delete(token);
        } catch (_) { /* banco fora do ar: mantém o cache, não derruba ninguém */ }
    }

    // ── escrita (mesma assinatura do Map) ──────────────────────
    set(token, session) {
        if (!token || !session) return this;
        this.map.set(token, session);
        if (usingPostgres()) {
            this.pending.set(token, { session, attempts: 0 }); // upsert com retry
            this.scheduleDrain(); // aterrissa no Supabase quase na hora do login
        } else {
            this.dirty = true;
        }
        return this;
    }


    // Renova a validade (chamado a cada requisição autenticada): atualiza o
    // cache e, em produção, o expires_at no Supabase. Antes disso a renovação
    // nunca chegava ao banco e um token ativo "morria" no restart.
    touch(token, session) {
        if (!token || !session) return;
        session.checkedAt = Date.now();
        this.map.set(token, session);
        if (usingPostgres()) {
            this.track(this.pgQuery(
                `UPDATE sessions SET expires_at = $2 WHERE token = $1`,
                [token, new Date(session.expiresAt).toISOString()]
            ));
        } else {
            this.dirty = true; // o flush periódico (ou o shutdown) grava a renovação
        }
    }

    async delete(token) {
        const removed = this.map.delete(token);
        this.pending.delete(token);
        if (usingPostgres()) {
            this.pgDelete(token); // logout vale em todas as instâncias
            return removed;
        }
        if (removed) this.dirty = true;
        return removed;
    }

    get size() { return this.map.size; }

    // ── manutenção ─────────────────────────────────────────────
    isExpired(session) { return !session || !session.expiresAt || session.expiresAt <= Date.now(); }

    purge() {
        const antes = this.map.size;
        for (const [token, session] of this.map) {
            if (this.isExpired(session)) {
                this.map.delete(token);
                this.pending.delete(token);
            }
        }
        if (usingPostgres()) {
            // vencidas saem do Supabase também — a tabela não cresce pra sempre
            this.track(this.pgQuery(`DELETE FROM sessions WHERE expires_at < NOW()`));
        } else if (this.map.size !== antes) {
            this.dirty = true;
        }
    }

    flush() {
        if (usingPostgres()) { this.drainPending(); return; }
        if (!this.dirty) return;
        try {
            const tmp = FILE + ".tmp";
            fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.map), null, 2));
            fs.renameSync(tmp, FILE); // troca atômica: ou o arquivo antigo inteiro ou o novo inteiro
            this.dirty = false;
        } catch (err) {
            console.warn("[sessions] falha ao gravar sessions.json:", err.message);
        }
    }

    drainPending() {
        if (this.drainTimer) { clearTimeout(this.drainTimer); this.drainTimer = null; }
        for (const [token, entry] of [...this.pending]) {
            this.pending.delete(token);
            const p = this.upsert(token, entry.session)
                .then(() => { entry.session.pg = true; })
                .catch(() => {
                    entry.attempts += 1;
                    if (entry.attempts < UPSERT_MAX_ATTEMPTS) this.pending.set(token, entry);
                    else console.warn(`[sessions] desistindo do token ${String(token).slice(0, 8)}… após ${entry.attempts} tentativas`);
                });
            this.track(p);
        }
    }

    // Descarrega a fila de upserts ~250ms depois da última escrita (coalescido),
    // em vez de esperar o ciclo de 30s — a sessão chega ao Supabase logo após
    // o login, e o shutdown continua cobrindo o caso de morte súbita.
    scheduleDrain() {
        if (this.drainTimer) return;
        this.drainTimer = setTimeout(() => {
            this.drainTimer = null;
            this.flush();
        }, 250);
        if (this.drainTimer.unref) this.drainTimer.unref();
    }

    // token + usuário → linha na tabela sessions do Supabase.
    // Mesma resolução de usuário do antigo persistSession (username OU e-mail).
    async upsert(token, session) {
        const identifier = String(session.usuario || session.email || "").trim();
        if (!identifier) return;
        const pool = getPool();
        const u = await pool.query(
            `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
            [identifier]
        );
        const userId = u.rows[0] && u.rows[0].id;
        if (!userId) return; // usuário não existe no Postgres; sessão segue só no cache
        await pool.query(
            `INSERT INTO sessions (token, user_id, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
            [token, userId, new Date(session.expiresAt).toISOString()]
        );
    }

    // ── infraestrutura ─────────────────────────────────────────
    pgQuery(text, params) {
        const pool = getPool();
        if (!pool) return Promise.resolve();
        return pool.query(text, params);
    }

    pgDelete(token) {
        this.track(this.pgQuery(`DELETE FROM sessions WHERE token = $1`, [token]));
    }

    // Registra a promessa para o shutdown esperar; engole rejeições, porque
    // sessão é melhor-esforço: falha de gravação nunca pode derrubar a rota.
    track(promise) {
        this.inflight.add(promise);
        Promise.resolve(promise).catch(() => {}).then(() => { this.inflight.delete(promise); });
    }

    loadFromFile() {
        try {
            const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
            for (const [token, session] of Object.entries(raw)) {
                if (!this.isExpired(session)) this.map.set(token, session);
            }
        } catch (_) { /* arquivo ausente ou corrompido: começa limpo */ }
    }

    bindShutdown() {
        let done = false;
        const shutdown = async () => {
            if (done) return;
            done = true;
            try {
                if (usingPostgres()) {
                    this.drainPending();
                    // dá até 2s para o Supabase receber o que está pendente
                    await Promise.race([Promise.allSettled([...this.inflight]), delay(SHUTDOWN_GRACE_MS)]);
                } else {
                    this.flush(); // grava o que mudou desde o último ciclo
                }
            } catch (_) {}
            process.exit(0);
        };
        process.on("SIGINT", shutdown);   // Ctrl+C
        process.on("SIGTERM", shutdown);  // é o que Render/PM2/Docker mandam
    }
}

module.exports = new SessionStore();

