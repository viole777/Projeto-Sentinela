'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : (process.env.PGSSL ? { rejectUnauthorized: false } : undefined),
    max: 1
  });
  try {
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '20261112_clinical_platform.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    const result = await pool.query(
      "SELECT to_regclass('public.clinical_records') AS clinical_records, to_regclass('public.clinical_audit_events') AS clinical_audit_events"
    );
    if (!result.rows[0]?.clinical_records || !result.rows[0]?.clinical_audit_events) {
      throw new Error('Clinical platform migration verification failed');
    }
    process.stdout.write('Clinical platform migration applied and verified.\\n');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
