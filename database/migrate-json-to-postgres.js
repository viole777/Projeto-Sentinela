// Migração: JSON atual (backend/db.json) → PostgreSQL (Render).
// Uso: DATABASE_URL=postgres://... node database/migrate-json-to-postgres.js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Defina DATABASE_URL primeiro.');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  const dbPath = path.join(__dirname, '..', 'backend', 'db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const schema2 = fs.readFileSync(path.join(__dirname, 'schema2.sql'), 'utf8');
  const seeds = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf8');
  await pool.query(schema + '\n' + schema2 + '\n' + seeds);

  for (const u of db.usuarios || []) {
    const role = u.role || u.tipo || 'atendimento';
    await pool.query(
      `INSERT INTO users (username, email, name, password_hash, role, must_change_password, unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
      [String(u.usuario), u.email || null, u.nome || String(u.usuario), String(u.senha), role, !!u.mustChangePassword, u.setor || null]
    );
    const r = await pool.query(`SELECT id FROM roles WHERE name = $1`, [role]);
    if (r.rows[0]) {
      await pool.query(`UPDATE users SET role_id = $2 WHERE username = $1`, [String(u.usuario), r.rows[0].id]);
    }
  }

  for (const p of db.pacientes || []) {
    await pool.query(
      `INSERT INTO patients (name, cpf, patient_type, perfil, status) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (cpf) DO UPDATE SET name = EXCLUDED.name, perfil = EXCLUDED.perfil, status = EXCLUDED.status`,
      [p.nome, String(p.cpf), p.tipo || null, JSON.stringify(p.perfil || {}), p.status || 'triagem']
    );
  }

  for (const a of db.atendimentos || []) {
    await pool.query(
      `INSERT INTO appointments (patient_cpf, patient_name, appointment_type, image_path) VALUES ($1,$2,$3,$4)`,
      [String(a.pacienteCpf), a.pacienteNome || null, a.tipo || null, a.imagem || null]
    );
  }

  for (const t of db.triagens || []) {
    await pool.query(
      `INSERT INTO triage (patient_cpf, patient_name, vital_signs, allergy, risk, status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [String(t.pacienteCpf), t.pacienteNome || null,
        JSON.stringify({ temperatura: t.temperatura, pas: t.pas, pad: t.pad, fc: t.fc, spo2: t.spo2, fr: t.fr, dorToracica: t.dorToracica, faltaAr: t.faltaAr, tontura: t.tontura, palpitacoes: t.palpitacoes, desmaio: t.desmaio, sintomas: t.sintomas }),
        t.alergia || null, t.risco || 'verde', t.status || 'aguardando_medico']
    );
  }

  for (const c of db.consultas || []) {
    await pool.query(
      `INSERT INTO consultations (patient_cpf, patient_name, diagnosis, medication, notes, safety, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [String(c.pacienteCpf), c.pacienteNome || null, c.diagnostico || null, c.medicacao || null, c.obs || null, JSON.stringify(c.safety || []), c.createdBy || null]
    );
  }

  for (const e of db.exames || []) {
    const r = await pool.query(
      `INSERT INTO exams (patient_cpf, patient_name, exam_type, observation, status, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [String(e.pacienteCpf), e.pacienteNome || null, e.tipo, e.observacao || null, e.status === 'concluido' ? 'done' : 'pending', e.solicitadoPor || null]
    );
    if (e.resultado) {
      await pool.query(`INSERT INTO exam_results (exam_id, resultado, created_by) VALUES ($1,$2,$3)`,
        [r.rows[0].id, JSON.stringify(e.resultado), (e.resultado || {}).laudoPor || null]);
    }
  }

  for (const e of db.estoque || []) {
    await pool.query(
      `INSERT INTO inventory (name, quantity, min_stock, high_risk) VALUES ($1,$2,$3,$4)
       ON CONFLICT (name) DO UPDATE SET quantity = EXCLUDED.quantity, min_stock = EXCLUDED.min_stock`,
      [e.medicamento, Number(e.quantidade) || 0, Number(e.minimo) || 10, !!e.altoRisco]
    );
  }

  for (const a of db.alertas || []) {
    await pool.query(
      `INSERT INTO alerts (level, rule, message, patient_cpf, patient_name, details, created_by, resolved, resolved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [a.nivel, a.regra, a.mensagem, a.pacienteCpf || null, a.pacienteNome || null, JSON.stringify(a.contexto || {}), a.geradoPor || null, !!a.resolvido, a.resolvidoPor || null]
    );
  }

  for (const l of db.auditoria || []) {
    await pool.query(`INSERT INTO audit_logs (username, role, action, details) VALUES ($1,$2,$3,$4)`,
      [l.usuario, l.perfil || null, l.acao, JSON.stringify(l.detalhes || {})]);
  }

  if (db.safetyRules) {
    await pool.query(`INSERT INTO safety_rules (rules) VALUES ($1)`, [JSON.stringify(db.safetyRules)]);
  }

  console.log('Migração concluída.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
