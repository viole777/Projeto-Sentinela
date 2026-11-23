const assert = require('node:assert/strict');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

function getCookieHeader(setCookieHeader) {
  if (!setCookieHeader) {
    return '';
  }

  return setCookieHeader
    .split(';')[0]
    .trim();
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log('Iniciando smoke test do Sentinela...');

  if (process.env.DATABASE_URL) {
    const healthResult = await request('/health');
    assertCondition(healthResult.response.ok, `Health check falhou: ${JSON.stringify(healthResult.body)}`);
    assertCondition(healthResult.body && healthResult.body.database === 'connected', 'Health check não confirmou PostgreSQL conectado');
  }

  const unauthorizedAI = await request('/ia/resumo/00000000000');
  assertCondition(
    unauthorizedAI.response.status === 401 || unauthorizedAI.response.status === 403,
    `Endpoint de IA deveria exigir autenticação: HTTP ${unauthorizedAI.response.status}`
  );

  const unauthorizedStaff = await request('/profissionais');
  assertCondition(
    unauthorizedStaff.response.status === 401 || unauthorizedStaff.response.status === 403,
    `Lista de profissionais deveria exigir autenticação: HTTP ${unauthorizedStaff.response.status}`
  );

  const protectedApiNavigation = await fetch(new URL('/profissionais', BASE_URL), {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
  });
  assertCondition(
    protectedApiNavigation.status === 401 || protectedApiNavigation.status === 403,
    `A rota de API protegida deve continuar exigindo autenticação: HTTP ${protectedApiNavigation.status}`
  );

  const spaNavigation = await fetch(new URL('/app/profissionais', BASE_URL), {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
  });
  assertCondition(spaNavigation.status === 200, `A rota da SPA deve servir o frontend: HTTP ${spaNavigation.status}`);
  assertCondition(
    String(spaNavigation.headers.get('content-type') || '').includes('text/html'),
    'A rota da SPA deve responder HTML'
  );

  const loginResult = await request('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ usuario: 'admin', senha: process.env.TEST_ADMIN_PASSWORD }),
  });

  const loginResponse = loginResult.response;
  const loginBody = loginResult.body;

  assertCondition(loginResponse.ok, `Login falhou: ${JSON.stringify(loginBody)}`);
  assertCondition(loginBody.role === 'admin', `Role inesperada no login: ${JSON.stringify(loginBody)}`);

  const sessionCookie = getCookieHeader(loginResponse.headers.get('set-cookie'));
  assertCondition(sessionCookie, 'Cookie de sessão não retornado no login');

  const doctorLogin = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'ci.medico', senha: process.env.TEST_DOCTOR_PASSWORD || process.env.TEST_ADMIN_PASSWORD }),
  });
  assertCondition(doctorLogin.response.ok, `Login médico de CI falhou: ${JSON.stringify(doctorLogin.body)}`);
  const doctorCookie = getCookieHeader(doctorLogin.response.headers.get('set-cookie'));
  assertCondition(doctorCookie, 'Cookie de sessão não retornado para médico');

  const blockedPrescription = await request('/consulta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ pacienteCpf: '99999999999', diagnostico: 'Teste sintético', medicacao: 'penicilina', obs: 'Teste de bloqueio de alergia' }),
  });
  assertCondition(blockedPrescription.response.status === 409, `Prescrição com alerta crítico deveria exigir justificativa: HTTP ${blockedPrescription.response.status}`);
  assertCondition(blockedPrescription.body?.codigo === 'CRITICAL_SAFETY_BLOCKED', 'Alerta crítico deve bloquear a prescrição até revisão clínica estruturada');

  const attemptedOverride = await request('/consulta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ pacienteCpf: '99999999999', diagnostico: 'Teste sintético', medicacao: 'penicilina', obs: 'Tentativa sintética de override', justificativaSeguranca: 'Texto de justificativa não substitui revisão clínica estruturada.' }),
  });
  assertCondition(attemptedOverride.response.status === 409, `Justificativa textual não deve liberar alerta crítico: HTTP ${attemptedOverride.response.status}`);
  assertCondition(attemptedOverride.body?.codigo === 'CRITICAL_SAFETY_BLOCKED', 'Override textual de alerta crítico deve continuar bloqueado');

  const doctorDispense = await request('/farmacia/dispensar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ consultaId: 999999 }),
  });
  assertCondition(doctorDispense.response.status === 403, `Médico prescritor não deve dispensar: HTTP ${doctorDispense.response.status}`);

  const pharmacistLogin = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'ci.farmacia', senha: process.env.TEST_PHARMACY_PASSWORD || process.env.TEST_ADMIN_PASSWORD }),
  });
  assertCondition(pharmacistLogin.response.ok, `Login de farmácia de CI falhou: ${JSON.stringify(pharmacistLogin.body)}`);
  const pharmacistCookie = getCookieHeader(pharmacistLogin.response.headers.get('set-cookie'));
  const medicationLots = await request('/api/v1/medication-lots', { headers: { Cookie: pharmacistCookie } });
  assertCondition(medicationLots.response.ok && Array.isArray(medicationLots.body?.items), `Farmácia deve consultar lotes versionados: HTTP ${medicationLots.response.status}`);
  const dispensations = await request('/api/v1/dispensations', { headers: { Cookie: pharmacistCookie } });
  assertCondition(dispensations.response.ok && Array.isArray(dispensations.body?.items), `Farmácia deve consultar histórico de dispensações: HTTP ${dispensations.response.status}`);
  const purchaseCreate = await request('/api/v1/purchase-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pharmacistCookie },
    body: JSON.stringify({ itemName: 'Material sintético CI', quantity: 12, priority: 'urgent', justification: 'Teste automatizado de solicitação de compra.' }),
  });
  assertCondition(purchaseCreate.response.status === 201, `Farmácia deve criar solicitação de compra: HTTP ${purchaseCreate.response.status} ${JSON.stringify(purchaseCreate.body)}`);
  const purchaseId = purchaseCreate.body?.item?.id;
  assertCondition(purchaseId, 'Solicitação de compra deve retornar ID');
  const pharmacistCannotApprove = await request('/api/v1/purchase-requests/' + purchaseId + '/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pharmacistCookie },
    body: JSON.stringify({ decision: 'approved' }),
  });
  assertCondition(pharmacistCannotApprove.response.status === 403, 'Farmácia não deve aprovar a própria solicitação nem outras compras');

  const directorLogin = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'ci.direcao', senha: process.env.TEST_DIRECTOR_PASSWORD }),
  });
  assertCondition(directorLogin.response.ok, `Login da direção de CI falhou: ${JSON.stringify(directorLogin.body)}`);
  const directorCookie = getCookieHeader(directorLogin.response.headers.get('set-cookie'));
  const billingBatches = await request('/api/v1/billing-batches', { headers: { Cookie: directorCookie } });
  assertCondition(billingBatches.response.ok && billingBatches.body?.items?.length, 'Direção deve consultar lotes sintéticos de faturamento');
  const billingBatchId = billingBatches.body.items[0].id;
  const denialCreate = await request('/api/v1/billing-denials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify({ batchId: billingBatchId, documentReference: 'CI-DENIAL-001', reason: 'Glosa sintética criada pelo teste de integração.', disputedAmount: 125.5, appealDeadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }),
  });
  assertCondition(denialCreate.response.status === 201, `Direção deve registrar glosa: HTTP ${denialCreate.response.status} ${JSON.stringify(denialCreate.body)}`);
  const denialId = denialCreate.body.item.id;
  for (const [status, reason] of [['under_review', 'Início de análise sintética.'], ['appeal_submitted', 'Recurso sintético encaminhado.'], ['accepted', 'Deferimento sintético de CI.']]) {
    const decision = await request('/api/v1/billing-denials/' + denialId + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
      body: JSON.stringify({ status, reason }),
    });
    assertCondition(decision.response.ok && decision.body?.item?.status === status, `Transição de glosa para ${status} deve ser persistida e auditada: HTTP ${decision.response.status}`);
  }
  const invalidDenialTransition = await request('/api/v1/billing-denials/' + denialId + '/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify({ status: 'under_review', reason: 'Tentativa inválida após resolução.' }),
  });
  assertCondition(invalidDenialTransition.response.status === 409 && invalidDenialTransition.body?.codigo === 'INVALID_BILLING_DENIAL_TRANSITION', 'Glosa resolvida não pode reabrir por transição inválida');
  const productionReport = await request('/api/v1/reports/production', { headers: { Cookie: directorCookie } });
  assertCondition(productionReport.response.ok && productionReport.body?.items?.some(item => item.instrument === 'BPA-C' && Number(item.records) >= 1), 'Relatório de produção deve agregar registros sintéticos persistidos');
  assertCondition(productionReport.body?.officialExportPerformed === false, 'Relatório interno não deve alegar transmissão oficial');
  const denialReport = productionReport.body.denials?.find(item => item.status === 'accepted');
  assertCondition(denialReport && Number(denialReport.total) >= 1, 'Relatório deve consolidar glosas por situação');

  const purchaseDecision = await request('/api/v1/purchase-requests/' + purchaseId + '/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify({ decision: 'approved' }),
  });
  assertCondition(purchaseDecision.response.ok && purchaseDecision.body?.item?.status === 'approved', 'Direção deve aprovar solicitação enviada por outro usuário');

  const purchaseRejectCreate = await request('/api/v1/purchase-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pharmacistCookie },
    body: JSON.stringify({ itemName: 'Segundo material sintético CI', quantity: 2, priority: 'routine', justification: 'Teste automatizado do fluxo de rejeição.' }),
  });
  assertCondition(purchaseRejectCreate.response.status === 201, 'Farmácia deve criar segunda solicitação para teste de rejeição');
  const purchaseReject = await request('/api/v1/purchase-requests/' + purchaseRejectCreate.body.item.id + '/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify({ decision: 'rejected', reason: 'Justificativa sintética de rejeição para CI.' }),
  });
  assertCondition(purchaseReject.response.ok && purchaseReject.body?.item?.status === 'rejected', 'Direção deve rejeitar com justificativa obrigatória');

  const professionalList = await request('/api/v1/professional-registry', { headers: { Cookie: directorCookie } });
  assertCondition(professionalList.response.ok && professionalList.body?.items?.length, 'Direção deve consultar profissionais ativos da unidade');
  const professionalId = professionalList.body.items[0].id;
  const shiftStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);
  const shiftPayload = { professionalId, sector: 'Enfermaria CI', startsAt: shiftStart.toISOString(), endsAt: shiftEnd.toISOString(), notes: 'Registro sintético de CI' };
  const shiftCreate = await request('/api/v1/professional-shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify(shiftPayload),
  });
  assertCondition(shiftCreate.response.status === 201, `Direção deve criar escala: HTTP ${shiftCreate.response.status} ${JSON.stringify(shiftCreate.body)}`);
  const shiftOverlap = await request('/api/v1/professional-shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify(shiftPayload),
  });
  assertCondition(shiftOverlap.response.status === 409 && shiftOverlap.body?.codigo === 'PROFESSIONAL_SHIFT_OVERLAP', 'Plantões sobrepostos devem ser bloqueados');
  const shiftDecision = await request('/api/v1/professional-shifts/' + shiftCreate.body.item.id + '/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: directorCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assertCondition(shiftDecision.response.ok && shiftDecision.body?.item?.status === 'confirmed', 'Direção deve confirmar plantão com auditoria');

  const guardedDispense = await request('/farmacia/dispensar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pharmacistCookie },
    body: JSON.stringify({ consultaId: 999999, revisadoPor: 'usuario-forjado' }),
  });
  assertCondition(guardedDispense.response.status === 400, `Rota legada de dispensação deve orientar o uso da API versionada: HTTP ${guardedDispense.response.status}`);
  assertCondition(guardedDispense.body?.codigo === 'USE_VERSIONED_PRESCRIPTION_DISPENSING', 'Rota legada deve direcionar para o fluxo versionado de dispensação');

  const doctorTriageScreen = await request('/triagem', { headers: { Cookie: doctorCookie } });
  assertCondition(doctorTriageScreen.response.status === 403, `Perfil médico não deve consultar a API da triagem: HTTP ${doctorTriageScreen.response.status}`);

  const doctorConsultationQueue = await request('/consultas/fila', { headers: { Cookie: doctorCookie } });
  assertCondition(doctorConsultationQueue.response.ok && Array.isArray(doctorConsultationQueue.body), 'Fila médica dedicada deve estar disponível ao perfil médico');

  const blockedTriageDelete = await request('/triagem?id=999999', {
    method: 'DELETE',
    headers: { Cookie: doctorCookie },
  });
  assertCondition(blockedTriageDelete.response.status === 403, `Médico não deve acessar a operação de exclusão/encerramento da triagem: HTTP ${blockedTriageDelete.response.status}`);

  const missingClosureReason = await request('/triagem/999999/encerrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctorCookie },
    body: JSON.stringify({ motivo: 'curto' }),
  });
  assertCondition(missingClosureReason.response.status === 403, `Médico não deve encerrar triagem: HTTP ${missingClosureReason.response.status}`);

  const adminClinicalData = await request('/pacientes', { headers: { Cookie: sessionCookie } });
  assertCondition(adminClinicalData.response.status === 403, `Administrador técnico não deve acessar pacientes sem permissão clínica: HTTP ${adminClinicalData.response.status}`);

  const adminInventory = await request('/estoque', { headers: { Cookie: sessionCookie } });
  assertCondition(adminInventory.response.status === 403, `Administrador técnico não deve acessar estoque sem permissão operacional: HTTP ${adminInventory.response.status}`);

  const adminSafetyRules = await request('/safety/regras', { headers: { Cookie: sessionCookie } });
  assertCondition(adminSafetyRules.response.ok, `Admin deveria acessar Safety Engine: HTTP ${adminSafetyRules.response.status}`);

  const blockedModuleRead = await request('/protocolos', { headers: { Cookie: sessionCookie } });
  assertCondition(blockedModuleRead.response.status === 404, `Rota legada não montada deve responder 404: HTTP ${blockedModuleRead.response.status}`);

  const blockedModuleWrite = await request('/protocolos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ protocolo: 'registro genérico não deve ser persistido' }),
  });
  assertCondition(blockedModuleWrite.response.status === 404, `Rota legada sem implementação não deve aceitar gravação: HTTP ${blockedModuleWrite.response.status}`);

  const blockedModuleDelete = await request('/protocolos/123', {
    method: 'DELETE',
    headers: { Cookie: sessionCookie },
  });
  assertCondition(blockedModuleDelete.response.status === 404, `Rota legada sem implementação não deve permitir exclusão física: HTTP ${blockedModuleDelete.response.status}`);

  const triageLogin = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'ci.triagem', senha: process.env.TEST_TRIAGE_PASSWORD }),
  });
  assertCondition(triageLogin.response.ok, `Login de triagem falhou: ${JSON.stringify(triageLogin.body)}`);
  assertCondition(triageLogin.body.role === 'triagem', `Role inesperada para triagem: ${JSON.stringify(triageLogin.body)}`);
  const triageCookie = getCookieHeader(triageLogin.response.headers.get('set-cookie'));
  assertCondition(triageCookie, 'Cookie de sessão não retornado para triagem');

  const triageSafetyRead = await request('/safety/regras', { headers: { Cookie: triageCookie } });
  assertCondition(triageSafetyRead.response.status === 403, `Triagem não deveria ler Safety Engine: HTTP ${triageSafetyRead.response.status}`);
  const triageSafetyWrite = await request('/safety/regras', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: triageCookie },
    body: JSON.stringify({ alergia: false }),
  });
  assertCondition(triageSafetyWrite.response.status === 403, `Triagem não deveria alterar Safety Engine: HTTP ${triageSafetyWrite.response.status}`);

  const triageLogout = await request('/logout', {
    method: 'POST',
    headers: { Cookie: triageCookie },
  });
  assertCondition(triageLogout.response.ok, `Logout de triagem falhou: HTTP ${triageLogout.response.status}`);
  const triageMeAfterLogout = await request('/me', { headers: { Cookie: triageCookie } });
  assertCondition(triageMeAfterLogout.response.status === 401, `Sessão de triagem deveria ser invalidada após logout: HTTP ${triageMeAfterLogout.response.status}`);

  const meResult = await request('/me', {
    headers: {
      Cookie: sessionCookie,
    },
  });

  assertCondition(meResult.response.ok, `GET /me falhou: ${JSON.stringify(meResult.body)}`);
  assertCondition(meResult.body.role === 'admin', `GET /me retornou role inesperada: ${JSON.stringify(meResult.body)}`);

  // Modo claro/escuro: el usuario guarda su preferencia y /me la devuelve
  const themeSetResult = await request('/me/tema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ tema: 'dark' }),
  });
  assertCondition(themeSetResult.response.ok, `POST /me/tema falhou: ${JSON.stringify(themeSetResult.body)}`);
  assertCondition(themeSetResult.body.tema === 'dark', `POST /me/tema não devolviu tema=dark: ${JSON.stringify(themeSetResult.body)}`);

  const meThemeResult = await request('/me', { headers: { Cookie: sessionCookie } });
  assertCondition(meThemeResult.body.theme === 'dark', `GET /me não devolviu theme=dark: ${JSON.stringify(meThemeResult.body)}`);

  const themeInvalidResult = await request('/me/tema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ tema: 'neon' }),
  });
  assertCondition(!themeInvalidResult.response.ok, 'POST /me/tema deveria rejeitar um tema inválido');

  // Restaura o tema claro para não deixar o usuário demo em modo escuro
  await request('/me/tema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ tema: 'light' }),
  });

  const dashboardResult = await request('/dashboard', {
    headers: {
      Cookie: sessionCookie,
    },
  });

  assertCondition(dashboardResult.response.ok, `GET /dashboard falhou: ${JSON.stringify(dashboardResult.body)}`);
  assertCondition(dashboardResult.body && typeof dashboardResult.body.porCondicao === 'object', 'Dashboard não retornou porCondicao esperado');

  const estoqueResult = await request('/estoque', {
    headers: {
      Cookie: pharmacistCookie,
    },
  });

  assertCondition(estoqueResult.response.ok, `GET /estoque falhou: ${JSON.stringify(estoqueResult.body)}`);
  assertCondition(Array.isArray(estoqueResult.body) && estoqueResult.body.length > 0, 'Estoque vazio ou endpoint inválido');

  const casaResult = await request('/atendimentos-casa', {
    headers: {
      Cookie: doctorCookie,
    },
  });

  assertCondition(casaResult.response.ok, `GET /atendimentos-casa falhou: ${JSON.stringify(casaResult.body)}`);
  assertCondition(Array.isArray(casaResult.body), 'Endpoint de atendimento domiciliar retornou payload inesperado');

  console.log('Smoke test concluído com sucesso.');
}

main().catch((error) => {
  console.error('Smoke test falhou:', error.message || error);
  process.exit(1);
});
