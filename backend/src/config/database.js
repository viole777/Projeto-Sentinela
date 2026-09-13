'use strict';

const { Pool } = require('pg');

let pool = null;

// ---------------------------------------------------------------------------
// Por que este modulo existe:
// O parser interno do pg (pg-connection-string) resolve a string contra o base
// 'postgres://base' (`new URL(str, 'postgres://base')`). Se o valor de
// DATABASE_URL NAO for uma URL absoluta valida (scheme + '://' + authority),
// o pg herda o HOST 'base' e tenta conectar em `base` ->
// "getaddrinfo ENOTFOUND base". Aqui validamos ANTES de entregar a string ao
// pg: ou ela e uma URL absoluta valida, ou falhamos com mensagem sanitizada
// (sem senha e sem a URL completa).
// ---------------------------------------------------------------------------

function parseDatabaseUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('DATABASE_URL nao configurado no ambiente');
  }
  const candidate = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_err) {
    throw new Error(
      'DATABASE_URL invalida: o valor nao e uma URL absoluta valida. ' +
      'Esperado: postgresql://usuario:senha@host:5432/banco. ' +
      'Caracteres especiais da senha precisam estar percent-encoded (RFC 3986) ' +
      'e o valor nao pode estar truncado ou conter quebras de linha.'
    );
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'postgres:' && scheme !== 'postgresql:') {
    throw new Error('DATABASE_URL invalida: protocolo "' + parsed.protocol + '" nao suportado (use postgres ou postgresql).');
  }
  if (!parsed.hostname) {
    throw new Error('DATABASE_URL invalida: hostname ausente.');
  }
  return parsed;
}

// Diagnostico seguro para logs (nunca contem senha nem a URL completa).
function describeDatabaseUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const parsed = parseDatabaseUrl(rawUrl);
  return {
    configured: true,
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, '') || null,
    username: decodeURIComponent(parsed.username)
  };
}

// URL normalizada (o WHATWG re-encoda username/password corretamente),
// garantindo que o pg jamais receba uma string relativa/ambigua.
function resolveConnectionString(rawUrl) {
  return parseDatabaseUrl(rawUrl).toString();
}

function usingPostgres() {
  return Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
}

function sslFromEnv() {
  const mode = String(process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'verify-ca' || mode === 'verify-full') return true;
  if (mode === 'require' || mode === 'prefer' || mode === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  // Supabase exige SSL; este era o comportamento padrao do projeto.
  return { rejectUnauthorized: false };
}

function getPool() {
  if (!usingPostgres()) return null;
  const connectionString = resolveConnectionString(process.env.DATABASE_URL);
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: sslFromEnv()
    });
  }
  return pool;
}

async function testDatabaseConnection() {
  if (!usingPostgres()) {
    return { connected: false, reason: 'DATABASE_URL nao configurado no ambiente', details: null };
  }
  let details = null;
  try {
    details = describeDatabaseUrl(process.env.DATABASE_URL);
  } catch (error) {
    return { connected: false, reason: error.message, details: null };
  }
  try {
    const p = getPool();
    await p.query('SELECT 1');
    return { connected: true, reason: 'ok', details };
  } catch (error) {
    return { connected: false, reason: String((error && error.message) || error), details };
  }
}

module.exports = {
  getPool,
  usingPostgres,
  parseDatabaseUrl,
  describeDatabaseUrl,
  resolveConnectionString,
  sslFromEnv,
  testDatabaseConnection
};
