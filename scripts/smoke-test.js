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

  const loginResult = await request('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ usuario: 'admin', senha: '123' }),
  });

  const loginResponse = loginResult.response;
  const loginBody = loginResult.body;

  assertCondition(loginResponse.ok, `Login falhou: ${JSON.stringify(loginBody)}`);
  assertCondition(loginBody.role === 'admin', `Role inesperada no login: ${JSON.stringify(loginBody)}`);

  const sessionCookie = getCookieHeader(loginResponse.headers.get('set-cookie'));
  assertCondition(sessionCookie, 'Cookie de sessão não retornado no login');

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
      Cookie: sessionCookie,
    },
  });

  assertCondition(estoqueResult.response.ok, `GET /estoque falhou: ${JSON.stringify(estoqueResult.body)}`);
  assertCondition(Array.isArray(estoqueResult.body) && estoqueResult.body.length > 0, 'Estoque vazio ou endpoint inválido');

  const casaResult = await request('/atendimentos-casa', {
    headers: {
      Cookie: sessionCookie,
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
