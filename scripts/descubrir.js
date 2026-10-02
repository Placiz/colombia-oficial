// Visita la web oficial de cada entidad (entidades.json), extrae sus cuentas
// oficiales de redes sociales y sus feeds RSS, y escribe/actualiza fuentes.json.
//   node scripts/descubrir.js            -> completa solo campos vacíos
//   node scripts/descubrir.js --forzar   -> sobrescribe lo descubierto
//   node scripts/descubrir.js minsalud   -> solo esa entidad
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fetchText, pool } from '../src/http.js';
import { parseFeed } from '../src/feed.js';
import https from 'node:https';

function fetchInseguro(url, saltos = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && saltos > 0) {
        res.resume();
        return resolve(fetchInseguro(new URL(res.headers.location, url).href, saltos - 1));
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ text: body, url }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const ROOT = new URL('..', import.meta.url);
const entidades = JSON.parse(readFileSync(new URL('entidades.json', ROOT), 'utf8'));
const fuentesPath = new URL('fuentes.json', ROOT);
const previas = existsSync(fuentesPath) ? JSON.parse(readFileSync(fuentesPath, 'utf8')) : [];
const forzar = process.argv.includes('--forzar');
const solo = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const IGNORAR = /^(share|sharer|sharer\.php|intent|home|hashtag|search|i|dialog|plugins|tr|watch|embed|p|reel|reels|explore|login|signup|privacy|legal|policies|help|about|results|feed|playlist|shorts|joinchat|addstickers|iframe_api|pages|people|groups|events|profile\.php|v\d+\.\d+|\d{1,6})$/i;

const PATRONES = {
  x: /https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})(?=[/?#"'\s]|$)/gi,
  facebook: /https?:\/\/(?:www\.|m\.|es-la\.|web\.)?(?:facebook|fb)\.com\/(?:pg\/)?([A-Za-z0-9.\-]{2,})(?=[/?#"'\s]|$)/gi,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})(?=[/?#"'\s]|$)/gi,
  youtube: /https?:\/\/(?:www\.|m\.)?youtube\.com\/((?:channel\/UC[\w-]{22})|(?:@[\w.\-]+)|(?:user\/[\w.\-]+)|(?:c\/[\w.\-%]+))/gi,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@([\w.]{2,24})/gi,
  telegram: /https?:\/\/(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{5,32})(?=[/?#"'\s]|$)/gi,
  threads: /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([\w.]{2,30})/gi,
};

function masFrecuente(html, re) {
  const cuenta = new Map();
  for (const m of html.matchAll(re)) {
    const v = m[1];
    if (IGNORAR.test(v.split('/').pop())) continue;
    const k = v.toLowerCase();
    const e = cuenta.get(k) || { v, n: 0 };
    e.n++;
    cuenta.set(k, e);
  }
  // Map conserva el orden de aparición: ante empate gana la primera.
  let best = null;
  for (const e of cuenta.values()) if (!best || e.n > best.n) best = e;
  return best?.v || null;
}

async function resolverYoutube(ruta) {
  if (ruta.startsWith('channel/')) return ruta.slice(8);
  try {
    const { text } = await fetchText(`https://www.youtube.com/${ruta}`, { headers: { Cookie: 'CONSENT=YES+1' } });
    return (
      text.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ||
      text.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}

async function feedValido(url) {
  try {
    const { text } = await fetchText(url, { timeout: 15000 });
    const f = parseFeed(text);
    return f && f.items.length > 0 ? f : null;
  } catch {
    return null;
  }
}

async function descubrirRss(html, base) {
  const candidatos = new Set();
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    const tag = m[0];
    if (/type=["']application\/(rss|atom)\+xml["']/i.test(tag)) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) candidatos.add(new URL(href, base).href);
    }
  }
  for (const m of html.matchAll(/href=["']([^"']*(?:\/rss|rss\.xml|\/feed\/?|\.rss|atom\.xml)[^"']*)["']/gi)) {
    try {
      candidatos.add(new URL(m[1], base).href);
    } catch {}
  }
  for (const p of ['/feed/', '/rss.xml', '/feed']) candidatos.add(new URL(p, base).href);

  const validos = [];
  const vistos = new Set();
  for (const url of [...candidatos].slice(0, 8)) {
    const clave = url.replace(/\/+$/, '');
    if (/comments\/feed/.test(url) || vistos.has(clave)) continue;
    vistos.add(clave);
    const f = await feedValido(url);
    if (f) validos.push(url);
    if (validos.length >= 2) break;
  }
  return validos;
}

async function descubrir(ent) {
  const res = { cuentas: {}, rss: [], error: null };
  let html, base;
  try {
    ({ text: html, url: base } = await fetchText(ent.web, { timeout: 25000 }));
  } catch (e) {
    const code = e.cause?.code || '';
    // Muchos sitios .gov.co publican la cadena TLS incompleta. Solo para leer
    // los enlaces de la portada reintentamos sin validar el certificado.
    if (!/CERT|SIGNATURE|SELF_SIGNED/.test(code)) {
      res.error = code || e.message;
      return res;
    }
    try {
      ({ text: html, url: base } = await fetchInseguro(ent.web));
      res.aviso = `TLS inválido (${code})`;
    } catch (e2) {
      res.error = e2.code || e2.message;
      return res;
    }
  }
  for (const [red, re] of Object.entries(PATRONES)) {
    const v = masFrecuente(html, re);
    if (v) res.cuentas[red] = v;
  }
  if (res.cuentas.youtube) {
    const id = await resolverYoutube(res.cuentas.youtube);
    res.cuentas.youtube = { ruta: res.cuentas.youtube, channelId: id };
  }
  res.rss = await descubrirRss(html, base);
  return res;
}

const objetivo = solo.length ? entidades.filter((e) => solo.includes(e.id)) : entidades;
console.log(`Descubriendo ${objetivo.length} entidades...\n`);

const resultados = await pool(objetivo, 6, async (ent) => {
  const r = await descubrir(ent);
  const redes = Object.keys(r.cuentas).join(', ') || '—';
  console.log(`${r.error ? '✗' : '✓'} ${ent.id.padEnd(20)} ${r.error ? 'ERROR ' + r.error : `redes: ${redes} | rss: ${r.rss.length}${r.aviso ? ' | ' + r.aviso : ''}`}`);
  return [ent, r];
});

const porId = new Map(previas.map((f) => [f.id, f]));
for (const [ent, r] of resultados) {
  const prev = porId.get(ent.id) || { ...ent, cuentas: {}, rss: [] };
  const fuente = { ...prev, nombre: ent.nombre, categoria: ent.categoria, web: ent.web };
  fuente.cuentas = { ...(prev.cuentas || {}) };
  for (const [red, v] of Object.entries(r.cuentas)) {
    if (forzar || !fuente.cuentas[red]) fuente.cuentas[red] = v;
  }
  if (forzar || !fuente.rss?.length) fuente.rss = r.rss;
  porId.set(ent.id, fuente);
}
const salida = entidades.map((e) => porId.get(e.id) || { ...e, cuentas: {}, rss: [] });
writeFileSync(fuentesPath, JSON.stringify(salida, null, 2) + '\n');
console.log(`\nGuardado fuentes.json (${salida.length} entidades).`);
