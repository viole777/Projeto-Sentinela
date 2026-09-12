const { Pool } = require('pg');

let pool = null;

function usingPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!usingPostgres()) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function testDatabaseConnection() {
  if (!usingPostgres()) {
    return {
      connected: false,
      reason: 'DATABASE_URL não configurado'
    };
  }

  try {
    const p = getPool();
    await p.query('SELECT 1');
    return {
      connected: true,
      reason: 'ok'
    };
  } catch (error) {
    return {
      connected: false,
      reason: error.message
    };
  }
}

module.exports = {
  getPool,
  usingPostgres,
  testDatabaseConnection
};
