'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const dbPath = path.join(__dirname, '../backend/src/db.js');
const scenarios = [
  { name: 'production without DATABASE_URL', env: { NODE_ENV: 'production' }, expected: /DATABASE_URL é obrigatório em produção/ },
  { name: 'production before PostgreSQL hydration', env: { NODE_ENV: 'production', DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/sentinela' }, expected: /PostgreSQL ainda não foi hidratado/ }
];
for (const scenario of scenarios) {
  const script = 'const assert = require("node:assert/strict"); const db = require(' + JSON.stringify(dbPath) + '); assert.throws(() => db.readDB(), ' + scenario.expected.toString() + '); assert.throws(() => db.writeDB({ pacientes: [] }), /PostgreSQL obrigatório/);';
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { PATH: process.env.PATH, SENTINELA_DB_PATH: dbPath, ...scenario.env } });
  assert.equal(result.status, 0, scenario.name + ': ' + (result.stderr || result.stdout));
}
console.log('production storage fail-closed tests passed');
