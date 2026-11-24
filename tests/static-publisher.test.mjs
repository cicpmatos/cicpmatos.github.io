import test from 'node:test';
import assert from 'node:assert/strict';
import { gitBlobSha, isSafeBearerToken, publishStatic, PUBLIC_REPOSITORY, PUBLIC_REPOSITORY_ID } from '../scripts/publish-static.mjs';

const token = 'ghs_' + 'x'.repeat(36);
const initial = 'a'.repeat(40), next = 'b'.repeat(40), tree = 'c'.repeat(40);
const files = ['index.html', '.nojekyll', 'CNAME', 'admin/index.html', 'admin/runtime-config.json'].map(path => ({path, bytes: Buffer.from(path === 'CNAME' ? 'caiomatos.com.br\n' : 'public')}));

function fake({ wrongRepo = false, unchanged = false, race = false, redirect = false } = {}) {
  const calls = [];
  let head = initial, refReads = 0;
  const entries = ['README.md', '.github/workflows/pages.yml'].map(path => ({path, type:'blob',mode:'100644',sha:'d'.repeat(40)}));
  if (unchanged) entries.push(...files.map(file => ({path:file.path,type:'blob',mode:'100644',sha:gitBlobSha(file.bytes)})));
  else entries.push({path:'obsolete.html',type:'blob',mode:'100644',sha:'e'.repeat(40)});
  const fetchImpl = async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/repos/' + PUBLIC_REPOSITORY));
    assert.equal(options.redirect, 'manual');
    const path = url.slice(('https://api.github.com/repos/' + PUBLIC_REPOSITORY).length);
    const body = options.body && JSON.parse(options.body);
    calls.push({path, method:options.method, body});
    if (redirect) return new Response(null, {status:302,headers:{Location:'https://evil.example'}});
    let data;
    if (path === '') data = {id:wrongRepo ? 1 : PUBLIC_REPOSITORY_ID,owner:{id:92313515},full_name:PUBLIC_REPOSITORY,private:false,default_branch:'main',archived:false};
    else if (path === '/git/ref/heads/main') { refReads++; data = {object:{sha:race && refReads > 1 ? 'f'.repeat(40) : head}}; }
    else if (path === `/git/commits/${initial}`) data = {tree:{sha:tree}};
    else if (path === `/git/trees/${tree}?recursive=1`) data = {truncated:false,tree:entries};
    else if (path === '/git/blobs') data = {sha:gitBlobSha(Buffer.from(body.content,'base64'))};
    else if (path === '/git/trees') data = {sha:'f'.repeat(40)};
    else if (path === '/git/commits') data = {sha:next};
    else if (path === '/git/refs/heads/main') { assert.equal(body.force,false); head = body.sha; data = {object:{sha:head}}; }
    else throw new Error('Unexpected path ' + path);
    return Response.json(data);
  };
  return {fetchImpl,calls};
}

test('publisher sends only final bytes, keeps public metadata, drops stale output without force/history rewrite', async () => {
  const mock = fake();
  const result = await publishStatic({files,token,...mock});
  assert.equal(result.changed,true);
  const createdTree = mock.calls.find(call => call.path === '/git/trees').body;
  assert.equal(createdTree.base_tree,undefined);
  assert.deepEqual(createdTree.tree.map(item => item.path).sort(), [...files.map(file => file.path),'README.md','.github/workflows/pages.yml'].sort());
  const commit = mock.calls.find(call => call.path === '/git/commits').body;
  assert.deepEqual(commit.parents,[initial]);
  assert.equal(commit.message,'Atualizar versão pública do site');
  assert.ok(!JSON.stringify(mock.calls).includes('content/posts'));
});

test('identical public output causes no writes', async () => {
  const mock = fake({unchanged:true});
  assert.equal((await publishStatic({files,token,...mock})).changed,false);
  assert.ok(mock.calls.every(call => call.method === 'GET'));
});

test('wrong immutable destination and redirects fail closed before writes', async () => {
  for (const options of [{wrongRepo:true},{redirect:true}]) {
    const mock = fake(options);
    await assert.rejects(publishStatic({files,token,...mock}));
    assert.ok(mock.calls.every(call => call.method === 'GET'));
  }
});

test('concurrent destination change does not overwrite branch', async () => {
  const mock = fake({race:true});
  await assert.rejects(publishStatic({files,token,...mock}),/mudou/);
  assert.ok(!mock.calls.some(call => call.method === 'PATCH'));
});

test('missing files, traversal, hidden source and duplicate paths fail before network', async () => {
  for (const bad of [[],files.slice(1),[...files,{path:'../private.txt',bytes:Buffer.from('x')}],
    [...files,{path:'.env',bytes:Buffer.from('x')}],[...files,files[0]]]) {
    await assert.rejects(publishStatic({files:bad,token,fetchImpl:async () => {throw new Error('Should not connect');}}));
  }
});

test('publisher treats current JWT-shaped installation tokens as opaque header values', async () => {
  const currentToken = 'ghs_5896570_' + 'a'.repeat(150) + '.' + 'b_-'.repeat(100) + '.' + 'c'.repeat(150);
  const mock = fake();
  assert.equal((await publishStatic({ files, token: currentToken, ...mock })).changed, true);
  assert.equal(isSafeBearerToken('future-opaque-token:value+/=~'), true);
});

test('publisher refuses header injection, whitespace, missing and oversized tokens before network', async () => {
  for (const token of [undefined, null, 123, '', 'opaque\r\nInjected: secret', 'opaque\0value', 'opaque value', 'opaque\tvalue', 'opaque\u007fvalue', 'a'.repeat(8193)]) {
    let called = false;
    await assert.rejects(publishStatic({ files, token, fetchImpl: async () => { called = true; throw new Error('Must not contact GitHub'); } }));
    assert.equal(called, false);
  }
});
