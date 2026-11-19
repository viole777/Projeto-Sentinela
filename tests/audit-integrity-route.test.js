'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { createClinicalPlatformRouter } = require('../backend/src/routes/clinicalPlatform');

(async () => {
  let allow = true;
  let postgres = true;
  let failVerification = false;
  let auditWrites = 0;
  let released = 0;
  const client = {
    async query(sql) {
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM audit_logs')) {
        if (failVerification) throw new Error('synthetic database failure');
        return { rows: [] };
      }
      if (sql.startsWith('INSERT INTO clinical_audit_events')) {
        auditWrites += 1;
        return { rowCount: 1, rows: [] };
      }
      throw new Error('Unexpected SQL in route test: ' + sql);
    },
    release() { released += 1; }
  };
  const pool = { connect: async () => client };
  const app = express();
  app.use(createClinicalPlatformRouter({
    requirePermission: permission => (req, res, next) => {
      if (permission !== 'audit.read' || !allow) return res.status(403).json({ code: 'FORBIDDEN' });
      req.user = { username: 'auditor-synthetic', role: 'direcao', unit: 'UNIT-SYNTHETIC' };
      next();
    },
    getPool: () => pool,
    usingPostgres: () => postgres
  }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  try {
    let response = await fetch(baseUrl + '/api/v1/audit/integrity');
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ledger, 'audit_logs');
    assert.equal(body.valid, true);
    assert.equal(body.count, 0);
    assert.ok(body.scopeNote.includes('clinical_audit_events'));
    assert.equal(auditWrites, 1, 'integrity read must itself be audited in the separate clinical audit ledger');

    allow = false;
    response = await fetch(baseUrl + '/api/v1/audit/integrity');
    assert.equal(response.status, 403, 'permission denial must stop integrity queries');

    allow = true;
    failVerification = true;
    response = await fetch(baseUrl + '/api/v1/audit/integrity');
    body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.code, 'AUDIT_INTEGRITY_UNAVAILABLE');

    postgres = false;
    response = await fetch(baseUrl + '/api/v1/audit/integrity');
    body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.code, 'AUDIT_INTEGRITY_UNAVAILABLE');
    assert.ok(released >= 2, 'checked-out clients must always be released');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log('audit integrity route tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
