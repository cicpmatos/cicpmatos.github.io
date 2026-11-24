import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import Eleventy from '@11ty/eleventy';
import { authOrigin } from '../lib/content.mjs';
import { validatePublicOutput } from '../lib/public-output.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const origin = authOrigin(process.env.CMS_AUTH_ORIGIN);
const authMode = process.env.CMS_AUTH_MODE || 'oauth';
if (!['oauth', 'github_app'].includes(authMode)) throw new Error('Modo de login inválido.');
const repository = process.env.CMS_REPOSITORY || 'cicpmatos/cicpmatos.github.io';
if (repository !== 'cicpmatos/cicpmatos.github.io') throw new Error('Repositório editorial não autorizado.');
// Only generated output inside this repository is removed.
await rm(resolve(root, '_site'), { recursive: true, force: true });
const elev = new Eleventy();
await elev.write();
await mkdir('_site/admin', { recursive: true });
await writeFile('_site/.nojekyll', '');
await writeFile('_site/admin/runtime-config.json', JSON.stringify({
  enabled: Boolean(origin), authOrigin: origin,
  ...(authMode === 'github_app' ? { authMode, repository } : {}),
}) + '\n');
const publication = await validatePublicOutput(root);
console.log(`Saída pública aprovada: ${publication.files.length} arquivos; ${publication.uploads} imagens referenciadas.`);
if (process.argv.includes('--serve')) {
  await elev.watch();
  await elev.serve(8080);
}
