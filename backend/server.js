const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const multer = require("multer");

// Carrega variáveis de ambiente locais do arquivo .env (não é usado no Render —
// lá as variáveis são definidas nas Environment Variables do serviço).
// O arquivo .env é ignorado pelo Git; nunca insira chaves reais no código.
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});
app.use(express.json({ limit: "100kb" }));

//frontend
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/screenshots", express.static(path.join(__dirname, "../docs/screenshots")));

//uploads
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

// camada de persistência (db.json) reutilizada
const { readDB, writeDB, ROLE_PERMISSIONS, store, usingPostgres, getPool } = require("./src/db");

const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;

function normalizeRole(role) {
    const raw = String(role || "").trim().toLowerCase();
    const aliases = {
        cardiologista: "cardiologist",
        cardiologo: "cardiologist",
        cardiologist: "cardiologist",
        medico: "medico",
        enfermeiro: "enfermagem",
        enfermagem: "enfermagem",
        farmacia: "farmacia",
        recepcao: "recepcao",
        atendimento: "atendimento",
        triagem: "triagem",
        direcao: "direcao",
        admin: "admin"
    };
    return aliases[raw] || raw || "atendimento";
}

function permissionsFor(role) {
    const normalized = normalizeRole(role);
    if (ROLE_PERMISSIONS[normalized]) return ROLE_PERMISSIONS[normalized];
    return ROLE_PERMISSIONS[normalized?.toLowerCase()] || [];
}

function sessionCan(session, perm) {
    if (!session) return false;
    const perms = session.permissions || permissionsFor(session.role || session.tipo);
    return perms.includes("*") || perms.includes(perm);
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH).toString("hex");
    return `scrypt$${salt}$${hash}`;
}

function passwordMatches(password, storedPassword) {
    if (typeof storedPassword !== "string" || !storedPassword.startsWith("scrypt$")) {
        return String(password) === String(storedPassword);
    }

    const [, salt, expectedHex] = storedPassword.split("$");
    if (!salt || !expectedHex) return false;

    const actual = crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH);
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function parseCookies(header = "") {
    return Object.fromEntries(header.split(";").map(part => {
        const index = part.indexOf("=");
        return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }).filter(([key]) => key));
}

function requireAuth(roles = []) {
    // Backend é a autoridade: esconder botão NUNCA é segurança.
    // Toda rota valida: usuário → sessão → role → permissão → rota.
    return async (req, res, next) => {
        const token = parseCookies(req.headers.cookie).sentinela_session;
        let session = token && sessions.get(token);

        // Sessão também pode estar no Postgres (Render com múltiplas instâncias)
        if (!session && token && usingPostgres()) {
            try {
                const pool = getPool();
                const r = await pool.query(
                    `SELECT s.token, s.expires_at, u.username, u.name, u.email, u.theme, r.name AS role
                     FROM sessions s JOIN users u ON u.id = s.user_id
                     LEFT JOIN roles r ON r.id = u.role_id
                     WHERE s.token = $1 LIMIT 1`, [token]);
                const row = r.rows[0];
                if (row && new Date(row.expires_at).getTime() > Date.now()) {
                    const perms = await permissionsForRole(row.role);
                    session = { usuario: row.username, nome: row.name, email: row.email, tipo: row.role, role: row.role, theme: row.theme || "light", permissions: perms, expiresAt: new Date(row.expires_at).getTime(), pg: true };
                    sessions.set(token, session);
                }
            } catch (_) { /* cai para 401 abaixo */ }
        }

        if (!session || session.expiresAt <= Date.now()) {
            if (token) sessions.delete(token);
            return res.status(401).json({ erro: "Autenticação necessária" });
        }

        const sessionRole = normalizeRole(session.role || session.tipo);
        const sessionPerms = Array.isArray(session.permissions) ? session.permissions : permissionsFor(sessionRole);
        const requestedRoles = roles.map(normalizeRole);

        const hasWildcardPermission = sessionPerms.includes("*");
        const roleAllowed = requestedRoles.length === 0 || hasWildcardPermission || requestedRoles.includes(sessionRole);

        if (roles.length && !roleAllowed) {
            return res.status(403).json({ erro: "Perfil sem permissão para esta operação" });
        }

        session.expiresAt = Date.now() + SESSION_TTL_MS;
        if (session.pg && usingPostgres()) {
            try { await getPool().query(`UPDATE sessions SET expires_at = NOW() + INTERVAL '8 hours' WHERE token = $1`, [token]); } catch (_) {}
        }
        req.user = session;
        next();
    };
}

async function permissionsForRole(role) {
    const normalized = normalizeRole(role);
    if (!usingPostgres()) return permissionsFor(normalized);
    try {
        const pool = getPool();
        const r = await pool.query(
            `SELECT p.name FROM permissions p
             JOIN role_permissions rp ON rp.permission_id = p.id
             JOIN roles r ON r.id = rp.role_id WHERE r.name = $1`, [normalized]);
        if (r.rows.length) return r.rows.map(x => x.name);
    } catch (_) {}
    return permissionsFor(normalized);
}

async function persistSession(token, userIdentifier, session) {
    if (!usingPostgres()) return;
    try {
        const pool = getPool();
        const identifier = String(userIdentifier || session.usuario || session.email || "").trim();
        if (!identifier) return;
        const existingUser = await pool.query(
            `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
            [identifier]
        );
        if (!existingUser.rows[0]) return;
        await pool.query(
            `INSERT INTO sessions (token, user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '8 hours')
             ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
            [token, existingUser.rows[0].id]
        );
    } catch (_) {
        // sessão continua em memória se o banco não estiver disponível; nunca quebra login
    }
}

// ── RBAC novo: requirePermission("prescriptions.write") ──
// O cargo vem da conta (role), o usuário NÃO escolhe no login.
function requirePermission(...perms) {
    return async (req, res, next) => {
        const token = parseCookies(req.headers.cookie).sentinela_session;
        let session = token && sessions.get(token);

        if (!session && token && usingPostgres()) {
            try {
                const pool = getPool();
                const r = await pool.query(
                    `SELECT s.token, s.expires_at, u.username, u.name, u.email, u.theme, r.name AS role
                     FROM sessions s JOIN users u ON u.id = s.user_id
                     LEFT JOIN roles r ON r.id = u.role_id
                     WHERE s.token = $1 LIMIT 1`, [token]);
                const row = r.rows[0];
                if (row && new Date(row.expires_at).getTime() > Date.now()) {
                    session = { usuario: row.username, nome: row.name, email: row.email, tipo: row.role, role: row.role, theme: row.theme || "light", permissions: await permissionsForRole(row.role), expiresAt: new Date(row.expires_at).getTime(), pg: true };
                    sessions.set(token, session);
                }
            } catch (_) {}
        }

        if (!session || session.expiresAt <= Date.now()) {
            if (token) sessions.delete(token);
            return res.status(401).json({ erro: "Autenticação necessária" });
        }

        // Permissões vêm do banco (role_permissions) quando Postgres; do mapa quando JSON
        let effective = session.permissions;
        if (usingPostgres()) effective = await permissionsForRole(session.role || session.tipo);
        const ok = perms.every(p => effective.includes("*") || effective.includes(p));
        if (!ok) {
            return res.status(403).json({ erro: "Sem permissão para esta operação" });
        }

        session.expiresAt = Date.now() + SESSION_TTL_MS;
        req.user = session;
        next();
    };
}

function validateCpf(cpf) {
    return /^\d{11}$/.test(String(cpf).replace(/\D/g, ""));
}

function mapUserRecord(user) {
    const role = normalizeRole(user.role || user.tipo || "atendimento");
    return {
        id: user.id || user.usuario,
        usuario: user.usuario,
        nome: user.nome || user.usuario,
        email: user.email || null,
        role,
        tipo: role,
        setor: user.setor || null,
        ativo: user.ativo !== false,
        theme: user.theme || "light",
        mustChangePassword: !!user.mustChangePassword,
        permissions: Array.isArray(user.permissions) ? user.permissions : permissionsFor(role)
    };
}


const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || "";
        cb(null, `foto_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
    }
});

const uploadFoto = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
    }
});

function audit(req, acao, detalhes = {}) {
    try {
        const db = readDB();
        if (!Array.isArray(db.auditoria)) db.auditoria = [];
        db.auditoria.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            quando: new Date().toISOString(),
            usuario: req.user ? req.user.usuario : "anonimo",
            perfil: req.user ? req.user.tipo : "-",
            acao,
            detalhes,
            ip: req.ip
        });
        // mantém trilha enxuta (últimos 2000 eventos)
        if (db.auditoria.length > 2000) db.auditoria = db.auditoria.slice(-2000);
        writeDB(db);
    } catch (_) { /* auditoria nunca deve quebrar o fluxo */ }
}

// ── Safety Engine (regras configuráveis, NÃO diagnostica) ──
// Toda decisão clínica continua sendo do profissional. O motor apenas
// aponta possíveis inconsistências a partir dos registros.
function safetyCheck({ paciente, triagem, prescricao }) {
    const alertas = [];
    const norm = (s) => String(s || "").trim().toLowerCase();

    // 1. Alergia x medicação prescrita
    const alergiaTxt = norm(triagem?.alergia || paciente?.alergias);
    const medTxt = norm(prescricao?.medicacao);
    if (alergiaTxt && alergiaTxt !== "nenhuma" && alergiaTxt !== "-" && medTxt) {
        const termos = alergiaTxt.split(/[,;/]+/).map(t => t.trim()).filter(Boolean);
        if (termos.some(t => t.length >= 3 && medTxt.includes(t))) {
            alertas.push({
                nivel: "CRITICO",
                regra: "alergia",
                mensagem: "Possível conflito com alergia registrada. Revisão obrigatória antes de dispensar.",
                contexto: { alergia: triagem?.alergia, medicacao: prescricao?.medicacao }
            });
        }
    }

    // 2. Medicamento de alto risco (ex.: anticoagulantes — cardiologia)
    const altoRisco = ["varfarina", "rivaroxabana", "apixabana", "dabigatrana", "edoxabana", "heparina", "enoxaparina", "clopidogrel", "ticagrelor", "amiodarona", "digoxina", "insulina"];
    if (altoRisco.some(m => medTxt.includes(m))) {
        alertas.push({
            nivel: "ALTO",
            regra: "alto_risco",
            mensagem: "Medicamento de alto risco (protocolo cardiológico). Confirmar dose, indicação registrada e monitoramento.",
            contexto: { medicacao: prescricao?.medicacao }
        });
    }

    // 3. Duplicidade (mesmo texto de medicação já prescrito e ativo)
    try {
        const db = readDB();
        const dup = (db.consultas || []).find(c =>
            String(c.pacienteCpf) === String(paciente?.cpf) &&
            norm(c.medicacao) && norm(c.medicacao) === medTxt
        );
        if (dup && medTxt) {
            alertas.push({
                nivel: "ATENCAO",
                regra: "duplicidade",
                mensagem: "Medicação já registrada para este paciente. Verificar se é continuidade ou duplicidade.",
                contexto: { consultaAnterior: dup.id }
            });
        }
    } catch (_) {}

    // 4. Dados incompletos
    if (!medTxt || !norm(prescricao?.diagnostico)) {
        alertas.push({
            nivel: "ATENCAO",
            regra: "dados_incompletos",
            mensagem: "Prescrição com informação obrigatória ausente (diagnóstico/medicação).",
            contexto: {}
        });
    }

    // 5. Sinais que exigem avaliação imediata (NÃO é diagnóstico)
    const temp = Number(triagem?.temperatura);
    if (!Number.isNaN(temp) && triagem?.temperatura !== "" && triagem?.temperatura != null && (temp >= 39 || temp < 35)) {
        alertas.push({
            nivel: "ALTO",
            regra: "sinal_critico",
            mensagem: "Sinal registrado exige avaliação clínica imediata (temperatura fora da faixa).",
            contexto: { temperatura: triagem?.temperatura }
        });
    }

    return alertas;
}

// ── Assistente IA (baseado em regras + prontuário; sem diagnóstico) ──
function buildLocalClinicalSummary(paciente, triagens, consultas, atendimentos) {
    const nome = paciente?.nome || "Paciente";
    const alergia = (triagens.slice(-1)[0]?.alergia) || "não informada";
    const nConsultas = consultas.length;
    const nTriagens = triagens.length;
    const ultConsulta = consultas.slice(-1)[0];
    const meds = [...new Set(consultas.map(c => String(c.medicacao || "").trim()).filter(Boolean))];
    const inconsistencias = [];
    if (alergia && alergia.toLowerCase() !== "nenhuma") {
        const conflito = consultas.find(c =>
            String(c.medicacao || "").toLowerCase().includes(String(alergia).toLowerCase().split(/[,;/]/)[0].trim())
            && String(alergia).trim().length >= 3
        );
        if (conflito) inconsistencias.push(`Divergência: medicação "${conflito.medicacao}" x alergia registrada "${alergia}" (consulta ${new Date(conflito.createdAt).toLocaleDateString("pt-BR")}). Recomenda-se revisão.`);
    }
    if (meds.length >= 5) inconsistencias.push(`Polifarmácia: ${meds.length} medicamentos distintos registrados. Revisar interações.`);
    if (!ultConsulta && nTriagens > 0) inconsistencias.push("Há triagem sem consulta vinculada — verificar fila médica.");

    let texto = `${nome}: ${nTriagens} triagem(ns), ${nConsultas} consulta(s). `;
    texto += `Alergia registrada: ${alergia}. `;
    if (meds.length) texto += `Medicamentos ativos/registrados: ${meds.slice(0, 5).join("; ")}. `;
    if (ultConsulta) texto += `Último registro: ${ultConsulta.diagnostico || "sem diagnóstico"} em ${new Date(ultConsulta.createdAt).toLocaleDateString("pt-BR")}. `;
    texto += `Fonte: prontuário do paciente. Esta análise é um apoio e não substitui avaliação clínica.`;
    return { resumo: texto, inconsistencias, geradoEm: new Date().toISOString() };
}

function normalizeAiPayload(content) {
    try {
        const parsed = JSON.parse(String(content || "").trim());
        if (parsed && typeof parsed === "object" && parsed.resumo) {
            return {
                resumo: parsed.resumo,
                inconsistencias: Array.isArray(parsed.inconsistencias) ? parsed.inconsistencias : [],
                geradoEm: parsed.geradoEm || new Date().toISOString()
            };
        }
    } catch (_) {}

    return {
        resumo: String(content || "").trim() || "Resumo não disponível no momento.",
        inconsistencias: [],
        geradoEm: new Date().toISOString()
    };
}

async function resumoIA(paciente, triagens, consultas, atendimentos) {
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = process.env.AI_API_URL || "https://api.aimlapi.com/chat/completions";
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    const localSummary = buildLocalClinicalSummary(paciente, triagens, consultas, atendimentos);

    if (!apiKey) {
        return localSummary;
    }

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content: "Você é o Sentinela AI, um assistente clínico de apoio para cardiologia. Sua tarefa é resumir o prontuário do paciente de forma objetiva, sem diagnosticar, sem substituir avaliação médica, e apontar apenas inconsistências relevantes. Responda em português do Brasil e, se possível, em JSON com as chaves resumo e inconsistencias."
                    },
                    {
                        role: "user",
                        content: JSON.stringify({
                            paciente: {
                                nome: paciente?.nome || "Paciente",
                                cpf: paciente?.cpf || "-",
                                status: paciente?.status || "-"
                            },
                            triagens: triagens.slice(-6),
                            consultas: consultas.slice(-8),
                            atendimentos: atendimentos.slice(-5)
                        }, null, 2)
                    }
                ],
                temperature: 0.35,
                max_tokens: 600
            })
        });

        if (!response.ok) {
            throw new Error(`AI request failed: ${response.status}`);
        }

        const payload = await response.json();
        const aiContent = payload.choices?.[0]?.message?.content
            || payload.output_text
            || payload.content
            || payload.message?.content
            || "";

        const parsed = normalizeAiPayload(aiContent);
        return {
            resumo: parsed.resumo || localSummary.resumo,
            inconsistencias: Array.isArray(parsed.inconsistencias) && parsed.inconsistencias.length
                ? parsed.inconsistencias
                : localSummary.inconsistencias,
            geradoEm: parsed.geradoEm || new Date().toISOString()
        };
    } catch (error) {
        console.warn("Resumo IA falhou, usando resumo local:", error.message);
        return localSummary;
    }
}

function ensureTVShape(db) {
    if (!db.tvChamada) db.tvChamada = null;
    if (!db.tvHistorico) db.tvHistorico = [];
    if (!db.alertas) db.alertas = [];
    return db;
}

function registrarAlerta(req, { paciente, nivel, regra, mensagem, contexto }) {
    const db = readDB();
    ensureTVShape(db);
    if (!Array.isArray(db.alertas)) db.alertas = [];
    const alerta = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        quando: new Date().toISOString(),
        nivel: nivel || "ATENCAO",
        regra: regra || "geral",
        mensagem,
        pacienteCpf: paciente?.cpf || paciente?.pacienteCpf || null,
        pacienteNome: paciente?.nome || paciente?.pacienteNome || null,
        contexto: contexto || {},
        geradoPor: req.user ? req.user.usuario : "sistema",
        visualizadoPor: [],
        resolvido: false,
        resolvidoPor: null,
        resolvidoEm: null
    };
    db.alertas.unshift(alerta);
    if (db.alertas.length > 500) db.alertas = db.alertas.slice(0, 500);
    writeDB(db);
    return alerta;
}

//Login por e-mail institucional (novo) com compat para usuário legado.
// O backend identifica: usuário → cargo (role) → permissões → dashboard.
app.post("/login", async (req, res) => {
    const db = readDB();

    const identificador = String(req.body.email || req.body.usuario || "").trim().toLowerCase();
    const senhaEnviada = req.body.senha;

    if (!identificador || senhaEnviada === undefined || senhaEnviada === null || String(senhaEnviada).length > 128) {
        return res.status(401).json({ erro: "Login inválido" });
    }

    const user = db.usuarios.find(u => {
        const candidates = [
            String(u.email || ""),
            String(u.usuario || ""),
            String(u.id || "")
        ].map(value => value.trim().toLowerCase());

        return candidates.includes(identificador) && passwordMatches(senhaEnviada, u.senha);
    });

    if (!user) return res.status(401).json({ erro: "Login inválido" });

    if (user.mustChangePassword) {
        return res.status(403).json({ erro: "primeiro_acesso", usuarioId: user.id || user.usuario });
    }

    if (!String(user.senha).startsWith("scrypt$")) {
        user.senha = hashPassword(senhaEnviada);
        writeDB(db);
    }

    const role = normalizeRole(user.role || user.tipo || "atendimento");
    const permissions = user.permissions || permissionsFor(role);

    const token = crypto.randomBytes(32).toString("hex");
    const session = {
        usuario: String(user.usuario || user.email),
        nome: user.nome || String(user.usuario || ""),
        email: user.email || null,
        tipo: role, role, permissions,
        setor: user.setor || null,
        theme: user.theme || "light",
        mustChangePassword: false,
        expiresAt: Date.now() + SESSION_TTL_MS
    };
    sessions.set(token, session);
    await persistSession(token, user.email || user.usuario || user.nome, session);
    audit({ user: { usuario: String(user.usuario || user.email), tipo: role } }, "login", { role });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `sentinela_session=${token}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}; Path=/${secure}`);
    res.json({ usuario: String(user.usuario || user.email), nome: user.nome || "", email: user.email || null, role, tipo: role, permissions });
});

// Sessão atual → o frontend decide o dashboard pelo cargo (sem escolher perfil)
app.get("/me", (req, res) => {
    const token = parseCookies(req.headers.cookie).sentinela_session;
    const session = token && sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        return res.status(401).json({ erro: "Autenticação necessária" });
    }
    const role = session.role || session.tipo;
    res.json({
        usuario: session.usuario, nome: session.nome || session.usuario,
        email: session.email || null, role, tipo: role,
        setor: session.setor || null,
        theme: session.theme || "light",
        permissions: session.permissions || permissionsFor(role)
    });
});

// Preferência de tema claro/escuro por usuário (vale em todos os dispositivos)
app.post("/me/tema", requireAuth(), async (req, res) => {
    const tema = String(req.body?.tema || "").trim().toLowerCase();
    if (!["light", "dark"].includes(tema)) {
        return res.status(400).json({ erro: "Tema inválido. Use \"light\" ou \"dark\"." });
    }

    req.user.theme = tema;

    // Persiste no JSON local (dev)
    try {
        const db = readDB();
        const user = (db.usuarios || []).find(u =>
            String(u.usuario || "").trim().toLowerCase() === String(req.user.usuario || "").trim().toLowerCase() ||
            (u.email && String(u.email).trim().toLowerCase() === String(req.user.email || "").trim().toLowerCase())
        );
        if (user) { user.theme = tema; writeDB(db); }
    } catch (_) { /* nunca deve quebrar o fluxo */ }

    // Persiste também no PostgreSQL (produção/Render)
    if (usingPostgres()) {
        try {
            await getPool().query(
                `UPDATE users SET theme = $2 WHERE LOWER(username) = LOWER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($1))`,
                [String(req.user.usuario), tema]
            );
        } catch (_) { /* idem */ }
    }

    audit(req, "tema_atualizado", { tema });
    res.json({ ok: true, tema });
});

// Recuperação de senha (fluxo com token — sem e-mail real nesta versão: devolve o token)
app.post("/recuperar-senha", (req, res) => {
    const db = readDB();
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = db.usuarios.find(u => String(u.email || "").trim().toLowerCase() === email);
    // resposta genérica (não revela se o e-mail existe)
    if (!user) return res.json({ ok: true });
    user.resetToken = crypto.randomBytes(24).toString("hex");
    user.resetExpires = Date.now() + 60 * 60 * 1000;
    writeDB(db);
    audit({ user: { usuario: user.usuario, tipo: user.role || user.tipo } }, "recuperar_senha_solicitada", { email });
    // Em produção: enviar por e-mail. Aqui retornamos flag + token apenas se ?debug=1
    if (String(req.query.debug || "") === "1") return res.json({ ok: true, resetToken: user.resetToken });
    res.json({ ok: true });
});

app.post("/redefinir-senha", (req, res) => {
    const db = readDB();
    const { token, novaSenha, confirmar } = req.body || {};
    if (!token || !novaSenha || novaSenha !== confirmar || String(novaSenha).length < 6) {
        return res.status(400).json({ erro: "Dados inválidos. Confira token e senhas (mín. 6 caracteres)." });
    }
    const user = db.usuarios.find(u => u.resetToken === token && u.resetExpires > Date.now());
    if (!user) return res.status(400).json({ erro: "Token inválido ou expirado" });
    user.senha = hashPassword(novaSenha);
    user.resetToken = null; user.resetExpires = null; user.mustChangePassword = false;
    writeDB(db);
    audit({ user: { usuario: user.usuario, tipo: user.role || user.tipo } }, "senha_redefinida", {});
    res.json({ ok: true });
});

// Primeiro acesso (funcionário novo define a senha)
app.post("/primeiro-acesso", (req, res) => {
    const db = readDB();
    const { usuarioId, novaSenha, confirmar } = req.body || {};
    const user = db.usuarios.find(u => String(u.id || u.usuario) === String(usuarioId));
    if (!user) return res.status(404).json({ erro: "Conta não encontrada" });
    if (!novaSenha || novaSenha !== confirmar || String(novaSenha).length < 6) {
        return res.status(400).json({ erro: "Senha inválida (mín. 6 caracteres e confirmação igual)." });
    }
    user.senha = hashPassword(novaSenha);
    user.mustChangePassword = false;
    user.resetToken = null; user.resetExpires = null;
    writeDB(db);
    res.json({ ok: true, role: user.role || user.tipo });
});

//atendimento/admissão (cria paciente por CPF; evita duplicados) + salva imagem
// Perfil cardiovascular estendido (item 1 da spec de cardiologia).
app.post("/atendimento", requireAuth(["atendimento", "recepcao"]), uploadFoto.single("foto"), (req, res) => {
    const db = readDB();

    const nome = String(req.body.nome || "").trim();
    const cpf = String(req.body.cpf || "").replace(/\D/g, "");
    const tipo = String(req.body.tipo || "").trim();

    if (!nome || nome.length > 120 || !validateCpf(cpf)) {
        return res.status(400).json({ erro: "Nome e CPF são obrigatórios" });
    }

    const file = req.file;
    const imagemCaminho = file ? `/uploads/${file.filename}` : null;

    // perfil cardiovascular + contatos (merge com o que já existir)
    const perfil = {
        dataNascimento: String(req.body.dataNascimento || "").slice(0, 10) || null,
        sexo: String(req.body.sexo || "").slice(0, 20) || null,
        telefone: String(req.body.telefone || "").slice(0, 30) || null,
        email: String(req.body.email || "").slice(0, 80) || null,
        endereco: String(req.body.endereco || "").slice(0, 200) || null,
        nomeMae: String(req.body.nomeMae || "").slice(0, 120) || null,
        estadoCivil: String(req.body.estadoCivil || "").slice(0, 30) || null,
        contatoEmergencia: String(req.body.contatoEmergencia || "").slice(0, 120) || null,
        hipertensao: req.body.hipertensao === "SIM",
        diabetes: req.body.diabetes === "SIM",
        dislipidemia: req.body.dislipidemia === "SIM",
        tabagismo: req.body.tabagismo === "SIM",
        sedentarismo: req.body.sedentarismo === "SIM",
        obesidade: req.body.obesidade === "SIM",
        infartoPrevio: req.body.infartoPrevio === "SIM",
        avcPrevio: req.body.avcPrevio === "SIM",
        arritmias: req.body.arritmias === "SIM",
        insuficienciaCardiaca: req.body.insuficienciaCardiaca === "SIM",
        doencaCoronariana: req.body.doencaCoronariana === "SIM",
        cirurgiasCardiacas: String(req.body.cirurgiasCardiacas || "").slice(0, 300) || null,
        alergias: String(req.body.alergias || "").slice(0, 300) || null,
        medicamentosAtuais: String(req.body.medicamentosAtuais || "").slice(0, 500) || null,
        marcapasso: req.body.marcapasso === "SIM",
        desfibrilador: req.body.desfibrilador === "SIM",
        proteses: String(req.body.proteses || "").slice(0, 300) || null,
        historicoFamiliar: String(req.body.historicoFamiliar || "").slice(0, 500) || null
    };

    let paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) {
        paciente = {
            id: Date.now(),
            nome,
            cpf,
            tipo,
            perfil,
            status: "triagem",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        db.pacientes.push(paciente);
    } else {
        paciente.nome = nome;
        paciente.tipo = tipo || paciente.tipo;
        paciente.perfil = { ...(paciente.perfil || {}), ...Object.fromEntries(Object.entries(perfil).filter(([, v]) => v !== null && v !== "")) };
        if (perfil.alergias) paciente.perfil.alergias = perfil.alergias;
        paciente.status = "triagem";
        paciente.updatedAt = new Date().toISOString();
    }

    const atendimento = {
        id: Date.now(),
        pacienteId: paciente.id,
        pacienteCpf: paciente.cpf,
        pacienteNome: paciente.nome,
        tipo: paciente.tipo,
        imagem: imagemCaminho,
        createdAt: new Date().toISOString()
    };
    db.atendimentos.push(atendimento);

    writeDB(db);
    res.json(paciente);
});



//triagem com prioridade automatica (vincula paciente via cpf e salva pacienteId)
app.post("/triagem", requireAuth(["triagem"]), (req, res) => {
    const db = readDB();

    const pacienteCpf = String(req.body.pacienteCpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === pacienteCpf);

    if (!paciente) {
        return res.status(400).json({ erro: "Paciente não encontrado para o CPF informado" });
    }

    let risco = String(req.body.risco || "verde").trim().toLowerCase();
    if (!["verde", "amarelo", "vermelho"].includes(risco)) risco = "verde";

    //regra automatica (apoio — não diagnostica; decisão é do profissional)
    const tempRaw = req.body.temperatura;
    const temperaturaNum = tempRaw === "" || tempRaw == null ? NaN : Number(tempRaw);
    const temTemp = !Number.isNaN(temperaturaNum);
    if (temTemp && temperaturaNum > 39) risco = "vermelho";
    else if (temTemp && temperaturaNum < 36 && risco !== "vermelho") risco = "amarelo";

    // ── Triagem cardiológica: PA, FC, SpO2, FR + sintomas ──
    const pas = req.body.pas === "" || req.body.pas == null ? null : Number(req.body.pas);
    const pad = req.body.pad === "" || req.body.pad == null ? null : Number(req.body.pad);
    const fc = req.body.fc === "" || req.body.fc == null ? null : Number(req.body.fc);
    const spo2 = req.body.spo2 === "" || req.body.spo2 == null ? null : Number(req.body.spo2);
    const fr = req.body.fr === "" || req.body.fr == null ? null : Number(req.body.fr);
    const boolOf = (v) => v === true || v === "true" || v === "sim" || v === "SIM" || v === 1 || v === "1";
    const sint = {
        dorToracica: boolOf(req.body.dorToracica),
        faltaAr: boolOf(req.body.faltaAr),
        tontura: boolOf(req.body.tontura),
        palpitacoes: boolOf(req.body.palpitacoes),
        desmaio: boolOf(req.body.desmaio)
    };
    // sinais que merecem atenção imediata → elevam prioridade (sem diagnosticar)
    const sinalCardioCritico =
        (pas != null && !Number.isNaN(pas) && (pas >= 180 || pas <= 90)) ||
        (pad != null && !Number.isNaN(pad) && pad >= 110) ||
        (fc != null && !Number.isNaN(fc) && (fc >= 110 || fc <= 45)) ||
        (spo2 != null && !Number.isNaN(spo2) && spo2 < 94) ||
        sint.dorToracica || sint.faltaAr || sint.desmaio;
    if (sinalCardioCritico) risco = "vermelho";

    const triagem = {
        id: Date.now(),
        pacienteId: paciente.id,
        pacienteCpf: paciente.cpf,
        pacienteNome: paciente.nome,

        nome: String(req.body.nome || "").trim(),
        sintomas: String(req.body.sintomas || "").trim(),
        temperatura: temTemp ? temperaturaNum : (req.body.temperatura ?? null),
        // campos cardiológicos
        pas: pas != null && !Number.isNaN(pas) ? pas : null,
        pad: pad != null && !Number.isNaN(pad) ? pad : null,
        fc: fc != null && !Number.isNaN(fc) ? fc : null,
        spo2: spo2 != null && !Number.isNaN(spo2) ? spo2 : null,
        fr: fr != null && !Number.isNaN(fr) ? fr : null,
        dorToracica: sint.dorToracica,
        faltaAr: sint.faltaAr,
        tontura: sint.tontura,
        palpitacoes: sint.palpitacoes,
        desmaio: sint.desmaio,
        alergia: String(req.body.alergia || "nenhuma").trim(),
        risco,
        atencaoCardio: sinalCardioCritico,
        status: "aguardando_medico",
        createdAt: new Date().toISOString()
    };

    db.triagens.push(triagem);

    // atualiza status do paciente
    paciente.status = "aguardando_medico";
    paciente.updatedAt = new Date().toISOString();

    writeDB(db);
    audit(req, "triagem_criada", { pacienteCpf: paciente.cpf, risco, atencaoCardio: sinalCardioCritico });
    if (sinalCardioCritico) {
        registrarAlerta(req, {
            paciente, nivel: "ALTO", regra: "sinal_cardio",
            mensagem: "Os dados registrados apresentam sinais que exigem avaliação clínica imediata.",
            contexto: { triagemId: triagem.id, pas: triagem.pas, pad: triagem.pad, fc: triagem.fc, spo2: triagem.spo2, sintomas: sint }
        });
    }
    res.json(triagem);
});


//triagem para medico (com dados do atendimento via CPF)
app.get("/triagem", requireAuth(["medico", "cardiologist", "triagem"]), (req, res) => {
    const db = readDB();

    const triagens = (db.triagens || []).map(t => {
        const atendimento = (db.atendimentos || []).find(a => String(a.pacienteCpf) === String(t.pacienteCpf));
        return { ...t, atendimento };
    });

    res.json(triagens);
});


//compatibilidade (algumas telas podem chamar /triagens)
app.get("/triagens", requireAuth(["medico", "cardiologist", "triagem"]), (req, res) => {
    const db = readDB();
    res.json(db.triagens);
});

//delete triagem (para apagar da lista do medico)
app.delete("/triagem", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();

    const triagemId = req.query.id;
    if (!triagemId) return res.status(400).json({ erro: "id é obrigatório" });

    const idNum = Number(triagemId);

    const triagemRemovida = (db.triagens || []).find(t => Number(t.id) === idNum);
    const pacienteCpf = triagemRemovida?.pacienteCpf;

    // remove triagem
    db.triagens = (db.triagens || []).filter(t => Number(t.id) !== idNum);

    // remove consultas vinculadas (se existirem)
    db.consultas = (db.consultas || []).filter(c => Number(c.triagemId) !== idNum);

    // opcional: remove atendimentos/imagem associados por CPF + remove arquivos do uploads
    if (pacienteCpf) {
        const removidos = (db.atendimentos || []).filter(a => String(a.pacienteCpf) === String(pacienteCpf));
        // tenta apagar as imagens físicas
        removidos.forEach(a => {
            const img = a.imagem;
            if (!img) return;
            const imgRel = String(img).replace(/^\/uploads\//, "").replace(/^uploads\//, "");
            const imgPath = path.join(UPLOADS_DIR, imgRel);
            try {
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            } catch (_) {
                // ignora falhas de delete
            }
        });

        db.atendimentos = (db.atendimentos || []).filter(a => String(a.pacienteCpf) !== String(pacienteCpf));
    }



    writeDB(db);
    res.json({ ok: true });
});


//tabela de atendimentos por CPF (para triagem.html)
app.get("/atendimentos", requireAuth(["atendimento", "triagem", "medico"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.query.cpf || "").trim();
    const list = cpf ? db.atendimentos.filter(a => String(a.pacienteCpf) === cpf) : db.atendimentos;
    res.json(list);
});

app.get("/atendimentos-casa", requireAuth(["atendimento", "recepcao", "medico", "cardiologist", "triagem"]), (req, res) => {
    const db = readDB();
    const list = (db.atendimentosCasa || []).slice().reverse();
    res.json(list);
});

app.post("/atendimento-casa", requireAuth(["atendimento", "recepcao", "medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.body.pacienteCpf || "").replace(/\D/g, "");
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);

    if (!paciente) {
        return res.status(404).json({ erro: "Paciente não encontrado para o CPF informado" });
    }

    const endereco = String(req.body.endereco || paciente.perfil?.endereco || "").trim() || "Endereço não informado";
    const motivo = String(req.body.motivo || "").trim();
    const observacoes = String(req.body.observacoes || "").trim();
    const dataAtendimento = String(req.body.dataAtendimento || new Date().toISOString()).slice(0, 16);
    const status = String(req.body.status || "agendado").trim().toLowerCase() || "agendado";

    const registro = {
        id: Date.now(),
        pacienteId: paciente.id,
        pacienteCpf: paciente.cpf,
        pacienteNome: paciente.nome,
        endereco,
        motivo: motivo || "Atendimento domiciliar agendado",
        observacoes: observacoes || "Paciente encaminhado para atendimento em casa.",
        dataAtendimento,
        status,
        criadoPor: req.user.usuario,
        createdAt: new Date().toISOString()
    };

    db.atendimentosCasa.push(registro);
    writeDB(db);
    audit(req, "atendimento_casa_criado", { pacienteCpf: paciente.cpf, status, dataAtendimento });
    res.json(registro);
});

app.post("/atendimento-casa/:id/concluir", requireAuth(["atendimento", "recepcao", "medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    const registro = (db.atendimentosCasa || []).find(item => Number(item.id) === Number(req.params.id));

    if (!registro) {
        return res.status(404).json({ erro: "Atendimento domiciliar não encontrado" });
    }

    registro.status = "concluido";
    registro.concluidoPor = req.user.usuario;
    registro.concluidoEm = new Date().toISOString();
    writeDB(db);
    audit(req, "atendimento_casa_concluido", { atendimentoId: registro.id, pacienteCpf: registro.pacienteCpf });
    res.json(registro);
});


//consulta (vincula paciente por cpf, se vier; senão tenta usar pacienteId)
// Passa pelo Safety Engine antes de confirmar — sem diagnosticar, só aponta.
app.post("/consulta", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();

    const pacienteCpf = String(req.body.pacienteCpf || "").trim();
    const pacienteId = req.body.pacienteId;

    let paciente;
    if (pacienteId) {
        paciente = db.pacientes.find(p => Number(p.id) === Number(pacienteId));
    }
    if (!paciente && pacienteCpf) {
        paciente = db.pacientes.find(p => String(p.cpf) === pacienteCpf);
    }

    if (!paciente) {
        return res.status(400).json({ erro: "Paciente não encontrado para a consulta" });
    }

    const triagem = (db.triagens || []).slice().reverse().find(t => String(t.pacienteCpf) === String(paciente.cpf)) || null;

    const prescricao = {
        diagnostico: String(req.body.diagnostico || "").trim(),
        medicacao: String(req.body.medicacao || "").trim(),
        obs: String(req.body.obs || "").trim()
    };

    // ── Safety Engine ──
    const achados = safetyCheck({ paciente, triagem, prescricao });

    const consulta = {
        id: Date.now(),
        pacienteId: paciente.id,
        pacienteCpf: paciente.cpf,
        pacienteNome: paciente.nome,

        diagnostico: prescricao.diagnostico,
        medicacao: prescricao.medicacao,
        obs: prescricao.obs,
        triagemId: triagem?.id || null,
        safety: achados,
        createdAt: new Date().toISOString(),
        createdBy: req.user.usuario,
        status: "finalizado"
    };

    db.consultas.push(consulta);

    // atualiza status do paciente (opcional)
    paciente.status = "em_consulta";
    paciente.updatedAt = new Date().toISOString();

    writeDB(db);
    audit(req, "consulta_criada", { pacienteCpf: paciente.cpf, consultaId: consulta.id, achados: achados.length });
    const gerados = achados.map(a => registrarAlerta(req, { paciente, nivel: a.nivel, regra: a.regra, mensagem: a.mensagem, contexto: { ...a.contexto, consultaId: consulta.id } }));
    res.json({ ...consulta, alertasGerados: gerados });
});

// prévia do Safety Engine (médico confere ANTES de confirmar a prescrição)
app.post("/safety/preview", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.body.pacienteCpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) return res.status(400).json({ erro: "Paciente não encontrado" });
    const triagem = (db.triagens || []).slice().reverse().find(t => String(t.pacienteCpf) === cpf) || null;
    const achados = safetyCheck({
        paciente, triagem,
        prescricao: { diagnostico: req.body.diagnostico, medicacao: req.body.medicacao, obs: req.body.obs }
    });
    res.json({ achados });
});

//finalizar atendimento (alta ou internar) e remover da triagem/painel
app.post("/finalizar", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();

    const acao = String(req.body.acao || "").trim(); // "alta" | "internar"
    const pacienteCpf = String(req.body.pacienteCpf || "").trim();
    const pacienteId = req.body.pacienteId;

    if (!acao || !pacienteCpf) {
        return res.status(400).json({ erro: "acao e pacienteCpf são obrigatórios" });
    }

    // encontra triagem ativa do paciente pelo CPF
    const triagem = (db.triagens || []).find(t => String(t.pacienteCpf) === String(pacienteCpf));
    const triagemId = triagem?.id;

    let paciente = null;
    if (pacienteId) {
        paciente = (db.pacientes || []).find(p => p.id === pacienteId);
    }
    if (!paciente) {
        paciente = (db.pacientes || []).find(p => String(p.cpf) === String(pacienteCpf));
    }

    if (!paciente) {
        return res.status(400).json({ erro: "Paciente não encontrado" });
    }

    // atualiza status do paciente
    if (acao === "alta") {
        paciente.status = "alta";
    } else if (acao === "internar") {
        paciente.status = "internado";
    } else {
        return res.status(400).json({ erro: "acao inválida (use alta ou internar)" });
    }
    paciente.updatedAt = new Date().toISOString();

    // opcional: registra internação (estrutura existe no db.js)
    if (acao === "internar") {
        if (Array.isArray(db.internacoes)) {
            db.internacoes.push({
                id: Date.now(),
                pacienteId: paciente.id,
                pacienteCpf: paciente.cpf,
                pacienteNome: paciente.nome,
                triagemId: triagemId,
                doc: req.body.internacaoDoc || null,
                createdAt: new Date().toISOString()
            });
        }
    }

    // remove triagem do painel usando a mesma lógica da rota DELETE /triagem
    if (triagemId) {
        // remove triagem
        db.triagens = (db.triagens || []).filter(t => Number(t.id) !== Number(triagemId));

        // remove consultas vinculadas (se existirem)
        db.consultas = (db.consultas || []).filter(c => Number(c.triagemId) !== Number(triagemId));

        // remove atendimentos/imagem associados por CPF
        db.atendimentos = (db.atendimentos || []).filter(a => String(a.pacienteCpf) !== String(pacienteCpf));
    }

    writeDB(db);
    res.json({ ok: true, removedTriagemId: triagemId || null, pacienteStatus: paciente.status });
});

// prontuário integrado (paciente + triagens + consultas + atendimentos + alertas)
app.get("/prontuario/:cpf", requireAuth(["medico", "cardiologist", "triagem"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.params.cpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) return res.status(404).json({ erro: "Paciente não encontrado" });
    const triagens = (db.triagens || []).filter(t => String(t.pacienteCpf) === cpf);
    const consultas = (db.consultas || []).filter(c => String(c.pacienteCpf) === cpf);
    const atendimentos = (db.atendimentos || []).filter(a => String(a.pacienteCpf) === cpf);
    const alertas = (db.alertas || []).filter(a => String(a.pacienteCpf) === cpf);
    audit(req, "prontuario_visualizado", { pacienteCpf: cpf });
    res.json({ paciente, triagens, consultas, atendimentos, alertas });
});

// lista de pacientes (para fila / emergência / busca)
app.get("/pacientes", requireAuth(["medico", "cardiologist", "triagem", "atendimento", "recepcao"]), (req, res) => {
    const db = readDB();
    const q = String(req.query.q || "").toLowerCase();
    let list = db.pacientes || [];
    if (q) list = list.filter(p => String(p.nome || "").toLowerCase().includes(q) || String(p.cpf || "").includes(q));
    res.json(list.slice(-100).reverse());
});

// ── IA assistente: resumo do prontuário + possíveis inconsistências ──
// Não diagnostica. Aponta registros que merecem revisão pelo profissional.
app.get("/ia/resumo/:cpf", requireAuth(["medico", "cardiologist"]), async (req, res) => {
    const db = readDB();
    const cpf = String(req.params.cpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) return res.status(404).json({ erro: "Paciente não encontrado" });
    const triagens = (db.triagens || []).filter(t => String(t.pacienteCpf) === cpf);
    const consultas = (db.consultas || []).filter(c => String(c.pacienteCpf) === cpf);
    const atendimentos = (db.atendimentos || []).filter(a => String(a.pacienteCpf) === cpf);
    const out = await resumoIA(paciente, triagens, consultas, atendimentos);
    audit(req, "ia_resumo", { pacienteCpf: cpf });
    res.json({ pacienteCpf: cpf, pacienteNome: paciente.nome, ...out, aviso: "Apoio à decisão. Não substitui avaliação clínica." });
});

// ── Alertas ──
app.get("/alertas", requireAuth(["medico", "cardiologist", "triagem", "enfermagem"]), (req, res) => {
    const db = ensureTVShape(readDB());
    const nivel = String(req.query.nivel || "").toUpperCase();
    const soAbertos = String(req.query.abertos || "") === "1";
    let list = db.alertas || [];
    if (nivel) list = list.filter(a => String(a.nivel).toUpperCase() === nivel);
    if (soAbertos) list = list.filter(a => !a.resolvido);
    res.json(list.slice(0, 100));
});

app.post("/alertas/:id/resolver", requireAuth(["medico", "cardiologist", "direcao"]), (req, res) => {
    const db = readDB();
    const a = (db.alertas || []).find(x => Number(x.id) === Number(req.params.id));
    if (!a) return res.status(404).json({ erro: "Alerta não encontrado" });
    a.resolvido = true;
    a.resolvidoPor = req.user.usuario;
    a.resolvidoEm = new Date().toISOString();
    writeDB(db);
    audit(req, "alerta_resolvido", { alertaId: a.id, regra: a.regra });
    res.json(a);
});

// ── Auditoria (trilha por API — sem DELETE) ──
app.get("/auditoria", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const db = readDB();
    res.json((db.auditoria || []).slice(-200).reverse());
});

// ── TV / chamada de guichê ──
app.get("/tv/chamada", (req, res) => {
    const db = ensureTVShape(readDB());
    res.json({ chamada: db.tvChamada, historico: db.tvHistorico || [] });
});

app.post("/tv/chamar", requireAuth(["triagem", "atendimento"]), (req, res) => {
    const db = ensureTVShape(readDB());
    const pacienteCpf = String(req.body.pacienteCpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === pacienteCpf);
    if (!paciente) return res.status(400).json({ erro: "Paciente não encontrado" });
    const chamada = {
        id: Date.now(),
        pacienteCpf: paciente.cpf,
        paciente: paciente.nome,
        guiche: String(req.body.guiche || "GUICHÊ 01"),
        localType: String(req.body.guiche || "GUICHÊ 01"),
        localNumber: String(req.body.guiche || "GUICHÊ 01"),
        quando: new Date().toISOString(),
        chamadoPor: req.user.usuario
    };
    db.tvChamada = chamada;
    db.tvHistorico.unshift(chamada);
    db.tvHistorico = db.tvHistorico.slice(0, 8);
    writeDB(db);
    audit(req, "tv_chamada", { pacienteCpf: paciente.cpf, guiche: chamada.guiche });
    res.json(chamada);
});

app.post("/logout", async (req, res) => {
    const token = parseCookies(req.headers.cookie).sentinela_session;
    if (token) sessions.delete(token);
    if (usingPostgres()) {
        try {
            await getPool().query(`DELETE FROM sessions WHERE token = $1`, [token]);
        } catch (_) {}
    }
    res.setHeader("Set-Cookie", "sentinela_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/");
    res.json({ ok: true });
});

// ── Dashboard por cargo: centro de comando (muda conforme role) ──
// triagem → fila/espera/alertas · cardiologista → consultas/exames/prontuários
// farmacia → prescrições/estoque · direcao → indicadores/ocupação
app.get("/dashboard", requireAuth([]), async (req, res) => {
    const db = ensureTVShape(await store.readAll());
    const role = req.user.role || req.user.tipo;
    const hoje = new Date().toISOString().slice(0, 10);
    const consultasHoje = (db.consultas || []).filter(c => String(c.createdAt || "").slice(0, 10) === hoje).length;
    const alertasAbertos = (db.alertas || []).filter(a => !a.resolvido);
    const criticos = alertasAbertos.filter(a => a.nivel === "CRITICO").length;
    const altos = alertasAbertos.filter(a => a.nivel === "ALTO").length;
    const prescPendentes = (db.consultas || []).filter(c => c.medicacao && !c.dispensado).length;
    const estoqueCritico = (db.estoque || []).filter(e => Number(e.quantidade) <= Number(e.minimo)).length;
    const internados = (db.internacoes || []).filter(i => !i.altaEm).length;
    const leitos = (db.leitos || []);
    const leitosLivres = leitos.filter(l => l.status === "livre").length;
    const ocupacao = leitos.length ? Math.round(((leitos.length - leitosLivres) / leitos.length) * 100) : 0;
    const examesPendentes = (db.exames || []).filter(e => e.status === "pendente").length;
    const fila = (db.triagens || []).slice(-5).reverse().map(t => ({ nome: t.pacienteNome, cpf: t.pacienteCpf, risco: t.risco, quando: t.createdAt }));
    const atividade = (db.auditoria || []).slice(-6).reverse();
    const porCondicao = {};
    (db.pacientes || []).forEach(paciente => {
        const perfil = paciente.perfil || {};
        ["hipertensao", "diabetes", "dislipidemia", "tabagismo", "sedentarismo", "obesidade", "infartoPrevio", "avcPrevio", "arritmias", "insuficienciaCardiaca", "doencaCoronariana"].forEach(condicao => {
            if (perfil[condicao]) {
                porCondicao[condicao] = (porCondicao[condicao] || 0) + 1;
            }
        });
    });
    // cards por perfil (hierarquia: crítico = vermelho raro; ação = amarelo; normal = neutro)
    const cards = {};
    if (["triagem", "enfermagem", "atendimento", "recepcao"].includes(role)) {
        cards.pacientes = (db.pacientes || []).length;
        cards.espera = (db.triagens || []).length;
        cards.alertas = alertasAbertos.length;
        cards.leitos = leitosLivres;
    } else if (["farmacia"].includes(role)) {
        cards.presc = prescPendentes;
        cards.estoque = estoqueCritico;
        cards.alertas = alertasAbertos.length;
        cards.pacientes = (db.pacientes || []).length;
    } else if (["direcao", "admin"].includes(role)) {
        cards.pacientes = (db.pacientes || []).length;
        cards.consultas = consultasHoje;
        cards.alertas = alertasAbertos.length;
        cards.leitos = leitosLivres;
        cards.exames = examesPendentes;
        cards.estoque = estoqueCritico;
    } else {
        // cardiologist / medico
        cards.consultas = consultasHoje;
        cards.espera = (db.triagens || []).length;
        cards.alertas = alertasAbertos.length;
        cards.exames = examesPendentes;
        cards.presc = prescPendentes;
        cards.leitos = leitosLivres;
    }
    audit(req, "dashboard", { role, backend: store.backend() });
    res.json({
        role, nome: req.user.nome || req.user.usuario, backend: store.backend(),
        cards, consultasHoje, triagensAbertas: (db.triagens || []).length,
        alertasAbertos: alertasAbertos.length, criticos, altos,
        prescPendentes, estoqueCritico, internados, leitosLivres, ocupacao, examesPendentes,
        proximos: fila, fila,
        alertas: alertasAbertos.slice(0, 5), atividade, porCondicao
    });
});

//medicações (legado)
app.get("/medicacoes", requireAuth(["medico", "cardiologist", "farmacia"]), (req, res) => {
    const db = readDB();
    res.json(db.consultas);
});

// ── EXAMES (solicitar / pendentes / resultados) ──
const TIPOS_EXAME = ["ECG", "Ecocardiograma", "Holter", "MAPA", "Teste ergométrico", "Cateterismo", "Angiografia", "Laboratorial"];

app.get("/exames/tipos", requireAuth([]), (req, res) => res.json(TIPOS_EXAME));

app.post("/exames", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.body.pacienteCpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) return res.status(400).json({ erro: "Paciente não encontrado" });
    const tipo = String(req.body.tipo || "").trim();
    if (!TIPOS_EXAME.includes(tipo)) return res.status(400).json({ erro: "Tipo de exame inválido" });
    const exame = {
        id: Date.now(),
        pacienteCpf: paciente.cpf, pacienteNome: paciente.nome,
        tipo, observacao: String(req.body.observacao || "").slice(0, 500),
        status: "pendente", resultado: null,
        solicitadoPor: req.user.usuario, solicitadoEm: new Date().toISOString()
    };
    db.exames.push(exame);
    writeDB(db);
    audit(req, "exame_solicitado", { exameId: exame.id, tipo, pacienteCpf: cpf });
    res.json(exame);
});

app.get("/exames", requireAuth(["medico", "cardiologist", "triagem", "enfermagem"]), (req, res) => {
    const db = readDB();
    const { status, cpf } = req.query;
    let list = db.exames || [];
    if (status) list = list.filter(e => e.status === status);
    if (cpf) list = list.filter(e => String(e.pacienteCpf) === String(cpf));
    res.json(list.slice(-100).reverse());
});

app.post("/exames/:id/resultado", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    const exame = (db.exames || []).find(e => Number(e.id) === Number(req.params.id));
    if (!exame) return res.status(404).json({ erro: "Exame não encontrado" });
    exame.resultado = {
        texto: String(req.body.texto || "").slice(0, 2000),
        fracaoEjecao: req.body.fracaoEjecao ?? null,
        laudoEm: new Date().toISOString(), laudoPor: req.user.usuario
    };
    exame.status = "concluido";
    writeDB(db);
    audit(req, "exame_resultado", { exameId: exame.id, tipo: exame.tipo });
    res.json(exame);
});

// ── FARMÁCIA + ESTOQUE ──
app.get("/farmacia/prescricoes", requireAuth(["medico", "cardiologist", "farmacia"]), (req, res) => {
    const db = readDB();
    const pendentes = (db.consultas || []).filter(c => c.medicacao && !c.dispensado);
    res.json(pendentes.slice(-100).reverse().map(c => ({
        consultaId: c.id, pacienteCpf: c.pacienteCpf, pacienteNome: c.pacienteNome,
        medicacao: c.medicacao, diagnostico: c.diagnostico,
        safety: c.safety || [], criadaEm: c.createdAt
    })));
});

app.post("/farmacia/dispensar", requireAuth(["farmacia", "medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    const consulta = (db.consultas || []).find(c => Number(c.id) === Number(req.body.consultaId));
    if (!consulta) return res.status(404).json({ erro: "Prescrição não encontrada" });
    const critico = (consulta.safety || []).find(s => s.nivel === "CRITICO");
    if (critico && !req.body.revisadoPor) {
        return res.status(409).json({ erro: "Prescrição com alerta CRÍTICO requer revisão registrada antes da dispensação", alerta: critico });
    }
    consulta.dispensado = true;
    consulta.dispensadoPor = req.user.usuario;
    consulta.dispensadoEm = new Date().toISOString();
    writeDB(db);
    audit(req, "dispensacao", { consultaId: consulta.id, pacienteCpf: consulta.pacienteCpf });
    res.json({ ok: true, consulta });
});

app.get("/estoque", requireAuth(["farmacia", "medico", "cardiologist", "direcao"]), (req, res) => {
    const db = readDB();
    const estoque = (db.estoque || [])
        .map(e => ({ ...e, categoria: e.categoria || "Outros", critico: Number(e.quantidade) <= Number(e.minimo) }))
        .sort((a, b) => {
            const categoria = (a.categoria || '').localeCompare(b.categoria || '');
            if (categoria !== 0) return categoria;
            return String(a.medicamento).localeCompare(String(b.medicamento));
        });

    res.json(estoque);
});

app.post("/estoque/entrada", requireAuth(["farmacia"]), (req, res) => {
    const db = readDB();
    const { medicamento, qtd } = req.body || {};
    if (!medicamento || !(Number(qtd) > 0)) return res.status(400).json({ erro: "Medicamento e quantidade válidos são obrigatórios" });
    let item = (db.estoque || []).find(e => String(e.medicamento).toLowerCase() === String(medicamento).toLowerCase());
    if (!item) {
        item = { id: Date.now(), medicamento: String(medicamento).slice(0, 120), quantidade: 0, minimo: 10, updatedAt: new Date().toISOString() };
        db.estoque.push(item);
    }
    item.quantidade = Number(item.quantidade) + Number(qtd);
    item.updatedAt = new Date().toISOString();
    db.movimentacoes.unshift({ id: Date.now(), medicamento: item.medicamento, tipo: "entrada", qtd: Number(qtd), por: req.user.usuario, em: new Date().toISOString() });
    writeDB(db);
    audit(req, "estoque_entrada", { medicamento: item.medicamento, qtd });
    res.json(item);
});

app.get("/compras/sugestao", requireAuth(["farmacia", "direcao"]), (req, res) => {
    const db = readDB();
    const criticos = (db.estoque || []).filter(e => Number(e.quantidade) <= Number(e.minimo));
    res.json({ itens: criticos.map(e => ({ medicamento: e.medicamento, atual: e.quantidade, minimo: e.minimo })), geradoEm: new Date().toISOString() });
});

// ── INTERNAÇÃO (leitos da ala cardiologia) ──
app.get("/leitos", requireAuth([]), (req, res) => {
    const db = readDB();
    res.json(db.leitos || []);
});

app.post("/internacoes", requireAuth(["medico", "cardiologist", "enfermagem"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.body.pacienteCpf || "").trim();
    const leitoId = String(req.body.leito || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    const leito = (db.leitos || []).find(l => String(l.id) === leitoId);
    if (!paciente) return res.status(400).json({ erro: "Paciente não encontrado" });
    if (!leito) return res.status(400).json({ erro: "Leito não encontrado" });
    if (leito.status !== "livre") return res.status(409).json({ erro: "Leito ocupado" });
    leito.status = "ocupado";
    leito.pacienteCpf = paciente.cpf;
    leito.pacienteNome = paciente.nome;
    leito.desde = new Date().toISOString();
    const internacao = {
        id: Date.now(), pacienteCpf: paciente.cpf, pacienteNome: paciente.nome,
        leito: leito.id, ala: leito.ala,
        motivo: String(req.body.motivo || "").slice(0, 500),
        medicoResponsavel: req.user.nome || req.user.usuario,
        entradaEm: new Date().toISOString(), altaEm: null
    };
    db.internacoes.push(internacao);
    paciente.status = "internado";
    paciente.updatedAt = new Date().toISOString();
    writeDB(db);
    audit(req, "internacao", { pacienteCpf: cpf, leito: leito.id });
    res.json({ internacao, leito });
});

// ── PERFIS / USUÁRIOS / PERMISSÕES / SETORES (Fase 2) ──
app.get("/usuarios", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const db = readDB();
    res.json((db.usuarios || []).map(mapUserRecord));
});

app.get("/profissionais", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const db = readDB();
    res.json((db.usuarios || []).map(mapUserRecord));
});

app.get("/roles", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const roles = Object.entries(ROLE_PERMISSIONS).map(([name, permissions]) => ({
        name: normalizeRole(name), permissions: permissions || []
    }));
    res.json(roles);
});

app.get("/permissoes", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const permissions = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat())).sort();
    res.json(permissions);
});

app.get("/setores", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const db = readDB();
    const setores = Array.from(new Set((db.usuarios || []).map(u => u.setor).filter(Boolean))).sort();
    res.json(setores);
});

app.post("/profissionais", requireAuth(["medico", "cardiologist", "direcao", "admin"]), (req, res) => {
    const db = readDB();
    const { usuario, nome, email, role, setor } = req.body || {};
    if (!usuario || !role) return res.status(400).json({ erro: "usuario e role são obrigatórios" });

    const normalizedRole = normalizeRole(role);
    if (!ROLE_PERMISSIONS[normalizedRole]) {
        return res.status(400).json({ erro: `role inválida: ${role}` });
    }

    const usuarioNormalized = String(usuario).trim();
    const emailNormalized = email ? String(email).trim().toLowerCase() : null;

    if (db.usuarios.some(u => {
        const userUsuario = String(u.usuario || "").trim().toLowerCase();
        const userEmail = String(u.email || "").trim().toLowerCase();
        return userUsuario === usuarioNormalized.toLowerCase() || (emailNormalized && userEmail === emailNormalized);
    })) {
        return res.status(409).json({ erro: "Usuário ou e-mail já existe" });
    }

    const novo = {
        id: Date.now(),
        usuario: usuarioNormalized,
        nome: String(nome || usuario).trim(),
        email: emailNormalized,
        role: normalizedRole,
        tipo: normalizedRole,
        setor: setor ? String(setor).trim() : null,
        senha: "trocar_no_primeiro_acesso",
        permissions: permissionsFor(normalizedRole),
        mustChangePassword: true,
        ativo: true
    };
    db.usuarios.push(novo);
    writeDB(db);
    audit(req, "profissional_criado", { usuario: novo.usuario, role: novo.role, setor: novo.setor || null });
    res.json({ ok: true, usuario: novo.usuario, role: novo.role, setor: novo.setor || null, primeiroAcesso: true });
});

// ── RELATÓRIOS (direção) ──
app.get("/relatorios", requireAuth(["medico", "cardiologist", "direcao", "farmacia"]), (req, res) => {
    const db = readDB();
    const { de, ate } = req.query;
    const inRange = (iso) => {
        if (!de && !ate) return true;
        const d = String(iso || "").slice(0, 10);
        return (!de || d >= String(de)) && (!ate || d <= String(ate));
    };
    const alertas = (db.alertas || []).filter(a => inRange(a.quando));
    const porCondicao = {};
    (db.pacientes || []).forEach(p => {
        const perfil = p.perfil || {};
        ["hipertensao", "diabetes", "arritmias", "insuficienciaCardiaca", "doencaCoronariana", "infartoPrevio"].forEach(k => {
            if (perfil[k]) porCondicao[k] = (porCondicao[k] || 0) + 1;
        });
    });
    res.json({
        periodo: { de: de || null, ate: ate || null },
        atendimentos: (db.triagens || []).filter(t => inRange(t.createdAt)).length,
        pacientes: (db.pacientes || []).length,
        internacoes: (db.internacoes || []).filter(i => inRange(i.entradaEm)).length,
        ocupacao: (db.leitos || []).length ? Math.round(((db.leitos || []).filter(l => l.status !== "livre").length / (db.leitos || []).length) * 100) : 0,
        alertas: alertas.length,
        alertasResolvidos: alertas.filter(a => a.resolvido).length,
        porCondicao
    });
});

// ── Regras do Safety Engine (configuráveis) ──
app.get("/safety/regras", requireAuth([]), (req, res) => {
    const db = readDB();
    res.json(db.safetyRules || { alergia: true, altoRisco: true, duplicidade: true, dadosIncompletos: true, sinalCritico: true });
});

app.put("/safety/regras", requireAuth(["medico", "cardiologist"]), (req, res) => {
    const db = readDB();
    db.safetyRules = { ...(db.safetyRules || {}), ...(req.body || {}) };
    writeDB(db);
    audit(req, "safety_regras_atualizadas", req.body || {});
    res.json(db.safetyRules);
});

app.get("/health", async (req, res) => {
    if (!usingPostgres()) {
        return res.status(503).json({ status: "error", database: "disconnected" });
    }
    try {
        await getPool().query("SELECT 1");
        return res.status(200).json({ status: "ok", database: "connected" });
    } catch (error) {
        return res.status(503).json({ status: "error", database: "disconnected" });
    }
});

//start
if (!process.env.GEMINI_API_KEY) {
    console.warn("Gemini API key não configurada. Configure GEMINI_API_KEY no ambiente. A integração de IA usará apenas o resumo local.");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Porta ${PORT}`);
});

