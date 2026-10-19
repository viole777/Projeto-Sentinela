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
      ssl
    });
  }
  return pool;
}

module.exports = { getPool, usingPostgres };
