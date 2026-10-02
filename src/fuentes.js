import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, ROOT } from './config.js';

export const REDES = {
  web: { nombre: 'Página oficial', emoji: '🌐' },
  youtube: { nombre: 'YouTube', emoji: '▶️' },
  x: { nombre: 'X', emoji: '𝕏' },
  facebook: { nombre: 'Facebook', emoji: '📘' },
  instagram: { nombre: 'Instagram', emoji: '📸' },
  tiktok: { nombre: 'TikTok', emoji: '🎵' },
  telegram: { nombre: 'Telegram', emoji: '✈️' },
  threads: { nombre: 'Threads', emoji: '🧵' },
};

const PERFIL = {
  x: (u) => `https://x.com/${u}`,
  facebook: (u) => `https://www.facebook.com/${u}`,
  instagram: (u) => `https://www.instagram.com/${u}`,
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
  telegram: (u) => `https://t.me/${u}`,
  threads: (u) => `https://www.threads.net/@${u}`,
  youtube: (y) => (y.channelId ? `https://www.youtube.com/channel/${y.channelId}` : `https://www.youtube.com/${y.ruta}`),
};

export const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const entidades = JSON.parse(readFileSync(resolve(ROOT, 'fuentes.json'), 'utf8'));
export const entidadPorId = new Map(entidades.map((e) => [e.id, e]));
export const categorias = [...new Set(entidades.map((e) => e.categoria))].map((nombre) => ({ id: slug(nombre), nombre }));
export const entidadesDeCategoria = (cat) => entidades.filter((e) => slug(e.categoria) === cat).map((e) => e.id);

/**
 * Convierte fuentes.json en la lista de feeds a consultar.
 * tipo: 'rss' (URL directa), 'telegram' (scraping de t.me/s), 'x-api' (API oficial de X).
 */
export function construirFeeds() {
  const feeds = [];
  const add = (ent, red, tipo, ident, url, puente = false) =>
    feeds.push({ clave: `${ent.id}:${red}:${ident}`.toLowerCase(), entidad: ent.id, red, tipo, ident, url, puente });

  for (const ent of entidades) {
    const c = ent.cuentas || {};
    for (const url of ent.rss || []) add(ent, 'web', 'rss', url, url);
    if (c.youtube?.channelId)
      add(ent, 'youtube', 'rss', c.youtube.channelId, `https://www.youtube.com/feeds/videos.xml?channel_id=${c.youtube.channelId}`);
    if (c.telegram) add(ent, 'telegram', 'telegram', c.telegram, `https://t.me/s/${c.telegram}`);

    for (const red of ['x', 'facebook', 'instagram', 'tiktok', 'threads']) {
      const usuario = c[red];
      if (!usuario) continue;
      if (red === 'x' && config.x.bearer) add(ent, red, 'x-api', usuario, PERFIL.x(usuario), true);
      else if (config.puentes[red])
        add(ent, red, 'rss', usuario, config.puentes[red].replaceAll('{usuario}', encodeURIComponent(usuario)), true);
    }
  }
  return feeds;
}

/** Lista pública de entidades con enlaces a sus perfiles y si cada red está monitoreada. */
export function fuentesPublicas(feeds, estadoFeeds) {
  const monitoreadas = new Map();
  for (const f of feeds) {
    const st = estadoFeeds[f.clave];
    const k = `${f.entidad}:${f.red}`;
    // Si una red tiene varios feeds (p. ej. dos RSS), basta con que uno funcione.
    if (monitoreadas.get(k)?.ok) continue;
    monitoreadas.set(k, { ok: !!st?.ultimoOk && !st?.errores, error: st?.errores ? st.error : null });
  }
  return entidades.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    categoria: e.categoria,
    categoriaId: slug(e.categoria),
    web: e.web,
    cuentas: Object.entries(e.cuentas || {})
      .filter(([, v]) => v && (typeof v === 'string' || v.channelId || v.ruta))
      .map(([red, v]) => ({
        red,
        usuario: typeof v === 'string' ? v : v.ruta,
        url: PERFIL[red]?.(v),
        monitoreada: monitoreadas.has(`${e.id}:${red}`),
        ...monitoreadas.get(`${e.id}:${red}`),
      })),
    webMonitoreada: monitoreadas.has(`${e.id}:web`),
    webError: monitoreadas.get(`${e.id}:web`)?.error || null,
  }));
}
