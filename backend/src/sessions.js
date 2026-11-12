'use strict';

// Store de sessões com persistência durável.
//
// Por que existe: um `new Map()` morre junto com o processo. No Render, qualquer
// restart/redeploy zera o Map e todo mundo é chutado para o login. Aqui:
//
//   • Com DATABASE_URL (PostgreSQL no Render): a tabela `sessions` é a fonte da
//     verdade e este módulo funciona como cache de leitura. O token sumiu do
//     cache? get() reidrata do banco. O servidor caiu? O token continua no
//     PostgreSQL — o login sobrevive ao restart.
//   • Sem DATABASE_URL (dev local): persiste em backend/sessions.json com
//     gravação atômica (escreve no .tmp e renomeia — nunca sobra JSON pela metade).
//
// Store de sessões: persistência JSON em desenvolvimento e PostgreSQL em produção.
// get() e delete() são async porque podem falar com o banco.

const fs = require("fs");
const path = require("path");
const { getPool, usingPostgres } = require("./config/database");

const FILE = path.join(__dirname, "..", "sessions.json");
const FLUSH_INTERVAL_MS = 30 * 1000;   // limpeza periódica + flush do JSON local
const SHUTDOWN_GRACE_MS = 2000;        // espera máxima pelas gravações ao desligar

// Mesma consulta do requireAuth antigo: token → usuário → cargo.
const SELECT_SESSION = `
    SELECT s.token, s.expires_at, u.username, u.name, u.email, u.theme, u.unit, COALESCE(r.name, u.role) AS role
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE s.token = $1 AND u.active = TRUE LIMIT 1`;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class SessionStore {
    constructor() {
        this.map = new Map();        // token → sessão (cache de leitura)
        this.inflight = new Set();   // escritas em andamento (esperadas no shutdown)
        this.dirty = false;          // há mudanças para gravar no arquivo (modo JSON)

        if (!usingPostgres()) this.loadFromFile();

        this.timer = setInterval(() => {
            this.purge();
            this.flush();
        }, FLUSH_INTERVAL_MS);
        if (this.timer.unref) this.timer.unref(); // não segura o processo vivo só por causa do timer

        this.bindShutdown();
    }

    // ── leitura ────────────────────────────────────────────────
    async get(token) {
        if (!token) return undefined;
        if (usingPostgres()) {
            // Em produção, revalida sessão, usuário ativo e papel no banco em
            // toda requisição protegida. Logout, bloqueio e troca de papel
            // passam a valer imediatamente entre instâncias.
            return this.rehydrate(token);
        }
        const cached = this.map.get(token);
        if (!cached || this.isExpired(cached)) {
            this.map.delete(token);
            return undefined;
        }
        return cached;
    }

    // Cache frio → PostgreSQL. É o que mantém o login vivo após um restart.
    async rehydrate(token) {
        const pool = getPool();
        if (!pool) throw new Error("Banco de sessões indisponível");
        const r = await pool.query(SELECT_SESSION, [token]);
        const row = r.rows[0];
        if (!row) {
            this.map.delete(token);
            return undefined;
        }
        const expiresAt = new Date(row.expires_at).getTime();
        if (!(expiresAt > Date.now())) {
            this.pgDelete(token);
            return undefined;
        }
        const session = {
            usuario: row.username, nome: row.name, email: row.email,
            tipo: row.role, role: row.role, theme: row.theme || "light",
            setor: row.unit || null, expiresAt
        };
        this.map.set(token, session);
        return session;
    }

    // ── escrita ─────────────────────────────────────────────────
    // Cria a sessão no PostgreSQL antes de devolver o cookie ao cliente.
    // A leitura revalida no banco a cada requisição; portanto, uma sessão
    // recém-criada não pode depender do flush assíncrono da fila.
    async persist(token, session) {
        if (!token || !session) throw new Error("Token ou sessão inválidos");
        this.map.set(token, session);
        if (usingPostgres()) {
            const operation = this.upsert(token, session);
            this.track(operation);
            await operation;
        } else {
            this.dirty = true;
        }
        return this;
    }

    // Renova a validade (chamado a cada requisição autenticada): atualiza o
    // cache e, em produção, o expires_at no PostgreSQL. Antes disso a renovação
    // nunca chegava ao banco e um token ativo "morria" no restart.
    async touch(token, session) {
        if (!token || !session) return;
        this.map.set(token, session);
        if (usingPostgres()) {
            const operation = this.pgQuery(
                `UPDATE sessions SET expires_at = $2 WHERE token = $1`,
                [token, new Date(session.expiresAt).toISOString()]
            );
            this.track(operation);
            await operation;
        } else {
            this.dirty = true; // o flush periódico (ou o shutdown) grava a renovação
        }
    }

    async delete(token) {
        const removed = this.map.delete(token);
        if (usingPostgres()) {
            await this.pgDelete(token); // logout só confirma após revogar no banco
            return removed;
        }
        if (removed) this.dirty = true;
        return removed;
    }

    // Revoga as sessões da conta após redefinição administrativa de senha.
    async deleteForUser(username, email) {
        const identifiers = [...new Set([username, email]
            .filter(Boolean)
            .map(value => String(value).trim().toLowerCase())
            .filter(Boolean))];
        let removed = 0;
        for (const [token, session] of this.map) {
            const sessionIdentifiers = [session.usuario, session.email]
                .filter(Boolean)
                .map(value => String(value).trim().toLowerCase());
            if (sessionIdentifiers.some(value => identifiers.includes(value))) {
                this.map.delete(token);
                removed += 1;
                if (!usingPostgres()) this.dirty = true;
            }
        }
        if (usingPostgres() && identifiers.length) {
            await this.pgQuery(
                `DELETE FROM sessions s USING users u
                 WHERE s.user_id = u.id
                   AND (LOWER(u.username) = ANY($1::text[])
                     OR LOWER(COALESCE(u.email, '')) = ANY($1::text[]))`,
                [identifiers]
            );
        }
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
            }
        }
        if (usingPostgres()) {
            // vencidas saem do PostgreSQL também — a tabela não cresce pra sempre
            this.track(this.pgQuery(`DELETE FROM sessions WHERE expires_at < NOW()`));
        } else if (this.map.size !== antes) {
            this.dirty = true;
        }
    }

    flush() {
        if (usingPostgres()) return;
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

    // token + usuário → linha na tabela sessions do PostgreSQL.
    // Mesma resolução de usuário do antigo persistSession (username OU e-mail).
    async upsert(token, session) {
        const identifier = String(session.usuario || session.email || "").trim();
        if (!identifier) throw new Error('Identificador do usuário da sessão ausente');
        const pool = getPool();
        const u = await pool.query(
            `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
            [identifier]
        );
        const userId = u.rows[0] && u.rows[0].id;
        if (!userId) throw new Error('Usuário da sessão não existe no PostgreSQL');
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
        const operation = this.pgQuery(`DELETE FROM sessions WHERE token = $1`, [token]);
        this.track(operation);
        return operation;
    }

    // Registra operações PostgreSQL para o shutdown aguardar. O chamador de
    // persist() continua recebendo a rejeição e pode negar o login.
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
                    // dá até 2s para concluir gravações/revogações já iniciadas
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

