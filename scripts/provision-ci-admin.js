'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');

async function main() {
  const password = process.env.TEST_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;
  const directorPassword = process.env.TEST_DIRECTOR_PASSWORD;
  if (!password || password.length < 16 || !directorPassword || directorPassword.length < 16 || !databaseUrl) {
    throw new Error('CI admin provisioning requires DATABASE_URL and a strong TEST_ADMIN_PASSWORD.');
  }

  const sslMode = String(process.env.PGSSL || '').toLowerCase();
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode !== 'insecure' }
  });

  try {
    const users = [
      { username: 'admin', name: 'CI Test Administrator', role: 'admin', unit: 'ci-unit', password },
      { username: 'ci.triagem', name: 'CI Test Triage', role: 'triagem', unit: 'ci-unit', password: process.env.TEST_TRIAGE_PASSWORD },
      { username: 'ci.medico', name: 'CI Test Physician', role: 'medico', unit: 'ci-unit', password: process.env.TEST_DOCTOR_PASSWORD || password },
      { username: 'ci.farmacia', name: 'CI Test Pharmacist', role: 'farmacia', unit: 'ci-unit', password: process.env.TEST_PHARMACY_PASSWORD || password },
      { username: 'ci.direcao', name: 'CI Test Director', role: 'direcao', unit: 'ci-unit', password: directorPassword }
    ];

    for (const user of users) {
      if (!user.password || user.password.length < 16) {
        throw new Error(`CI password missing or too short for ${user.username}.`);
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(user.password, salt, 64).toString('hex');
      const passwordHash = `scrypt${String.fromCharCode(36)}${salt}${String.fromCharCode(36)}${hash}`;

      const result = await pool.query(
        `INSERT INTO users (username, name, password_hash, role_id, role, unit, active, must_change_password)
         SELECT $1, $2, $3, r.id, $4, $5, TRUE, FALSE
         FROM roles r WHERE r.name = $4
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role_id = EXCLUDED.role_id,
           role = EXCLUDED.role,
           unit = EXCLUDED.unit,
           active = TRUE,
           must_change_password = FALSE
         RETURNING id`,
        [user.username, user.name, passwordHash, user.role, user.unit]
      );
      if (!result.rows.length) {
        throw new Error(`Could not provision CI user ${user.username}: role seed may be missing.`);
      }
    }

    const doctor = await pool.query("SELECT id FROM users WHERE username='ci.medico'");
    await pool.query(
      `INSERT INTO professional_registry(user_id,cns,cbo,unit_id,cnes,active)
       VALUES($1,'123456789012345','225125','ci-unit','1234567',TRUE)
       ON CONFLICT(user_id) DO UPDATE SET cns=EXCLUDED.cns,cbo=EXCLUDED.cbo,unit_id=EXCLUDED.unit_id,cnes=EXCLUDED.cnes,active=TRUE`,
      [doctor.rows[0].id]
    );

    await pool.query(
      `INSERT INTO patients (cpf, name, perfil, status, unit_id)
       VALUES ('99999999999', 'Paciente Sintético CI', '{"alergias":"penicilina"}'::jsonb, 'triagem', 'ci-unit')
       ON CONFLICT (cpf) DO UPDATE SET name = EXCLUDED.name, perfil = EXCLUDED.perfil, status = EXCLUDED.status, unit_id = EXCLUDED.unit_id`
    );
    await pool.query(
      `INSERT INTO triage (patient_cpf, patient_name, allergy, risk, status)
       VALUES ('99999999999', 'Paciente Sintético CI', 'penicilina', 'amarelo', 'aguardando_medico')`
    );

    console.log('Temporary CI test users provisioned.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('CI admin provisioning failed:', error.message || error);
  process.exit(1);
});
