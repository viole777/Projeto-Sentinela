'use strict';

/**
 * Middleware de autenticação e autorização.
 *
 * O módulo recebe suas dependências explicitamente para não criar dependência
 * circular com server.js. Assim, as regras HTTP ficam separadas da inicialização.
 */
function createAuthMiddleware({ sessions, normalizeRole, permissionsForRole, usingPostgres, sessionTtlMs }) {
    function parseCookies(header = "") {
        try {
            return Object.fromEntries((header || "").split(";").map(part => {
                const index = part.indexOf("=");
                if (index < 0) return ["", ""];
                const key = part.slice(0, index).trim();
                const rawValue = part.slice(index + 1).trim();
                return [key, decodeURIComponent(rawValue)];
            }).filter(([key]) => key));
        } catch (_) {
            return {};
        }
    }

    function requireAuth(roles = []) {
        return async (req, res, next) => {
            const token = parseCookies(req.headers.cookie).sentinela_session;
            const session = token ? await sessions.get(token) : null;

            if (!session) {
                return res.status(401).json({ erro: "Autenticação necessária" });
            }

            const sessionRole = normalizeRole(session.role || session.tipo);
            const sessionPerms = Array.isArray(session.permissions)
                ? session.permissions
                : await permissionsForRole(sessionRole);
            const requestedRoles = roles.map(normalizeRole);

            const hasWildcardPermission = sessionPerms.includes("*");
            const roleAllowed =
                requestedRoles.length === 0 ||
                hasWildcardPermission ||
                requestedRoles.includes(sessionRole);

            if (roles.length && !roleAllowed) {
                return res.status(403).json({ erro: "Perfil sem permissão para esta operação" });
            }

            session.expiresAt = Date.now() + sessionTtlMs;
            sessions.touch(token, session);
            req.user = session;
            next();
        };
    }

    function requirePermission(...perms) {
        return async (req, res, next) => {
            const token = parseCookies(req.headers.cookie).sentinela_session;
            const session = token ? await sessions.get(token) : null;

            if (!session) {
                return res.status(401).json({ erro: "Autenticação necessária" });
            }

            let effective = session.permissions;
            if (usingPostgres()) {
                effective = await permissionsForRole(session.role || session.tipo);
            }
            effective = Array.isArray(effective) ? effective : [];

            const ok = perms.every(p => effective.includes("*") || effective.includes(p));
            if (!ok) {
                return res.status(403).json({ erro: "Sem permissão para esta operação" });
            }

            session.expiresAt = Date.now() + sessionTtlMs;
            sessions.touch(token, session);
            req.user = session;
            next();
        };
    }

    return { parseCookies, requireAuth, requirePermission };
}

module.exports = { createAuthMiddleware };
