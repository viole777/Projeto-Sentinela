'use strict';

/**
 * Legacy audit adapter.
 *
 * This adapter is intentionally fail-closed: storage errors must reach the
 * request handler instead of being silently discarded. It is still not a
 * substitute for writing the audit event through the same PostgreSQL client
 * and transaction as a clinical mutation; clinical routes must use their
 * transaction-scoped audit writer for that guarantee.
 */
function createAuditService({ readDB, writeDB }) {
    return function audit(req, acao, detalhes = {}) {
        if (typeof acao !== 'string' || !acao.trim()) {
            throw new TypeError('Ação de auditoria é obrigatória.');
        }
        const db = readDB();
        if (!Array.isArray(db.auditoria)) db.auditoria = [];
        db.auditoria.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            quando: new Date().toISOString(),
            usuario: req.user ? req.user.usuario : 'anonimo',
            perfil: req.user ? (req.user.tipo || req.user.role) : '-',
            acao: acao.trim(),
            detalhes,
            ip: req.ip || null
        });
        // Do not truncate the audit history: deletion would violate append-only
        // expectations. Retention must be implemented as an approved archive.
        writeDB(db);
        return db.auditoria[db.auditoria.length - 1];
    };
}

module.exports = { createAuditService };
