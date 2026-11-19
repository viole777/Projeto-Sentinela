'use strict';
const assert = require('node:assert/strict');
const { MODULES, validateModulePayload } = require('../backend/src/routes/advancedModules');

assert.ok(Object.keys(MODULES).length >= 10, 'dedicated operational APIs must be registered');
let result = validateModulePayload('/incidentes', {
  data: '2026-11-19T09:30',
  categoria: 'Queda',
  setor: 'Recepção',
  gravidade: 'Leve',
  descricao: 'Registro sintético para teste',
  campoInventado: 'não deve ser persistido'
});
assert.equal(result.ok, true);
assert.equal(result.data.campoInventado, undefined, 'unknown input fields must be discarded');
assert.equal(validateModulePayload('/incidentes', { categoria: 'Queda' }).ok, false, 'required fields must be enforced');
assert.equal(validateModulePayload('/agenda/disponibilidade', {
  profissional: 'Profissional sintético', especialidade: 'Teste', unidade: 'Unidade sintética',
  data: '2026-11-19', inicio: '18:00', fim: '08:00'
}).ok, false, 'availability end must be after start');
assert.equal(validateModulePayload('/escalas/trocas', {
  solicitante: 'A', substituto: 'A', data: '2026-11-19', turno: 'Manhã'
}).ok, false, 'a professional cannot replace themselves');
assert.equal(validateModulePayload('/faturamento/glosas', {
  competencia: '2026-13', documento: 'BPA', motivo: 'Motivo sintético'
}).ok, false, 'billing competence must be valid');
assert.equal(validateModulePayload('/configuracoes/modulos', {
  modulo: 'triagem', unidade: 'U1', ativo: 'Ativo'
}).ok, true);
assert.equal(validateModulePayload('/configuracoes/modulos', {
  modulo: 'triagem', unidade: 'U1', ativo: 'talvez'
}).ok, false, 'module activation must use an explicit state');
assert.equal(validateModulePayload('/incidentes', {
  data: '2026-11-19T09:30', categoria: 'Inventado', setor: 'Recepção',
  gravidade: 'Leve', descricao: 'Registro sintético'
}).ok, false, 'incident categories must be allowlisted');
const competence = validateModulePayload('/faturamento/glosas', {
  competencia: '2026-11', documento: 'BPA', motivo: 'Motivo sintético'
});
assert.equal(competence.ok, true);
assert.equal(competence.data.competencia, '202611', 'HTML month values must normalize to AAAAMM');
assert.equal(validateModulePayload('/endpoint-inexistente', {}).ok, false);
console.log('advanced operational module API contract tests passed');

(async () => {
  const express = require('express');
  const createRouter = require('../backend/src/routes/advancedModules');
  const queries = [];
  let nextId = 100;
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith('SELECT id FROM operational_module_records')) return { rows: [{ id: 99 }], rowCount: 1 };
      if (sql.startsWith('SELECT id,status,data,created_by,created_at,supersedes_id FROM operational_module_records')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('INSERT INTO operational_module_records')) {
        return { rows: [{ id: nextId++, status: values[2], created_at: new Date('2026-11-19T10:00:00Z') }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const pool = { connect: async () => client };
  const app = express();
  app.use(express.json());
  app.use(createRouter({
    requireAuth: () => (req, res, next) => next(),
    requirePermission: permission => (req, res, next) => {
      req.user = { username: 'tester', role: 'admin', unit: Object.prototype.hasOwnProperty.call(req.headers, 'x-test-unit') ? req.headers['x-test-unit'] : 'U1' };
      req.permissionUnderTest = permission;
      next();
    },
    getPool: () => pool,
    usingPostgres: () => true
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const created = await fetch(base + '/incidentes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: '2026-11-19T09:30', categoria: 'Queda', setor: 'Recepção', gravidade: 'Leve', descricao: 'Evento sintético de teste' })
    });
    assert.equal(created.status, 201, 'validated module records must be persisted');
    const payload = await created.json();
    assert.equal(payload.item.id, 100);
    assert.equal(payload.appendOnly, true);
    assert.ok(queries.some(item => item.sql === 'BEGIN'));
    assert.ok(queries.some(item => item.sql.includes('INSERT INTO clinical_audit_events')));
    assert.ok(queries.some(item => item.sql === 'COMMIT'));
    const invalid = await fetch(base + '/incidentes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoria: 'Queda' })
    });
    assert.equal(invalid.status, 400, 'invalid payloads must be rejected before opening a transaction');
    const wrongUnit = await fetch(base + '/incidentes', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-unit': '' },
      body: JSON.stringify({ data: '2026-11-19T09:30', categoria: 'Queda', setor: 'Recepção', gravidade: 'Leve', descricao: 'Evento sintético' })
    });
    assert.equal(wrongUnit.status, 403, 'unitless sessions must fail closed');
    const nested = await fetch(base + '/escalas/trocas');
    assert.equal(nested.status, 200, 'nested routes must not be captured by a parent :id route');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log('advanced operational module API integration tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

