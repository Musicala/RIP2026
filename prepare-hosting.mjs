import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, '.firebase-hosting');
const expectedOutput = `${resolve(root)}${sep}.firebase-hosting`;

if (output !== expectedOutput) {
  throw new Error('Ruta de Hosting generada fuera del repositorio.');
}

const runtimeFiles = [
  'index.html',
  'admin-import.html',
  'registrar-clases.html',
  'registrar-pagos.html',
  'styles.css',
  'app.js',
  'firebase.auth.js',
  'firebase.config.js',
  'membrete_assets.js',
  'membrete_img_0.png',
  'membrete_img_1.png',
  'registrar-clases.js',
  'registrar-pagos.js',
  'rip.calculations.js',
  'rip.core.js',
  'rip.identity.js',
  'rip.importer.js',
  'rip.programacion.js',
  'rip.repository.js',
  'rip.sync.js',
  'ui.dashboard.js',
  'ui.editor.js',
  'ui.ficha.js',
  'ui.shared.js',
  'ui.table.js'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of runtimeFiles) {
  const source = resolve(root, file);
  const destination = resolve(output, file);
  if (!source.startsWith(`${resolve(root)}${sep}`) || !destination.startsWith(`${output}${sep}`)) {
    throw new Error(`Ruta runtime inválida: ${file}`);
  }
  const info = await stat(source);
  if (!info.isFile()) throw new Error(`Runtime no es archivo: ${file}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`Hosting preparado: ${runtimeFiles.length} archivos runtime.`);
console.log(`Directorio: ${relative(root, output)}`);
