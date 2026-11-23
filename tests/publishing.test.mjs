import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('um novo Markdown vira post, índices e sitemap; conteúdo perigoso bloqueia o build', async () => {
  const source = resolve(import.meta.dirname, '..');
  const fixture = await mkdtemp(join(tmpdir(), 'caio-publishing-test-'));
  try {
    for (const path of ['content', 'lib', 'scripts', 'admin', 'eleventy.config.js', 'package.json', 'index.html', 'style.css', 'site-v2.css', 'script.js', 'CNAME', 'robots.txt', 'assets', 'projetos', 'tecnologias', 'videos', 'publicacoes']) {
      await cp(join(source, path), join(fixture, path), { recursive: true });
    }
    await symlink(join(source, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    const data = '---\ntitle: "Uma experiência <img src=x onerror=alert(1)>"\ndescription: Uma nota de teste\nslug: nota-pessoal\ncategory: Pessoal\ndate: 2026-12-26\nrepository: https://github.com/cicpmatos/cicpmatos.github.io\nlinks: [{label: Documentação, url: "https://www.11ty.dev/"}]\n---\nTexto {{ 7 * 7 }}.\n\n```python\nprint("Olá")\n```\n\n<script>alert(1)</script>\n';
    await writeFile(join(fixture, 'content/posts/nota-pessoal.md'), data);
    const build = () => spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, env: { ...process.env, CMS_AUTH_ORIGIN: '' }, encoding: 'utf8' });
    let result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const post = await readFile(join(fixture, '_site/artigos/nota-pessoal.html'), 'utf8');
    assert.match(post, /Texto \{\{ 7 \* 7 \}\}/);
    assert.ok(!post.includes('<img src=x'));
    assert.ok(!post.includes('<script>alert'));
    assert.match(post, /26 de dezembro de 2026/);
    assert.match(post, /Ver repositório no GitHub/);
    assert.match(post, /<footer>[\s\S]*<a href="\/admin\/">Área do autor<\/a>[\s\S]*<\/footer>/);
    assert.match(post, /https:\/\/www.11ty.dev\//);
    for (const file of ['artigos/index.html', 'alem-dos-dados/index.html', 'sitemap.xml']) {
      assert.match(await readFile(join(fixture, '_site', file), 'utf8'), /\/artigos\/nota-pessoal\.html/);
    }
    assert.deepEqual(JSON.parse(await readFile(join(fixture, '_site/admin/runtime-config.json'), 'utf8')), { enabled: false, authOrigin: null });
    // A nested post must go through the same validation as editor-created posts.
    await mkdir(join(fixture, 'content/posts/nested'));
    await writeFile(join(fixture, 'content/posts/nested/duplicate.md'), data);
    result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Endereço repetido/);
    await rm(join(fixture, 'content/posts/nested/duplicate.md'));
    await mkdir(join(fixture, 'assets/uploads'), { recursive: true });
    await writeFile(join(fixture, 'assets/uploads/active.html'), '<script>alert(1)</script>');
    result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /HTML e SVG não são publicados/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
