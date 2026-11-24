import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validatePublicOutput } from '../lib/public-output.mjs';

export const PUBLIC_REPOSITORY = 'cicpmatos/caiomatos-site-publico';
export const PUBLIC_REPOSITORY_ID = 1469475632;
const SOURCE_REPOSITORY = 'cicpmatos/cicpmatos.github.io';
const SOURCE_REPOSITORY_ID = 1382264698;
const OWNER_ID = 92313515;
const META = ['.github/workflows/pages.yml', 'README.md'];
const SHA = /^[a-f0-9]{40}$/;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

// Access tokens are opaque. GitHub's current installation format contains a
// JWT and is longer than legacy tokens. Validate header transport only, never
// their prefix, claims, signature, fixed length or GitHub-specific alphabet.
export function isSafeBearerToken(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && /^[\x21-\x7e]+$/.test(value);
}

// Source history is never pushed, cloned into the destination, or mentioned in
// public commit messages. Only validated final files become fresh Git blobs.
export async function publishStatic({ files, token, fetchImpl = fetch }) {
  assert(isSafeBearerToken(token), 'Autorização de publicação ausente ou inválida.');
  assert(Array.isArray(files) && files.length > 0, 'Nenhum arquivo final validado.');
  const seen = new Set();
  for (const file of files) {
    assert(typeof file.path === 'string' && !file.path.startsWith('/') && !file.path.includes('\\') &&
      !file.path.split('/').some(part => !part || part === '..' || part === '.' || (part.startsWith('.') && file.path !== '.nojekyll')) &&
      !META.includes(file.path) && Buffer.isBuffer(file.bytes), 'Arquivo de publicação inválido.');
    assert(!seen.has(file.path), 'Arquivo final duplicado.');
    seen.add(file.path);
  }
  for (const required of ['index.html', 'CNAME', '.nojekyll', 'admin/index.html', 'admin/runtime-config.json']) {
    assert(seen.has(required), 'Saída pública incompleta.');
  }
  assert(files.find(file => file.path === 'CNAME').bytes.toString('utf8').trim() === 'caiomatos.com.br', 'Domínio público inesperado.');
  const prefix = `https://api.github.com/repos/${PUBLIC_REPOSITORY}`;
  async function api(path, method = 'GET', data) {
    const response = await fetchImpl(prefix + path, {
      method, redirect: 'manual', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'caio-site-static-publisher',
        ...(data ? { 'Content-Type': 'application/json' } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    assert(response.ok && response.status < 300, `GitHub recusou a operação de publicação (HTTP ${response.status}).`);
    // Never surface the API error body: it may contain contextual/private data.
    return response.json();
  }
  const repo = await api('');
  assert(repo.id === PUBLIC_REPOSITORY_ID && repo.owner?.id === OWNER_ID &&
    repo.full_name === PUBLIC_REPOSITORY && repo.private === false && repo.default_branch === 'main' && !repo.archived,
  'Destino de publicação não corresponde ao repositório público aprovado.');
  const ref = await api('/git/ref/heads/main');
  const head = ref.object?.sha;
  assert(SHA.test(head), 'Referência pública inválida.');
  const commit = await api(`/git/commits/${head}`);
  assert(SHA.test(commit.tree?.sha), 'Árvore pública inválida.');
  const oldTree = await api(`/git/trees/${commit.tree.sha}?recursive=1`);
  assert(oldTree.truncated === false && Array.isArray(oldTree.tree), 'Árvore pública incompleta.');
  const retained = META.map(path => {
    const item = oldTree.tree.find(entry => entry.path === path);
    assert(item?.type === 'blob' && item.mode === '100644' && SHA.test(item.sha), 'Configuração inicial do destino está incompleta.');
    return { path, mode: '100644', type: 'blob', sha: item.sha };
  });
  const desired = [...retained];
  for (const { path, bytes } of files) {
    const sha = gitBlobSha(bytes);
    const existing = oldTree.tree.find(item => item.path === path);
    if (!(existing?.sha === sha && existing.mode === '100644' && existing.type === 'blob')) {
      const blob = await api('/git/blobs', 'POST', { content: bytes.toString('base64'), encoding: 'base64' });
      assert(blob.sha === sha, 'Conteúdo enviado não corresponde ao arquivo validado.');
    }
    desired.push({ path, mode: '100644', type: 'blob', sha });
  }
  const current = oldTree.tree.filter(item => item.type !== 'tree');
  if (current.length === desired.length && desired.every(item => current.some(old => old.path === item.path && old.sha === item.sha && old.mode === item.mode && old.type === item.type))) {
    return { changed: false, files: files.length, commit: head };
  }
  // No base_tree: obsolete output is removed from the new snapshot. The public
  // repository's own published history remains intact; source history is absent.
  const tree = await api('/git/trees', 'POST', { tree: desired });
  assert(SHA.test(tree.sha), 'Nova árvore pública inválida.');
  const next = await api('/git/commits', 'POST', {
    message: 'Atualizar versão pública do site', tree: tree.sha, parents: [head],
  });
  assert(SHA.test(next.sha), 'Novo commit público inválido.');
  const currentRef = await api('/git/ref/heads/main');
  assert(currentRef.object?.sha === head, 'O destino mudou durante a publicação. Execute novamente.');
  await api('/git/refs/heads/main', 'PATCH', { sha: next.sha, force: false });
  const verified = await api('/git/ref/heads/main');
  assert(verified.object?.sha === next.sha, 'Não foi possível confirmar a atualização pública.');
  return { changed: true, files: files.length, commit: next.sha };
}

async function main() {
  assert(process.env.GITHUB_REPOSITORY === SOURCE_REPOSITORY &&
    process.env.GITHUB_REF === 'refs/heads/main' &&
    ['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME), 'Publicação permitida somente pela main dos bastidores.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  assert(event.repository?.id === SOURCE_REPOSITORY_ID && event.repository?.private === true,
    'Os bastidores precisam estar privados antes da publicação automática.');
  const root = resolve(import.meta.dirname, '..');
  const validated = await validatePublicOutput(root);
  const files = await Promise.all(validated.files.map(async path => ({ path, bytes: await readFile(resolve(root, '_site', path)) })));
  const result = await publishStatic({ files, token: process.env.PUBLIC_SITE_TOKEN });
  console.log(result.changed ? `${result.files} arquivos finais enviados ao repositório público.` : 'A versão pública já está atualizada.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
