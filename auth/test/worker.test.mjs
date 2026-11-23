import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { createHandler } from '../worker.mjs';

const SITE = 'https://caiomatos.com.br';
const AUTH = 'https://cms-auth.example.test';
const TOKEN = 'gho_test_token_only_never_a_real_github_token';
const ENV = {
  PUBLIC_ORIGIN: AUTH,
  OAUTH_CLIENT_ID: 'test-client-id',
  OAUTH_CLIENT_SECRET: 'test-only-client-secret-never-valid',
  SESSION_SECRET: Buffer.alloc(32, 7).toString('base64url'),
};

function harness({ identity = { id: 92313515, login: 'cicpmatos' }, token = {}, upstreamError = false, redirectAt = null } = {}) {
  let time = 1800000000000;
  const calls = [];
  const handler = createHandler({
    now: () => time,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.redirect === 'error') throw new TypeError('Workers does not support redirect error mode');
      if ((redirectAt === 'token' && url.endsWith('/access_token')) || (redirectAt === 'identity' && url.endsWith('/user'))) {
        return new Response('',{status:302,headers:{Location:'https://must-never-receive-credentials.example'}});
      }
      if (upstreamError) throw new Error('sensitive upstream diagnostic');
      if (url.endsWith('/access_token')) {
        return Response.json({ access_token: TOKEN, token_type: 'bearer', scope: 'public_repo', ...token });
      }
      if (url === 'https://api.github.com/user') return Response.json(identity);
      throw new Error('Unexpected outbound request');
    },
  });
  return { handler, calls, advance: ms => { time += ms; } };
}

async function start(h = harness(), query = 'provider=github&site_id=caiomatos.com.br&scope=public_repo') {
  const response = await h.handler(new Request(`${AUTH}/auth?${query}`, { headers: { Referer: `${SITE}/admin/` } }), ENV);
  assert.equal(response.status, 302);
  return { h, response, github: new URL(response.headers.get('Location')), cookie: response.headers.get('Set-Cookie').split(';')[0] };
}

async function finish(flow, { state = flow.github.searchParams.get('state'), cookie = flow.cookie, query = 'code=one-time-code' } = {}) {
  return flow.h.handler(new Request(`${AUTH}/callback?${query}&state=${encodeURIComponent(state)}`, { headers: cookie ? { Cookie: cookie } : {} }), ENV);
}

test('authorization sends fixed callback, minimal scope, random state and PKCE; encrypted cookie is secure', async () => {
  const flow = await start();
  const second = await start();
  const params = flow.github.searchParams;
  assert.equal(flow.github.origin, 'https://github.com');
  assert.equal(flow.github.pathname, '/login/oauth/authorize');
  assert.equal(params.get('redirect_uri'), `${AUTH}/callback`);
  assert.equal(params.get('scope'), 'public_repo');
  assert.equal(params.get('login'), 'cicpmatos');
  assert.equal(params.get('allow_signup'), 'false');
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.match(params.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(params.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(params.get('state'), second.github.searchParams.get('state'));
  assert.ok(!flow.cookie.includes(params.get('state')));
  assert.match(flow.response.headers.get('Set-Cookie'), /^__Host-cms-oauth=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  assert.equal(flow.response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(flow.h.calls.length, 0);
});

test('success validates immutable GitHub ID, binds PKCE and returns only the token to the exact opener', async () => {
  const flow = await start(harness({ identity: { id: 92313515, login: 'a-new-login' } }));
  const response = await finish(flow);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0$/);
  const tokenRequest = new URLSearchParams(flow.h.calls[0].options.body);
  assert.equal(flow.h.calls[0].options.headers['User-Agent'], 'caiomatos-cms-oauth');
  assert.equal(tokenRequest.get('client_secret'), ENV.OAUTH_CLIENT_SECRET);
  assert.equal(tokenRequest.get('redirect_uri'), `${AUTH}/callback`);
  assert.equal(createHash('sha256').update(tokenRequest.get('code_verifier')).digest('base64url'), flow.github.searchParams.get('code_challenge'));
  assert.equal(flow.h.calls[1].options.headers.Authorization, `Bearer ${TOKEN}`);
  for (const call of flow.h.calls) assert.equal(call.options.redirect, 'manual');
  const html = await response.text();
  assert.ok(!html.includes(ENV.OAUTH_CLIENT_SECRET));
  assert.ok(!html.includes(tokenRequest.get('code_verifier')));
  const [, nonce, script] = html.match(/<script nonce="([^"]+)">([\s\S]+?)<\/script>/);
  assert.ok(response.headers.get('Content-Security-Policy').includes(`script-src 'nonce-${nonce}'`));
  const messages = [];
  const listeners = new Map();
  let closed = false;
  const opener = { postMessage: (...args) => messages.push(args) };
  const fakeWindow = {
    opener,
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    setTimeout: () => 1,
    close: () => { closed = true; },
  };
  runInNewContext(script, { window: fakeWindow, document: { getElementById: () => ({ textContent: '' }) } });
  assert.deepEqual(messages, [['authorizing:github', SITE]]);
  const receive = listeners.get('message');
  receive({ origin: 'https://attacker.example', source: opener, data: 'authorizing:github' });
  receive({ origin: SITE, source: {}, data: 'authorizing:github' });
  receive({ origin: SITE, source: opener, data: 'authorizing:gitlab' });
  assert.equal(messages.length, 1);
  receive({ origin: SITE, source: opener, data: 'authorizing:github' });
  assert.equal(messages[1][1], SITE);
  assert.deepEqual(JSON.parse(messages[1][0].slice('authorization:github:success:'.length)), { token: TOKEN, provider: 'github' });
  assert.equal(listeners.has('message'), false);
  assert.equal(closed, true);
});

test('a different GitHub account is rejected before any token enters the popup', async () => {
  const flow = await start(harness({ identity: { id: 123, login: 'cicpmatos' } }));
  const response = await finish(flow);
  const html = await response.text();
  assert.equal(response.status, 403);
  assert.ok(html.includes('authorization:github:error:'));
  assert.ok(!html.includes(TOKEN));
});

test('missing, forged, duplicate and expired session cookies never trigger an exchange', async t => {
  for (const kind of ['missing', 'tampered', 'duplicate', 'expired', 'wrong state', 'wrong browser']) {
    await t.test(kind, async () => {
      const flow = await start();
      let cookie = flow.cookie;
      let state = flow.github.searchParams.get('state');
      if (kind === 'missing') cookie = '';
      if (kind === 'tampered') cookie += 'x';
      if (kind === 'duplicate') cookie += `; ${flow.cookie}`;
      if (kind === 'expired') flow.h.advance(600000);
      if (kind === 'wrong state') state = 'X'.repeat(43);
      if (kind === 'wrong browser') cookie = (await start()).cookie;
      const response = await finish(flow, { cookie, state });
      assert.equal(response.status, 400);
      assert.equal(flow.h.calls.length, 0);
      assert.match(response.headers.get('Set-Cookie'), /Max-Age=0$/);
      assert.ok(!(await response.text()).includes(TOKEN));
    });
  }
});

test('session diagnostics use fixed reason codes without exposing callback or session values', async t => {
  const callbackCode = 'diagnostic-code-fixture-never-valid';
  const extraValue = 'diagnostic-extra-fixture-never-sensitive';
  const wrongState = 'W'.repeat(43);
  const scenarios = [
    {
      name: 'duplicate callback parameter', reason: 'callback_parameters',
      change: () => ({ query: `code=${callbackCode}&code=${extraValue}` }),
    },
    {
      name: 'unexpected provider', reason: 'callback_parameters',
      change: () => ({ query: `code=${callbackCode}&provider=${extraValue}` }),
    },
    { name: 'missing browser cookie', reason: 'cookie_missing', change: () => ({ cookie: '' }) },
    {
      name: 'ambiguous browser cookie', reason: 'cookie_ambiguous',
      change: flow => ({ cookie: `${flow.cookie}; ${flow.cookie}` }),
    },
    {
      name: 'malformed browser cookie', reason: 'cookie_invalid',
      change: () => ({ cookie: `__Host-cms-oauth=${extraValue}` }),
    },
    {
      name: 'tampered encrypted cookie', reason: 'cookie_invalid',
      change: flow => ({ cookie: `${flow.cookie}x` }),
    },
    {
      name: 'expired session', reason: 'session_expired',
      change: flow => { flow.h.advance(600000); return {}; },
    },
    {
      name: 'future session timestamp', reason: 'session_future',
      change: flow => { flow.h.advance(-1); return {}; },
    },
    { name: 'mismatched state', reason: 'state_mismatch', change: () => ({ state: wrongState }) },
    {
      name: 'overlapping login attempts', reason: 'state_mismatch',
      change: async () => ({ cookie: (await start()).cookie }),
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const flow = await start();
      const options = { query: `code=${callbackCode}`, ...await scenario.change(flow) };
      const response = await finish(flow, options);
      const body = await response.text();
      const headerText = Array.from(response.headers, ([name, value]) => `${name}: ${value}`).join('\n');
      const reason = response.headers.get('X-CMS-Login-Error');
      assert.ok(response.status === 400, 'Session failures must keep their existing HTTP status.');
      assert.ok(reason === scenario.reason, 'Session diagnostics must use the expected fixed reason code.');
      assert.ok(body.startsWith('Sessão de login inválida ou expirada. Volte ao painel e tente novamente.'), 'Keep the existing user-facing explanation.');
      assert.ok(body.includes(scenario.reason), 'The safe reason code must be available in the error explanation.');
      assert.ok(response.headers.get('Cache-Control') === 'no-store, max-age=0', 'Diagnostic responses must not be cached.');
      assert.ok(response.headers.get('Set-Cookie')?.endsWith('Max-Age=0'), 'The rejected login cookie must be cleared.');
      assert.ok(flow.h.calls.length === 0, 'Session failures must not contact the GitHub API.');
      const sessionValue = flow.cookie.slice(flow.cookie.indexOf('=') + 1);
      const forbidden = [
        TOKEN, ENV.OAUTH_CLIENT_SECRET, ENV.SESSION_SECRET, callbackCode, extraValue, wrongState,
        flow.github.searchParams.get('state'), flow.github.searchParams.get('code_challenge'),
        flow.cookie, sessionValue, ...sessionValue.split('.'), options.cookie, options.state, options.query,
      ].filter(value => typeof value === 'string' && value.length > 0);
      assert.ok(forbidden.every(value => !body.includes(value) && !headerText.includes(value)), 'No callback, credential, state or cookie values may appear in diagnostics.');
    });
  }
});

test('auth rejects redirect injection, provider mismatch, duplicate parameters, broad scopes and foreign origins', async t => {
  for (const suffix of ['&redirect_uri=https://attacker.example', '&origin=https://attacker.example', '&provider=gitlab', '&site_id=attacker.example', '&scope=repo']) {
    await t.test(suffix, async () => {
      const h = harness();
      const response = await h.handler(new Request(`${AUTH}/auth?provider=github&site_id=caiomatos.com.br${suffix}`), ENV);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('Location'), null);
      assert.equal(h.calls.length, 0);
    });
  }
  for (const header of ['Origin', 'Referer']) {
    const response = await harness().handler(new Request(`${AUTH}/auth?provider=github&site_id=caiomatos.com.br`, { headers: { [header]: 'https://attacker.example' } }), ENV);
    assert.ok([400, 403].includes(response.status));
  }
  const wrongHost = await harness().handler(new Request('https://attacker.example/auth?provider=github&site_id=caiomatos.com.br'), ENV);
  assert.equal(wrongHost.status, 400);
});

test('callback rejects ambiguous consumed parameters and provider mismatches without contacting GitHub', async () => {
  for (const query of [
    'code=test&provider=gitlab', 'code=one&code=two', 'code=test&state=extra',
    'code=test&provider=github&provider=github', 'error=one&error=two',
    'error=access_denied&error_description=one&error_description=two',
    'error=access_denied&error_uri=one&error_uri=two',
  ]) {
    const flow = await start();
    const response = await finish(flow, { query });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('X-CMS-Login-Error'), 'callback_parameters');
    assert.equal(flow.h.calls.length, 0);
  }
});

test('unrecognized callback metadata is ignored, not reflected or forwarded', async () => {
  const extras = new URLSearchParams({
    scope: 'untrusted-scope-metadata', iss: 'https://ignored-issuer.example',
    unknown: '<script>ignored-metadata</script>', redirect_uri: 'https://ignored-redirect.example',
  });
  extras.append('unknown', 'ignored-duplicate-metadata');
  const query = `code=one-time-code&${extras}`;
  const flow = await start();
  const response = await finish(flow, { query });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-CMS-Login-Error'), null);
  assert.equal(flow.h.calls.length, 2);
  assert.equal(flow.h.calls[0].url, 'https://github.com/login/oauth/access_token');
  assert.equal(flow.h.calls[1].url, 'https://api.github.com/user');
  const exchange = new URLSearchParams(flow.h.calls[0].options.body);
  assert.equal(exchange.get('redirect_uri'), `${AUTH}/callback`);
  assert.deepEqual([...exchange.keys()].sort(), ['client_id', 'client_secret', 'code', 'code_verifier', 'redirect_uri']);
  const body = await response.text();
  const output = body + JSON.stringify([...response.headers]) + JSON.stringify(flow.h.calls);
  assert.ok([...extras.values()].every(value => !output.includes(value)), 'Unknown parameter values must not reach output or upstream calls.');
  const badState = await start();
  const rejected = await finish(badState, { query, state: 'X'.repeat(43) });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.headers.get('X-CMS-Login-Error'), 'state_mismatch');
  assert.equal(badState.h.calls.length, 0);
  const wrongAccount = await start(harness({ identity: { id: 123, login: 'cicpmatos' } }));
  const denied = await finish(wrongAccount, { query });
  assert.equal(denied.status, 403);
  assert.ok(!(await denied.text()).includes(TOKEN));
});

test('cancelled authorization returns a safe Decap error only after state validation', async () => {
  const flow = await start();
  const response = await finish(flow, { query: 'error=access_denied&error_description=%3Cscript%3Ebad%3C%2Fscript%3E' });
  const html = await response.text();
  assert.equal(response.status, 401);
  assert.ok(html.includes('authorization:github:error:'));
  assert.ok(!html.includes('bad'));
  assert.equal(flow.h.calls.length, 0);
});

test('upstream failures and unexpectedly broad or malformed tokens do not disclose credentials', async t => {
  const cases = [
    { upstreamError: true },
    { token: { scope: 'repo' } },
    { token: { scope: 'public_repo,user' } },
    { token: { token_type: 'unknown' } },
    { token: { access_token: '</script><script>attack</script>' } },
    { token: { error: 'bad_verification_code' } },
  ];
  for (const options of cases) {
    await t.test(JSON.stringify(options), async () => {
      const flow = await start(harness(options));
      const response = await finish(flow);
      const html = await response.text();
      assert.equal(response.status, 502);
      assert.ok(!html.includes(TOKEN));
      assert.ok(!html.includes(ENV.OAUTH_CLIENT_SECRET));
      assert.ok(!html.includes('sensitive upstream diagnostic'));
      assert.ok(!html.includes('attack'));
      assert.equal(flow.h.calls.length, 1);
    });
  }
});

test('missing/unsafe configuration fails closed; unrelated endpoints and methods are unavailable', async () => {
  for (const override of [
    { OAUTH_CLIENT_ID: '' }, { OAUTH_CLIENT_SECRET: '' }, { SESSION_SECRET: 'short' },
    { PUBLIC_ORIGIN: '' }, { PUBLIC_ORIGIN: 'http://cms-auth.example.test' },
    { PUBLIC_ORIGIN: `${AUTH}/` }, { PUBLIC_ORIGIN: `${AUTH}/callback` },
    { PUBLIC_ORIGIN: SITE }, { PUBLIC_ORIGIN: 'https://user:password@cms-auth.example.test' },
  ]) {
    const h = harness();
    const response = await h.handler(new Request(`${AUTH}/auth?provider=github&site_id=caiomatos.com.br`), { ...ENV, ...override });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  assert.equal((await h.handler(new Request(`${AUTH}/other`), ENV)).status, 404);
  const post = await h.handler(new Request(`${AUTH}/auth`, { method: 'POST' }), ENV);
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET');
});

test('OAuth failure stages expose fixed diagnostic labels but never upstream details', async () => {
  for (const [error, expected] of [
    ['incorrect_client_credentials','oauth_client_credentials'],
    ['redirect_uri_mismatch','oauth_redirect_mismatch'],
    ['bad_verification_code','oauth_code_invalid'],
    ['unverified_user_email','oauth_email_unverified'],
    ['untrusted-upstream-diagnostic','oauth_exchange_failed'],
  ]) {
    const flow = await start(harness({token:{error,error_description:'UPSTREAM_PRIVATE_DETAIL'}}));
    const response = await finish(flow);
    const html = await response.text();
    assert.equal(response.status,502);
    assert.equal(response.headers.get('X-CMS-Login-Error'),expected);
    assert.ok(html.includes(expected));
    assert.ok(!html.includes('UPSTREAM_PRIVATE_DETAIL'));
    assert.ok(!html.includes('untrusted-upstream-diagnostic'));
    assert.ok(!html.includes(ENV.OAUTH_CLIENT_SECRET));
    assert.ok(!html.includes(TOKEN));
    assert.equal(flow.h.calls.length,1);
  }
});

test('Cloudflare-compatible outbound calls reject redirects without forwarding credentials', async () => {
  for (const redirectAt of ['token','identity']) {
    const flow = await start(harness({redirectAt}));
    const response = await finish(flow);
    const body = await response.text();
    assert.equal(response.status,502);
    assert.equal(flow.h.calls.length,redirectAt==='token'?1:2);
    assert.ok(flow.h.calls.every(call=>call.options.redirect==='manual'));
    assert.ok(flow.h.calls.every(call=>['https://github.com/login/oauth/access_token','https://api.github.com/user'].includes(call.url)));
    assert.ok(!body.includes(ENV.OAUTH_CLIENT_SECRET));
    assert.ok(!body.includes(TOKEN));
    assert.ok(!body.includes('must-never-receive-credentials.example'));
  }
});
