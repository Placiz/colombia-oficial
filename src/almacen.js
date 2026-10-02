// Estado persistente en archivos JSON. En GitHub Actions viven en la rama
// `datos`; en local, en la carpeta ./datos.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { config, ROOT } from './config.js';

const dir = resolve(ROOT, config.datos);
const ruta = (f) => resolve(dir, f);
const leer = (f, def) => (existsSync(ruta(f)) ? JSON.parse(readFileSync(ruta(f), 'utf8')) : def);

export const MAX_PUBLICACIONES = 1500;
const MAX_GUIDS_POR_FEED = 300;

export const idDe = (feed, guid) => createHash('sha1').update(`${feed}\n${guid}`).digest('base64url').slice(0, 12);

export function cargar() {
  const estado = leer('estado.json', { feeds: {} });
  const publicaciones = leer('publicaciones.json', []);
  const ids = new Set(publicaciones.map((p) => p.id));

  return {
    estado,
    publicaciones,
    feed: (clave) => estado.feeds[clave],

    /** Registra los guids vistos en un feed y devuelve los que son nuevos. */
    registrarVistos(clave, guids) {
      const f = (estado.feeds[clave] ||= { guids: [] });
      const previos = new Set(f.guids);
      const nuevos = guids.filter((g) => !previos.has(g));
      f.guids = [...new Set([...guids, ...f.guids])].slice(0, MAX_GUIDS_POR_FEED);
      return new Set(nuevos);
    },

    agregar(p) {
      if (ids.has(p.id)) return false;
      ids.add(p.id);
      publicaciones.push(p);
      return true;
    },

    feedOk(clave) {
      const f = (estado.feeds[clave] ||= { guids: [] });
      f.ultimoOk = new Date().toISOString();
      f.errores = 0;
      delete f.error;
    },

    feedError(clave, err) {
      const f = (estado.feeds[clave] ||= { guids: [] });
      f.ultimoError = new Date().toISOString();
      f.error = String(err).slice(0, 200);
      f.errores = (f.errores || 0) + 1;
    },

    pendientes: () => publicaciones.filter((p) => !p.notificado).sort((a, b) => a.detectado.localeCompare(b.detectado)),

    guardar() {
      publicaciones.sort((a, b) => b.fecha.localeCompare(a.fecha));
      // Nunca se descartan publicaciones pendientes de enviar.
      const conservar = publicaciones.filter((p, i) => i < MAX_PUBLICACIONES || !p.notificado);
      publicaciones.length = 0;
      publicaciones.push(...conservar);
      estado.actualizado = new Date().toISOString();
      mkdirSync(dir, { recursive: true });
      writeFileSync(ruta('estado.json'), JSON.stringify(estado));
      writeFileSync(ruta('publicaciones.json'), JSON.stringify(publicaciones));
    },
  };
}
