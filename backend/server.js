const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const multer = require("multer");

const app = express();
app.use(express.json());
app.use(cors());

//frontend
app.use(express.static(path.join(__dirname, "../frontend")));

//uploads
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

// camada de persistência (db.json) reutilizada
const { readDB, writeDB } = require("./src/db");


const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || "";
        cb(null, `foto_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
    }
});

const upload = multer({ storage });

//Login (aceita senha como number ou string numérica)
app.post("/login", (req, res) => {
    const db = readDB();

    const usuario = String(req.body.usuario ?? '').trim();
    const senhaEnviada = req.body.senha;
    const senhaEnviadaNum = Number(senhaEnviada);

    if (!usuario || Number.isNaN(senhaEnviadaNum)) {
        return res.status(401).json({ erro: "Login inválido" });
    }

    const user = db.usuarios.find(
        u => String(u.usuario).trim() === usuario && Number(u.senha) === senhaEnviadaNum
    );

    if (!user) return res.status(401).json({ erro: "Login inválido" });

    res.json(user);
});

//atendimento (cria paciente por CPF; evita duplicados) + salva imagem
app.post("/atendimento", upload.single("foto"), (req, res) => {
    const db = readDB();

    const nome = (req.body.nome || "").trim();
    const cpf = String(req.body.cpf || "").trim();
    const tipo = (req.body.tipo || "").trim();

    if (!nome || !cpf) {
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
app.post("/triagem", (req, res) => {
    const db = readDB();

    const pacienteCpf = String(req.body.pacienteCpf || "").trim();
    const paciente = db.pacientes.find(p => String(p.cpf) === pacienteCpf);

    if (!paciente) {
        return res.status(400).json({ erro: "Paciente não encontrado para o CPF informado" });
    }

    let risco = req.body.risco;

    //regra automatica
    const temperaturaNum = Number(req.body.temperatura);
    if (temperaturaNum > 39) risco = "vermelho";
    if (temperaturaNum < 38 && risco !== "vermelho") risco = "amarelo";

    const triagem = {
        id: Date.now(),
        pacienteId: paciente.id,
        pacienteCpf: paciente.cpf,
        pacienteNome: paciente.nome,

        ...req.body,
        risco,
        status: "aguardando_medico",
        createdAt: new Date().toISOString()
    };

    db.triagens.push(triagem);

    // atualiza status do paciente
    paciente.status = "aguardando_medico";
    paciente.updatedAt = new Date().toISOString();

    writeDB(db);
    res.json(triagem);
});


//triagem para medico (com dados do atendimento via CPF)
app.get("/triagem", (req, res) => {
    const db = readDB();

    const triagens = (db.triagens || []).map(t => {
        const atendimento = (db.atendimentos || []).find(a => String(a.pacienteCpf) === String(t.pacienteCpf));
        return { ...t, atendimento };
    });

    res.json(triagens);
});


//compatibilidade (algumas telas podem chamar /triagens)
app.get("/triagens", (req, res) => {
    const db = readDB();
    res.json(db.triagens);
});

//delete triagem (para apagar da lista do medico)
app.delete("/triagem", (req, res) => {
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
app.get("/atendimentos", (req, res) => {
    const db = readDB();
    const cpf = String(req.query.cpf || "").trim();
    const list = cpf ? db.atendimentos.filter(a => String(a.pacienteCpf) === cpf) : db.atendimentos;
    res.json(list);
});



//consulta (vincula paciente por cpf, se vier; senão tenta usar pacienteId)
app.post("/consulta", (req, res) => {
    const db = readDB();

    const pacienteCpf = String(req.body.pacienteCpf || "").trim();
    const pacienteId = req.body.pacienteId;

    let paciente;
    if (pacienteId) {
        paciente = db.pacientes.find(p => p.id === pacienteId);
    }
    if (!paciente && pacienteCpf) {
        paciente = db.pacientes.find(p => String(p.cpf) === pacienteCpf);
    }

    if (!paciente) {
        return res.status(400).json({ erro: "Paciente não encontrado para a consulta" });
    }

    const consulta = {
        id: Date.now(),
        pacienteId: paciente.id,
        pacienteCpf: paciente.cpf,
        pacienteNome: paciente.nome,

        ...req.body,
        createdAt: new Date().toISOString(),
        status: "finalizado"
    };

    db.consultas.push(consulta);

    // atualiza status do paciente (opcional)
    paciente.status = "em_consulta";
    paciente.updatedAt = new Date().toISOString();

    writeDB(db);
    res.json(consulta);
});

//finalizar atendimento (alta ou internar) e remover da triagem/painel
app.post("/finalizar", (req, res) => {
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

//medicações
app.get("/medicacoes", (req, res) => {
    const db = readDB();
    res.json(db.consultas);
});

//start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Porta ${PORT}`);
});

