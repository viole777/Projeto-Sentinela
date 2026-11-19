'use strict';

const assert = require('node:assert/strict');
const {
  withTransaction,
  OptimisticConflictError,
  updateWithVersion
} = require('../backend/src/repositories/base');
const { createMemoryRepository } = require('../backend/src/repositories/memory');

(async () => {
  const statements = [];
  const client = {
    query(sql) {
      statements.push(String(sql).trim());
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    },
    release() { statements.push('RELEASE'); }
  };
  const result = await withTransaction({ connect: async () => client }, async tx => {
    await tx.query('UPDATE patients SET name = $1');
    return { id: 1 };
  });
  assert.deepEqual(result, { id: 1 });
  assert.deepEqual(statements.slice(0, 3), ['BEGIN', 'UPDATE patients SET name = $1', 'COMMIT']);

  const stale = {
    query: async () => ({ rows: [], rowCount: 0 }),
  };
  await assert.rejects(
    updateWithVersion(
      stale,
      'UPDATE patients SET name = $1 WHERE id = $2 AND version = $3',
      ['Novo', 1],
      1,
      'paciente'
    ),
    OptimisticConflictError
  );

  const memory = createMemoryRepository({ pacientes: [{ cpf: '00000000000', nome: 'Sintético' }] });
  assert.equal((await memory.read('pacientes')).length, 1);
  console.log('repository transaction and conflict tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
