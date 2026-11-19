'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  appendAudit,
  verifyAuditChain,
  patientHash,
  redact,
  canonicalJson
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
          hash_version: values[15],
          happened_at: new Date()
        });
        // PostgreSQL JSONB returns object keys in canonical order, not necessarily
        // the insertion order used by the application before INSERT.
        const inserted = rows[rows.length - 1];
        if (inserted.before_data) inserted.before_data = JSON.parse(canonicalJson(inserted.before_data));
        if (inserted.after_data) inserted.after_data = JSON.parse(canonicalJson(inserted.after_data));
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
  assert.equal(verification.hashChainValid, true);
  assert.equal(verification.unverifiedLegacyRecords, 0);
  assert.equal(rows[0].hash_version, 2, 'new events must use canonical hash version 2');
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
  const tamperedClient = {
    async query(sql) {
      if (sql.startsWith('SELECT id,')) {
        return { rows: rows.map((row, index) => index === 1 ? { ...row, after_data: { nome: 'conteúdo alterado' } } : row) };
      }
      return { rows: [] };
    }
  };
  const tampered = await verifyAuditChain(tamperedClient);
  assert.equal(tampered.valid, false, 'altered JSONB content must break the hash chain');
  assert.equal(tampered.brokenAt, 2);
  const legacyRows = [{
    id: 1, hash_version: 0, record_hash: '', previous_hash: null,
    username: 'legacy', role: null, unit: null, patient_hash: null,
    action: 'legacy', resource: null, ip: null, user_agent: null,
    request_id: null, reason: null, before_data: null, after_data: null
  }];
  const legacyClient = {
    async query(sql, values) {
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
      if (sql.startsWith('SELECT record_hash')) {
        return { rows: legacyRows.length ? [{ record_hash: legacyRows.at(-1).record_hash, hash_version: legacyRows.at(-1).hash_version }] : [] };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) {
        legacyRows.push({
          id: 2, username: values[0], role: values[1], unit: values[2], patient_hash: values[3],
          action: values[4], details: JSON.parse(values[5]), resource: values[6],
          before_data: values[7] ? JSON.parse(values[7]) : null, after_data: values[8] ? JSON.parse(values[8]) : null,
          ip: values[9], user_agent: values[10], request_id: values[11], reason: values[12],
          previous_hash: values[13], record_hash: values[14], hash_version: values[15]
        });
        return { rowCount: 1 };
      }
      if (sql.startsWith('SELECT id,')) return { rows: legacyRows };
      return { rows: [] };
    }
  };
  await appendAudit(legacyClient, { username:'new-user', action:'new-chain-segment' });
  const legacyVerification = await verifyAuditChain(legacyClient);
  assert.equal(legacyVerification.hashChainValid, true, 'new v2 segment after legacy unchained rows must verify');
  assert.equal(legacyVerification.valid, false, 'legacy unchained rows must prevent a fully valid status');
  assert.equal(legacyVerification.unverifiedLegacyRecords, 1);

  assert.equal(patientHash('00000000000').length, 64);
  assert.notEqual(patientHash('00000000000'), crypto.createHash('sha256').update('00000000000').digest('hex'), 'patient identifiers must use a keyed HMAC, not a reversible-by-enumeration plain hash');
  assert.deepEqual(redact({ cpf: '00000000000', nome: 'Sintético' }), {
    cpf: '[REDACTADO]',
    nome: 'Sintético'
  });
  console.log('transactional audit chain tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
