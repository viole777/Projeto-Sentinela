'use strict';

const assert = require('node:assert/strict');
const { syncToPostgres } = require('../backend/src/db');

function makePool({ failAt } = {}) {
  const statements = [];
  let released = false;
  const client = {
    async query(sql) {
      const statement = String(sql).trim().split(/\\s+/).slice(0, 2).join(' ').toUpperCase();
      statements.push(statement);
      if (failAt && String(sql).includes(failAt)) throw new Error('simulated persistence failure');
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; }
  };
  return { pool: { async connect() { return client; } }, statements, wasReleased: () => released };
}

(async () => {
  const success = makePool();
  await syncToPostgres({}, success.pool);
  assert.equal(success.statements[0], 'BEGIN');
  assert.equal(success.statements.at(-1), 'COMMIT');
  assert.equal(success.statements.filter(item => item === 'BEGIN').length, 1);
  assert.equal(success.wasReleased(), true, 'transaction client must be released after commit');

  const failure = makePool({ failAt: 'DELETE FROM tv_calls' });
  await assert.rejects(syncToPostgres({}, failure.pool), /simulated persistence failure/);
  assert.ok(failure.statements.includes('ROLLBACK'), 'a failed snapshot must roll back all preceding writes');
  assert.notEqual(failure.statements.at(-1), 'COMMIT', 'a failed snapshot must never commit');
  assert.equal(failure.wasReleased(), true, 'transaction client must be released after rollback');

  console.log('PostgreSQL snapshot transaction tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
