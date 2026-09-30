const assert = require('node:assert/strict');

const { hashPassword, passwordMatches, hashToken, verifyTokenHash } = require('../backend/server.js');

const stored = hashPassword('123');
assert.equal(passwordMatches('123', stored), true);
assert.equal(passwordMatches('456', stored), false);
assert.equal(passwordMatches('123', '123'), false);

const rawToken = 'reset-token-123';
const hashed = hashToken(rawToken);
assert.equal(verifyTokenHash(rawToken, hashed), true);
assert.equal(verifyTokenHash('other-token', hashed), false);

console.log('security tests passed');
