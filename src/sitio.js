// Genera la web estática (./dist) a partir de public/ y del almacén.
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, ROOT } from './config.js';
import { REDES, categorias, entidadPorId, fuentesPublicas } from './fuentes.js';

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const publica = ({ notificado, ...p }) => p;

function rss(publicaciones, base) {
  const items = publicaciones
    .slice(0, 100)
    .map((p) => {
      const ent = entidadPorId.get(p.entidad);
      return (
        `<item><title>${esc(`${ent?.nombre || p.entidad}: ${p.titulo || p.texto.slice(0, 100)}`)}</title>` +
        `<link>${esc(p.url)}</link><guid isPermaLink="false">${p.id}</guid>` +
        `<pubDate>${new Date(p.fecha).toUTCString()}</pubDate><category>${esc(ent?.categoria || '')}</category>` +
        `<description>${esc(p.texto)}</description></item>`
      );
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Colombia Oficial</title>` +
    `<link>${esc(base)}</link><description>Publicaciones de las entidades del Estado colombiano</description>` +
    `${items}</channel></rss>`
  );
}

export function construirSitio(feeds, almacen) {
  const out = resolve(ROOT, config.salida);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(resolve(out, 'data'), { recursive: true });

  cpSync(resolve(ROOT, 'public'), out, { recursive: true });
  const iconos = resolve(ROOT, 'node_modules/@phosphor-icons/web/src/regular');
  mkdirSync(resolve(out, 'iconos'), { recursive: true });
  for (const f of ['style.css', 'Phosphor.woff2', 'Phosphor.woff']) cpSync(resolve(iconos, f), resolve(out, 'iconos', f));

  const pubs = almacen.publicaciones.map(publica);
  const hace24h = Date.now() - 86400_000;
  const meta = {
    generado: new Date().toISOString(),
    redes: REDES,
    categorias,
    entidades: fuentesPublicas(feeds, almacen.estado.feeds),
    stats: {
      total: pubs.length,
      ultimas24h: pubs.filter((p) => Date.parse(p.fecha) >= hace24h).length,
      feeds: feeds.length,
      feedsOk: feeds.filter((f) => almacen.estado.feeds[f.clave]?.ultimoOk && !almacen.estado.feeds[f.clave]?.errores).length,
    },
    telegram: process.env.TELEGRAM_CANAL_PUBLICO || (config.telegram.canal.startsWith('@') ? config.telegram.canal : null),
    repo: process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : null,
  };
  writeFileSync(resolve(out, 'data/publicaciones.json'), JSON.stringify(pubs));
  writeFileSync(resolve(out, 'data/meta.json'), JSON.stringify(meta));
  writeFileSync(resolve(out, 'feed.xml'), rss(pubs, process.env.URL_PUBLICA || ''));
  // Pages no debe procesar el sitio con Jekyll.
  writeFileSync(resolve(out, '.nojekyll'), '');
  const kb = Math.round(Buffer.byteLength(readFileSync(resolve(out, 'data/publicaciones.json'))) / 1024);
  console.log(`[sitio] ${pubs.length} publicaciones (${kb} KB) en ${config.salida}/`);
}
