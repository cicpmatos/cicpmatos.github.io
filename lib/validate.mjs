import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parsePost } from './content.mjs';

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const paths = [];
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Link simbólico não permitido: ${file}`);
    if (entry.isDirectory()) paths.push(...await walk(file));
    else if (entry.isFile()) paths.push(file);
  }
  return paths;
}

export function validRaster(file, bytes) {
  switch (extname(file).toLowerCase()) {
    case '.png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case '.jpg': case '.jpeg': return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case '.gif': return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
    case '.webp': return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    default: return false;
  }
}

export async function validateSources() {
  const seen = new Set();
  for (const file of await walk('content/posts')) {
    if (!file.endsWith('.md')) continue;
    const { data } = parsePost(await readFile(file, 'utf8'), file);
    if (seen.has(data.slug)) throw new Error(`Endereço repetido: ${data.slug}`);
    seen.add(data.slug);
  }
  for (const file of await walk('assets/uploads')) {
    if (file.endsWith('/.gitkeep')) continue;
    const bytes = await readFile(file);
    if (bytes.length > 5 * 1024 * 1024 || !validRaster(file, bytes)) {
      throw new Error(`${file}: envie apenas PNG, JPEG, GIF ou WebP válidos de até 5 MB. HTML e SVG não são publicados.`);
    }
  }
}
