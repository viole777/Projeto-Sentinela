'use strict';

const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../backend/src/middleware/auth');
const { ROLE_PERMISSIONS, syncBuiltInRolePermissions } = require('../backend/src/db');

function makeHarness({ role = 'medico', effective = [], loader = async () => effective, sessionPermissions = [] } = {}) {
  const session = { role, tipo: role, permissions: sessionPermissions, expiresAt: 0 };
  const sessions = {
    async get(token) { return token === 'valid-token' ? session : undefined; },
    touch(token, value) { value.touched = true; }
  };
  const middleware = createAuthMiddleware({
    sessions,
    normalizeRole: value => String(value || '').trim().toLowerCase(),
    permissionsForRole: loader,
    sessionTtlMs: 60_000
  });
  return { middleware, session };
}

async function invoke(handler, cookie = 'sentinela_session=valid-token') {
  const req = { headers: { cookie }, user: null };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;
  let nextError = null;
  await handler(req, res, error => { nextCalled = true; nextError = error || null; });
  return { req, res, nextCalled, nextError };
}

(async () => {
  assert.ok(!ROLE_PERMISSIONS.admin.includes('*'), 'admin must not inherit a wildcard');
  assert.ok(!ROLE_PERMISSIONS.admin.includes('patients.read'), 'technical admin must not inherit clinical access');
  assert.ok(ROLE_PERMISSIONS.admin.includes('users.write'));
  assert.ok(ROLE_PERMISSIONS.medico.includes('consultations.write'));

  {
    const statements = [];
    let released = false;
    const client = {
      async query(sql) { statements.push(String(sql).trim().split(/\\s+/)[0].toUpperCase()); return { rows: [] }; },
      release() { released = true; }
    };
    await syncBuiltInRolePermissions({ async connect() { return client; } });
    assert.equal(statements[0], 'BEGIN');
    assert.equal(statements.at(-1), 'COMMIT');
    assert.ok(statements.includes('DELETE'), 'startup reconciliation must revoke stale grants');
    assert.equal(released, true, 'transaction client must always be released');
  }

  {
    const { middleware } = makeHarness({ role: 'admin', effective: ROLE_PERMISSIONS.admin });
    const result = await invoke(middleware.requirePermission('patients.read'));
    assert.equal(result.res.statusCode, 403, 'admin without a clinical permission must be denied');
  }

  {
    const { middleware } = makeHarness({ role: 'admin', effective: ROLE_PERMISSIONS.admin, sessionPermissions: ['*'] });
    const result = await invoke(middleware.requireAuth(['medico']));
    assert.equal(result.res.statusCode, 403, 'wildcard permissions must not bypass an explicit role restriction');
  }

  {
    const { middleware, session } = makeHarness({ role: 'medico', effective: ['consultations.write'], sessionPermissions: [] });
    const result = await invoke(middleware.requirePermission('consultations.write'));
    assert.equal(result.nextCalled, true);
    assert.equal(result.req.user, session);
    assert.deepEqual(result.req.user.permissions, ['consultations.write']);
    assert.equal(session.touched, true);
  }

  {
    const { middleware } = makeHarness({ role: 'triagem', effective: ['triage.read'], sessionPermissions: ['*'] });
    const result = await invoke(middleware.requirePermission('patients.write'));
    assert.equal(result.res.statusCode, 403, 'stale session permissions must not grant access');
  }

  {
    const { middleware } = makeHarness({ role: 'medico', loader: async () => { throw new Error('database unavailable'); } });
    const result = await invoke(middleware.requirePermission('consultations.write'));
    assert.equal(result.res.statusCode, 503, 'authorization infrastructure failures must fail closed');
    assert.equal(result.res.body.codigo, 'AUTHORIZATION_UNAVAILABLE');
  }

  {
    const { middleware } = makeHarness({ role: 'medico', effective: ['consultations.write'] });
    const result = await invoke(middleware.requirePermission('consultations.write'), 'other=x; sentinela_session=valid-token');
    assert.equal(result.nextCalled, true, 'valid auth cookie must survive unrelated cookie values');
  }

  {
    const { middleware } = makeHarness();
    const result = await invoke(middleware.requirePermission('consultations.write'), 'sentinela_session=%ZZ');
    assert.equal(result.res.statusCode, 401, 'malformed session cookie must not authenticate');
  }

  console.log('authorization tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
