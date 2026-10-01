const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const multer = require("multer");

// Carrega variáveis de ambiente locais do arquivo .env (não é usado no Render —
// lá as variáveis são definidas nas Environment Variables do serviço).
// O arquivo .env é ignorado pelo Git; nunca insira chaves reais no código.
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
});
app.use(express.json({ limit: "100kb" }));

const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Tente novamente mais tarde." }
});

const passwordRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas de redefinição. Aguarde e tente novamente." }
});

//frontend
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/screenshots", express.static(path.join(__dirname, "../docs/screenshots")));

//uploads
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", requireAuth(["admin", "medico", "triagem", "atendimento", "recepcao", "enfermagem", "farmacia"]), express.static(UPLOADS_DIR, { index: false, maxAge: "1h" }));

// camada de persistência unificada (JSON em dev / PostgreSQL em produção)
const { readDB, writeDB, ROLE_PERMISSIONS, store, usingPostgres, getPool, hydrate } = require("./src/db");

// Sessões: cache em memória + persistência durável (Supabase em produção,
// backend/sessions.json no dev sem DATABASE_URL). Mesma API do Map —
// get/set/delete continuam funcionando em todo o arquivo.
const sessions = require("./src/sessions");
// Ao reidratar uma sessão do banco, as permissões vêm das tabelas de RBAC:
sessions.setPermissionLoader(permissionsForRole);

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

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function verifyTokenHash(token, expectedHash) {
    if (!expectedHash || typeof expectedHash !== "string") return false;
    const hash = hashToken(token);
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

function passwordMatches(password, storedPassword) {
    if (typeof storedPassword !== "string" || !storedPassword.startsWith("scrypt$")) {
        return false;
    }

    const [, salt, expectedHex] = storedPassword.split("$");
    if (!salt || !expectedHex) return false;

    const actual = crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH);
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
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

// ── RBAC novo: requirePermission("prescriptions.write") ──
// O cargo vem da conta (role), o usuário NÃO escolhe no login.

// Middleware HTTP de autenticação e RBAC.
const { createAuthMiddleware } = require("./src/middleware/auth");
const { parseCookies, requireAuth, requirePermission } = createAuthMiddleware({
    sessions,
    normalizeRole,
    permissionsForRole,
    usingPostgres,
    sessionTtlMs: SESSION_TTL_MS
});

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


const MIME_TO_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
};

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_SIGNATURE = [0x52, 0x49, 0x46, 0x46];

function detectImageSignature(buffer) {
    if (!buffer || buffer.length < 8) return null;
    const bytes = Buffer.from(buffer).subarray(0, 8);
    if (bytes.length >= JPEG_SIGNATURE.length && JPEG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return ".jpg";
    if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return ".png";
    if (bytes.length >= 12 && bytes[0] === WEBP_SIGNATURE[0] && bytes[1] === WEBP_SIGNATURE[1] && bytes[2] === WEBP_SIGNATURE[2] && bytes[3] === WEBP_SIGNATURE[3]) {
        const riff = buffer.toString("ascii", 8, 12);
        if (riff === "WEBP") return ".webp";
    }
    return null;
}

const uploadFoto = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const allowed = Object.keys(MIME_TO_EXTENSION);
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Arquivo inválido: tipo de imagem não permitido."));
        }
        const expectedExt = MIME_TO_EXTENSION[file.mimetype];
        const originalExt = path.extname(file.originalname || "").toLowerCase();
        if (originalExt && originalExt !== expectedExt) {
            return cb(new Error("Arquivo inválido: extensão não confere com o tipo de imagem."));
        }
        cb(null, true);
    }
});

// Serviços de infraestrutura e domínio
const { createAuditService } = require("./src/services/auditService");
const { createAlertService } = require("./src/services/alertService");
const audit = createAuditService({ readDB, writeDB });
const { ensureTVShape, registrarAlerta } = createAlertService({ readDB, writeDB });
const { safetyCheck } = require("./src/services/safetyEngine");
const { resumoIA } = require("./src/services/aiService");

//Login por e-mail institucional (novo) com compat para usuário legado.
// O backend identifica: usuário → cargo (role) → permissões → dashboard.
app.post("/login", authRateLimit, async (req, res) => {
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

        return candidates.includes(identificador);
    });

    if (!user) return res.status(401).json({ erro: "Login inválido" });
    if (user.ativo === false) return res.status(403).json({ erro: "Conta desativada" });
    if (!passwordMatches(senhaEnviada, user.senha)) return res.status(401).json({ erro: "Login inválido" });

    if (user.mustChangePassword) {
        return res.status(403).json({ erro: "primeiro_acesso", usuarioId: user.id || user.usuario });
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
    // set() persiste no Supabase (produção) ou no sessions.json (dev).
    // O upsert é assíncrono com retry — se o banco engasgar, o flush de 30s
    // tenta de novo e o shutdown espera as gravações pendentes.
    sessions.set(token, session);
    audit({ user: { usuario: String(user.usuario || user.email), tipo: role } }, "login", { role });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `sentinela_session=${token}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}; Path=/${secure}`);
    res.json({ usuario: String(user.usuario || user.email), nome: user.nome || "", email: user.email || null, role, tipo: role, permissions });
});

// Sessão atual → o frontend decide o dashboard pelo cargo (sem escolher perfil)
app.get("/me", async (req, res) => {
    const token = parseCookies(req.headers.cookie).sentinela_session;
    // get() reidrata do Supabase — o /me é a primeira chamada do frontend,
    // então é ele que evita o "chute para o login" após um restart.
    const session = token ? await sessions.get(token) : null;
    if (!session) {
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

// Recuperação de senha (fluxo com token). Nunca expõe o token em resposta.
app.post("/recuperar-senha", passwordRateLimit, (req, res) => {
    const db = readDB();
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = db.usuarios.find(u => String(u.email || "").trim().toLowerCase() === email);

    if (!user) return res.json({ ok: true });

    const resetToken = crypto.randomBytes(24).toString("hex");
    user.resetToken = hashToken(resetToken);
    user.resetExpires = Date.now() + 60 * 60 * 1000;
    writeDB(db);
    audit({ user: { usuario: user.usuario, tipo: user.role || user.tipo } }, "recuperar_senha_solicitada", { email });

    if (process.env.NODE_ENV !== "production" && String(req.query.debug || "") === "1") {
        console.warn("DEBUG reset token emitido em ambiente não-prod: use apenas em desenvolvimento");
    }

    res.json({ ok: true });
});

app.post("/redefinir-senha", passwordRateLimit, (req, res) => {
    const db = readDB();
    const { token, novaSenha, confirmar } = req.body || {};
    if (!token || !novaSenha || novaSenha !== confirmar || String(novaSenha).length < 6) {
        return res.status(400).json({ erro: "Dados inválidos. Confira token e senhas (mín. 6 caracteres)." });
    }

    const user = (db.usuarios || []).find(u => {
        if (!u.resetToken || !u.resetExpires || u.resetExpires < Date.now()) return false;
        return verifyTokenHash(token, u.resetToken);
    });

    if (!user) return res.status(400).json({ erro: "Token inválido ou expirado" });

    user.senha = hashPassword(novaSenha);
    user.resetToken = null;
    user.resetExpires = null;
    user.mustChangePassword = false;
    writeDB(db);
    audit({ user: { usuario: user.usuario, tipo: user.role || user.tipo } }, "senha_redefinida", {});
    res.json({ ok: true });
});

// Primeiro acesso (funcionário novo define a senha usando a senha temporária)
app.post("/primeiro-acesso", passwordRateLimit, (req, res) => {
    const db = readDB();
    const { usuarioId, senhaTemporaria, novaSenha, confirmar } = req.body || {};
    const user = db.usuarios.find(u => String(u.id || u.usuario) === String(usuarioId));

    if (!user) return res.status(404).json({ erro: "Conta não encontrada" });
    if (!user.mustChangePassword) return res.status(403).json({ erro: "Acesso negado" });
    if (!senhaTemporaria || !user.senhaTemporariaHash) {
        return res.status(400).json({ erro: "Senha temporária obrigatória" });
    }
    if (!passwordMatches(String(senhaTemporaria), user.senhaTemporariaHash)) {
        return res.status(401).json({ erro: "Credenciais inválidas" });
    }
    if (!novaSenha || novaSenha !== confirmar || String(novaSenha).length < 6) {
        return res.status(400).json({ erro: "Senha inválida (mín. 6 caracteres e confirmação igual)." });
    }

    user.senha = hashPassword(novaSenha);
    user.senhaTemporariaHash = null;
    user.senhaTemporariaExpiraEm = null;
    user.mustChangePassword = false;
    user.resetToken = null;
    user.resetExpires = null;
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
    let imagemCaminho = null;
    if (file) {
        const detectedExtension = detectImageSignature(file.buffer);
        const expectedExtension = MIME_TO_EXTENSION[file.mimetype];
        if (!expectedExtension || !detectedExtension || expectedExtension !== detectedExtension) {
            return res.status(400).json({ erro: "Arquivo rejeitado: imagem inválida ou corrompida." });
        }
        const finalName = `${crypto.randomBytes(16).toString("hex")}${expectedExtension}`;
        const savedPath = path.join(UPLOADS_DIR, finalName);
        fs.writeFileSync(savedPath, file.buffer);
        imagemCaminho = `/uploads/${finalName}`;
    }

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

    // Remove somente a triagem da fila ativa.
    //
    // CONSULTAS e ATENDIMENTOS são histórico.
    // Eles nunca devem ser apagados ao finalizar.

    db.triagens =
        (db.triagens || []).filter(
            t =>
                Number(t.id) !==
                Number(triagemId)
        );
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
    const out = await resumoIA(
    paciente,
    triagens,
    consultas,
    atendimentos,
    req.user
);
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
    // apaga do cache e do Supabase/arquivo — o logout vale em qualquer instância
    if (token) await sessions.delete(token);
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

app.post("/profissionais", requireAuth(["admin"]), (req, res) => {
    const db = readDB();
    const { usuario, nome, email, role, setor } = req.body || {};
    if (!usuario || !role) return res.status(400).json({ erro: "usuario e role são obrigatórios" });

    const requesterRole = normalizeRole(req.user.role || req.user.tipo || "");
    const normalizedRole = normalizeRole(role);
    if (!ROLE_PERMISSIONS[normalizedRole]) {
        return res.status(400).json({ erro: `role inválida: ${role}` });
    }
    if (requesterRole !== "admin" || normalizedRole === "admin") {
        return res.status(403).json({ erro: "Apenas o admin pode criar usuários e não é permitido criar um perfil acima do próprio." });
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

    const senhaTemporaria = crypto.randomBytes(18).toString("hex");
    const novo = {
        id: Date.now(),
        usuario: usuarioNormalized,
        nome: String(nome || usuario).trim(),
        email: emailNormalized,
        role: normalizedRole,
        tipo: normalizedRole,
        setor: setor ? String(setor).trim() : null,
        senha: hashPassword(senhaTemporaria),
        senhaTemporariaHash: hashPassword(senhaTemporaria),
        senhaTemporariaExpiraEm: Date.now() + (24 * 60 * 60 * 1000),
        permissions: permissionsFor(normalizedRole),
        mustChangePassword: true,
        ativo: true
    };
    db.usuarios.push(novo);
    writeDB(db);
    audit(req, "profissional_criado", { usuario: novo.usuario, role: novo.role, setor: novo.setor || null });
    res.json({ ok: true, usuario: novo.usuario, role: novo.role, setor: novo.setor || null, primeiroAcesso: true, senhaTemporaria });
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
    return res.status(200).json({ status: "ok", app: "alive", database: usingPostgres() ? "connected" : "local-json" });
});

app.use((err, req, res, next) => {
    console.error("Unhandled error:", err && err.message ? err.message : err);
    if (res.headersSent) return next(err);
    res.status(err && err.statusCode ? err.statusCode : 500).json({ erro: "Erro interno do servidor" });
});

app.use((req, res) => {
    res.status(404).json({ erro: "Rota não encontrada" });
});

function startServer() {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("Gemini API key não configurada. Configure GEMINI_API_KEY no ambiente. A integração de IA usará apenas o resumo local.");
    }

    const PORT = process.env.PORT || 3000;
    hydrate()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Porta ${PORT} · storage=${store.backend()}`);
            });
        })
        .catch((err) => {
            console.error("Falha ao preparar o armazenamento:", err.message);
            process.exit(1);
        });
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    hashPassword,
    passwordMatches,
    hashToken,
    verifyTokenHash,
    normalizeRole,
    parseCookies,
    startServer
};

