const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'db.json');

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

module.exports = { readDB, writeDB, ROLE_PERMISSIONS };

