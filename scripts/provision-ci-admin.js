'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');

async function main() {
  const password = process.env.TEST_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;
  if (!password || password.length < 16 || !databaseUrl) {
    throw new Error('CI admin provisioning requires DATABASE_URL and a strong TEST_ADMIN_PASSWORD.');
  }

  const sslMode = String(process.env.PGSSL || '').toLowerCase();
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode !== 'insecure' }
  });

  try {
    const users = [
      { username: 'admin', name: 'CI Test Administrator', role: 'admin', password },
      { username: 'ci.triagem', name: 'CI Test Triage', role: 'triagem', password: process.env.TEST_TRIAGE_PASSWORD },
      { username: 'ci.medico', name: 'CI Test Physician', role: 'medico', password: process.env.TEST_DOCTOR_PASSWORD || password },
      { username: 'ci.farmacia', name: 'CI Test Pharmacist', role: 'farmacia', password: process.env.TEST_PHARMACY_PASSWORD || password }
    ];

    for (const user of users) {
      if (!user.password || user.password.length < 16) {
        throw new Error(`CI password missing or too short for ${user.username}.`);
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(user.password, salt, 64).toString('hex');
      const passwordHash = `scrypt${String.fromCharCode(36)}${salt}${String.fromCharCode(36)}${hash}`;

      const result = await pool.query(
        `INSERT INTO users (username, name, password_hash, role_id, role, active, must_change_password)
         SELECT $1, $2, $3, r.id, $4, TRUE, FALSE
         FROM roles r WHERE r.name = $4
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role_id = EXCLUDED.role_id,
           role = EXCLUDED.role,
           active = TRUE,
           must_change_password = FALSE
         RETURNING id`,
        [user.username, user.name, passwordHash, user.role]
      );
      if (!result.rows.length) {
        throw new Error(`Could not provision CI user ${user.username}: role seed may be missing.`);
      }
    }

    await pool.query(
      `INSERT INTO patients (cpf, name, perfil, status)
       VALUES ('99999999999', 'Paciente Sintético CI', '{"alergias":"penicilina"}'::jsonb, 'triagem')
       ON CONFLICT (cpf) DO UPDATE SET name = EXCLUDED.name, perfil = EXCLUDED.perfil, status = EXCLUDED.status`
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
