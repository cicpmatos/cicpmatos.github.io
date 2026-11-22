import MarkdownIt from 'markdown-it';
import { parse } from 'yaml';

export const categories = ['Python', 'PostgreSQL', 'Power BI', 'Engenharia de Dados', 'Pessoal'];
const fields = new Set(['title', 'description', 'slug', 'category', 'date', 'image', 'image_alt', 'repository', 'links']);
export const markdown = new MarkdownIt({ html: false, linkify: false });

export function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export function authOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!httpsUrl(value) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CMS_AUTH_ORIGIN deve ser uma origem HTTPS, sem caminho, credenciais ou parâmetros.');
  }
  return url.origin;
}

export function parsePost(source, filename = 'post.md') {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: cabeçalho YAML ausente.`);
  const data = parse(match[1], { schema: 'core', uniqueKeys: true, maxAliasCount: 0 });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: cabeçalho inválido.`);
  const fail = (message) => { throw new Error(`${filename}: ${message}`); };
  for (const key of Object.keys(data)) if (!fields.has(key)) fail(`campo não permitido: ${key}`);
  for (const key of ['title', 'description', 'slug', 'category']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) fail(`${key} é obrigatório.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || data.slug === 'index') fail('slug inválido ou reservado.');
  if (!categories.includes(data.category)) fail('categoria desconhecida.');
  if (data.date) {
    if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) fail('data inválida (use AAAA-MM-DD).');
  }
  if (data.repository && (!httpsUrl(data.repository) || new URL(data.repository).hostname !== 'github.com')) fail('repositório deve ser uma URL HTTPS do GitHub.');
  if (data.image) {
    if (typeof data.image !== 'string' || !/^\/assets\/[a-zA-Z0-9_./ ()-]+\.(png|jpe?g|webp|gif)$/i.test(data.image) || data.image.includes('..')) fail('imagem deve ser um arquivo local em /assets/.');
    if (typeof data.image_alt !== 'string' || !data.image_alt.trim()) fail('descreva a imagem no campo image_alt.');
  }
  if (data.links != null && (!Array.isArray(data.links) || data.links.some(link => !link || typeof link.label !== 'string' || !link.label.trim() || !httpsUrl(link.url)))) fail('links devem ter texto e URL HTTPS.');
  if (!match[2].trim()) fail('texto do post vazio.');
  return { data, body: match[2] };
}
