'use strict';

async function withTransaction(pool, operation) {
  if (!pool) throw new Error('PostgreSQL indisponível.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

class OptimisticConflictError extends Error {
  constructor(resource) {
    super(`Conflito de concorrência ao atualizar ${resource}.`);
    this.name = 'OptimisticConflictError';
    this.statusCode = 409;
    this.code = 'VERSION_CONFLICT';
  }
}

async function updateWithVersion(client, sql, params, expectedVersion, resource) {
  const result = await client.query(
    sql.replace(/;\s*$/, ''),
    [...params, expectedVersion]
  );
  if (!result.rowCount) throw new OptimisticConflictError(resource);
  return result.rows[0];
}

module.exports = { withTransaction, OptimisticConflictError, updateWithVersion };
