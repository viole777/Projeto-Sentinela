'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const serverSource = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');
assert.doesNotMatch(serverSource, /scriptSrc:\s*\[[^\]]*['"]unsafe-inline['"]/);
assert.doesNotMatch(serverSource, /styleSrc:\s*\[[^\]]*['"]unsafe-inline['"]/);
assert.match(serverSource, /CORS_ALLOWED_ORIGINS/);
assert.match(serverSource, /CSRF_ORIGIN_MISMATCH/);

const legacyDir = path.join(__dirname, '../frontend');
let inlineHashes = 0;
for (const name of fs.readdirSync(legacyDir)) {
  if (!name.endsWith('.html')) continue;
  const source = fs.readFileSync(path.join(legacyDir, name), 'utf8');
  for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) {
      const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
      assert.ok(hash.length > 20);
      inlineHashes++;
    }
  }
}
assert.ok(inlineHashes > 0);
console.log('application CSP and CORS source checks passed');

// Same-origin Render requests must not depend on CORS_ALLOWED_ORIGINS.
assert.match(serverSource, /const requestOrigin = `\\$\{req\.protocol\}:\\/\\/\\$\{req\.get\("host"\)\}`/);
assert.match(serverSource, /origin && !isSameOrigin && !isExplicitlyAllowed/);
assert.match(serverSource, /allowedOrigins\.has\(origin\)/);
