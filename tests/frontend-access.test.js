'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const access = fs.readFileSync(path.join(root, 'frontend-v2/src/access.ts'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'frontend-v2/src/components/AppShell.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'frontend-v2/src/App.tsx'), 'utf8');

const menuPaths = [...shell.matchAll(/\['[^']+','(\/app\/[^']+)'/g)].map(match => match[1]);
const mappedPaths = new Set([...access.matchAll(/'((?:\/app\/)\w[\w-]*)':\s*'[^']+'/g)].map(match => match[1]));
assert.ok(menuPaths.length > 0, 'navigation must declare module paths');
for (const route of menuPaths) {
  assert.ok(mappedPaths.has(route), `navigation route has no explicit permission: ${route}`);
}
assert.match(access, /if\s*\(!permission\)\s*return false/, 'missing permissions must fail closed');
assert.match(shell, /authReady\s*\?\s*<Outlet\/>/, 'protected pages must wait for server session permissions');
assert.match(shell, /setAuthError\(status === 503/, 'authorization infrastructure failures must not be presented as an ordinary login failure');
assert.match(app, /function Protected\(/, 'frontend routes must use a permission guard');
assert.match(app, /<Protected path=\{routePath\}>/, 'advanced routes must be guarded too');
console.log('frontend access tests passed');
