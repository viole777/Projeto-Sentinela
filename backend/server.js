const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const multer = require("multer");

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
const { readDB, writeDB } = require("./src/db");

const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;

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
    return (req, res, next) => {
        const token = parseCookies(req.headers.cookie).sentinela_session;
        const session = token && sessions.get(token);

        if (!session || session.expiresAt <= Date.now()) {
            if (token) sessions.delete(token);
            return res.status(401).json({ erro: "Autenticação necessária" });
        }

        if (roles.length && !roles.includes(session.tipo)) {
            return res.status(403).json({ erro: "Perfil sem permissão para esta operação" });
        }

        session.expiresAt = Date.now() + SESSION_TTL_MS;
        req.user = session;
        next();
    };
}

function validateCpf(cpf) {
    return /^\d{11}$/.test(String(cpf).replace(/\D/g, ""));
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
function resumoIA(paciente, triagens, consultas, atendimentos) {
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

//Login (aceita senha como number ou string numérica)
app.post("/login", (req, res) => {
    const db = readDB();

    const usuario = String(req.body.usuario ?? '').trim();
    const senhaEnviada = req.body.senha;
    const senhaEnviadaNum = Number(senhaEnviada);

    if (!usuario || senhaEnviada === undefined || senhaEnviada === null || String(senhaEnviada).length > 128) {
        return res.status(401).json({ erro: "Login inválido" });
    }

    const user = db.usuarios.find(u => String(u.usuario).trim() === usuario && passwordMatches(senhaEnviada, u.senha));

    if (!user) return res.status(401).json({ erro: "Login inválido" });

    if (!String(user.senha).startsWith("scrypt$")) {
        user.senha = hashPassword(senhaEnviada);
        writeDB(db);
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { usuario: String(user.usuario), tipo: user.tipo, expiresAt: Date.now() + SESSION_TTL_MS });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `sentinela_session=${token}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}; Path=/${secure}`);
    res.json({ usuario: user.usuario, tipo: user.tipo });
});

//atendimento (cria paciente por CPF; evita duplicados) + salva imagem
app.post("/atendimento", requireAuth(["atendimento"]), uploadFoto.single("foto"), (req, res) => {
    const db = readDB();

    const nome = (req.body.nome || "").trim();
    const cpf = String(req.body.cpf || "").replace(/\D/g, "");
    const tipo = (req.body.tipo || "").trim();

    if (!nome || nome.length > 120 || !validateCpf(cpf)) {
        return res.status(400).json({ erro: "Nome e CPF são obrigatórios" });
    }

    const file = req.file;
    const imagemCaminho = file ? `/uploads/${file.filename}` : null;

    let paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) {
        paciente = {
            id: Date.now(),
            nome,
            cpf,
            tipo,
            status: "triagem",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        db.pacientes.push(paciente);
    } else {
        paciente.nome = nome;
        paciente.tipo = tipo || paciente.tipo;
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
app.get("/triagem", requireAuth(["medico"]), (req, res) => {
    const db = readDB();

    const triagens = (db.triagens || []).map(t => {
        const atendimento = (db.atendimentos || []).find(a => String(a.pacienteCpf) === String(t.pacienteCpf));
        return { ...t, atendimento };
    });

    res.json(triagens);
});


//compatibilidade (algumas telas podem chamar /triagens)
app.get("/triagens", requireAuth(["medico", "triagem"]), (req, res) => {
    const db = readDB();
    res.json(db.triagens);
});

//delete triagem (para apagar da lista do medico)
app.delete("/triagem", requireAuth(["medico"]), (req, res) => {
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



//consulta (vincula paciente por cpf, se vier; senão tenta usar pacienteId)
// Passa pelo Safety Engine antes de confirmar — sem diagnosticar, só aponta.
app.post("/consulta", requireAuth(["medico"]), (req, res) => {
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
app.post("/safety/preview", requireAuth(["medico"]), (req, res) => {
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
app.post("/finalizar", requireAuth(["medico"]), (req, res) => {
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
app.get("/prontuario/:cpf", requireAuth(["medico", "triagem"]), (req, res) => {
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
app.get("/pacientes", requireAuth(["medico", "triagem", "atendimento"]), (req, res) => {
    const db = readDB();
    const q = String(req.query.q || "").toLowerCase();
    let list = db.pacientes || [];
    if (q) list = list.filter(p => String(p.nome || "").toLowerCase().includes(q) || String(p.cpf || "").includes(q));
    res.json(list.slice(-100).reverse());
});

// ── IA assistente: resumo do prontuário + possíveis inconsistências ──
// Não diagnostica. Aponta registros que merecem revisão pelo profissional.
app.get("/ia/resumo/:cpf", requireAuth(["medico"]), (req, res) => {
    const db = readDB();
    const cpf = String(req.params.cpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === cpf);
    if (!paciente) return res.status(404).json({ erro: "Paciente não encontrado" });
    const triagens = (db.triagens || []).filter(t => String(t.pacienteCpf) === cpf);
    const consultas = (db.consultas || []).filter(c => String(c.pacienteCpf) === cpf);
    const atendimentos = (db.atendimentos || []).filter(a => String(a.pacienteCpf) === cpf);
    const out = resumoIA(paciente, triagens, consultas, atendimentos);
    audit(req, "ia_resumo", { pacienteCpf: cpf });
    res.json({ pacienteCpf: cpf, pacienteNome: paciente.nome, ...out, aviso: "Apoio à decisão. Não substitui avaliação clínica." });
});

// ── Alertas ──
app.get("/alertas", requireAuth(["medico", "triagem"]), (req, res) => {
    const db = ensureTVShape(readDB());
    const nivel = String(req.query.nivel || "").toUpperCase();
    const soAbertos = String(req.query.abertos || "") === "1";
    let list = db.alertas || [];
    if (nivel) list = list.filter(a => String(a.nivel).toUpperCase() === nivel);
    if (soAbertos) list = list.filter(a => !a.resolvido);
    res.json(list.slice(0, 100));
});

app.post("/alertas/:id/resolver", requireAuth(["medico"]), (req, res) => {
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
app.get("/auditoria", requireAuth(["medico"]), (req, res) => {
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

app.post("/logout", (req, res) => {
    const token = parseCookies(req.headers.cookie).sentinela_session;
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", "sentinela_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/");
    res.json({ ok: true });
});

//medicações
app.get("/medicacoes", requireAuth(["medico"]), (req, res) => {
    const db = readDB();
    res.json(db.consultas);
});

//start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Porta ${PORT}`);
});

