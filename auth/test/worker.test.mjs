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

function harness({ identity = { id: 92313515, login: 'cicpmatos' }, token = {}, upstreamError = false } = {}) {
  let time = 1800000000000;
  const calls = [];
  const handler = createHandler({
    now: () => time,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
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
  assert.equal(tokenRequest.get('client_secret'), ENV.OAUTH_CLIENT_SECRET);
  assert.equal(tokenRequest.get('redirect_uri'), `${AUTH}/callback`);
  assert.equal(createHash('sha256').update(tokenRequest.get('code_verifier')).digest('base64url'), flow.github.searchParams.get('code_challenge'));
  assert.equal(flow.h.calls[1].options.headers.Authorization, `Bearer ${TOKEN}`);
  for (const call of flow.h.calls) assert.equal(call.options.redirect, 'error');
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

test('callback rejects query injection and provider mismatches without contacting GitHub', async () => {
  for (const query of ['code=test&provider=gitlab', 'code=test&redirect_uri=https://attacker.example', 'code=one&code=two', 'code=test&state=extra']) {
    const flow = await start();
    const response = await finish(flow, { query });
    assert.equal(response.status, 400);
    assert.equal(flow.h.calls.length, 0);
  }
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
