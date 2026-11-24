import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import Eleventy from '@11ty/eleventy';
import { authOrigin } from '../lib/content.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const origin = authOrigin(process.env.CMS_AUTH_ORIGIN);
// Only generated output inside this repository is removed.
await rm(resolve(root, '_site'), { recursive: true, force: true });
const elev = new Eleventy();
await elev.write();
await mkdir('_site/admin', { recursive: true });
await writeFile('_site/.nojekyll', '');
await writeFile('_site/admin/runtime-config.json', JSON.stringify({ enabled: Boolean(origin), authOrigin: origin }) + '\n');
if (process.argv.includes('--serve')) {
  await elev.watch();
  await elev.serve(8080);
}
