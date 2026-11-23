'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0, single = false, double = false, lineComment = false, blockComment = false, dollarTag = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], next = sql[i + 1];
    if (lineComment) { if (ch.charCodeAt(0) === 10) lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (dollarTag) { if (sql.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; } continue; }
    if (single) { if (ch === "'" && next === "'") { i++; continue; } if (ch === "'") single = false; continue; }
    if (double) { if (ch === '"' && next === '"') { i++; continue; } if (ch === '"') double = false; continue; }
    if (ch === '-' && next === '-') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'") { single = true; continue; }
    if (ch === '"') { double = true; continue; }
    if (ch === '$') {
      const close = sql.indexOf('$', i + 1);
      if (close !== -1 && /^[A-Za-z_0-9]*$/.test(sql.slice(i + 1, close))) {
        dollarTag = sql.slice(i, close + 1); i = close; continue;
      }
    }
    if (ch === ';') { const statement = sql.slice(start, i).trim(); if (statement) statements.push(statement); start = i + 1; }
  }
  const tail = sql.slice(start).trim(); if (tail) statements.push(tail);
  return statements;
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : (process.env.PGSSL ? { rejectUnauthorized: false } : undefined),
    max: 1
  });
  try {
    const migrationPaths = ['20261112_clinical_platform.sql', '20261123_purchasing_professional_shifts.sql', '20261123_billing_denials_reports.sql'].map(file => path.join(__dirname, '..', 'database', 'migrations', file));
    const statements = migrationPaths.flatMap(migrationPath => splitSqlStatements(fs.readFileSync(migrationPath, 'utf8'))).filter(statement => !/^(BEGIN|COMMIT)$/i.test(statement));
    await pool.query('BEGIN');
    try {
      for (let index = 0; index < statements.length; index++) {
        try { await pool.query(statements[index]); }
        catch (error) {
          const excerpt = statements[index].slice(0, 1200);
          throw new Error(`Clinical migration failed at statement ${index + 1}: ${excerpt}. Cause: ${error.message}`);
        }
      }
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => {});
      throw error;
    }
    const result = await pool.query(
      "SELECT to_regclass('public.clinical_records') AS clinical_records, to_regclass('public.clinical_audit_events') AS clinical_audit_events, to_regclass('public.purchase_requests') AS purchase_requests, to_regclass('public.professional_shifts') AS professional_shifts, to_regclass('public.billing_denials') AS billing_denials"
    );
    if (!result.rows[0]?.clinical_records || !result.rows[0]?.clinical_audit_events || !result.rows[0]?.purchase_requests || !result.rows[0]?.professional_shifts || !result.rows[0]?.billing_denials) {
      throw new Error('Clinical platform migration verification failed');
    }
    process.stdout.write('Clinical platform migrations applied and verified.\\n');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
