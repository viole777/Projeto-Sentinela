'use strict';

const assert = require('node:assert/strict');
const {
  generateTotp,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode
} = require('../backend/src/services/totp');

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
