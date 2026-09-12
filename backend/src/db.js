const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'db.json');

// ── Camada de persistência unificada ──
// Local/dev: JSON (db.json). Produção/Render: PostgreSQL via DATABASE_URL.
// Toda rota usa store.* — nunca acessa o JSON diretamente.
// Isso elimina o "Frankenstein de 8MB" e o filesystem efêmero do Render Free.
let pgPool = null;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (pgPool) return pgPool;
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  return pgPool;
}
function usingPostgres() { return !!process.env.DATABASE_URL; }

// ── RBAC: papéis → permissões (o usuário NÃO escolhe o cargo no login) ──
const ROLE_PERMISSIONS = {
  admin: ["*"],
  cardiologist: [
    "dashboard.read",
    "patients.read", "patients.write",
    "appointments.read", "triage.read",
    "consultations.read", "consultations.write",
    "exams.read", "exams.write",
    "prescriptions.read", "prescriptions.write",
    "alerts.read", "alerts.resolve",
    "ai.read", "audit.read", "reports.read"
  ],
  medico: [
    "dashboard.read",
    "patients.read", "patients.write",
    "appointments.read", "triage.read",
    "consultations.read", "consultations.write",
    "exams.read", "exams.write",
    "prescriptions.read", "prescriptions.write",
    "alerts.read", "alerts.resolve",
    "ai.read", "audit.read", "reports.read"
  ],
  enfermagem: [
    "dashboard.read", "patients.read",
    "appointments.read", "triage.read", "triage.write",
    "internacoes.read", "internacoes.write",
    "exams.read", "alerts.read"
  ],
  triagem: [
    "dashboard.read", "patients.read",
    "appointments.read", "triage.read", "triage.write", "alerts.read"
  ],
  farmacia: [
    "dashboard.read", "patients.read",
    "prescriptions.read", "prescriptions.dispense",
    "estoque.read", "estoque.write", "alerts.read"
  ],
  atendimento: [
    "dashboard.read", "patients.read", "patients.write",
    "appointments.read", "appointments.write"
  ],
  recepcao: [
    "dashboard.read", "patients.read", "patients.write",
    "appointments.read", "appointments.write"
  ],
  direcao: [
    "dashboard.read", "reports.read", "audit.read",
    "patients.read", "alerts.read"
  ]
};

function ensureDBShape(db) {
  if (!db.usuarios) db.usuarios = [];
  if (!db.pacientes) db.pacientes = [];
  if (!db.leitos) db.leitos = [];
  if (!db.agendamentos) db.agendamentos = [];
  if (!db.prescricoes) db.prescricoes = [];
  if (!db.internacoes) db.internacoes = [];
  if (!db.triagens) db.triagens = [];
  if (!db.consultas) db.consultas = [];
  if (!db.atendimentos) db.atendimentos = [];
  if (!db.auditoria) db.auditoria = [];
  // ── Novos módulos (hospital de cardiologia) ──
  if (!db.exames) db.exames = [];
  if (!db.farmacia) db.farmacia = [];
  if (!db.estoque) db.estoque = [];
  if (!db.movimentacoes) db.movimentacoes = [];
  if (!db.compras) db.compras = [];
  if (!db.alertas) db.alertas = [];
  if (!db.safetyRules) db.safetyRules = null; // null = usa regras padrão do código
  if (!db.tvChamada) db.tvChamada = null;
  if (!db.tvHistorico) db.tvHistorico = [];
  // perfil cardiovascular estendido do paciente vive dentro de db.pacientes[*].perfil
  return db;
}

function seedIfEmpty(db) {
  // Leitos da ala cardiologia (mapa inicial)
  if (!db.leitos.length) {
    db.leitos = [
      { id: "101", ala: "CARDIOLOGIA", status: "livre", pacienteCpf: null },
      { id: "102", ala: "CARDIOLOGIA", status: "livre", pacienteCpf: null },
      { id: "103", ala: "CARDIOLOGIA", status: "livre", pacienteCpf: null },
      { id: "104", ala: "CARDIOLOGIA", status: "livre", pacienteCpf: null },
      { id: "105", ala: "CARDIOLOGIA", status: "livre", pacienteCpf: null },
      { id: "UTI-201", ala: "UTI CARDIOVASCULAR", status: "livre", pacienteCpf: null }
    ];
  }
  // Estoque inicial
  if (!db.estoque.length) {
    db.estoque = [
      { id: 1, medicamento: "Dipirona 500mg", quantidade: 82, minimo: 20, updatedAt: new Date().toISOString() },
      { id: 2, medicamento: "Varfarina 5mg", quantidade: 7, minimo: 15, altoRisco: true, updatedAt: new Date().toISOString() },
      { id: 3, medicamento: "Losartana 50mg", quantidade: 60, minimo: 20, updatedAt: new Date().toISOString() }
    ];
  }
  return db;
}


function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return seedIfEmpty(ensureDBShape({
      usuarios: [],
      pacientes: [],
      leitos: [],
      agendamentos: [],
      prescricoes: [],
      internacoes: [],
      triagens: [],
      consultas: [],
      atendimentos: [],
      auditoria: [],
    }));
  }
  return seedIfEmpty(ensureDBShape(JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function readAllSync() { return readDB(); }

// ── STORE: API única usada por todas as rotas ──
// JSON (dev) ou Postgres (Render, via DATABASE_URL). Migração:
//   DATABASE_URL=... node database/migrate-json-to-postgres.js
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (pgPool) return pgPool;
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  return pgPool;
}
function usingPostgres() { return !!process.env.DATABASE_URL; }

const store = {
  backend() { return usingPostgres() ? 'postgres' : 'json'; },
  async readAll() {
    if (!usingPostgres()) return readDB();
    const pool = getPool();
    const [users, patients, beds, appointments, triage, consultations, exams, inventory, hospitalizations, alerts, safetyRules, audit] = await Promise.all([
      pool.query(`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id`),
      pool.query(`SELECT * FROM patients ORDER BY id DESC LIMIT 500`),
      pool.query(`SELECT b.*, w.name AS ala FROM beds b LEFT JOIN wards w ON w.id = b.ward_id`),
      pool.query(`SELECT * FROM appointments ORDER BY id DESC LIMIT 200`),
      pool.query(`SELECT * FROM triage ORDER BY id DESC LIMIT 200`),
      pool.query(`SELECT * FROM consultations ORDER BY id DESC LIMIT 200`),
      pool.query(`SELECT e.*, er.resultado AS resultado FROM exams e LEFT JOIN exam_results er ON er.exam_id = e.id ORDER BY e.id DESC LIMIT 200`),
      pool.query(`SELECT * FROM inventory ORDER BY id`),
      pool.query(`SELECT * FROM hospitalizations ORDER BY id DESC LIMIT 200`),
      pool.query(`SELECT * FROM alerts ORDER BY id DESC LIMIT 100`),
      pool.query(`SELECT rules FROM safety_rules ORDER BY id DESC LIMIT 1`),
      pool.query(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200`)
    ]);
    return {
      usuarios: users.rows.map(u => ({ id: u.id, usuario: u.username, nome: u.name, email: u.email, role: u.role_name || u.role, tipo: u.role_name || u.role, senha: u.password_hash, setor: u.unit, mustChangePassword: u.must_change_password })),
      pacientes: patients.rows.map(p => ({ id: p.id, nome: p.name, cpf: p.cpf, tipo: p.patient_type, perfil: p.perfil || {}, status: p.status, createdAt: p.created_at, updatedAt: p.updated_at })),
      leitos: beds.rows.map(b => ({ id: b.code, ala: b.ala, status: b.status === 'free' ? 'livre' : 'ocupado', pacienteCpf: b.patient_cpf, pacienteNome: b.patient_name })),
      internacoes: hospitalizations.rows.map(h => ({ id: h.id, pacienteCpf: h.patient_cpf, pacienteNome: h.patient_name, leito: h.bed_code, motivo: h.reason, entradaEm: h.admitted_at, altaEm: h.discharged_at })),
      triagens: triage.rows.map(t => ({ id: t.id, pacienteCpf: t.patient_cpf, pacienteNome: t.patient_name, ...(t.vital_signs || {}), alergia: t.allergy, risco: t.risk, status: t.status, createdAt: t.created_at })),
      consultas: consultations.rows.map(c => ({ id: c.id, pacienteCpf: c.patient_cpf, pacienteNome: c.patient_name, diagnostico: c.diagnosis, medicacao: c.medication, obs: c.notes, safety: c.safety || [], createdAt: c.created_at })),
      atendimentos: appointments.rows.map(a => ({ id: a.id, pacienteCpf: a.patient_cpf, pacienteNome: a.patient_name, tipo: a.appointment_type, imagem: a.image_path, createdAt: a.created_at })),
      auditoria: audit.rows.map(a => ({ id: a.id, quando: a.happened_at, usuario: a.username, perfil: a.role, acao: a.action, detalhes: a.details })),
      exames: exams.rows.map(e => ({ id: e.id, pacienteCpf: e.patient_cpf, pacienteNome: e.patient_name, tipo: e.exam_type, observacao: e.observation, status: e.status === 'done' ? 'concluido' : 'pendente', resultado: e.resultado, solicitadoEm: e.requested_at })),
      estoque: inventory.rows.map(e => ({ id: e.id, medicamento: e.name, quantidade: e.quantity, minimo: e.min_stock })),
      movimentacoes: [], farmacia: [], compras: [], agendamentos: [], prescricoes: [],
      alertas: alerts.rows.map(a => ({ id: a.id, quando: a.happened_at, nivel: a.level, regra: a.rule, mensagem: a.mensagem || a.message, pacienteCpf: a.patient_cpf, pacienteNome: a.patient_name, resolvido: a.resolved })),
      safetyRules: (safetyRules.rows[0] || {}).rules || null,
      tvChamada: null, tvHistorico: []
    };
  }
};

module.exports = { readDB, writeDB, readAllSync, ROLE_PERMISSIONS, store, usingPostgres, getPool };

