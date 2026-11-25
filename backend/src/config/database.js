'use strict';

const { Pool } = require('pg');

let pool = null;

function usingPostgres() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function getPool() {
  if (!usingPostgres()) return null;
  if (!pool) {
    const sslMode = String(process.env.PGSSL || '').toLowerCase();
    const ssl = sslMode === 'disable'
      ? false
      : { rejectUnauthorized: sslMode !== 'insecure' };
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    pool.on('error', (error) => {
      console.error('[postgres pool] idle client error:', error.message);
    });
  }
  return pool;
}

module.exports = { getPool, usingPostgres };
