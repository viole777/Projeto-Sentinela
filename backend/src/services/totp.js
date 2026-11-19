'use strict';

const crypto = require('node:crypto');

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of String(input).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret, timestamp = Date.now(), step = 30) {
  const counter = Math.floor(timestamp / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code, timestamp = Date.now()) {
  const normalized = String(code || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some(offset =>
    crypto.timingSafeEqual(
      Buffer.from(generateTotp(secret, timestamp + offset * 30000)),
      Buffer.from(normalized)
    )
  );
}

function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-')
  );
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase()).digest('hex');
}

module.exports = { generateTotp, verifyTotp, generateRecoveryCodes, hashRecoveryCode };
