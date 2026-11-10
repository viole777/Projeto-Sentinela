const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { hashPassword, passwordMatches, hashToken, verifyTokenHash } = require('../backend/server.js');

const stored = hashPassword('123');
assert.equal(passwordMatches('123', stored), true);
assert.equal(passwordMatches('456', stored), false);
assert.equal(passwordMatches('123', '123'), false);

const rawToken = 'reset-token-123';
const hashed = hashToken(rawToken);
assert.equal(verifyTokenHash(rawToken, hashed), true);
assert.equal(verifyTokenHash('other-token', hashed), false);

console.log('security tests passed');

const medicationsHtml = fs.readFileSync(path.join(__dirname, '../frontend/medicacoes.html'), 'utf8');
const chartHtml = fs.readFileSync(path.join(__dirname, '../frontend/prontuario.html'), 'utf8');
assert.ok(medicationsHtml.includes('Sentinela.escapeHtml(m.pacienteNome'));
assert.ok(medicationsHtml.includes('Sentinela.escapeHtml(m.diagnostico'));
assert.ok(medicationsHtml.includes('Sentinela.escapeHtml(m.medicacao'));
assert.ok(medicationsHtml.includes('Sentinela.escapeHtml(m.pacienteCpf'));
assert.ok(chartHtml.includes('Sentinela.escapeHtml(e.resultado.texto'));
console.log('legacy clinical XSS regression checks passed');


(async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = 'production';
  delete process.env.DATABASE_URL;
  try {
    const { hydrate } = require('../backend/src/db');
    await assert.rejects(
      hydrate(),
      /DATABASE_URL é obrigatório em produção/,
      'Produção não deve iniciar com armazenamento JSON local'
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
  console.log('production storage guard passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
