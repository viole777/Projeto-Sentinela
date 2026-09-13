const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'db.json');

// ── Camada de persistência unificada ──
// Local/dev: JSON (db.json). Produção: PostgreSQL via DATABASE_URL.
// readDB()/writeDB() abstraem a origem: com DATABASE_URL setado, as rotas
// leem e escrevem no Postgres SEM precisar mudar nenhuma chamada (o JSON
// vira apenas fallback de arranque). Isso elimina o "Frankenstein" de rotas
// gravando em arquivo enquanto o banco real fica vazio.
const { getPool, usingPostgres } = require('./config/database');

// ── RBAC: papéis → permissões (fallback quando banco indisponível; no
// Postgres a tabela role_permissions é a fonte usada em requireAuth) ──
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

// IDs gerados por Date.now() estouram o SERIAL (INT) do Postgres; ao sincronizar
// registros novos deixamos o banco gerar o id (RETURNING id) e reatribuímos.
const INT_MAX = 2147483647;
const isNaturalId = (id) => {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 && n <= INT_MAX;
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
  if (!db.atendimentosCasa) db.atendimentosCasa = [];
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
  // Estoque inicial (seed sintético do hospital de cardiologia)
  if (!db.estoque.length) {
    db.estoque = [
      { id: 1, medicamento: "Aspirina 100mg", categoria: "Antiagregantes plaquetários", quantidade: 90, minimo: 30 },
      { id: 2, medicamento: "Clopidogrel 75mg", categoria: "Antiagregantes plaquetários", quantidade: 56, minimo: 20 },
      { id: 3, medicamento: "Atorvastatina 20mg", categoria: "Estatinas", quantidade: 80, minimo: 25 },
      { id: 4, medicamento: "Losartana 50mg", categoria: "Hipertensão / RAAS", quantidade: 84, minimo: 25 },
      { id: 5, medicamento: "Metoprolol 50mg", categoria: "Betabloqueadores", quantidade: 70, minimo: 25 },
      { id: 6, medicamento: "Carvedilol 25mg", categoria: "Betabloqueadores", quantidade: 48, minimo: 18 },
      { id: 7, medicamento: "Enalapril 10mg", categoria: "Hipertensão / RAAS", quantidade: 62, minimo: 20 },
      { id: 8, medicamento: "Amlodipina 5mg", categoria: "Bloqueadores de canais de cálcio", quantidade: 58, minimo: 20 },
      { id: 9, medicamento: "Furosemida 40mg", categoria: "Diuréticos", quantidade: 40, minimo: 20 },
      { id: 10, medicamento: "Spironolactona 25mg", categoria: "Diuréticos", quantidade: 38, minimo: 18 },
      { id: 11, medicamento: "Digoxina 0,25mg", categoria: "Antiarrítmicos", quantidade: 26, minimo: 10, altoRisco: true },
      { id: 12, medicamento: "Amiodarona 200mg", categoria: "Antiarrítmicos", quantidade: 34, minimo: 12, altoRisco: true },
      { id: 13, medicamento: "Propafenona 150mg", categoria: "Antiarrítmicos", quantidade: 24, minimo: 10, altoRisco: true },
      { id: 14, medicamento: "Nitroglicerina 0,4mg", categoria: "Nitratos", quantidade: 80, minimo: 30 },
      { id: 15, medicamento: "Isosorbida 5mg", categoria: "Nitratos", quantidade: 42, minimo: 15 },
      { id: 16, medicamento: "Heparina 5000UI", categoria: "Anticoagulantes", quantidade: 30, minimo: 12, altoRisco: true },
      { id: 17, medicamento: "Enoxaparina 40mg", categoria: "Anticoagulantes", quantidade: 26, minimo: 12, altoRisco: true },
      { id: 18, medicamento: "Varfarina 5mg", categoria: "Anticoagulantes", quantidade: 24, minimo: 12, altoRisco: true },
      { id: 19, medicamento: "Dobutamina 250mg", categoria: "Inotrópicos", quantidade: 10, minimo: 6, altoRisco: true },
      { id: 20, medicamento: "Verapamil 40mg", categoria: "Bloqueadores de canais de cálcio", quantidade: 30, minimo: 12 },
      { id: 21, medicamento: "Diltiazem 60mg", categoria: "Bloqueadores de canais de cálcio", quantidade: 24, minimo: 10 }
    ];
  }
  return db;
}
// ── JSON (dev) ──
function readJSON() {
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
      atendimentosCasa: [],
      auditoria: [],
    }));
  }
  return seedIfEmpty(ensureDBShape(JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))));
}

function writeJSON(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Estado em memória (espelho do Postgres em produção) ──
let current = null;
let hydrated = false;
let syncChain = Promise.resolve();

// Carrega o estado inicial: Postgres (produção) ou JSON (dev). Chamado antes
// do app.listen() — as rotas que usam readDB() sincrono recebem dados reais.
async function hydrate() {
  if (!usingPostgres() || !getPool()) {
    current = readJSON();
    hydrated = true;
    return current;
  }
  try {
    current = await readAllFromPostgres();
    hydrated = true;
  } catch (error) {
    console.warn('[storage] Postgres indisponível no arranque; usando db.json como fallback:', error.message);
    current = readJSON();
    hydrated = true;
  }
  return current;
}

// Mesma assinatura de sempre — as rotas não mudam, mas a origem sim.
function readDB() {
  if (usingPostgres() && hydrated) return current;
  current = readJSON();
  return current;
}

// Mesma assinatura de sempre — grava no Postgres quando DATABASE_URL estiver
// definido. A sincronização é serializada para evitar duplicar registros novos.
// Se o Postgres falhar (credenciais/offline), mantém um espelho em db.json para
// o fluxo de desenvolvimento não perder dados.
function writeDB(data) {
  if (!usingPostgres()) {
    writeJSON(data);
    current = data;
    return;
  }
  current = data;
  syncChain = syncChain
    .then(() => syncToPostgres(data))
    .catch((err) => {
      console.error('[storage] Sincronização com Postgres falhou:', err.message);
      try { writeJSON(data); } catch (_) { /* sem fallback adicional */ }
    });
}

function readAllSync() { return readDB(); }
// ── Leitura completa do PostgreSQL (formato igual ao db.json das rotas) ──
async function readAllFromPostgres() {
  const pool = getPool();
  const safe = async (query, empty) => {
    try { return (await pool.query(query)).rows; } catch (_) { return empty; }
  };

  const users = await safe(`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id`, []);
  const patients = await safe(`SELECT * FROM patients ORDER BY id DESC LIMIT 500`, []);
  const beds = await safe(`SELECT b.*, w.name AS ala FROM beds b LEFT JOIN wards w ON w.id = b.ward_id`, []);
  const appointments = await safe(`SELECT * FROM appointments ORDER BY id DESC LIMIT 200`, []);
  const triage = await safe(`SELECT * FROM triage ORDER BY id DESC LIMIT 200`, []);
  const consultations = await safe(`SELECT * FROM consultations ORDER BY id DESC LIMIT 200`, []);
  const exams = await safe(`SELECT e.*, er.resultado AS resultado FROM exams e LEFT JOIN exam_results er ON er.exam_id = e.id ORDER BY e.id DESC LIMIT 200`, []);
  const inventory = await safe(`SELECT * FROM inventory ORDER BY id`, []);
  const hospitalizations = await safe(`SELECT * FROM hospitalizations ORDER BY id DESC LIMIT 200`, []);
  const alerts = await safe(`SELECT * FROM alerts ORDER BY id DESC LIMIT 100`, []);
  const safetyRules = await safe(`SELECT rules FROM safety_rules ORDER BY id DESC LIMIT 1`, []);
  const audit = await safe(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200`, []);
  // Tabelas novas (schema recente). Se ainda não existirem no banco, seguimos sem elas.
  const atendimentosCasa = await safe(`SELECT * FROM atendimentos_casa ORDER BY id DESC LIMIT 200`, []);
  const tvCalls = await safe(`SELECT * FROM tv_calls ORDER BY called_at DESC LIMIT 12`, []);

  const db = ensureDBShape({
    usuarios: users.map(u => ({ id: u.id, usuario: u.username, nome: u.name, email: u.email, role: u.role_name || u.role, tipo: u.role_name || u.role, senha: u.password_hash, setor: u.unit, theme: u.theme || 'light', mustChangePassword: u.must_change_password, resetToken: u.reset_token, resetExpires: u.reset_expires, ativo: u.active })),
    pacientes: patients.map(p => ({ id: p.id, nome: p.name, cpf: p.cpf, tipo: p.patient_type, perfil: p.perfil || {}, status: p.status, createdAt: p.created_at, updatedAt: p.updated_at })),
    leitos: beds.map(b => ({ id: b.code, ala: b.ala || 'CARDIOLOGIA', status: b.status === 'free' ? 'livre' : 'ocupado', pacienteCpf: b.patient_cpf, pacienteNome: b.patient_name, desde: b.occupied_since })),
    internacoes: hospitalizations.map(h => ({ id: h.id, pacienteCpf: h.patient_cpf, pacienteNome: h.patient_name, leito: h.bed_code, motivo: h.reason, medicoResponsavel: h.doctor, entradaEm: h.admitted_at, altaEm: h.discharged_at })),
    triagens: triage.map(t => ({ id: t.id, pacienteCpf: t.patient_cpf, pacienteNome: t.patient_name, ...(t.vital_signs || {}), alergia: t.allergy, risco: t.risk, status: t.status, createdAt: t.created_at })),
    consultas: consultations.map(c => ({ id: c.id, pacienteCpf: c.patient_cpf, pacienteNome: c.patient_name, diagnostico: c.diagnosis, medicacao: c.medication, obs: c.notes, safety: c.safety || [], dispensado: c.dispensed, dispensadoPor: c.dispensed_by, dispensadoEm: c.dispensed_at, createdBy: c.created_by, createdAt: c.created_at })),
    atendimentos: appointments.map(a => ({ id: a.id, pacienteCpf: a.patient_cpf, pacienteNome: a.patient_name, tipo: a.appointment_type, imagem: a.image_path, createdAt: a.created_at })),
    atendimentosCasa: atendimentosCasa.map(c => ({ id: c.id, pacienteCpf: c.patient_cpf, pacienteNome: c.patient_name, endereco: c.endereco, motivo: c.motivo, observacoes: c.observacoes, dataAtendimento: c.data_atendimento, status: c.status, criadoPor: c.criado_por, concluidoPor: c.concluido_por, concluidoEm: c.concluido_em, createdAt: c.created_at })),
    auditoria: audit.map(a => ({ id: a.id, quando: a.happened_at, usuario: a.username, perfil: a.role, acao: a.action, detalhes: a.details })),
    exames: exams.map(e => ({ id: e.id, pacienteCpf: e.patient_cpf, pacienteNome: e.patient_name, tipo: e.exam_type, observacao: e.observation, status: e.status === 'done' ? 'concluido' : 'pendente', resultado: e.resultado, solicitadoPor: e.requested_by, solicitadoEm: e.requested_at })),
    estoque: inventory.map(e => ({ id: e.id, medicamento: e.name, quantidade: e.quantity, minimo: e.min_stock, altoRisco: !!e.high_risk })),
    movimentacoes: [], farmacia: [], compras: [], agendamentos: [], prescricoes: [],
    alertas: alerts.map(a => ({ id: a.id, quando: a.happened_at, nivel: a.level, regra: a.rule, mensagem: a.mensagem || a.message, pacienteCpf: a.patient_cpf, pacienteNome: a.patient_name, contexto: a.details || {}, geradoPor: a.created_by, resolvido: a.resolved, resolvidoPor: a.resolved_by, resolvidoEm: a.resolved_at })),
    safetyRules: (safetyRules[0] || {}).rules || null,
    tvChamada: tvCalls.find(t => t.is_current) || null,
    tvHistorico: tvCalls.map(t => ({ id: t.id, pacienteCpf: t.patient_cpf, paciente: t.patient_name, guiche: t.guiche, localType: t.local_type, localNumber: t.local_number, quando: t.called_at, chamadoPor: t.called_by }))
  });
  return db;
}

// ── STORE: API pública (mantida para /dashboard e demais leituras diretas) ──
const store = {
  backend() { return usingPostgres() ? 'postgres' : 'json'; },
  async readAll() { return usingPostgres() ? readAllFromPostgres() : readDB(); },
  hydrate
};
// ═══════════════════════════════════════════════════════════════════════
// Sync: objeto em memória → PostgreSQL (upserts + remoção de registros que
// foram apagados pelas rotas). Ordem respeita FKs (patients antes de tudo).
// ═══════════════════════════════════════════════════════════════════════
async function syncToPostgres(db) {
  const pool = getPool();
  if (!pool) return;
  await syncUsers(pool, db.usuarios || []);
  await syncPatients(pool, db.pacientes || []);
  await syncBeds(pool, db.leitos || []);
  await syncAppointments(pool, db.atendimentos || []);
  await syncTriage(pool, db.triagens || []);
  await syncConsultas(pool, db.consultas || []);
  await syncExams(pool, db.exames || []);
  await syncInventory(pool, db.estoque || [], db.movimentacoes || []);
  await syncAlerts(pool, db.alertas || []);
  await syncHospitalizations(pool, db.internacoes || []);
  await syncAudit(pool, db.auditoria || []);
  await syncAtendimentosCasa(pool, db.atendimentosCasa || []);
  await syncTVCalls(pool, db.tvChamada || null, db.tvHistorico || []);
  await syncSafetyRules(pool, db.safetyRules || null);
}

// Remove do Postgres as linhas cujo id não existe mais em memória.
async function pruneByIds(pool, table, list) {
  const keep = new Set();
  for (const item of list || []) {
    const n = Number(item && item.id);
    if (Number.isFinite(n) && n > 0) keep.add(n);
  }
  const res = await pool.query(`SELECT id FROM ${table}`);
  for (const row of res.rows) {
    const n = Number(row.id);
    if (!keep.has(n)) {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [n]);
    }
  }
}

async function syncUsers(pool, list) {
  for (const u of list) {
    if (!u.usuario) continue;
    const role = String(u.role || u.tipo || 'atendimento').trim().toLowerCase();
    let roleId = (await pool.query(`SELECT id FROM roles WHERE name = $1`, [role])).rows[0];
    if (!roleId) {
      roleId = (await pool.query(`INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`, [role])).rows[0];
    }
    const resetExpires = u.resetExpires ? new Date(u.resetExpires).toISOString() : null;
    const params = [
      String(u.usuario), u.email || null, u.nome || String(u.usuario),
      String(u.senha || ''), role, u.setor || null, u.theme || 'light',
      !!u.mustChangePassword, roleId ? roleId.id : null, u.resetToken || null,
      resetExpires, u.ativo === undefined ? true : !!u.ativo
    ];
    await pool.query(
      `INSERT INTO users (username, email, name, password_hash, role, unit, theme, must_change_password, role_id, reset_token, reset_expires, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (username) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, unit = EXCLUDED.unit, theme = EXCLUDED.theme,
         must_change_password = EXCLUDED.must_change_password, role_id = EXCLUDED.role_id,
         reset_token = EXCLUDED.reset_token, reset_expires = EXCLUDED.reset_expires,
         active = EXCLUDED.active`,
      params
    );
    const got = await pool.query(`SELECT id FROM users WHERE username = $1`, [String(u.usuario)]);
    if (got.rows[0]) u.id = got.rows[0].id;
  }
}

async function syncPatients(pool, list) {
  for (const p of list) {
    if (!p.cpf) continue;
    const r = await pool.query(
      `INSERT INTO patients (cpf, name, patient_type, perfil, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (cpf) DO UPDATE SET
         name = EXCLUDED.name, patient_type = EXCLUDED.patient_type,
         perfil = EXCLUDED.perfil, status = EXCLUDED.status, updated_at = NOW()
       RETURNING id`,
      [String(p.cpf), p.nome || 'Sem nome', p.tipo || null, JSON.stringify(p.perfil || {}), p.status || 'triagem']
    );
    p.id = r.rows[0].id;
  }
}

async function syncBeds(pool, list) {
  for (const b of list) {
    const ala = b.ala || 'CARDIOLOGIA';
    let ward = (await pool.query(`SELECT id FROM wards WHERE name = $1`, [ala])).rows[0];
    if (!ward) {
      ward = (await pool.query(`INSERT INTO wards (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`, [ala])).rows[0];
    }
    const status = b.status === 'livre' ? 'free' : 'occupied';
    const since = b.desde ? new Date(b.desde).toISOString() : (status === 'occupied' ? new Date().toISOString() : null);
    await pool.query(
      `INSERT INTO beds (code, ward_id, status, patient_cpf, patient_name, occupied_since)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO UPDATE SET
         ward_id = EXCLUDED.ward_id, status = EXCLUDED.status,
         patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
         occupied_since = EXCLUDED.occupied_since`,
      [String(b.id), ward ? ward.id : null, status, b.pacienteCpf || null, b.pacienteNome || null, since]
    );
  }
}
async function syncAppointments(pool, list) {
  await pruneByIds(pool, 'appointments', list);
  for (const a of list) {
    const id = Number(a.id);
    const createdAt = a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString();
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO appointments (id, patient_cpf, patient_name, appointment_type, image_path, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           appointment_type = EXCLUDED.appointment_type, image_path = EXCLUDED.image_path`,
        [id, String(a.pacienteCpf), a.pacienteNome || null, a.tipo || null, a.imagem || null, createdAt]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO appointments (patient_cpf, patient_name, appointment_type, image_path, created_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [String(a.pacienteCpf), a.pacienteNome || null, a.tipo || null, a.imagem || null, createdAt]
      );
      a.id = r.rows[0].id;
    }
  }
}

async function syncTriage(pool, list) {
  await pruneByIds(pool, 'triage', list);
  for (const t of list) {
    const vitals = JSON.stringify({
      temperatura: t.temperatura ?? null, pas: t.pas ?? null, pad: t.pad ?? null,
      fc: t.fc ?? null, spo2: t.spo2 ?? null, fr: t.fr ?? null,
      dorToracica: t.dorToracica ?? null, faltaAr: t.faltaAr ?? null, tontura: t.tontura ?? null,
      palpitacoes: t.palpitacoes ?? null, desmaio: t.desmaio ?? null, sintomas: t.sintomas ?? null
    });
    const createdAt = t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString();
    const base = [
      String(t.pacienteCpf), t.pacienteNome || null, vitals, t.alergia || null,
      t.risco || 'verde', t.status || 'aguardando_medico', t.createdBy || null, createdAt
    ];
    const id = Number(t.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO triage (id, patient_cpf, patient_name, vital_signs, allergy, risk, status, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           vital_signs = EXCLUDED.vital_signs, allergy = EXCLUDED.allergy,
           risk = EXCLUDED.risk, status = EXCLUDED.status, created_by = EXCLUDED.created_by`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO triage (patient_cpf, patient_name, vital_signs, allergy, risk, status, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        base
      );
      t.id = r.rows[0].id;
    }
  }
}
async function syncConsultas(pool, list) {
  await pruneByIds(pool, 'consultations', list);
  for (const c of list) {
    const createdAt = c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString();
    const dispensedAt = c.dispensadoEm ? new Date(c.dispensadoEm).toISOString() : null;
    const base = [
      String(c.pacienteCpf), c.pacienteNome || null, c.diagnostico || null,
      c.medicacao || null, c.obs || null, JSON.stringify(c.safety || []),
      !!c.dispensado, c.dispensadoPor || null, dispensedAt, c.createdBy || null, createdAt
    ];
    const id = Number(c.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO consultations (id, patient_cpf, patient_name, diagnosis, medication, notes, safety, dispensed, dispensed_by, dispensed_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           diagnosis = EXCLUDED.diagnosis, medication = EXCLUDED.medication,
           notes = EXCLUDED.notes, safety = EXCLUDED.safety, dispensed = EXCLUDED.dispensed,
           dispensed_by = EXCLUDED.dispensed_by, dispensed_at = EXCLUDED.dispensed_at,
           created_by = EXCLUDED.created_by`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO consultations (patient_cpf, patient_name, diagnosis, medication, notes, safety, dispensed, dispensed_by, dispensed_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        base
      );
      c.id = r.rows[0].id;
    }
  }
}

async function syncExams(pool, list) {
  for (const e of list) {
    const requestedAt = e.solicitadoEm ? new Date(e.solicitadoEm).toISOString() : new Date().toISOString();
    const base = [
      String(e.pacienteCpf), e.pacienteNome || null, e.tipo, e.observacao || null,
      e.status === 'concluido' ? 'done' : 'pending', e.solicitadoPor || null, requestedAt
    ];
    const id = Number(e.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO exams (id, patient_cpf, patient_name, exam_type, observation, status, requested_by, requested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           exam_type = EXCLUDED.exam_type, observation = EXCLUDED.observation,
           status = EXCLUDED.status, requested_by = EXCLUDED.requested_by`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO exams (patient_cpf, patient_name, exam_type, observation, status, requested_by, requested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        base
      );
      e.id = r.rows[0].id;
    }
    if (e.resultado) {
      await pool.query(
        `INSERT INTO exam_results (exam_id, resultado, created_by)
         VALUES ($1,$2,$3)
         ON CONFLICT (exam_id) DO UPDATE SET resultado = EXCLUDED.resultado, created_by = EXCLUDED.created_by`,
        [e.id, JSON.stringify(e.resultado), (e.resultado || {}).laudoPor || null]
      );
    }
  }
}
async function syncInventory(pool, list, movements) {
  for (const item of list) {
    await pool.query(
      `INSERT INTO inventory (name, quantity, min_stock, high_risk)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (name) DO UPDATE SET
         quantity = EXCLUDED.quantity, min_stock = EXCLUDED.min_stock, high_risk = EXCLUDED.high_risk`,
      [item.medicamento, Number(item.quantidade) || 0, Number(item.minimo) || 10, !!item.altoRisco]
    );
  }
  for (const m of movements || []) {
    const inv = (await pool.query(`SELECT id FROM inventory WHERE name = $1`, [m.medicamento])).rows[0];
    if (!inv) continue;
    if (isNaturalId(Number(m.id))) {
      await pool.query(
        `INSERT INTO inventory_movements (id, inventory_id, kind, qty, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [Number(m.id), inv.id, m.tipo || 'entrada', Number(m.qtd) || 0, m.reason || null, m.por || null]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO inventory_movements (inventory_id, kind, qty, reason, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [inv.id, m.tipo || 'entrada', Number(m.qtd) || 0, m.reason || null, m.por || null]
      );
      m.id = r.rows[0].id;
    }
  }
}

async function syncAlerts(pool, list) {
  for (const a of list) {
    const happenedAt = a.quando ? new Date(a.quando).toISOString() : new Date().toISOString();
    const resolvedAt = a.resolvidoEm ? new Date(a.resolvidoEm).toISOString() : null;
    const base = [
      a.nivel || 'ATENCAO', a.regra || 'geral', a.mensagem || '',
      a.pacienteCpf || null, a.pacienteNome || null,
      JSON.stringify(a.contexto || a.detalhes || {}), a.geradoPor || a.createdBy || null,
      !!a.resolvido, a.resolvidoPor || null, resolvedAt, happenedAt
    ];
    const id = Number(a.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO alerts (id, level, rule, message, patient_cpf, patient_name, details, created_by, resolved, resolved_by, resolved_at, happened_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           level = EXCLUDED.level, rule = EXCLUDED.rule, message = EXCLUDED.message,
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           details = EXCLUDED.details, created_by = EXCLUDED.created_by,
           resolved = EXCLUDED.resolved, resolved_by = EXCLUDED.resolved_by, resolved_at = EXCLUDED.resolved_at`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO alerts (level, rule, message, patient_cpf, patient_name, details, created_by, resolved, resolved_by, resolved_at, happened_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        base
      );
      a.id = r.rows[0].id;
    }
  }
}

async function syncHospitalizations(pool, list) {
  await pruneByIds(pool, 'hospitalizations', list);
  for (const h of list) {
    const admittedAt = h.entradaEm ? new Date(h.entradaEm).toISOString() : new Date().toISOString();
    const dischargedAt = h.altaEm ? new Date(h.altaEm).toISOString() : null;
    const base = [
      String(h.pacienteCpf), h.pacienteNome || null, h.leito || null,
      h.motivo || null, h.medicoResponsavel || h.doc || null, admittedAt, dischargedAt
    ];
    const id = Number(h.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO hospitalizations (id, patient_cpf, patient_name, bed_code, reason, doctor, admitted_at, discharged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           bed_code = EXCLUDED.bed_code, reason = EXCLUDED.reason, doctor = EXCLUDED.doctor,
           discharged_at = EXCLUDED.discharged_at`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO hospitalizations (patient_cpf, patient_name, bed_code, reason, doctor, admitted_at, discharged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        base
      );
      h.id = r.rows[0].id;
    }
  }
}

async function syncAudit(pool, list) {
  for (const a of list) {
    const happenedAt = a.quando ? new Date(a.quando).toISOString() : new Date().toISOString();
    const base = [
      a.usuario || 'sistema', a.perfil || a.role || null,
      a.acao || '', JSON.stringify(a.detalhes || {}), happenedAt
    ];
    const id = Number(a.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO audit_logs (id, username, role, action, details, happened_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username, role = EXCLUDED.role,
           action = EXCLUDED.action, details = EXCLUDED.details`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO audit_logs (username, role, action, details, happened_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        base
      );
      a.id = r.rows[0].id;
    }
  }
}
async function syncAtendimentosCasa(pool, list) {
  await pruneByIds(pool, 'atendimentos_casa', list);
  for (const c of list) {
    const createdAt = c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString();
    const concludedAt = c.concluidoEm ? new Date(c.concluidoEm).toISOString() : null;
    const base = [
      String(c.pacienteCpf), c.pacienteNome || null, c.endereco || null,
      c.motivo || null, c.observacoes || null, c.dataAtendimento || null,
      c.status || 'agendado', c.criadoPor || null,
      c.concluidoPor || null, concludedAt, createdAt
    ];
    const id = Number(c.id);
    if (isNaturalId(id)) {
      await pool.query(
        `INSERT INTO atendimentos_casa (id, patient_cpf, patient_name, endereco, motivo, observacoes, data_atendimento, status, criado_por, concluido_por, concluido_em, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
           endereco = EXCLUDED.endereco, motivo = EXCLUDED.motivo, observacoes = EXCLUDED.observacoes,
           data_atendimento = EXCLUDED.data_atendimento, status = EXCLUDED.status,
           concluido_por = EXCLUDED.concluido_por, concluido_em = EXCLUDED.concluido_em`,
        [id, ...base]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO atendimentos_casa (patient_cpf, patient_name, endereco, motivo, observacoes, data_atendimento, status, criado_por, concluido_por, concluido_em, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        base
      );
      c.id = r.rows[0].id;
    }
  }
}

async function syncTVCalls(pool, currentCall, history) {
  const rows = history || [];
  const ids = [];
  for (const call of rows) {
    const id = Number(call.id);
    if (!Number.isFinite(id)) continue;
    ids.push(id);
    const calledAt = call.quando ? new Date(call.quando).toISOString() : new Date().toISOString();
    await pool.query(
      `INSERT INTO tv_calls (id, patient_cpf, patient_name, guiche, local_type, local_number, called_at, called_by, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         patient_cpf = EXCLUDED.patient_cpf, patient_name = EXCLUDED.patient_name,
         guiche = EXCLUDED.guiche, local_type = EXCLUDED.local_type, local_number = EXCLUDED.local_number,
         is_current = EXCLUDED.is_current`,
      [id, call.pacienteCpf || null, call.paciente || call.pacienteNome || null,
        call.guiche || null, call.localType || null, call.localNumber || null,
        calledAt, call.chamadoPor || null,
        !!(currentCall && Number(currentCall.id) === id)]
    );
  }
  if (ids.length) {
    await pool.query(`DELETE FROM tv_calls WHERE NOT (id = ANY($1::bigint[]))`, [ids]);
  } else {
    await pool.query(`DELETE FROM tv_calls`);
  }
}

async function syncSafetyRules(pool, rules) {
  if (!rules || !Object.keys(rules).length) return;
  await pool.query(`INSERT INTO safety_rules (rules) VALUES ($1)`, [JSON.stringify(rules)]);
}

module.exports = {
  readDB,
  writeDB,
  readAllSync,
  ROLE_PERMISSIONS,
  store,
  usingPostgres,
  getPool,
  hydrate,
  syncToPostgres
};