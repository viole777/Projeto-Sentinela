'use strict';

const express = require('express');
const crypto = require('crypto');

const ENDPOINTS = [
  '/agenda', '/enfermagem/evolucoes', '/prescricoes', '/altas', '/faturamento',
  '/perfis', '/unidades', '/sinais-vitais', '/exames/imagem', '/cardiologia',
  '/evolucoes-medicas', '/enfermagem/plano-cuidados', '/medicamentos/administracao',
  '/incidentes', '/protocolos', '/alergias', '/farmacia/avaliacoes',
  '/farmacia/controlados', '/estoque/movimentacoes', '/estoque/validade', '/compras',
  '/faturamento/glosas', '/escalas', '/escalas/trocas', '/frequencia',
  '/indicadores/qualidade', '/relatorios/gerencial', '/ccih', '/lgpd/consentimentos',
  '/notificacoes', '/comunicados', '/encaminhamentos', '/portal-paciente',
  '/configuracoes/protocolos', '/configuracoes/unidades', '/configuracoes/modulos',
  '/fila', '/transferencias', '/producao-sus', '/faturamento/dashboard',
  '/acessos/unidades', '/agenda/disponibilidade', '/exames/resultados'
];

const ADMIN_ONLY = new Set([
  '/perfis', '/configuracoes/protocolos', '/configuracoes/unidades',
  '/configuracoes/modulos', '/acessos/unidades', '/lgpd/consentimentos'
]);
const CLINICAL_WRITE = new Set([
  '/agenda', '/enfermagem/evolucoes', '/prescricoes', '/altas', '/sinais-vitais',
  '/exames/imagem', '/cardiologia', '/evolucoes-medicas',
  '/enfermagem/plano-cuidados', '/medicamentos/administracao', '/incidentes',
  '/protocolos', '/alergias', '/farmacia/avaliacoes', '/farmacia/controlados',
  '/estoque/movimentacoes', '/estoque/validade', '/compras', '/escalas',
  '/escalas/trocas', '/frequencia', '/ccih', '/encaminhamentos', '/fila',
  '/transferencias', '/agenda/disponibilidade', '/exames/resultados'
]);
const CLINICAL_ROLES = new Set(['admin', 'medico', 'cardiologist', 'enfermagem', 'triagem', 'farmacia', 'atendimento', 'recepcao', 'direcao']);

function actor(req) {
  return String(req.user?.usuario || req.user?.email || 'usuario-autenticado').slice(0, 160);
}
function roleOf(req) {
  return String(req.user?.role || req.user?.tipo || '').toLowerCase();
}
function canWrite(req, endpoint) {
  if (ADMIN_ONLY.has(endpoint)) return roleOf(req) === 'admin' || (req.user?.permissions || []).includes('*');
  if (CLINICAL_WRITE.has(endpoint)) return CLINICAL_ROLES.has(roleOf(req)) || (req.user?.permissions || []).includes('*');
  return roleOf(req) === 'admin' || (req.user?.permissions || []).includes('*');
}
function sanitizePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const payload = { ...body };
  for (const key of Object.keys(payload)) {
    if (/^(senha|password|token|secret|authorization|cookie)$/i.test(key)) delete payload[key];
  }
  return payload;
}

module.exports = function createAdvancedModulesRouter({ requireAuth, usingPostgres, getPool, readDB, writeDB }) {
  const router = express.Router();
  router.use(requireAuth([]));

  let tableReady = false;
  let tableInit = null;
  async function ensureTable() {
    if (!usingPostgres() || tableReady) return;
    if (!tableInit) {
      tableInit = getPool().query(
        'CREATE TABLE IF NOT EXISTS sentinela_module_records (' +
        'id BIGSERIAL PRIMARY KEY, endpoint TEXT NOT NULL, payload JSONB NOT NULL, ' +
        'created_by TEXT NOT NULL, updated_by TEXT NOT NULL, ' +
        'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); ' +
        'CREATE INDEX IF NOT EXISTS idx_sentinela_module_records_endpoint_created ' +
        'ON sentinela_module_records (endpoint, created_at DESC)'
      ).then(() => { tableReady = true; }).catch((error) => {
        tableInit = null;
        throw error;
      });
    }
    await tableInit;
  }

  async function listRecords(endpoint) {
    if (usingPostgres()) {
      await ensureTable();
      const result = await getPool().query(
        'SELECT id, payload, created_by, updated_by, created_at, updated_at FROM sentinela_module_records WHERE endpoint = $1 ORDER BY created_at DESC LIMIT 500',
        [endpoint]
      );
      return result.rows.map(row => ({...row.payload, id:String(row.id), criadoPor:row.created_by, atualizadoPor:row.updated_by, criadoEm:row.created_at, atualizadoEm:row.updated_at}));
    }
    const db = readDB();
    const all = Array.isArray(db.advancedModuleRecords) ? db.advancedModuleRecords : [];
    return all.filter(row => row.endpoint === endpoint).sort((a,b) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0,500).map(row => ({...row.payload, id:row.id, criadoPor:row.criadoPor, atualizadoPor:row.atualizadoPor, criadoEm:row.criadoEm, atualizadoEm:row.atualizadoEm}));
  }

  async function createRecord(endpoint, payload, req) {
    const user = actor(req);
    if (usingPostgres()) {
      await ensureTable();
      const result = await getPool().query(
        'INSERT INTO sentinela_module_records (endpoint, payload, created_by, updated_by) VALUES ($1, $2::jsonb, $3, $3) RETURNING id, created_at, updated_at',
        [endpoint, JSON.stringify(payload), user]
      );
      const row = result.rows[0];
      return {...payload, id:String(row.id), criadoPor:user, atualizadoPor:user, criadoEm:row.created_at, atualizadoEm:row.updated_at};
    }
    const db = readDB();
    if (!Array.isArray(db.advancedModuleRecords)) db.advancedModuleRecords = [];
    const now = new Date().toISOString();
    const record = {id:crypto.randomUUID(), endpoint, payload, criadoPor:user, atualizadoPor:user, criadoEm:now, atualizadoEm:now};
    db.advancedModuleRecords.push(record);
    writeDB(db);
    return {...payload, id:record.id, criadoPor:user, atualizadoPor:user, criadoEm:now, atualizadoEm:now};
  }

  async function updateRecord(endpoint, id, payload, req) {
    const user = actor(req);
    if (usingPostgres()) {
      await ensureTable();
      const result = await getPool().query(
        'UPDATE sentinela_module_records SET payload = $3::jsonb, updated_by = $4, updated_at = NOW() WHERE endpoint = $1 AND id::text = $2 RETURNING id, created_by, created_at, updated_at',
        [endpoint, id, JSON.stringify(payload), user]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      return {...payload, id:String(row.id), criadoPor:row.created_by, atualizadoPor:user, criadoEm:row.created_at, atualizadoEm:row.updated_at};
    }
    const db = readDB();
    if (!Array.isArray(db.advancedModuleRecords)) db.advancedModuleRecords = [];
    const row = db.advancedModuleRecords.find(item => item.endpoint === endpoint && String(item.id) === id);
    if (!row) return null;
    row.payload = payload;
    row.atualizadoPor = user;
    row.atualizadoEm = new Date().toISOString();
    writeDB(db);
    return {...payload, id:row.id, criadoPor:row.criadoPor, atualizadoPor:user, criadoEm:row.criadoEm, atualizadoEm:row.atualizadoEm};
  }

  async function deleteRecord(endpoint, id) {
    if (usingPostgres()) {
      await ensureTable();
      const result = await getPool().query('DELETE FROM sentinela_module_records WHERE endpoint = $1 AND id::text = $2 RETURNING id', [endpoint, id]);
      return result.rowCount > 0;
    }
    const db = readDB();
    if (!Array.isArray(db.advancedModuleRecords)) db.advancedModuleRecords = [];
    const index = db.advancedModuleRecords.findIndex(item => item.endpoint === endpoint && String(item.id) === id);
    if (index < 0) return false;
    db.advancedModuleRecords.splice(index, 1);
    writeDB(db);
    return true;
  }

  for (const endpoint of ENDPOINTS) {
    router.get(endpoint, async (req, res) => {
      try {
        if (ADMIN_ONLY.has(endpoint) && roleOf(req) !== 'admin' && !(req.user?.permissions || []).includes('*')) return res.status(403).json({erro:'Acesso restrito ao administrador.'});
        return res.json(await listRecords(endpoint));
      } catch (error) {
        console.error('[advanced-modules] list failed:', endpoint, error.message);
        return res.status(503).json({erro:'Não foi possível consultar os registros no armazenamento.', codigo:'STORAGE_UNAVAILABLE'});
      }
    });
    router.post(endpoint, async (req, res) => {
      try {
        if (!canWrite(req, endpoint)) return res.status(403).json({erro:'Perfil sem permissão para cadastrar neste módulo.'});
        const payload = sanitizePayload(req.body);
        if (!payload || Object.keys(payload).length === 0) return res.status(400).json({erro:'Envie um objeto JSON com os campos do registro.'});
        return res.status(201).json(await createRecord(endpoint, payload, req));
      } catch (error) {
        console.error('[advanced-modules] create failed:', endpoint, error.message);
        return res.status(503).json({erro:'Não foi possível salvar no armazenamento. O registro não foi confirmado.', codigo:'STORAGE_UNAVAILABLE'});
      }
    });
    router.put(endpoint + '/:id', async (req, res) => {
      try {
        if (!canWrite(req, endpoint)) return res.status(403).json({erro:'Perfil sem permissão para alterar neste módulo.'});
        const payload = sanitizePayload(req.body);
        if (!payload || Object.keys(payload).length === 0) return res.status(400).json({erro:'Envie um objeto JSON com os campos atualizados.'});
        const record = await updateRecord(endpoint, req.params.id, payload, req);
        return record ? res.json(record) : res.status(404).json({erro:'Registro não encontrado.'});
      } catch (error) {
        console.error('[advanced-modules] update failed:', endpoint, error.message);
        return res.status(503).json({erro:'Não foi possível atualizar o armazenamento.', codigo:'STORAGE_UNAVAILABLE'});
      }
    });
    router.delete(endpoint + '/:id', async (req, res) => {
      try {
        if (!canWrite(req, endpoint)) return res.status(403).json({erro:'Perfil sem permissão para excluir neste módulo.'});
        const removed = await deleteRecord(endpoint, req.params.id);
        return removed ? res.status(204).end() : res.status(404).json({erro:'Registro não encontrado.'});
      } catch (error) {
        console.error('[advanced-modules] delete failed:', endpoint, error.message);
        return res.status(503).json({erro:'Não foi possível excluir do armazenamento.', codigo:'STORAGE_UNAVAILABLE'});
      }
    });
  }

  router.get('/api/advanced-modules/health', async (req, res) => {
    try {
      await ensureTable();
      res.json({ok:true, storage:usingPostgres() ? 'postgresql' : 'json-dev', endpoints:ENDPOINTS.length});
    } catch (_) {
      res.status(503).json({ok:false, storage:'unavailable', endpoints:ENDPOINTS.length});
    }
  });
  return router;
};
