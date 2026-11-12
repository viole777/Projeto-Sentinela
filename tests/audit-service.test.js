'use strict';

const assert = require('node:assert/strict');
const { createAuditService } = require('../backend/src/services/auditService');

let state = { auditoria: Array.from({ length: 2001 }, (_, id) => ({ id })) };
let writes = 0;
const audit = createAuditService({
  readDB: () => state,
  writeDB: next => { writes += 1; state = next; }
});

const event = audit({ user: { usuario: 'tester', tipo: 'medico' }, ip: '127.0.0.1' }, 'patient.read', { patientId: 7 });
assert.equal(event.usuario, 'tester');
assert.equal(event.perfil, 'medico');
assert.equal(state.auditoria.length, 2002, 'legacy audit history must not be silently truncated');
assert.equal(writes, 1);
assert.throws(() => audit({}, '', {}), /Ação de auditoria é obrigatória/);
assert.throws(() => createAuditService({ readDB: () => { throw new Error('read failed'); }, writeDB: () => {} })({}, 'x'), /read failed/);
assert.throws(() => createAuditService({ readDB: () => ({ auditoria: [] }), writeDB: () => { throw new Error('write failed'); } })({}, 'x'), /write failed/);
console.log('audit service tests passed');
