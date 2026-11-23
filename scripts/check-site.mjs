import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';

const output = resolve('_site');
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}
const all = await files(output);
let checked = 0;
for (const file of all) {
  assert.ok(!/\.(md|ya?ml|toml|jsonc)$/.test(file), `Fonte interna exposta: ${file}`);
  assert.ok(!relative(output, file).startsWith('auth/'), 'Serviço de login incluído no site estático.');
  if (!file.endsWith('.html')) continue;
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|data:|#|\/\/)/.test(href)) continue;
    const target = decodeURIComponent(href.split(/[?#]/)[0]);
    if (!target) continue;
    let path = target.startsWith('/') ? resolve(output, `.${target}`) : resolve(dirname(file), target);
    assert.ok(path === output || path.startsWith(output + '/'), `Referência fora do site: ${href}`);
    try {
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      assert.ok((await stat(path)).isFile());
    } catch { throw new Error(`Link local quebrado em ${relative(output, file)}: ${href}`); }
    checked++;
  }
}
for (const file of ['analise-financeira.html', 'analise-xadrez.html', 'analise-condominio.html']) {
  assert.equal(await readFile(`_site/projetos/${file}`, 'utf8'), await readFile(`projetos/${file}`, 'utf8'), 'Dashboard existente foi alterado.');
}
const article = await readFile('_site/artigos/integracao-apis-xadrez.html', 'utf8');
assert.match(article, /RemoverNulos/);
assert.match(article, /Sigla País/);
assert.match(article, /api\.worldbank\.org/);
const sitemap = await readFile('_site/sitemap.xml', 'utf8');
for (const file of ['index.html', 'tecnologias/index.html', 'videos/index.html', 'publicacoes/index.html', 'artigos/index.html', 'alem-dos-dados/index.html', 'artigos/integracao-apis-xadrez.html']) {
  const html = await readFile(`_site/${file}`, 'utf8');
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1] || '';
  assert.equal([...footer.matchAll(/<a href="\/admin\/">Área do autor<\/a>/g)].length, 1, `Acesso do autor ausente ou duplicado: ${file}`);
}
assert.match(sitemap, /\/artigos\/integracao-apis-xadrez\.html/);
assert.ok(!sitemap.includes('/admin/'));
const runtime = JSON.parse(await readFile('_site/admin/runtime-config.json', 'utf8'));
assert.equal(runtime.enabled, Boolean(runtime.authOrigin));
console.log(`${all.filter(file => file.endsWith('.html')).length} páginas verificadas; ${checked} referências locais válidas; 3 dashboards preservados.`);
