const SITE_ORIGIN = 'https://caiomatos.com.br';
const SITE_HOST = 'caiomatos.com.br';
const ALLOWED_GITHUB_ID = 92313515;
const COOKIE_NAME = '__Host-cms-oauth';
const SESSION_MS = 10 * 60 * 1000;
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function unbase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('Noncanonical encoding');
  return bytes;
}

function randomValue(size = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(size)));
}

function getConfig(env) {
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.PUBLIC_ORIGIN ||
      origin.username || origin.password || origin.origin === SITE_ORIGIN) {
    throw new Error('Invalid public origin');
  }
  if (typeof env.OAUTH_CLIENT_ID !== 'string' || !/^[A-Za-z0-9._-]{8,128}$/.test(env.OAUTH_CLIENT_ID) ||
      typeof env.OAUTH_CLIENT_SECRET !== 'string' || env.OAUTH_CLIENT_SECRET.length < 20 ||
      typeof env.SESSION_SECRET !== 'string' || unbase64url(env.SESSION_SECRET).length !== 32) {
    throw new Error('Missing configuration');
  }
  return {
    origin: origin.origin,
    clientId: env.OAUTH_CLIENT_ID,
    clientSecret: env.OAUTH_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    callback: `${origin.origin}/callback`,
  };
}

function headers(extra = {}) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extra,
  };
}

function cookie(value, maxAge = SESSION_MS / 1000) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function plain(message, status, extra = {}) {
  return new Response(message, {
    status,
    headers: headers({ 'Content-Type': 'text/plain; charset=utf-8', ...extra }),
  });
}

function uniqueAllowedParameters(params, allowed) {
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key) || !allowed.includes(key)) return false;
    seen.add(key);
  }
  return true;
}

function additionalData(config) {
  return encoder.encode(`cms-oauth-v1|${config.origin}|${SITE_ORIGIN}|${config.clientId}`);
}

async function sessionKey(config) {
  return crypto.subtle.importKey('raw', unbase64url(config.sessionSecret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function sealSession(session, config) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(config) },
    await sessionKey(config),
    encoder.encode(JSON.stringify(session)),
  );
  return `${base64url(iv)}.${base64url(ciphertext)}`;
}

async function readSession(request, config, now) {
  const matches = (request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) throw new Error('Missing or ambiguous session');
  const encoded = matches[0].slice(COOKIE_NAME.length + 1);
  if (encoded.length > 2048) throw new Error('Invalid session');
  const pieces = encoded.split('.');
  if (pieces.length !== 2) throw new Error('Invalid session');
  const iv = unbase64url(pieces[0]);
  if (iv.length !== 12) throw new Error('Invalid session');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(config) },
    await sessionKey(config),
    unbase64url(pieces[1]),
  );
  const session = JSON.parse(new TextDecoder().decode(plaintext));
  if (session.version !== 1 || session.provider !== 'github' || session.origin !== SITE_ORIGIN ||
      !/^[A-Za-z0-9_-]{43}$/.test(session.state) || !/^[A-Za-z0-9_-]{43}$/.test(session.verifier) ||
      !Number.isSafeInteger(session.createdAt) || session.createdAt > now ||
      session.expiresAt !== session.createdAt + SESSION_MS || now >= session.expiresAt) {
    throw new Error('Expired or invalid session');
  }
  return session;
}

function equalState(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

// Escape for a script element as well as JavaScript, even for upstream API values.
function scriptJSON(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

function popupResult(payload, success, status = 200) {
  const nonce = randomValue(18);
  const message = `authorization:github:${success ? 'success' : 'error'}:${JSON.stringify(payload)}`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acesso ao painel</title></head>
<body><p id="status">Concluindo o acesso ao painel. Esta janela pode ser fechada após o retorno.</p>
<script nonce="${nonce}">
(() => {
  const targetOrigin = ${scriptJSON(SITE_ORIGIN)};
  const opener = window.opener;
  let result = ${scriptJSON(message)};
  if (!opener) {
    document.getElementById('status').textContent = 'Abra o login pelo painel em caiomatos.com.br/admin/.';
    result = null;
    return;
  }
  const receive = event => {
    if (event.origin !== targetOrigin || event.source !== opener || event.data !== 'authorizing:github') return;
    window.removeEventListener('message', receive);
    opener.postMessage(result, targetOrigin);
    result = null;
    window.close();
  };
  window.addEventListener('message', receive);
  opener.postMessage('authorizing:github', targetOrigin);
  window.setTimeout(() => {
    window.removeEventListener('message', receive);
    result = null;
    document.getElementById('status').textContent = 'O painel não respondeu. Feche esta janela e tente entrar novamente.';
  }, 30000);
})();
</script></body></html>`;
  return new Response(html, {
    status,
    headers: headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': cookie('', 0),
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    }),
  });
}

async function authorize(request, url, config, now) {
  const params = url.searchParams;
  const requestOrigin = request.headers.get('Origin');
  if (!uniqueAllowedParameters(params, ['provider', 'site_id', 'scope', 'login']) ||
      params.get('provider') !== 'github' || params.get('site_id') !== SITE_HOST ||
      (params.has('scope') && params.get('scope') !== 'public_repo') ||
      (params.has('login') && params.get('login') !== 'true') ||
      (requestOrigin !== null && requestOrigin !== SITE_ORIGIN)) {
    return plain('Solicitação de acesso inválida. Abra o login pelo painel do site.', 400);
  }
  const referrer = request.headers.get('Referer');
  if (referrer) {
    try {
      if (new URL(referrer).origin !== SITE_ORIGIN) throw new Error('Wrong referrer');
    } catch {
      return plain('Origem de acesso não permitida.', 403);
    }
  }
  const session = {
    version: 1, provider: 'github', origin: SITE_ORIGIN,
    state: randomValue(), verifier: randomValue(), createdAt: now, expiresAt: now + SESSION_MS,
  };
  const github = new URL('https://github.com/login/oauth/authorize');
  github.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callback,
    scope: 'public_repo',
    state: session.state,
    code_challenge: base64url(await crypto.subtle.digest('SHA-256', encoder.encode(session.verifier))),
    code_challenge_method: 'S256',
    login: 'cicpmatos',
    allow_signup: 'false',
  }).toString();
  return plain('Redirecionando para o GitHub…', 302, {
    Location: github.href,
    'Set-Cookie': cookie(await sealSession(session, config)),
  });
}

async function callback(request, url, config, now, fetchImpl) {
  const params = url.searchParams;
  let session;
  try {
    if (!uniqueAllowedParameters(params, ['code', 'state', 'error', 'error_description', 'error_uri', 'provider']) ||
        (params.has('provider') && params.get('provider') !== 'github')) throw new Error('Invalid callback');
    session = await readSession(request, config, now);
    if (!equalState(params.get('state'), session.state)) throw new Error('Invalid state');
  } catch {
    return plain('Sessão de login inválida ou expirada. Volte ao painel e tente novamente.', 400, { 'Set-Cookie': cookie('', 0) });
  }
  if (params.has('error')) {
    return popupResult({ message: 'A autorização no GitHub não foi concluída. Tente novamente pelo painel.' }, false, 401);
  }
  const code = params.get('code');
  if (!code || code.length > 2048) {
    return popupResult({ message: 'O GitHub não retornou um código válido. Tente novamente.' }, false, 400);
  }
  try {
    const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callback,
        code_verifier: session.verifier,
      }).toString(),
    });
    if (!tokenResponse.ok) throw new Error('Token exchange failed');
    const token = await tokenResponse.json();
    if (token.error || typeof token.access_token !== 'string' ||
        !/^[A-Za-z0-9_]{20,2048}$/.test(token.access_token) ||
        token.token_type?.toLowerCase() !== 'bearer' || token.scope !== 'public_repo') {
      throw new Error('Invalid token or excessive scope');
    }
    const userResponse = await fetchImpl('https://api.github.com/user', {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.access_token}`,
        'User-Agent': 'caiomatos-cms-oauth',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!userResponse.ok) throw new Error('Identity check failed');
    const user = await userResponse.json();
    if (user.id !== ALLOWED_GITHUB_ID) {
      return popupResult({ message: 'Esta conta do GitHub não tem acesso ao painel.' }, false, 403);
    }
    return popupResult({ token: token.access_token, provider: 'github' }, true);
  } catch {
    return popupResult({ message: 'Não foi possível validar o acesso no GitHub. Entre novamente; se persistir, confira a configuração do serviço.' }, false, 502);
  }
}

// Injection is for isolated tests; production always uses the platform fetch and clock.
export function createHandler({ fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  return async (request, env) => {
    const url = new URL(request.url);
    if (!['/auth', '/callback'].includes(url.pathname)) return plain('Não encontrado.', 404);
    if (request.method !== 'GET') return plain('Método não permitido.', 405, { Allow: 'GET' });
    let config;
    try { config = getConfig(env); } catch {
      return plain('O serviço de acesso ainda precisa ser configurado.', 503);
    }
    if (url.origin !== config.origin) return plain('Endereço de acesso não permitido.', 400);
    try {
      return url.pathname === '/auth'
        ? await authorize(request, url, config, now())
        : await callback(request, url, config, now(), fetchImpl);
    } catch {
      return plain('O serviço de acesso está temporariamente indisponível.', 503, { 'Set-Cookie': cookie('', 0) });
    }
  };
}

export default { fetch: createHandler() };
