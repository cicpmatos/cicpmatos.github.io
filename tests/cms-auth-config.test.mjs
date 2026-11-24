import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsConfig } from '../admin/config.js';
import { readLoginError } from '../admin/login-feedback.js';

test('editor configuration preserves the existing public OAuth defaults', () => {
  const config = createCmsConfig('https://auth.example.test');
  assert.equal(config.backend.repo, 'cicpmatos/cicpmatos.github.io');
  assert.equal(config.backend.auth_scope, 'public_repo');
  assert.ok(config.collections.every(collection => collection.description.includes('Rascunhos no GitHub são públicos.')));
});

test('editor GitHub App mode uses nonempty expiry scope and private backstage wording', () => {
  const config = createCmsConfig('https://auth.example.test', { authMode: 'github_app' });
  assert.equal(config.backend.repo, 'cicpmatos/cicpmatos.github.io');
  assert.equal(config.backend.auth_scope, 'offline_access');
  assert.equal(config.backend.branch, 'main');
  assert.equal(config.publish_mode, 'editorial_workflow');
  assert.equal(config.show_preview_links, false);
  assert.ok(config.collections.every(collection => collection.description.includes('repositório privado')));
  assert.ok(config.collections.every(collection => !collection.description.includes('Rascunhos no GitHub são públicos.')));
});

test('editor runtime rejects unknown authentication modes and unsafe repository names', () => {
  for (const options of [
    { authMode: 'repo' }, { authMode: '' }, { authMode: 'github-app' },
    { repository: 'other-owner/repo' }, { repository: 'https://github.com/cicpmatos/repo' },
    { repository: 'cicpmatos/repo/extra' }, { repository: 'cicpmatos/repo?auth=true' },
  ]) assert.throws(() => createCmsConfig('https://auth.example.test', options));
  assert.equal(createCmsConfig('https://auth.example.test', { authMode: 'github_app', repository: 'cicpmatos/site-fonte' }).backend.repo, 'cicpmatos/site-fonte');
});

test('editor retains fixed GitHub App denial diagnostics without reflecting upstream detail', () => {
  const origin = 'https://auth.example.test';
  for (const code of ['github_app_access', 'github_app_permissions', 'github_repository_denied']) {
    const data = 'authorization:github:error:' + JSON.stringify({ code, message: 'DO_NOT_REFLECT_SECRET' });
    const message = readLoginError({ origin, data }, origin);
    assert.ok(message.includes(code));
    assert.ok(!message.includes('DO_NOT_REFLECT_SECRET'));
    assert.equal(readLoginError({ origin: 'https://other.example', data }, origin), null);
  }
});
