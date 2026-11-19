'use strict';

const assert = require('node:assert/strict');
const {
  generateTotp,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode
} = require('../backend/src/services/totp');

const fs = require('node:fs');
const path = require('node:path');
const schema = fs.readFileSync(path.join(__dirname, '../database.sql'), 'utf8');
const sessionsTable = schema.match(/CREATE TABLE IF NOT EXISTS sessions \\(([\\s\\S]*?)\\);/);
assert.ok(sessionsTable, 'sessions table must exist in the PostgreSQL schema');
assert.equal((sessionsTable[1].match(/\\btoken_hash\\b/g) || []).length, 1, 'sessions schema must declare token_hash exactly once');

const secret = 'JBSWY3DPEHPK3PXP';
const timestamp = 1763534400000;
const code = generateTotp(secret, timestamp);
assert.equal(code.length, 6);
assert.equal(verifyTotp(secret, code, timestamp), true);
assert.equal(verifyTotp(secret, 'ABC123', timestamp), false);

const recovery = generateRecoveryCodes(3);
assert.equal(recovery.length, 3);
assert.equal(hashRecoveryCode(recovery[0]).length, 64);
assert.equal(hashRecoveryCode(recovery[0].replace('-', '')).length, 64);
console.log('TOTP and recovery-code tests passed');
