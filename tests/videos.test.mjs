import test from 'node:test';
import assert from 'node:assert/strict';
import { categories, markdown } from '../lib/content.mjs';
import { parseVideo, youtubeVideoId } from '../lib/videos.mjs';
import { registerVideoWidget } from '../admin/video-widget.js';
import { createCmsConfig } from '../admin/config.js';

const id = 'Abc_123-xYz';
const video = (extra = '', body = '') => `---\ntitle: Meu primeiro vídeo\ndescription: Um exemplo prático\nslug: primeiro-video\ncategory: Python\nyoutube_url: https://www.youtube.com/watch?v=${id}\n${extra}---\n${body}`;

test('editor valida o link com a mesma função do build antes de salvar', () => {
  let control;
  registerVideoWidget({registerWidget(name, value) { assert.equal(name, 'youtube-url'); control = value; }}, value => value, () => null);
  const config = createCmsConfig('https://auth.example.com');
  const collection = config.collections.find(item => item.name === 'videos');
  assert.equal(collection.folder, 'content/videos');
  assert.equal(collection.fields.find(field => field.name === 'youtube_url').widget, 'youtube-url');
  assert.equal(collection.fields.find(field => field.name === 'body').required, false);
  assert.equal(control.isValid.call({props:{value:`https://youtu.be/${id}`}}), true);
  for (const value of ['', 'https://youtu.be/curto', 'https://youtube.com/watch?foo=bar', `https://youtube.com/watch?v=${id}&v=${id}`, `https://evil.example/watch?v=${id}`]) {
    assert.ok(control.isValid.call({props:{value}}).error.message);
    assert.throws(() => youtubeVideoId(value));
  }
});

test('extrai somente o identificador das URLs reconhecidas do YouTube', () => {
  const urls = [
    `https://youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?v=${id}&t=42s&si=compartilhamento`,
    `https://m.youtube.com/watch?feature=shared&v=${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}?si=compartilhamento`,
    `https://m.youtube.com/embed/${id}/`,
    `https://youtu.be/${id}?t=42&si=compartilhamento`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com:443/watch?v=${id}`,
    ` https://youtu.be/${id} `,
  ];
  for (const url of urls) assert.equal(youtubeVideoId(url), id, url);
});

test('rejeita hosts enganosos, esquemas inseguros, credenciais e portas alternativas', () => {
  const urls = [
    `http://youtube.com/watch?v=${id}`,
    `javascript:alert('${id}')`,
    `//youtube.com/watch?v=${id}`,
    `https://youtube.com.evil.example/watch?v=${id}`,
    `https://evil-youtube.com/watch?v=${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`,
    `https://user:secret@youtube.com/watch?v=${id}`,
    `https://user@youtube.com/watch?v=${id}`,
    `https://youtube.com:8443/watch?v=${id}`,
    `https://youtu.be:80/${id}`,
    `https://www.youtu.be/${id}`,
    `https://youtube.com./watch?v=${id}`,
    `https://www.youtube.com\\watch?v=${id}`,
    `https://www.you\ntube.com/watch?v=${id}`,
  ];
  for (const url of urls) assert.throws(() => youtubeVideoId(url), /link HTTPS/, url);
});

test('rejeita IDs malformados, rotas não reconhecidas e parâmetros v duplicados', () => {
  const urls = [
    '', null, {}, id,
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=',
    'https://youtu.be/curto',
    `https://youtu.be/${id}extra`,
    `https://youtu.be/${id}/outro`,
    `https://youtube.com/watch?v=${id}&v=${id}`,
    `https://youtube.com/watch?v=${id}&%76=${id}`,
    `https://youtube.com/shorts/${id}?v=${id}&v=${id}`,
    'https://www.youtube.com/watch?v=Abc%3C123-xYz',
    'https://www.youtube.com/watch?v=Abc%20123-xYz',
    `https://www.youtube.com/playlist?list=${id}`,
    `https://www.youtube.com/channel/${id}`,
    `https://www.youtube.com/embed/${id}%2f`,
    `https://www.youtube-nocookie.com/watch?v=${id}`,
  ];
  for (const url of urls) assert.throws(() => youtubeVideoId(url), /Vídeo inválido/);
});

test('vídeo tem metadados obrigatórios e corpo Markdown opcional', () => {
  const result = parseVideo(video());
  assert.equal(result.data.title, 'Meu primeiro vídeo');
  assert.equal(result.data.youtube_url, `https://www.youtube.com/watch?v=${id}`);
  assert.equal(result.body, '');
  assert.equal(parseVideo(video().trimEnd()).body, '');
  assert.equal(parseVideo(video('', 'Um exemplo **testado**.')).body, 'Um exemplo **testado**.');
  for (const field of ['title', 'description', 'slug', 'category', 'youtube_url']) {
    const source = video().replace(new RegExp(`^${field}:.*\\n`, 'm'), '');
    assert.throws(() => parseVideo(source, 'teste.md'), new RegExp(`teste.md: ${field} é obrigatório`));
  }
  for (const category of categories) {
    assert.equal(parseVideo(video().replace('category: Python', `category: ${category}`)).data.category, category);
  }
});

test('bloqueia metadados que alterem templates, caminhos ou execução de HTML', () => {
  for (const key of ['layout', 'template', 'permalink', 'tags', 'eleventyComputed', '__proto__']) {
    assert.throws(() => parseVideo(video(`${key}: exemplo\n`)), /campo não permitido/);
  }
  for (const value of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '{{ segredo }}', '{% include "secret" %}', '{# comentário #}']) {
    assert.throws(() => parseVideo(video().replace('title: Meu primeiro vídeo', `title: '${value}'`)), /HTML e comandos de template/);
  }
  for (const slug of ['../index', 'index', 'nome com espaço', 'Maiuscula', 'video.html', 'teste--duplo']) {
    assert.throws(() => parseVideo(video().replace('slug: primeiro-video', `slug: ${slug}`)), /slug inválido/);
  }
  assert.throws(() => parseVideo(video().replace('category: Python', 'category: Desconhecida')), /categoria desconhecida/);
  assert.throws(() => parseVideo(video().replace(`https://www.youtube.com/watch?v=${id}`, 'https://evil.example/video')), /youtube_url/);
});

test('valida datas reais no mesmo formato dos artigos', () => {
  for (const date of ['2026-12-05', '2028-02-29']) {
    assert.equal(parseVideo(video(`date: ${date}\n`)).data.date, date);
  }
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '05/12/2026', '2026-12-05T12:00:00Z', 'false', '123']) {
    assert.throws(() => parseVideo(video(`date: ${date}\n`)), /data inválida/);
  }
  assert.equal(parseVideo(video('date: ""\n')).data.date, '');
  assert.equal(parseVideo(video('date: null\n')).data.date, null);
});

test('rejeita YAML inválido, duplicação de campos e estruturas inesperadas', () => {
  for (const source of ['sem cabeçalho', null, '---\n- item\n---\n', '---\nnull\n---\n', video('title: Duplicado\n'), video('description: [quebrado\n')]) {
    assert.throws(() => parseVideo(source, 'exemplo.md'), /exemplo.md:/);
  }
  assert.throws(() => parseVideo(video().replace('title: Meu primeiro vídeo', 'title: [lista]')), /title é obrigatório/);
  assert.throws(() => parseVideo(video().replace('description: Um exemplo prático', 'description: "  "')), /description é obrigatório/);
});

test('corpo permanece literal e renderer existente não executa HTML', () => {
  const body = '{{ segredo }}\n\n<script>alert(1)</script>\n\n[link](javascript:alert(1))';
  const result = parseVideo(video('', body));
  assert.equal(result.body, body);
  const html = markdown.render(result.body);
  assert.ok(html.includes('{{ segredo }}'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
});
