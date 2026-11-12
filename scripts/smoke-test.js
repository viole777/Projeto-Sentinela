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

  const browserNavigation = await fetch(new URL('/profissionais', BASE_URL), {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
  });
  assertCondition(browserNavigation.status === 302, `Navegação HTML deveria redirecionar para a SPA: HTTP ${browserNavigation.status}`);
  assertCondition(browserNavigation.headers.get('location') === '/app/profissionais', 'Navegação HTML deveria apontar para /app/profissionais');

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
  const guardedDispense = await request('/farmacia/dispensar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pharmacistCookie },
    body: JSON.stringify({ consultaId: 999999, revisadoPor: 'usuario-forjado' }),
  });
  assertCondition(guardedDispense.response.status === 501, `Dispensação sem controle de lote/validade deve ficar bloqueada: HTTP ${guardedDispense.response.status}`);
  assertCondition(guardedDispense.body?.codigo === 'DISPENSING_REQUIRES_STRUCTURED_ITEMS', 'Bloqueio de dispensação deve explicar salvaguardas ausentes');

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
  assertCondition(blockedModuleRead.response.status === 501, `Módulo sem API específica deveria responder 501: HTTP ${blockedModuleRead.response.status}`);
  assertCondition(blockedModuleRead.body?.codigo === 'MODULE_NOT_IMPLEMENTED', 'Módulo não implementado deveria explicar o bloqueio');

  const blockedModuleWrite = await request('/protocolos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ protocolo: 'registro genérico não deve ser persistido' }),
  });
  assertCondition(blockedModuleWrite.response.status === 501, `CRUD genérico não deveria aceitar gravação: HTTP ${blockedModuleWrite.response.status}`);

  const blockedModuleDelete = await request('/protocolos/123', {
    method: 'DELETE',
    headers: { Cookie: sessionCookie },
  });
  assertCondition(blockedModuleDelete.response.status === 501, `CRUD genérico não deveria permitir exclusão física: HTTP ${blockedModuleDelete.response.status}`);

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
