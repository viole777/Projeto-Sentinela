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
    await pool.query(
      `INSERT INTO users (username, name, password_hash, role_id, role, active, must_change_password)
       SELECT 'admin', 'CI Test Administrator', $1, r.id, 'admin', TRUE, FALSE
       FROM roles r WHERE r.name = 'admin'
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role_id = EXCLUDED.role_id,
         role = EXCLUDED.role,
         active = TRUE,
         must_change_password = FALSE`,
      [passwordHash]
    );
    const check = await pool.query("SELECT id FROM users WHERE username = 'admin'");
    if (!check.rows.length) throw new Error('Could not provision CI admin: admin role seed is missing.');
    console.log('Temporary CI administrator provisioned.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('CI admin provisioning failed:', error.message || error);
  process.exit(1);
});
