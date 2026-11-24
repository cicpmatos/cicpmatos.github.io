import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHandler } from '../worker.mjs';

const SITE = 'https://caiomatos.com.br';
const AUTH = 'https://cms-auth.example.test';
const TOKEN = 'ghu_test_only_not_a_real_access_token';
const REFRESH = 'ghr_test_only_never_return_to_browser';
const ENV = {
  PUBLIC_ORIGIN: AUTH,
  OAUTH_MODE: 'github_app',
  OAUTH_CLIENT_ID: 'Iv_test_only_client',
  OAUTH_CLIENT_SECRET: 'test-only-legacy-secret-never-valid',
  GITHUB_APP_CLIENT_SECRET: 'test-only-github-app-secret-never-valid',
  SESSION_SECRET: Buffer.alloc(32, 7).toString('base64url'),
  GITHUB_APP_ID: '123456',
  CMS_REPOSITORY_ID: '1382264698',
  CMS_REPOSITORY: 'cicpmatos/cicpmatos.github.io',
};
const INSTALLATION = {
  id: 555,
  app_id: 123456,
  account: { id: 92313515 },
  repository_selection: 'selected',
  suspended_at: null,
  permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
};
const REPOSITORY = {
  id: 1382264698,
  full_name: ENV.CMS_REPOSITORY,
  owner: { id: 92313515 },
  private: true,
  permissions: { push: true },
  archived: false,
  disabled: false,
};

function harness({ token = {}, identity, installation = {}, repository = {}, inventory, repositories, failAt, responseAt } = {}) {
  const calls = [];
  const handler = createHandler({
    now: () => 1800000000000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.redirect, 'manual');
      assert.ok(url.startsWith('https://api.github.com/') || url === 'https://github.com/login/oauth/access_token');
      if (calls.length === failAt) throw new Error('private-upstream-detail');
      if (calls.length === responseAt?.index) return responseAt.response();
      if (url.endsWith('/access_token')) return Response.json({
        access_token: TOKEN, token_type: 'bearer', scope: '', expires_in: 28800,
        refresh_token: REFRESH, refresh_token_expires_in: 15897600, ...token,
      });
      if (url === 'https://api.github.com/user') return Response.json(identity ?? { id: 92313515, login: 'cicpmatos' });
      if (url === 'https://api.github.com/user/installations?per_page=100') {
        return Response.json(inventory ?? { total_count: 1, installations: [{ ...INSTALLATION, ...installation }] });
      }
      if (url === 'https://api.github.com/user/installations/555/repositories?per_page=100') {
        return Response.json(repositories ?? { total_count: 1, repositories: [{ ...REPOSITORY, ...repository }] });
      }
      throw new Error('Unexpected outbound request');
    },
  });
  return { handler, calls };
}

async function start(h = harness(), env = ENV) {
  const response = await h.handler(new Request(`${AUTH}/auth?provider=github&site_id=caiomatos.com.br&scope=offline_access`, {
    headers: { Referer: `${SITE}/admin/` },
  }), env);
  assert.equal(response.status, 302);
  return { h, env, response, github: new URL(response.headers.get('Location')), cookie: response.headers.get('Set-Cookie').split(';')[0] };
}

async function finish(flow, env = flow.env) {
  return flow.h.handler(new Request(`${AUTH}/callback?code=one-time-test-code&state=${flow.github.searchParams.get('state')}`, {
    headers: { Cookie: flow.cookie },
  }), env);
}

async function assertDenied(options, reason, calls) {
  const flow = await start(harness(options));
  const response = await finish(flow);
  const body = await response.text();
  assert.equal(response.status, reason === 'github_account_denied' ? 403 : 502);
  assert.equal(response.headers.get('X-CMS-Login-Error'), reason);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0$/);
  for (const secret of [TOKEN, REFRESH, ENV.OAUTH_CLIENT_SECRET, ENV.GITHUB_APP_CLIENT_SECRET, ENV.SESSION_SECRET, 'private-upstream-detail']) {
    assert.ok(!body.includes(secret));
  }
  if (calls) assert.equal(flow.h.calls.length, calls);
}

test('GitHub App login requests expiry and PKCE, never a classic repo scope', async () => {
  const flow = await start();
  assert.equal(flow.github.searchParams.get('scope'), 'offline_access');
  assert.equal(flow.github.searchParams.get('client_id'), ENV.OAUTH_CLIENT_ID);
  assert.equal(flow.github.searchParams.get('redirect_uri'), `${AUTH}/callback`);
  assert.equal(flow.github.searchParams.get('code_challenge_method'), 'S256');
  assert.match(flow.github.searchParams.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(flow.h.calls.length, 0);
  for (const scope of ['repo', 'public_repo', 'offline_access,repo', 'user', '']) {
    const response = await flow.h.handler(new Request(`${AUTH}/auth?provider=github&site_id=caiomatos.com.br&scope=${encodeURIComponent(scope)}`), ENV);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Location'), null);
  }
});

test('GitHub App success narrows token to source, validates identity/installation/repo and withholds refresh secret', async () => {
  const flow = await start();
  const response = await finish(flow);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(flow.h.calls.length, 4);
  const exchange = new URLSearchParams(flow.h.calls[0].options.body);
  assert.equal(exchange.get('repository_id'), ENV.CMS_REPOSITORY_ID);
  assert.equal(exchange.get('client_secret'), ENV.GITHUB_APP_CLIENT_SECRET);
  assert.notEqual(exchange.get('client_secret'), ENV.OAUTH_CLIENT_SECRET);
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'), flow.github.searchParams.get('code_challenge'));
  for (const call of flow.h.calls.slice(1)) assert.equal(call.options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(body.includes('authorization:github:success:'));
  assert.ok(body.includes(TOKEN));
  for (const secret of [REFRESH, ENV.OAUTH_CLIENT_SECRET, ENV.GITHUB_APP_CLIENT_SECRET, ENV.SESSION_SECRET, exchange.get('code_verifier')]) {
    assert.ok(!body.includes(secret));
  }
  assert.ok(!body.includes('refresh_token'));
});

test('GitHub App token must be expiring user token with empty scopes', async t => {
  for (const token of [
    { scope: 'repo' }, { scope: 'public_repo' }, { scope: 'offline_access' }, { scope: undefined },
    { access_token: 'ghs_installation_token_not_allowed_here' },
    { access_token: 'gho_classic_oauth_token_not_allowed_here' },
    { expires_in: undefined }, { expires_in: 0 }, { expires_in: 28801 }, { expires_in: '28800' },
  ]) {
    await t.test(JSON.stringify(token), () => assertDenied({ token }, 'oauth_scope', 1));
  }
});

test('GitHub App identity still uses immutable owner ID before repository calls', async () => {
  await assertDenied({ identity: { id: 999, login: 'cicpmatos' } }, 'github_account_denied', 2);
});

test('GitHub App rejects unselected, foreign, suspended or ambiguous installations', async t => {
  const cases = [
    { installation: { app_id: 999 } }, { installation: { id: '555' } }, { installation: { id: 0 } },
    { installation: { account: { id: 999 } } }, { installation: { repository_selection: 'all' } },
    { installation: { suspended_at: '2026-11-24T00:00:00Z' } },
    { installation: { suspended_at: undefined } },
    { inventory: { total_count: 0, installations: [] } },
    { inventory: { total_count: 2, installations: [INSTALLATION] } },
    { inventory: { total_count: 1, installations: [INSTALLATION, INSTALLATION] } },
    { inventory: {} },
  ];
  for (const [index, options] of cases.entries()) await t.test(String(index), () => assertDenied(options, 'github_app_access', 3));
});

test('GitHub App permissions must be exactly contents/pull requests write and metadata read', async t => {
  for (const permissions of [
    null, {},
    { ...INSTALLATION.permissions, contents: 'read' },
    { ...INSTALLATION.permissions, pull_requests: 'read' },
    { ...INSTALLATION.permissions, metadata: 'write' },
    { ...INSTALLATION.permissions, actions: 'write' },
    { ...INSTALLATION.permissions, administration: 'read' },
    { ...INSTALLATION.permissions, workflows: 'write' },
  ]) {
    await t.test(JSON.stringify(permissions), () => assertDenied({ installation: { permissions } }, 'github_app_permissions', 3));
  }
});

test('GitHub App requires inventory containing exactly the intended writable private source', async t => {
  const cases = [
    { repository: { id: 1469475632 } },
    { repository: { full_name: 'cicpmatos/caiomatos-site-publico' } },
    { repository: { owner: { id: 999 } } },
    { repository: { private: false } }, { repository: { private: undefined } },
    { repository: { permissions: { push: false } } },
    { repository: { archived: true } }, { repository: { disabled: true } },
    { repositories: { total_count: 0, repositories: [] } },
    { repositories: { total_count: 2, repositories: [REPOSITORY] } },
    { repositories: { total_count: 1, repositories: [REPOSITORY, { ...REPOSITORY, id: 1469475632 }] } },
    { repositories: {} },
  ];
  for (const [index, options] of cases.entries()) await t.test(String(index), () => assertDenied(options, 'github_repository_denied', 4));
});

test('GitHub App API validation fails closed on errors, redirects, malformed JSON and pagination', async t => {
  for (const index of [3, 4]) {
    const reason = index === 3 ? 'github_app_access' : 'github_repository_denied';
    await t.test(`network ${index}`, () => assertDenied({ failAt: index }, reason, index));
    for (const response of [
      () => new Response('', { status: 302, headers: { Location: 'https://untrusted.example' } }),
      () => new Response('', { status: 403 }),
      () => new Response('not-json', { status: 200 }),
      () => Response.json(index === 3 ? { total_count: 1, installations: [INSTALLATION] } : { total_count: 1, repositories: [REPOSITORY] }, {
        headers: { Link: '<https://untrusted.example>; rel="next"' },
      }),
    ]) {
      await t.test(`response ${index}`, () => assertDenied({ responseAt: { index, response } }, reason, index));
    }
  }
});

test('GitHub App configuration is explicit and validates identifiers without any outbound requests', async () => {
  for (const override of [
    { OAUTH_MODE: 'repo' }, { OAUTH_MODE: '' },
    { GITHUB_APP_CLIENT_SECRET: undefined }, { GITHUB_APP_CLIENT_SECRET: null },
    { GITHUB_APP_CLIENT_SECRET: '' }, { GITHUB_APP_CLIENT_SECRET: 'short' },
    { GITHUB_APP_ID: undefined }, { GITHUB_APP_ID: '0' }, { GITHUB_APP_ID: '1e3' },
    { CMS_REPOSITORY_ID: '-1' }, { CMS_REPOSITORY_ID: '01' }, { CMS_REPOSITORY_ID: '9007199254740992' },
    { CMS_REPOSITORY: undefined }, { CMS_REPOSITORY: 'elsewhere/repo' },
    { CMS_REPOSITORY: 'cicpmatos/../repo' }, { CMS_REPOSITORY: 'cicpmatos/repo?query' },
  ]) {
    const h = harness();
    const response = await h.handler(new Request(`${AUTH}/auth?provider=github&site_id=caiomatos.com.br`), { ...ENV, ...override });
    assert.equal(response.status, 503);
    assert.equal(h.calls.length, 0);
  }
});

test('GitHub App mode does not require or use the retired OAuth App secret', async () => {
  const env = { ...ENV, OAUTH_CLIENT_SECRET: undefined };
  const flow = await start(harness(), env);
  const response = await finish(flow);
  assert.equal(response.status, 200);
  const exchange = new URLSearchParams(flow.h.calls[0].options.body);
  assert.equal(exchange.get('client_secret'), ENV.GITHUB_APP_CLIENT_SECRET);
});

test('GitHub App sessions are bound to mode, application and repository configuration', async () => {
  for (const override of [
    { OAUTH_MODE: 'oauth_public' }, { GITHUB_APP_ID: '654321' },
    { CMS_REPOSITORY_ID: '1469475632' }, { CMS_REPOSITORY: 'cicpmatos/caiomatos-site-publico' },
  ]) {
    const flow = await start();
    const response = await finish(flow, { ...ENV, ...override });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('X-CMS-Login-Error'), 'cookie_invalid');
    assert.equal(flow.h.calls.length, 0);
  }
});
