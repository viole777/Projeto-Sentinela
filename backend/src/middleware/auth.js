'use strict';

/**
 * Autenticação e autorização RBAC.
 * A sessão identifica o usuário; as permissões são resolvidas no servidor
 * em cada requisição protegida para refletir revogações e mudanças de perfil.
 */
function createAuthMiddleware({ sessions, normalizeRole, permissionsForRole, sessionTtlMs }) {
    function parseCookies(header = "") {
        const cookies = {};
        for (const part of String(header || "").split(";")) {
            const index = part.indexOf("=");
            if (index < 0) continue;
            const key = part.slice(0, index).trim();
            const rawValue = part.slice(index + 1).trim();
            if (!key) continue;
            try {
                cookies[key] = decodeURIComponent(rawValue);
            } catch (_) {
                // Um cookie malformado não deve invalidar os demais.
            }
        }
        return cookies;
    }

    async function loadSession(req, res) {
        const token = parseCookies(req.headers.cookie).sentinela_session;
        const session = token ? await sessions.get(token) : null;
        if (!session) {
            res.status(401).json({ erro: "Autenticação necessária" });
            return null;
        }
        return { token, session };
    }

    function refreshSession(token, session, req) {
        session.expiresAt = Date.now() + sessionTtlMs;
        sessions.touch(token, session);
        req.user = session;
    }

    function requireAuth(roles = []) {
        return async (req, res, next) => {
            try {
                const auth = await loadSession(req, res);
                if (!auth) return;
                const role = normalizeRole(auth.session.role || auth.session.tipo);
                const allowed = roles.map(normalizeRole);
                // A permissão "*" NÃO substitui uma restrição explícita de papel.
                if (allowed.length && !allowed.includes(role)) {
                    return res.status(403).json({ erro: "Perfil sem permissão para esta operação" });
                }
                refreshSession(auth.token, auth.session, req);
                return next();
            } catch (error) {
                return next(error);
            }
        };
    }

    function requirePermission(...requiredPermissions) {
        return async (req, res, next) => {
            try {
                const auth = await loadSession(req, res);
                if (!auth) return;
                if (!requiredPermissions.length || requiredPermissions.some(p => typeof p !== "string" || !p.trim())) {
                    return res.status(403).json({ erro: "Política de autorização inválida" });
                }

                const role = normalizeRole(auth.session.role || auth.session.tipo);
                let effective;
                try {
                    effective = await permissionsForRole(role);
                } catch (_) {
                    return res.status(503).json({
                        erro: "Não foi possível validar as permissões. Tente novamente.",
                        codigo: "AUTHORIZATION_UNAVAILABLE"
                    });
                }
                if (!Array.isArray(effective)) effective = [];

                const allowed = requiredPermissions.every(permission =>
                    effective.includes("*") || effective.includes(permission)
                );
                if (!allowed) {
                    return res.status(403).json({ erro: "Sem permissão para esta operação" });
                }

                auth.session.permissions = effective;
                refreshSession(auth.token, auth.session, req);
                return next();
            } catch (error) {
                return next(error);
            }
        };
    }

    return { parseCookies, requireAuth, requirePermission };
}

module.exports = { createAuthMiddleware };
