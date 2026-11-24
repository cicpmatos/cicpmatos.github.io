import { lstat, readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, relative, sep, posix } from 'node:path';
import { parsePost, markdown, authOrigin } from './content.mjs';
import { parseVideo } from './videos.mjs';
import { validRaster } from './validate.mjs';

// This is deliberately a file allowlist, never a directory passthrough. Adding
// a private note, backup or source map beside a public asset cannot publish it.
export const staticPublicFiles = Object.freeze([
  'index.html', 'style.css', 'site-v2.css', 'script.js', 'CNAME', 'robots.txt',
  'assets/Camiseta_Preta_AlgodaoEgipcio (Modelo Virtual) (2).JPEG',
  'assets/dashboard-financeiro.png', 'assets/dashboard-xadrez.png',
  'assets/dashboard-condominio.png', 'assets/topic-filters.js',
  'projetos/analise-financeira.html', 'projetos/analise-xadrez.html',
  'projetos/analise-condominio.html', 'tecnologias/index.html', 'publicacoes/index.html',
  'admin/index.html', 'admin/guia.html', 'admin/admin.css', 'admin/preview.css',
  'admin/app.js', 'admin/config.js', 'admin/login-feedback.js',
  'admin/video-widget.js', 'admin/youtube-url.js',
]);

const generatedPublicFiles = [
  '.nojekyll', 'admin/runtime-config.json', 'artigos/index.html',
  'alem-dos-dados/index.html', 'videos/index.html', 'sitemap.xml',
];
const vendorName = /^(?:decap-cms\.js(?:\.LICENSE\.txt)?|\d+\.decap-cms\.js|[a-f0-9]+\.wasm|cms\.css)$/;
const rasterName = /\.(?:png|jpe?g|gif|webp)$/i;
const forbiddenPart = /^(?:drafts?|rascunhos?|backups?|private|secrets?|auth|content|node_modules)$/i;
const siteOrigin = 'https://caiomatos.com.br';

function fail(path, reason) {
  // Do not print file contents, token values or private source text in CI logs.
  throw new Error(`Publicação bloqueada (${path}): ${reason}`);
}

async function safePath(root, path, { optional = false } = {}) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith(`..${sep}`) || rel === '..' || !rel) fail(path, 'caminho fora da raiz permitida.');
  let current = root;
  for (const component of rel.split(sep)) {
    current = resolve(current, component);
    let info;
    try { info = await lstat(current); }
    catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
    if (info.isSymbolicLink()) fail(path, 'link simbólico não permitido.');
  }
  return absolute;
}

async function filesIn(root, path, { optional = false, dependency = false } = {}) {
  // node_modules itself may be a package-manager/test-fixture symlink; it is a
  // trusted dependency boundary. Public input/output trees never get this exception.
  const directory = dependency ? resolve(root, path) : await safePath(root, path, { optional });
  if (!directory) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = posix.join(path, entry.name);
    if (entry.isSymbolicLink()) fail(child, 'link simbólico não permitido.');
    if (entry.isDirectory()) files.push(...await filesIn(root, child, { dependency }));
    else if (entry.isFile()) files.push(child);
    else fail(child, 'somente arquivos regulares podem ser publicados.');
  }
  return files;
}

function uploadPath(url, page) {
  let parsed;
  try { parsed = new URL(url.replaceAll('&amp;', '&'), `${siteOrigin}/${page}`); }
  catch { return null; }
  if (parsed.origin !== siteOrigin) return null;
  let path;
  try { path = decodeURIComponent(parsed.pathname).replace(/^\//, ''); }
  catch { fail(page, 'URL de imagem inválida.'); }
  return path.startsWith('assets/uploads/') ? path : null;
}

function referencedUploads(text, page) {
  const paths = new Set();
  for (const match of text.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']|\burl\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
    const path = uploadPath(match[1] || match[2], page);
    if (path) paths.add(path);
  }
  return paths;
}

function validateUploadName(path) {
  const parts = path.slice('assets/uploads/'.length).split('/');
  if (!rasterName.test(path) || parts.some(part => !/^[a-zA-Z0-9_][a-zA-Z0-9_. ()-]*$/.test(part) || forbiddenPart.test(part) || /\.(?:bak|backup|old|orig|tmp)\./i.test(part))) {
    fail(path, 'nome de upload não permitido; publique somente imagens finais.');
  }
}

/** Only approved content from the checked-out publication branch is considered.
 * Editorial draft branches and private working directories are never traversed.
 * A draft:true front matter is rejected by the existing content schemas rather
 * than silently treated as a published article.
 */
export async function publicationPlan(root = process.cwd()) {
  root = resolve(root);
  const copies = new Map();
  const expected = new Set(generatedPublicFiles);
  const uploads = new Set();
  for (const file of staticPublicFiles) {
    const absolute = await safePath(root, file);
    if (!(await lstat(absolute)).isFile()) fail(file, 'arquivo público esperado não encontrado.');
    copies.set(file, file);
    expected.add(file);
    if (/\.(?:html|css|js)$/.test(file)) {
      for (const path of referencedUploads(await readFile(absolute, 'utf8'), file)) uploads.add(path);
    }
  }
  for (const [directory, parser, prefix] of [
    ['content/posts', parsePost, 'artigos'], ['content/videos', parseVideo, 'videos'],
  ]) {
    for (const file of await filesIn(root, directory)) {
      if (!file.endsWith('.md')) continue;
      const { data, body } = parser(await readFile(resolve(root, file), 'utf8'), file);
      const page = `${prefix}/${data.slug}.html`;
      expected.add(page);
      if (data.image) {
        const path = uploadPath(data.image, page);
        if (path) uploads.add(path);
      }
      for (const path of referencedUploads(markdown.render(body), page)) uploads.add(path);
    }
  }
  // Also inspect unused uploads for symlinks. Unreferenced raster files and
  // .gitkeep stay private and are not copied to the generated website.
  await filesIn(root, 'assets/uploads', { optional: true });
  for (const file of uploads) {
    validateUploadName(file);
    const absolute = await safePath(root, file);
    const bytes = await readFile(absolute);
    if (bytes.length > 5 * 1024 * 1024 || !validRaster(file, bytes)) fail(file, 'imagem inválida ou maior que 5 MB.');
    copies.set(file, file);
    expected.add(file);
  }
  for (const file of await filesIn(root, 'node_modules/decap-cms/dist', { dependency: true })) {
    const name = posix.basename(file);
    if (!vendorName.test(name) || posix.dirname(file) !== 'node_modules/decap-cms/dist') continue;
    const output = `admin/vendor/${name}`;
    copies.set(file, output);
    expected.add(output);
  }
  if (!expected.has('admin/vendor/decap-cms.js')) fail('admin/vendor', 'dependência do painel ausente.');
  return { copies, expected, uploads };
}

export async function copyPublicFiles(root = process.cwd()) {
  root = resolve(root);
  const plan = await publicationPlan(root);
  await mkdir(resolve(root, '_site'), { recursive: true });
  for (const [source, destination] of plan.copies) {
    // Exact copyFile paths avoid glob interpretation of spaces/parentheses in
    // existing image names. No recursive directory copy is permitted.
    await safePath(root, posix.join('_site', posix.dirname(destination)), { optional: true });
    await mkdir(resolve(root, '_site', posix.dirname(destination)), { recursive: true });
    await safePath(root, posix.join('_site', posix.dirname(destination)));
    if (!source.startsWith('node_modules/')) await safePath(root, source);
    await safePath(root, posix.join('_site', destination), { optional: true });
    await copyFile(resolve(root, source), resolve(root, '_site', destination));
  }
  return plan;
}

export function containsCredential(text) {
  // Installation credentials are opaque. Stateless ghs_APPID_JWT tokens contain
  // underscores, base64url hyphens and dots, and are not limited to 40 characters.
  // Deliberately detect a conservative superset without decoding JWT contents.
  return /\bghs_[a-zA-Z0-9_.-]{30,}|\bgh[pour]_[a-zA-Z0-9]{30,}\b|\bgithub_pat_[a-zA-Z0-9_]{50,}\b|-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text) ||
    /\b(?:client[_-]?secret|access[_-]?token|refresh[_-]?token|api[_-]?token|api[_-]?key|secret[_-]?key)\b["']?\s*[:=]\s*["']?[a-zA-Z0-9_+\/=.-]{24,}/i.test(text);
}

/** A fail-closed boundary immediately before publishing _site. This catches
 * accidental exposure; it is not a replacement for a full secret/history audit.
 */
export async function validatePublicOutput(root = process.cwd(), plan) {
  root = resolve(root);
  plan ??= await publicationPlan(root);
  const output = await safePath(root, '_site');
  const files = (await filesIn(root, '_site')).map(file => file.slice('_site/'.length));
  const actual = new Set(files);
  const referenced = new Set();
  const sourceByOutput = new Map([...plan.copies].map(([source, destination]) => [destination, source]));
  for (const file of files) {
    if (!plan.expected.has(file)) fail(file, 'arquivo inesperado; fontes, rascunhos, backups e mapas de código não pertencem à saída pública.');
    const bytes = await readFile(resolve(output, file));
    if (bytes.length > 25 * 1024 * 1024) fail(file, 'arquivo excede o limite de publicação de 25 MB.');
    if (file.startsWith('admin/vendor/')) {
      const original = await readFile(resolve(root, sourceByOutput.get(file)));
      if (!bytes.equals(original)) fail(file, 'biblioteca do painel difere da dependência instalada.');
      continue;
    }
    if (containsCredential(bytes.toString('utf8'))) fail(file, 'possível credencial encontrada; remova-a antes de publicar.');
    if (rasterName.test(file) && !validRaster(file, bytes)) fail(file, 'imagem não corresponde ao formato permitido.');
    if (/\.(?:html|css|js)$/.test(file)) {
      for (const path of referencedUploads(bytes.toString('utf8'), file)) referenced.add(path);
    }
  }
  for (const file of plan.expected) if (!actual.has(file)) fail(file, 'arquivo público esperado está ausente.');
  for (const file of plan.uploads) if (!referenced.has(file)) fail(file, 'upload sem referência nas páginas publicadas.');
  for (const file of referenced) if (!actual.has(file)) fail(file, 'imagem referenciada não foi incluída na publicação.');
  if ((await readFile(resolve(output, '.nojekyll'), 'utf8')) !== '') fail('.nojekyll', 'arquivo deve estar vazio.');
  if ((await readFile(resolve(output, 'CNAME'), 'utf8')).trim() !== 'caiomatos.com.br') fail('CNAME', 'domínio público inesperado.');
  let runtime;
  try { runtime = JSON.parse(await readFile(resolve(output, 'admin/runtime-config.json'), 'utf8')); }
  catch { fail('admin/runtime-config.json', 'configuração pública inválida.'); }
  const runtimeFields = new Set(['enabled', 'authOrigin', 'authMode', 'repository']);
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime) || Object.keys(runtime).some(key => !runtimeFields.has(key)) || !Object.hasOwn(runtime, 'authOrigin') || typeof runtime.enabled !== 'boolean') {
    fail('admin/runtime-config.json', 'somente enabled, authOrigin, authMode e repository podem ser publicados.');
  }
  if (runtime.authOrigin !== null && (typeof runtime.authOrigin !== 'string' || authOrigin(runtime.authOrigin) !== runtime.authOrigin)) fail('admin/runtime-config.json', 'origem de login inválida.');
  if (runtime.enabled !== Boolean(runtime.authOrigin)) fail('admin/runtime-config.json', 'estado de login inconsistente.');
  if (Object.hasOwn(runtime, 'authMode') && !['oauth', 'github_app'].includes(runtime.authMode)) fail('admin/runtime-config.json', 'modo de login inválido.');
  if (Object.hasOwn(runtime, 'repository') && runtime.repository !== 'cicpmatos/cicpmatos.github.io') fail('admin/runtime-config.json', 'repositório do painel inesperado.');
  return { files: files.sort(), uploads: plan.uploads.size };
}
