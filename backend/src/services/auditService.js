'use strict';

function createAuditService({ readDB, writeDB }) {
    return function audit(req, acao, detalhes = {}) {
        try {
            const db = readDB();
            if (!Array.isArray(db.auditoria)) db.auditoria = [];
            db.auditoria.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                quando: new Date().toISOString(),
                usuario: req.user ? req.user.usuario : "anonimo",
                perfil: req.user ? req.user.tipo : "-",
                acao,
                detalhes,
                ip: req.ip
            });
            if (db.auditoria.length > 2000) {
                db.auditoria = db.auditoria.slice(-2000);
            }
            writeDB(db);
        } catch (_) {
            // Auditoria nunca deve quebrar o fluxo principal.
        }
    };
}

module.exports = { createAuditService };
