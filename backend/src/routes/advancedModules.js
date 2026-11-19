'use strict';

const express = require('express');

const MODULES = Object.freeze({
  '/incidentes': {
    key: 'incidents', read: 'alerts.read', write: 'alerts.resolve',
    required: ['data','categoria','setor','gravidade','descricao'],
    allowed: ['data','categoria','setor','gravidade','descricao','acao','status'],
    title: 'incidentes'
  },
  '/escalas': {
    key: 'staff_schedules', read: 'professionals.read', write: 'professionals.write',
    required: ['data','unidade','setor','profissional','turno'],
    allowed: ['data','unidade','setor','profissional','turno','status'],
    title: 'escala'
  },
  '/escalas/trocas': {
    key: 'shift_exchanges', read: 'professionals.read', write: 'professionals.write',
    required: ['solicitante','substituto','data','turno'],
    allowed: ['solicitante','substituto','data','turno','motivo','status'],
    title: 'troca de plantão'
  },
  '/frequencia': {
    key: 'attendance_events', read: 'professionals.read', write: 'professionals.write',
    required: ['profissional','data','unidade'],
    allowed: ['profissional','data','entrada','saida','unidade','justificativa','status'],
    title: 'frequência'
  },
  '/indicadores/qualidade': {
    key: 'quality_indicators', read: 'reports.read', write: 'settings.manage',
    required: ['indicador','periodo','valor'],
    allowed: ['indicador','periodo','valor','meta','observacoes','status'],
    title: 'indicador de qualidade'
  },
  '/notificacoes': {
    key: 'internal_notifications', read: 'alerts.read', write: 'notifications.write',
    required: ['categoria','titulo','mensagem','destinatario'],
    allowed: ['categoria','titulo','mensagem','destinatario','status'],
    title: 'notificação'
  },
  '/comunicados': {
    key: 'internal_announcements', read: 'settings.manage', write: 'settings.manage',
    required: ['titulo','unidade','conteudo'],
    allowed: ['titulo','unidade','conteudo','validade','status'],
    title: 'comunicado'
  },
  '/configuracoes/modulos': {
    key: 'unit_module_settings', read: 'modules.manage', write: 'modules.manage',
    required: ['modulo','unidade','ativo'],
    allowed: ['modulo','descricao','unidade','ativo'],
    title: 'configuração de módulo'
  },
  '/configuracoes/unidades': {
    key: 'unit_parameters', read: 'settings.manage', write: 'settings.manage',
    required: ['unidade','parametro','valor','justificativa'],
    allowed: ['unidade','parametro','valor','justificativa'],
    title: 'parâmetro de unidade'
  },
  '/agenda/disponibilidade': {
    key: 'staff_availability', read: 'appointments.read', write: 'appointments.write',
    required: ['profissional','especialidade','unidade','data','inicio','fim'],
    allowed: ['profissional','especialidade','unidade','data','inicio','fim','status'],
    title: 'disponibilidade profissional'
  },
  '/compras': {
    key: 'purchasing_requests', read: 'inventory.read', write: 'inventory.write',
    required: ['solicitante','item','quantidade','prioridade','justificativa'],
    allowed: ['solicitante','item','quantidade','prioridade','justificativa','status'],
    title: 'solicitação de compra'
  },
  '/ccih': {
    key: 'infection_surveillance', read: 'settings.manage', write: 'settings.manage',
    required: ['data','setor','evento','medidas'],
    allowed: ['data','setor','evento','agente','medidas','status'],
    title: 'registro de vigilância CCIH'
  },
  '/faturamento/glosas': {
    key: 'billing_objections', read: 'billing.read', write: 'billing.write',
    required: ['competencia','documento','motivo'],
    allowed: ['competencia','documento','motivo','valor','prazo','status'],
    title: 'glosa'
  }
});

const EXTERNAL_OR_CLINICAL_ENDPOINTS = Object.freeze([
  '/agenda','/enfermagem/evolucoes','/prescricoes','/altas','/faturamento',
  '/perfis','/unidades','/sinais-vitais','/exames/imagem','/cardiologia',
  '/evolucoes-medicas','/enfermagem/plano-cuidados','/medicamentos/administracao',
  '/farmacia/avaliacoes','/farmacia/controlados','/estoque/movimentacoes','/estoque/validade',
  '/indicadores/qualidade','/relatorios/gerencial','/lgpd/consentimentos','/portal-paciente',
  '/configuracoes/protocolos','/fila','/transferencias','/producao-sus',
  '/faturamento/dashboard','/acessos/unidades','/exames/resultados'
]);

const DATE_FIELDS = new Set(['data','validade','prazo','periodo']);
const TIME_FIELDS = new Set(['hora','entrada','saida','inicio','fim']);
const NUMERIC_FIELDS = new Set(['quantidade','valor','meta']);

function validateModulePayload(endpoint, input) {
  const def = MODULES[endpoint];
  if (!def) return { ok: false, error: 'Módulo sem contrato de escrita.' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'O corpo deve ser um objeto JSON.' };
  }
  const data = {};
  for (const field of def.allowed) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== '') data[field] = input[field];
  }
  const missing = def.required.filter(field => data[field] === undefined || data[field] === '');
  if (missing.length) return { ok: false, error: 'Campos obrigatórios ausentes: ' + missing.join(', '), missing };
  for (const field of DATE_FIELDS) {
    if (data[field] !== undefined && !/^\\d{4}-(0[1-9]|1[0-2])(-([0-2]\\d|3[01]))?$/.test(String(data[field]))) {
      return { ok: false, error: 'Data ou competência inválida em ' + field + '.' };
    }
  }
  for (const field of TIME_FIELDS) {
    if (data[field] !== undefined && !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(data[field]))) {
      return { ok: false, error: 'Horário inválido em ' + field + '.' };
    }
  }
  for (const field of NUMERIC_FIELDS) {
    if (data[field] !== undefined && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0)) {
      return { ok: false, error: 'Valor numérico inválido em ' + field + '.' };
    }
    if (data[field] !== undefined) data[field] = Number(data[field]);
  }
  if (endpoint === '/faturamento/glosas' && !/^\\d{6}$/.test(String(data.competencia))) {
    return { ok: false, error: 'Competência deve estar no formato AAAAMM.' };
  }
  if (endpoint === '/agenda/disponibilidade' && data.inicio >= data.fim) {
    return { ok: false, error: 'O horário final deve ser posterior ao inicial.' };
  }
  if (endpoint === '/escalas/trocas' && data.solicitante === data.substituto) {
    return { ok: false, error: 'Solicitante e substituto devem ser profissionais diferentes.' };
  }
  return { ok: true, data };
}

module.exports = function createAdvancedModulesRouter({ requireAuth, requirePermission, getPool, usingPostgres }) {
  const router = express.Router();
  const unitOf = req => String(req.user?.unit || req.user?.unidade || '').trim();
  const actorOf = req => ({
    username: String(req.user?.usuario || req.user?.username || 'unknown'),
    role: String(req.user?.role || req.user?.tipo || 'unknown')
  });

  function unavailable(res) {
    return res.status(503).json({
      erro: 'O PostgreSQL e a migração 20261119_operational_modules.sql são necessários para este módulo.',
      codigo: 'OPERATIONAL_MODULE_SCHEMA_UNAVAILABLE'
    });
  }

  function requireUnit(req, res) {
    if (unitOf(req)) return true;
    res.status(403).json({ erro: 'Conta sem unidade vinculada.', codigo: 'UNIT_SCOPE_REQUIRED' });
    return false;
  }

  async function audit(client, req, action, moduleKey, id, metadata = {}) {
    await client.query(
      'INSERT INTO clinical_audit_events(actor_username,actor_role,unit_id,action,resource_type,resource_id,patient_ref_hash,request_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10)',
      [actorOf(req).username, actorOf(req).role, unitOf(req), action, 'operational_' + moduleKey, id || null,
        req.get('x-request-id') || null, req.ip || null, String(req.get('user-agent') || '').slice(0, 300),
        JSON.stringify(metadata)]
    );
  }

  for (const [endpoint, def] of Object.entries(MODULES)) {
    router.get(endpoint, requirePermission(def.read), async (req, res, next) => {
      if (!requireUnit(req, res)) return;
      if (!usingPostgres()) return unavailable(res);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      const cursor = req.query.cursor ? Number(req.query.cursor) : null;
      if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) return res.status(400).json({ erro: 'Cursor inválido.' });
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          'SELECT id,status,data,created_by,created_at,supersedes_id FROM operational_module_records WHERE module_key=$1 AND unit_id=$2 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT $4',
          [def.key, unitOf(req), cursor, limit]
        );
        await audit(client, req, 'read', def.key, null, { count: result.rowCount });
        await client.query('COMMIT');
        return res.json({ items: result.rows.map(row => ({ id: row.id, status: row.status, ...row.data, createdBy: row.created_by, createdAt: row.created_at, supersedesId: row.supersedes_id })), nextCursor: result.rows.length === limit ? String(result.rows[result.rows.length - 1].id) : null });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return next(error);
      } finally { client.release(); }
    });

    router.get(endpoint + '/:id', requirePermission(def.read), async (req, res, next) => {
      if (!requireUnit(req, res)) return;
      if (!usingPostgres()) return unavailable(res);
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'Identificador inválido.' });
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          'SELECT id,status,data,created_by,created_at,supersedes_id FROM operational_module_records WHERE id=$1 AND module_key=$2 AND unit_id=$3',
          [id, def.key, unitOf(req)]
        );
        if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Registro não encontrado nesta unidade.' }); }
        await audit(client, req, 'read', def.key, id);
        await client.query('COMMIT');
        const row = result.rows[0];
        return res.json({ item: { id: row.id, status: row.status, ...row.data, createdBy: row.created_by, createdAt: row.created_at, supersedesId: row.supersedes_id } });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return next(error);
      } finally { client.release(); }
    });

    router.post(endpoint, requirePermission(def.write), async (req, res, next) => {
      if (!requireUnit(req, res)) return;
      if (!usingPostgres()) return unavailable(res);
      const validation = validateModulePayload(endpoint, req.body);
      if (!validation.ok) return res.status(400).json({ erro: validation.error, campos: validation.missing || [] });
      const data = validation.data;
      const status = String(data.status || 'open').slice(0, 40);
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const actor = actorOf(req);
        const inserted = await client.query(
          'INSERT INTO operational_module_records(module_key,unit_id,status,data,created_by,created_by_role) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at',
          [def.key, unitOf(req), status, JSON.stringify(data), actor.username, actor.role]
        );
        await audit(client, req, 'create', def.key, inserted.rows[0].id, { fields: Object.keys(data) });
        await client.query('COMMIT');
        return res.status(201).json({ item: { id: inserted.rows[0].id, status, ...data, createdAt: inserted.rows[0].created_at }, appendOnly: true });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return next(error);
      } finally { client.release(); }
    });

    router.post(endpoint + '/:id/corrections', requirePermission(def.write), async (req, res, next) => {
      if (!requireUnit(req, res)) return;
      if (!usingPostgres()) return unavailable(res);
      const id = Number(req.params.id);
      const validation = validateModulePayload(endpoint, req.body);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'Identificador inválido.' });
      if (!validation.ok) return res.status(400).json({ erro: validation.error, campos: validation.missing || [] });
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const original = await client.query(
          'SELECT id FROM operational_module_records WHERE id=$1 AND module_key=$2 AND unit_id=$3 FOR SHARE',
          [id, def.key, unitOf(req)]
        );
        if (!original.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Registro original não encontrado nesta unidade.' }); }
        const actor = actorOf(req);
        const inserted = await client.query(
          'INSERT INTO operational_module_records(module_key,unit_id,status,data,created_by,created_by_role,supersedes_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at',
          [def.key, unitOf(req), String(validation.data.status || 'corrected').slice(0, 40), JSON.stringify(validation.data), actor.username, actor.role, id]
        );
        await audit(client, req, 'update', def.key, inserted.rows[0].id, { supersedesId: id });
        await client.query('COMMIT');
        return res.status(201).json({ item: { id: inserted.rows[0].id, status: inserted.rows[0].status, ...validation.data, createdAt: inserted.rows[0].created_at, supersedesId: id }, immutableOriginal: true });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return next(error);
      } finally { client.release(); }
    });
  }

  // These workflows are intentionally not exposed through generic CRUD. They
  // require their own clinical, legal or external integration contract.
  for (const endpoint of EXTERNAL_OR_CLINICAL_ENDPOINTS) {
    if (MODULES[endpoint]) continue;
    router.all(endpoint, requireAuth([]), (req, res) => res.status(501).json({
      erro: 'Este fluxo depende de contrato clínico específico, catálogo oficial ou homologação externa e não pode ser simulado por CRUD genérico.',
      codigo: 'WORKFLOW_REQUIRES_VALIDATION',
      endpoint
    }));
    router.all(endpoint + '/:id', requireAuth([]), (req, res) => res.status(501).json({
      erro: 'Este fluxo depende de contrato clínico específico, catálogo oficial ou homologação externa e não pode ser simulado por CRUD genérico.',
      codigo: 'WORKFLOW_REQUIRES_VALIDATION',
      endpoint
    }));
  }

  return router;
};

module.exports.MODULES = MODULES;
module.exports.validateModulePayload = validateModulePayload;
