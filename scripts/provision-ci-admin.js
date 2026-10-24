'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');

async function main() {
  const password = process.env.TEST_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;
  if (!password || password.length < 16 || !databaseUrl) {
    throw new Error('CI admin provisioning requires DATABASE_URL and a strong TEST_ADMIN_PASSWORD.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `scrypt$${salt}$${hash}`;
  const sslMode = String(process.env.PGSSL || '').toLowerCase();
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode !== 'insecure' }
  });

  try {
    const users = [
      { username: 'admin', name: 'CI Test Administrator', role: 'admin', password: password },
      { username: 'ci.triagem', name: 'CI Test Triage', role: 'triagem', password: process.env.TEST_TRIAGE_PASSWORD }
    ];
    for (const user of users) {
      if (!user.password || user.password.length < 16) {
        throw new Error(`CI password missing or too short for ${user.username}.`);
      }
      const userSalt = crypto.randomBytes(16).toString('hex');
      const userHash = crypto.scryptSync(user.password, userSalt, 64).toString('hex');
      const storedHash = `scrypt${userSalt}${userHash}`;
      await pool.query(
        `INSERT INTO users (username, name, password_hash, role_id, role, active, must_change_password)
         SELECT $1, $2, $3, r.id, $4, TRUE, FALSE
         FROM roles r WHERE r.name = $4
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role_id = EXCLUDED.role_id,
           role = EXCLUDED.role,
           active = TRUE,
           must_change_password = FALSE`,
        [user.username, user.name, storedHash, user.role]
      );
      const check = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
      if (!check.rows.length) throw new Error(`Could not provision CI user ${user.username}: role seed may be missing.`);
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
