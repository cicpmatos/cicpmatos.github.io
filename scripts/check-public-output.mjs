import { resolve } from 'node:path';
import { validatePublicOutput } from '../lib/public-output.mjs';

const root = resolve(import.meta.dirname, '..');
const result = await validatePublicOutput(root);
console.log(`Saída pública aprovada: ${result.files.length} arquivos; ${result.uploads} imagens de conteúdo referenciadas.`);
