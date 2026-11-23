import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve(import.meta.dirname, '..');
const sharedSlug = 'integracao-apis-xadrez';
const newerSlug = 'primeiro-csv-em-video';
const olderId = 'AbCdEfGhI_1';
const newerId = 'ZyXwVuTsR_2';

function video({ slug = sharedSlug, title = 'Um exemplo em vídeo', date = '2026-12-05', url = `https://www.youtube.com/watch?v=${olderId}`, body = '' } = {}) {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: Uma demonstração para o teste de publicação\nslug: ${slug}\ncategory: Python\n${date ? `date: ${date}\n` : ''}youtube_url: ${JSON.stringify(url)}\n---\n${body}`;
}

function assertPlayer(html, id) {
  const frames = html.match(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g) || [];
  const player = frames.find(frame => frame.includes(`/embed/${id}?playsinline=1`));
  assert.ok(player, `Player do vídeo ${id} não encontrado.`);
  assert.match(player, new RegExp(`\\bsrc="https://www\\.youtube-nocookie\\.com/embed/${id}\\?playsinline=1"`));
  assert.match(player, /\bloading="lazy"/);
  assert.match(player, /\btitle="[^"]+"/);
  assert.match(player, /\breferrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(player, /\ballowfullscreen(?:\s|=|>)/);
  assert.doesNotMatch(player, /[?&](?:amp;)?autoplay=/);
  assert.doesNotMatch(player, /\sautoplay(?:\s|=|>)/);
}

test('vídeos Markdown geram players, páginas e sitemap sem alterar artigos; validação bloqueia vídeos inválidos', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'caio-video-publishing-test-'));
  try {
    // The root videos/ page is now generated from content, not copied as static HTML.
    for (const path of ['content', 'lib', 'scripts', 'admin', 'eleventy.config.js', 'package.json', 'index.html', 'style.css', 'site-v2.css', 'script.js', 'CNAME', 'robots.txt', 'assets', 'projetos', 'tecnologias', 'publicacoes']) {
      await cp(join(source, path), join(fixture, path), { recursive: true });
    }
    await symlink(join(source, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    await mkdir(join(fixture, 'content/videos'), { recursive: true });
    const readOutput = path => readFile(join(fixture, '_site', path), 'utf8');
    const build = () => spawnSync(process.execPath, ['scripts/build.mjs'], {
      cwd: fixture,
      env: { ...process.env, CMS_AUTH_ORIGIN: '' },
      encoding: 'utf8',
      timeout: 60_000,
    });

    let result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const emptyIndex = await readOutput('videos/index.html');
    assert.doesNotMatch(emptyIndex, /<iframe\b|<video\b/);
    assert.doesNotMatch(emptyIndex, /href="\/videos\/[^"/]+\.html"/);
    assert.doesNotMatch(emptyIndex, /https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\/(?:watch|embed|shorts)/);
    const unchangedFiles = ['artigos/index.html', 'alem-dos-dados/index.html', `artigos/${sharedSlug}.html`];
    const baseline = new Map(await Promise.all(unchangedFiles.map(async path => [path, await readOutput(path)])));

    await writeFile(join(fixture, 'content/videos/exemplo-com-texto.md'), video({
      title: 'Um exemplo & uma "ideia"',
      body: 'Texto {{ 7 * 7 }}.\n\n{% include "nao-existe.njk" %}\n\n## Um passo por vez\n\n```python\nprint("Olá")\n```\n\n<script>alert("video")</script>\n\n<img src=x onerror=alert(1)>\n',
    }));
    await writeFile(join(fixture, 'content/videos/exemplo-sem-texto.md'), video({
      slug: newerSlug,
      title: 'Um CSV na prática',
      date: '2026-12-12',
      url: `https://youtu.be/${newerId}`,
    }));
    result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const index = await readOutput('videos/index.html');
    const older = await readOutput(`videos/${sharedSlug}.html`);
    const newer = await readOutput(`videos/${newerSlug}.html`);
    const sitemap = await readOutput('sitemap.xml');
    assert.equal((index.match(/<iframe\b/g) || []).length, 2);
    for (const [slug, id, detail] of [[sharedSlug, olderId, older], [newerSlug, newerId, newer]]) {
      assertPlayer(index, id);
      assertPlayer(detail, id);
      assert.equal((detail.match(/<iframe\b/g) || []).length, 1);
      assert.ok(index.includes(`/videos/${slug}.html`));
      assert.ok(sitemap.includes(`<loc>https://caiomatos.com.br/videos/${slug}.html</loc>`));
      assert.doesNotMatch(detail, /<img src=x|<script>alert/);
      assert.match(detail, /<footer>[\s\S]*<a href="\/admin\/">Área do autor<\/a>[\s\S]*<\/footer>/);
    }
    assert.ok(index.indexOf(`/embed/${newerId}`) < index.indexOf(`/embed/${olderId}`), 'Vídeos mais recentes devem aparecer primeiro.');
    assert.doesNotMatch(index, /<img src=x|<script>alert/);
    assert.match(index, /Um exemplo &amp; uma &quot;ideia&quot;/);
    assert.match(older, /Um exemplo &amp; uma &quot;ideia&quot;/);
    assert.match(older, /Texto \{\{ 7 \* 7 \}\}/);
    assert.match(older, /\{% include (?:&quot;|")nao-existe\.njk(?:&quot;|") %\}/);
    assert.match(older, /<h2>Um passo por vez<\/h2>/);
    assert.match(older, /<code class="language-python">/);
    assert.match(older, /5 de dezembro de 2026/);
    assert.match(newer, /12 de dezembro de 2026/);
    assert.ok(sitemap.includes(`<loc>https://caiomatos.com.br/artigos/${sharedSlug}.html</loc>`));
    for (const [path, html] of baseline) {
      assert.equal(await readOutput(path), html, `${path} não deve mudar ao publicar vídeos.`);
    }

    // A duplicate hidden in a nested directory must fail before generating output.
    await mkdir(join(fixture, 'content/videos/nested'));
    await writeFile(join(fixture, 'content/videos/nested/duplicate.md'), video());
    result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Endereço de vídeo repetido/);
    await rm(join(fixture, 'content/videos/nested/duplicate.md'));

    // The URL must be validated as a YouTube address, never interpolated into an iframe.
    await writeFile(join(fixture, 'content/videos/url-invalida.md'), video({
      slug: 'url-invalida',
      date: '',
      url: `https://www.youtube.com.evil.example/watch?v=${olderId}`,
    }));
    result = build();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /youtube|YouTube|vídeo/i);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
