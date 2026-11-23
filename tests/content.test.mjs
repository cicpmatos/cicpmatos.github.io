import test from 'node:test';
import assert from 'node:assert/strict';
import { authOrigin, markdown, parsePost } from '../lib/content.mjs';
import { validRaster } from '../lib/validate.mjs';

const post = (extra = '', body = 'Um exemplo **testado**.') => `---\ntitle: Teste\ndescription: Um exemplo\nslug: primeiro-post\ncategory: Python\n${extra}---\n${body}`;
test('conteúdo válido, data opcional e Markdown literal', () => {
  assert.equal(parsePost(post()).data.slug, 'primeiro-post');
  assert.equal(parsePost(post('date: 2026-12-05\n')).data.date, '2026-12-05');
  assert.equal(parsePost(post('', '{{ segredo }}')).body, '{{ segredo }}');
});
test('não permite HTML ativo nem links javascript no texto', () => {
  const html = markdown.render('<script>alert(1)</script>\n\n[link](javascript:alert(1))\n\n![img](data:text/html;base64,AAAA)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('src="data:'));
});
test('bloqueia caminhos, sobreposição de templates e categorias desconhecidas', () => {
  assert.throws(() => parsePost(post().replace('primeiro-post', '../index')));
  assert.throws(() => parsePost(post().replace('primeiro-post', 'index')));
  assert.throws(() => parsePost(post('permalink: /index.html\n')));
  assert.throws(() => parsePost(post('layout: ../../secret\n')));
  assert.throws(() => parsePost(post().replace('category: Python', 'category: desconhecida')));
});
test('valida datas, links e texto alternativo de imagens', () => {
  assert.throws(() => parsePost(post('date: 2026-02-30\n')));
  assert.throws(() => parsePost(post('repository: javascript:alert(1)\n')));
  assert.throws(() => parsePost(post('links: [{label: Exemplo, url: "http://example.com"}]\n')));
  assert.throws(() => parsePost(post('image: /assets/uploads/capa.png\n')));
  assert.throws(() => parsePost(post('image: /assets/../segredo.png\nimage_alt: Exemplo\n')));
  assert.ok(parsePost(post('image: /assets/uploads/capa.png\nimage_alt: Um gráfico\n')));
});
test('origem de autenticação falha de modo fechado', () => {
  assert.equal(authOrigin(''), null);
  assert.equal(authOrigin('https://auth.example.com/'), 'https://auth.example.com');
  for (const url of ['http://auth.example.com', 'https://auth.example.com/callback', 'https://user:pass@auth.example.com', 'https://auth.example.com?x=y']) {
    assert.throws(() => authOrigin(url));
  }
});
test('arquivos ativos ou imagens renomeadas não podem ser publicados nos uploads', () => {
  const html = Buffer.from('<script>localStorage.getItem("decap-cms-user")</script>');
  assert.equal(validRaster('ataque.html', html), false);
  assert.equal(validRaster('capa.png', html), false);
  assert.equal(validRaster('vetor.svg', Buffer.from('<svg onload="alert(1)"/>')), false);
  assert.equal(validRaster('capa.png', Buffer.from([137,80,78,71,13,10,26,10])), true);
});
