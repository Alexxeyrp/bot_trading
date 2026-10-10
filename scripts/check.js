import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? walk(`${folder}/${entry.name}`) : entry.name.endsWith('.js') ? [`${folder}/${entry.name}`] : []);
}
let failures = 0;
for (const path of ['src', 'api', 'scripts', 'tests'].flatMap(walk)) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  if (result.status !== 0) failures++;
  const require = createRequire(resolve(path));
  for (const match of readFileSync(path, 'utf8').matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
    try { require.resolve(match[1]); }
    catch { console.error(`Import no resuelto: ${path} → ${match[1]}`); failures++; }
  }
}
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
if (manifest.type !== 'module' || manifest.engines.node !== '22.x' || vercel.crons[0].path !== '/api/scan'
  || vercel.crons[0].schedule !== '0 8 * * *' || vercel.framework !== null
  || vercel.buildCommand !== '' || vercel.installCommand !== 'npm ci' || vercel.fluid !== true
  || vercel.outputDirectory !== 'public') failures++;
console.info(failures ? `Comprobación fallida: ${failures}` : 'Sintaxis, imports, ES Modules y configuración Vercel correctos.');
process.exitCode = failures ? 1 : 0;
