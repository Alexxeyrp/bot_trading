import { scan } from '../src/services/scanner.js';
try { console.info(JSON.stringify(await scan(), null, 2)); }
catch { console.error('No se pudo ejecutar el scan. Revisa configuración y servicios.'); process.exitCode = 1; }
