// Servidor estático mínimo para ver ./dist en local (npm run ver).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, normalize } from 'node:path';
import { config, ROOT } from '../src/config.js';

const raiz = resolve(ROOT, config.salida);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/rss+xml; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png',
};

createServer(async (req, res) => {
  let ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (!ruta || ruta.endsWith('/') || ruta.endsWith('\\')) ruta += 'index.html';
  const archivo = resolve(raiz, ruta);
  if (!archivo.startsWith(raiz)) return res.writeHead(403).end();
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(config.puerto, () => console.log(`http://localhost:${config.puerto}`));
