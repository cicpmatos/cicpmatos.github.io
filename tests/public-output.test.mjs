import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicationPlan, validatePublicOutput, containsCredential } from '../lib/public-output.mjs';

const source = resolve(import.meta.dirname, '..');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Synthetic strings only: fake app ID, payload and signature; no real credentials.
const fakeStatelessToken = `ghs_999999999_${'fake_header-'.repeat(4)}.${'fake_payload_'.repeat(30)}.${'not-a-signature_'.repeat(8)}`;

test('detector não imprime nem aceita formatos conhecidos de credenciais', () => {
  for (const value of [
    `ghp_${'a'.repeat(36)}`, `ghs_${'a'.repeat(36)}`, `github_pat_${'a'.repeat(80)}`,
    '-----BEGIN PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----',
    `client_secret = "${'a'.repeat(40)}"`, `api_token: ${'b'.repeat(40)}`,
    `AKIA${'A'.repeat(16)}`,
  ]) assert.equal(containsCredential(value), true);
  for (const value of ['const client_id = "Ov23liR0imL88VYGV2qM";', 'client_secret: "EXEMPLO"', 'const access_token = response.access_token;']) {
    assert.equal(containsCredential(value), false);
  }
});

test('detecta tokens de instalação stateless com pontos, hífens e underscores sem fixar tamanho', () => {
  assert.ok(fakeStatelessToken.length > 520);
  for (const token of [fakeStatelessToken, 'ghs_999999999_header-test.payload_test.signature-test-', `ghs_999999999_${'a_b-c.'.repeat(400)}`]) {
    for (const text of [token, `Bearer ${token}`, `<code>${token}</code>`, `const value = "${token}";`]) {
      assert.equal(containsCredential(text), true);
    }
  }
  for (const text of ['ghs_APPID_JWT', 'ghs_', 'ghs_EXEMPLO', 'Client ID Iv23li1qI8KHaJxOGh3S']) {
    assert.equal(containsCredential(text), false);
  }
});

test('a fronteira pública permite somente arquivos finais esperados', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'caio-public-output-test-'));
  const out = path => join(fixture, '_site', path);
  const build = () => spawnSync(process.execPath, ['scripts/build.mjs'], {
    cwd: fixture, env: { ...process.env, CMS_AUTH_ORIGIN: '' }, encoding: 'utf8', timeout: 60_000,
  });
  try {
    for (const path of ['content', 'lib', 'scripts', 'admin', 'eleventy.config.js', 'package.json', 'index.html', 'style.css', 'site-v2.css', 'script.js', 'CNAME', 'robots.txt', 'assets', 'projetos', 'tecnologias', 'publicacoes']) {
      await cp(join(source, path), join(fixture, path), { recursive: true });
    }
    await symlink(join(source, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    await mkdir(join(fixture, 'assets/uploads'), { recursive: true });
    await writeFile(join(fixture, 'assets/uploads/usada.png'), png);
    await writeFile(join(fixture, 'assets/uploads/privada.png'), png);
    await writeFile(join(fixture, 'assets/notas-privadas.md'), 'Não publicar esta nota.');
    await writeFile(join(fixture, 'admin/backup.js'), 'Não publicar este backup.');
    const post = join(fixture, 'content/posts/integracao-apis-xadrez.md');
    await writeFile(post, `${await readFile(post, 'utf8')}\n\n![Exemplo](/assets/uploads/usada.png)\n`);
    let result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const plan = await publicationPlan(fixture);

    await t.test('imagens referenciadas são públicas; órfãs, notas e backups ficam privados', async () => {
      const verified = await validatePublicOutput(fixture, plan);
      assert.ok(Array.isArray(verified.files));
      assert.ok(verified.files.includes('assets/uploads/usada.png'));
      assert.equal(verified.uploads, 1);
      for (const path of ['assets/uploads/privada.png', 'assets/uploads/.gitkeep', 'assets/notas-privadas.md', 'admin/backup.js']) {
        await assert.rejects(access(out(path)), { code: 'ENOENT' });
      }
    });

    await t.test('fontes, arquivos ocultos, mapas, dumps e nomes inesperados bloqueiam publicação', async () => {
      for (const path of ['.env', '.git/config', 'content/posts/rascunho.md', 'auth/worker.js', 'admin/app.js.map', 'assets/uploads/notas.txt', 'assets/uploads/copia.zip', 'assets/uploads/draft.png', 'backup.html']) {
        await mkdir(dirname(out(path)), { recursive: true });
        await writeFile(out(path), 'não publicar');
        await assert.rejects(validatePublicOutput(fixture, plan), /arquivo inesperado/);
        await rm(out(path));
      }
    });

    await t.test('links simbólicos na saída e até em uploads não usados são bloqueados', async () => {
      await symlink(join(fixture, 'index.html'), out('atalho.html'));
      await assert.rejects(validatePublicOutput(fixture, plan), /link simbólico/);
      await rm(out('atalho.html'));
      await symlink(join(fixture, 'index.html'), join(fixture, 'assets/uploads/atalho.png'));
      await assert.rejects(publicationPlan(fixture), /link simbólico/);
      await rm(join(fixture, 'assets/uploads/atalho.png'));
    });

    await t.test('credencial em página é bloqueada sem revelar o valor no erro', async () => {
      const original = await readFile(out('index.html'));
      for (const secret of [`ghp_${'a'.repeat(36)}`, `ghs_${'a'.repeat(36)}`, fakeStatelessToken]) {
        await writeFile(out('index.html'), `${original}\n${secret}`);
        await assert.rejects(validatePublicOutput(fixture, plan), error => /possível credencial/.test(error.message) && !error.message.includes(secret));
      }
      await writeFile(out('index.html'), original);
    });

    await t.test('bibliotecas devem ser exatamente as dependências instaladas', async () => {
      const file = out('admin/vendor/decap-cms.js');
      const original = await readFile(file);
      await writeFile(file, 'console.log("alterado")');
      await assert.rejects(validatePublicOutput(fixture, plan), /difere da dependência/);
      await writeFile(file, original);
    });

    await t.test('configuração de login não pode carregar campos privados', async () => {
      const file = out('admin/runtime-config.json');
      const original = await readFile(file);
      await writeFile(file, JSON.stringify({ enabled: false, authOrigin: null, clientSecret: 'oculto' }));
      await assert.rejects(validatePublicOutput(fixture, plan), /somente enabled, authOrigin, authMode e repository/);
      await writeFile(file, original);
    });

    await t.test('GitHub App permite somente modo explícito e repositório de bastidores fixo', async () => {
      const file = out('admin/runtime-config.json');
      const original = await readFile(file);
      const runtime = { enabled: true, authOrigin: 'https://auth.example.com', authMode: 'github_app', repository: 'cicpmatos/cicpmatos.github.io' };
      await writeFile(file, JSON.stringify(runtime));
      await validatePublicOutput(fixture, plan);
      for (const extra of [{ authMode: 'outro' }, { authMode: null }, { repository: 'cicpmatos/outro' }, { repository: null }, { authOrigin: undefined }]) {
        await writeFile(file, JSON.stringify({ ...runtime, ...extra }));
        await assert.rejects(validatePublicOutput(fixture, plan), /Publicação bloqueada/);
      }
      await writeFile(file, original);
    });

    await t.test('não ignora arquivo esperado ausente ou imagem sem referência publicada', async () => {
      const file = out('assets/uploads/usada.png');
      await rm(file);
      await assert.rejects(validatePublicOutput(fixture, plan), /arquivo público esperado está ausente/);
      await writeFile(file, png);
      const page = out('artigos/integracao-apis-xadrez.html');
      const original = await readFile(page, 'utf8');
      await writeFile(page, original.replace('/assets/uploads/usada.png', '/assets/dashboard-xadrez.png'));
      await assert.rejects(validatePublicOutput(fixture, plan), /upload sem referência/);
      await writeFile(page, original);
    });

    await t.test('draft:true é rejeitado, nunca publicado como se estivesse pronto', async () => {
      const original = await readFile(post, 'utf8');
      await writeFile(post, original.replace('category: Power BI', 'category: Power BI\ndraft: true'));
      await assert.rejects(publicationPlan(fixture), /campo não permitido: draft/);
      await writeFile(post, original);
    });

    await t.test('uma página gerada fora do contrato bloqueia o build completo', async () => {
      await writeFile(join(fixture, 'content/rascunho.njk'), '---\npermalink: /rascunho.html\n---\nConteúdo privado.');
      result = build();
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /rascunho.html.*arquivo inesperado/);
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
