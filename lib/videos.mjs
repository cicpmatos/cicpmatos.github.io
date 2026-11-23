import { parse } from 'yaml';
import { categories } from './content.mjs';
import { youtubeVideoId } from '../admin/youtube-url.js';
export { youtubeVideoId } from '../admin/youtube-url.js';

const fields = new Set(['title', 'description', 'slug', 'category', 'date', 'youtube_url']);

export function parseVideo(source, filename = 'video.md') {
  const fail = (message) => { throw new Error(`${filename}: ${message}`); };
  if (typeof source !== 'string') fail('conteúdo inválido.');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
  if (!match) fail('cabeçalho YAML ausente.');
  let data;
  try { data = parse(match[1], { schema: 'core', uniqueKeys: true, maxAliasCount: 0 }); }
  catch { fail('cabeçalho YAML inválido.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('cabeçalho inválido.');
  for (const key of Object.keys(data)) if (!fields.has(key)) fail(`campo não permitido: ${key}`);
  for (const key of ['title', 'description', 'slug', 'category', 'youtube_url']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) fail(`${key} é obrigatório.`);
  }
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && (/[<>]/.test(value) || /\{(?:\{|%|#)/.test(value))) {
      fail('HTML e comandos de template não são permitidos no cabeçalho.');
    }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || data.slug === 'index') fail('slug inválido ou reservado.');
  if (!categories.includes(data.category)) fail('categoria desconhecida.');
  if (data.date != null && data.date !== '') {
    if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) {
      fail('data inválida (use AAAA-MM-DD).');
    }
  }
  try { youtubeVideoId(data.youtube_url); }
  catch { fail('youtube_url deve ser um link HTTPS válido de um vídeo do YouTube.'); }
  return { data, body: match[2] ?? '' };
}
