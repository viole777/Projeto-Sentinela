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
      { username: 'ci.triagem', name: 'CI Test Triage', role: 'triagem', password: process.env.TEST_TRIAGE_PASSWORD }
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

    console.log('Temporary CI test users provisioned.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('CI admin provisioning failed:', error.message || error);
  process.exit(1);
});
