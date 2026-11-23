'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const access = fs.readFileSync(path.join(root, 'frontend-v2/src/access.ts'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'frontend-v2/src/components/AppShell.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'frontend-v2/src/App.tsx'), 'utf8');
const advanced = fs.readFileSync(path.join(root, 'frontend-v2/src/pages/AdvancedModules.tsx'), 'utf8');

const menuPaths = [...shell.matchAll(/\['[^']+','(\/app\/[^']+)'/g)].map(match => match[1]);
const mappedPaths = new Set([...access.matchAll(/'((?:\/app\/)\w[\w-]*)':\s*'[^']+'/g)].map(match => match[1]));
assert.ok(menuPaths.length > 0, 'navigation must declare module paths');
for (const route of menuPaths) {
  assert.ok(mappedPaths.has(route), `navigation route has no explicit permission: ${route}`);
}
assert.match(access, /if\s*\(!permission\)\s*return false/, 'missing permissions must fail closed');
assert.match(access, /permission !== '\*' && permissions\.includes\(permission\)/, 'wildcard permissions must never grant frontend access');
assert.doesNotMatch(access, /permissions\.includes\('\*'\)/, 'frontend must not treat wildcard as an authorization grant');
assert.match(shell, /authReady\s*\?\s*<Outlet\/>/, 'protected pages must wait for server session permissions');
assert.match(shell, /setAuthError\(status === 503/, 'authorization infrastructure failures must not be presented as an ordinary login failure');
assert.match(app, /function Protected\(/, 'frontend routes must use a permission guard');
assert.match(app, /<Protected path=\{routePath\}>/, 'advanced routes must be guarded too');

assert.ok(advanced.includes("endpoint:'/api/v1/nursing-evolutions'"), 'nursing evolutions must use the validated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/prescriptions'"), 'prescriptions must use the validated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/bed-map'"), 'bed map must use the dedicated read API');
assert.ok(advanced.includes("endpoint:'/api/v1/vital-signs'"), 'vital signs must use the validated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/exam-orders'"), 'exam orders must use the validated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/soap-notes'"), 'medical notes must use the validated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/care-plans'"), 'care plans must use the validated v1 API');
assert.equal(advanced.includes("permissions.includes('*')"), false, 'advanced module UI must not grant wildcard permissions');
console.log('frontend access tests passed');

assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8'),/routes\/advancedModules/, 'legacy 501 catch-all router must not be mounted');

assert.ok(advanced.includes("endpoint:'/api/v1/appointments'"), 'scheduling must use the v1 appointments API');
assert.ok(advanced.includes("endpoint:'/api/v1/hospitalizations'"), 'admissions must use the v1 hospitalization API');
assert.ok(advanced.includes("endpoint:'/api/v1/discharges'"), 'discharges must use the v1 discharge API');
assert.ok(advanced.includes("endpoint:'/api/v1/allergies'"), 'allergies must use a dedicated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/medication-administrations'"), 'medication administration must use a dedicated v1 API');

assert.ok(advanced.includes("endpoint:'/api/v1/medication-lots'"), 'stock lot screens must use the validated medication lots API');
assert.ok(advanced.includes("endpoint:'/api/v1/dispensations'"), 'pharmacy dispensing must use the dedicated v1 workflow');

assert.ok(advanced.includes("endpoint:'/api/v1/incidents'"), 'incident module must use the v1 incident API');
assert.ok(advanced.includes("endpoint:'/api/v1/protocols'"), 'protocol module must use the v1 protocol API');
assert.ok(advanced.includes("endpoint:'/api/v1/stock-movements'"), 'stock movement module must use the v1 ledger API');

assert.ok(advanced.includes("'notificacao-incidente':'incidentes'"), 'incident notification route must reuse the dedicated incident API module');

assert.ok(advanced.includes("endpoint:'/api/v1/purchase-requests'"), 'purchasing module must use the dedicated v1 API');
assert.ok(advanced.includes("endpoint:'/api/v1/professional-shifts'"), 'staff schedules must use the dedicated v1 API');
assert.ok(advanced.includes("'purchasing.approve'"), 'purchase approval action must require a distinct permission');

assert.ok(advanced.includes("endpoint:'/api/v1/professional-registry'") || advanced.includes("fetch('/api/v1/professional-registry'"), 'shift form must load active professionals from the registry');

assert.ok(advanced.includes("'solicitacao-compras':'compras'"), 'purchase navigation alias must resolve to the implemented purchase module');

assert.ok(advanced.includes("'rejected',reason"), 'purchase rejection must submit a reason to the backend');
assert.ok(advanced.includes('Confirmar rejeição'), 'direction UI must expose reason-required rejection');
