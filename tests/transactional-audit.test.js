'use strict';

const assert = require('node:assert/strict');
const {
  appendAudit,
  verifyAuditChain,
  patientHash,
  redact
} = require('../backend/src/services/transactionalAudit');

(async () => {
  const rows = [];
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push(sql);
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
      if (sql.startsWith('SELECT record_hash')) {
        return { rows: rows.length ? [{ record_hash: rows.at(-1).record_hash }] : [] };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) {
        rows.push({
          id: rows.length + 1,
          username: values[0],
          role: values[1],
          unit: values[2],
          patient_hash: values[3],
          action: values[4],
          details: values[5] ? JSON.parse(values[5]) : {},
          resource: values[6],
          before_data: values[7] ? JSON.parse(values[7]) : null,
          after_data: values[8] ? JSON.parse(values[8]) : null,
          ip: values[9],
          user_agent: values[10],
          request_id: values[11],
          reason: values[12],
          previous_hash: values[13],
          record_hash: values[14],
          happened_at: new Date()
        });
        return { rowCount: 1 };
      }
      if (sql.startsWith('SELECT id,')) return { rows };
      return { rows: [] };
    }
  };

  await appendAudit(client, {
    username: 'medico',
    role: 'medico',
    action: 'patient_view',
    patient: '00000000000',
    resource: 'patients/1'
  });
  await appendAudit(client, {
    username: 'medico',
    role: 'medico',
    action: 'patient_update',
    patient: '00000000000',
    before: { cpf: '00000000000' },
    after: { cpf: '00000000000', nome: 'Paciente sintético' }
  });

  const verification = await verifyAuditChain(client);
  const lockIndexes = queries
    .map((sql, index) => sql.startsWith('SELECT pg_advisory_xact_lock') ? index : -1)
    .filter(index => index >= 0);
  const firstSelectIndexes = queries
    .map((sql, index) => sql.startsWith('SELECT record_hash') ? index : -1)
    .filter(index => index >= 0);
  assert.equal(lockIndexes.length, 2, 'each append must acquire the transaction-scoped chain lock');
  assert.ok(lockIndexes.every((index, i) => index < firstSelectIndexes[i]), 'chain lock must precede reading the previous hash');
  assert.equal(verification.valid, true);
  assert.equal(patientHash('00000000000').length, 64);
  assert.deepEqual(redact({ cpf: '00000000000', nome: 'Sintético' }), {
    cpf: '[REDACTADO]',
    nome: 'Sintético'
  });
  console.log('transactional audit chain tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
