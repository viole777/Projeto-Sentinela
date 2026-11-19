'use strict';

const crypto = require('node:crypto');

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  const sensitive = /cpf|cns|telefone|phone|address|endereco|senha|password|token|secret/i;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) =>
      [key, sensitive.test(key) ? '[REDACTADO]' : redact(item)]
    )
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function patientHash(patientIdentifier) {
  if (!patientIdentifier) return null;
  const pepper = process.env.AUDIT_HASH_PEPPER;
  if (!pepper && process.env.NODE_ENV === 'production') {
    throw new Error('AUDIT_HASH_PEPPER é obrigatório em produção para pseudonimizar identificadores de pacientes.');
  }
  const key = pepper || 'sentinela-development-only-audit-pepper';
  return crypto.createHmac('sha256', key).update(String(patientIdentifier)).digest('hex');
}

async function appendAudit(client, {
  username,
  role,
  unit,
  patient,
  action,
  resource,
  before,
  after,
  ip,
  userAgent,
  requestId,
  reason
}) {
  if (!username || !action) throw new Error('Evento de auditoria incompleto.');
  // Serialize chain appends inside the caller's transaction. Without this lock,
  // concurrent writers can read the same tail hash and fork the audit chain.
  // The lock is transaction-scoped and is released automatically on COMMIT/ROLLBACK.
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1398035017, 1]);
  const previous = await client.query(
    'SELECT record_hash FROM audit_logs ORDER BY id DESC LIMIT 1'
  );
  const previousHash = previous.rows[0]?.record_hash || '';
  const payload = {
    username,
    role: role || null,
    unit: unit || null,
    patientHash: patientHash(patient),
    action,
    resource: resource || null,
    ip: ip || null,
    userAgent: userAgent || null,
    requestId: requestId || null,
    reason: reason || null,
    ...(before === undefined ? {} : { before: redact(before) }),
    ...(after === undefined ? {} : { after: redact(after) })
  };
  // Version 2 hashes canonical JSON so PostgreSQL JSONB key ordering cannot
  // create false integrity failures during later verification.
  const hashVersion = 2;
  const recordHash = crypto
    .createHash('sha256')
    .update(previousHash + canonicalJson(payload))
    .digest('hex');

  await client.query(
    `INSERT INTO audit_logs
      (username, role, unit, patient_hash, action, details, resource, before_data, after_data,
       ip, user_agent, request_id, reason, previous_hash, record_hash, hash_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      username,
      role || null,
      unit || null,
      patientHash(patient),
      action,
      JSON.stringify(redact(after)),
      resource || null,
      before === undefined ? null : JSON.stringify(redact(before)),
      after === undefined ? null : JSON.stringify(redact(after)),
      ip || null,
      userAgent || null,
      requestId || null,
      reason || null,
      previousHash,
      recordHash,
      hashVersion
    ]
  );
  return recordHash;
}

async function verifyAuditChain(client) {
  const result = await client.query(
    'SELECT id, username, role, unit, patient_hash, action, details, resource, before_data, after_data, ip, user_agent, request_id, reason, previous_hash, record_hash, hash_version, happened_at FROM audit_logs ORDER BY id ASC'
  );
  let previousHash = '';
  for (const row of result.rows) {
    if (row.previous_hash !== previousHash) {
      return { valid: false, brokenAt: row.id };
    }
    const payload = {
      username: row.username,
      role: row.role,
      unit: row.unit,
      patientHash: row.patient_hash,
      action: row.action,
      resource: row.resource,
      ip: row.ip,
      userAgent: row.user_agent,
      requestId: row.request_id,
      reason: row.reason,
      ...(row.before_data == null ? {} : { before: row.before_data }),
      ...(row.after_data == null ? {} : { after: row.after_data })
    };
    const hashVersion = Number(row.hash_version || 1);
    if (hashVersion !== 1 && hashVersion !== 2) {
      return { valid: false, brokenAt: row.id, reason: 'unsupported_hash_version' };
    }
    const serializedPayload = hashVersion === 2 ? canonicalJson(payload) : JSON.stringify(payload);
    const expected = crypto
      .createHash('sha256')
      .update(previousHash + serializedPayload)
      .digest('hex');
    if (row.record_hash !== expected) {
      return { valid: false, brokenAt: row.id };
    }
    previousHash = row.record_hash;
  }
  return { valid: true, count: result.rows.length };
}

module.exports = { appendAudit, verifyAuditChain, redact, patientHash, canonicalJson };
