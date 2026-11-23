import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { readLoginError } from '../admin/login-feedback.js';

const AUTH = 'https://caiomatos-cms-auth.cicpmatos.workers.dev';

test('production aliases and HTTP are upgraded to the canonical secure editor', async () => {
  const html = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const origin of ['http://caiomatos.com.br', 'https://www.caiomatos.com.br', 'https://cicpmatos.github.io']) {
    let destination;
    const location = { origin, hostname: new URL(origin).hostname, hash: '#/collections/posts', replace: value => {destination = value;} };
    runInNewContext(script, {location});
    assert.equal(destination, 'https://caiomatos.com.br/admin/#/collections/posts');
  }
  for (const origin of ['https://caiomatos.com.br', 'http://localhost:8080']) {
    let changed = false;
    runInNewContext(script, {location:{origin,hostname:new URL(origin).hostname,hash:'',replace:()=>{changed=true;}}});
    assert.equal(changed, false);
  }
});

test('login feedback accepts only fixed error codes from the configured auth origin', () => {
  const data = 'authorization:github:error:' + JSON.stringify({code:'oauth_client_credentials',message:'DO_NOT_REFLECT_SECRET'});
  const message = readLoginError({origin:AUTH,data},AUTH);
  assert.ok(message.includes('oauth_client_credentials'));
  assert.ok(!message.includes('DO_NOT_REFLECT_SECRET'));
  assert.equal(readLoginError({origin:'https://other.example',data},AUTH),null);
  assert.equal(readLoginError({origin:AUTH,data:'authorization:github:success:{"token":"DO_NOT_READ_TOKEN"}'},AUTH),null);
  assert.equal(readLoginError({origin:AUTH,data:'authorization:github:error:{invalid'},AUTH),null);
  const unknown = readLoginError({origin:AUTH,data:'authorization:github:error:{"code":"DO_NOT_REFLECT_CODE"}'},AUTH);
  assert.ok(!unknown.includes('DO_NOT_REFLECT_CODE'));
});
