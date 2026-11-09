'use strict';

const express = require('express');

const ENDPOINTS = [
  '/agenda', '/enfermagem/evolucoes', '/prescricoes', '/altas', '/faturamento',
  '/perfis', '/unidades', '/sinais-vitais', '/exames/imagem', '/cardiologia',
  '/evolucoes-medicas', '/enfermagem/plano-cuidados', '/medicamentos/administracao',
  '/incidentes', '/protocolos', '/alergias', '/farmacia/avaliacoes', '/farmacia/controlados',
  '/estoque/movimentacoes', '/estoque/validade', '/compras', '/faturamento/glosas',
  '/escalas', '/escalas/trocas', '/frequencia', '/indicadores/qualidade',
  '/relatorios/gerencial', '/ccih', '/lgpd/consentimentos', '/notificacoes',
  '/comunicados', '/encaminhamentos', '/portal-paciente', '/configuracoes/protocolos',
  '/configuracoes/unidades', '/configuracoes/modulos', '/fila', '/transferencias',
  '/producao-sus', '/faturamento/dashboard', '/acessos/unidades',
  '/agenda/disponibilidade', '/exames/resultados'
];;

module.exports = function createAdvancedModulesRouter({ requireAuth }) {
  const router = express.Router();

  // These endpoints previously shared a generic JSON CRUD implementation.
  // Clinical and administrative records must not be created, overwritten or
  // physically deleted through an untyped catch-all route. Until each module
  // has its own schema, validation, authorization and audit transaction,
  // fail closed with an explicit response.
  function notImplemented(req, res) {
    return res.status(501).json({
      erro: 'Este módulo ainda não possui uma API específica validada. A operação foi bloqueada.',
      codigo: 'MODULE_NOT_IMPLEMENTED'
    });
  }

  for (const endpoint of ENDPOINTS) {
    router.all(endpoint, requireAuth([]), notImplemented);
    router.all(endpoint + '/:id', requireAuth([]), notImplemented);
  }

  return router;
};
