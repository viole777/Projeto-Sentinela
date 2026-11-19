'use strict';

const assert = require('node:assert/strict');
const {
  LocalKeyProvider,
  encryptField,
  decryptField,
  blindIndex
} = require('../backend/src/services/dataEncryption');

(async () => {
  const provider = new LocalKeyProvider('teste-local-com-32-bytes-ou-mais');
  const cipher1 = await encryptField('12345678901', provider);
  const cipher2 = await encryptField('12345678901', provider);
  assert.notEqual(cipher1, cipher2, 'the IV must make encryption non-deterministic');
  assert.equal(await decryptField(cipher1, provider), '12345678901');
  assert.equal(blindIndex('123.456.789-01', 'pepper'), blindIndex('12345678901', 'pepper'));
  await assert.rejects(decryptField(cipher1 + 'corrompido', provider));
  console.log('AES-256-GCM field encryption tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
