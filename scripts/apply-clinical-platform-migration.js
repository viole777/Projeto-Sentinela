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
    const migrationFiles = [
      '20261112_clinical_platform.sql',
      '20261119_operational_modules.sql',
      '20261119_audit_integrity.sql'
    ];
    for (const filename of migrationFiles) {
      const migrationPath = path.join(__dirname, '..', 'database', 'migrations', filename);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
      process.stdout.write(`Applied ${filename}.\\n`);
    }
    const result = await pool.query(
      "SELECT to_regclass('public.clinical_records') AS clinical_records, to_regclass('public.clinical_audit_events') AS clinical_audit_events, to_regclass('public.operational_module_records') AS operational_module_records, (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='hash_version') AS audit_hash_version_columns"
    );
    if (!result.rows[0]?.clinical_records || !result.rows[0]?.clinical_audit_events || !result.rows[0]?.operational_module_records || Number(result.rows[0]?.audit_hash_version_columns)!==1) {
      throw new Error('Clinical/operational module migration verification failed');
    }
    process.stdout.write('Clinical and operational module migrations applied and verified.\\n');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
