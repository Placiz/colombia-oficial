import { parse } from 'node-html-parser';
import { fetchText, fetchJson } from './http.js';
import { parseFeed, stripHtml } from './feed.js';
import { config } from './config.js';

async function leerRss(feed) {
  const { text } = await fetchText(feed.url);
  const f = parseFeed(text);
  if (!f) throw new Error('La respuesta no es un feed RSS/Atom');
  return f.items;
}

// Vista previa pública de canales de Telegram: https://t.me/s/<canal>
async function leerTelegram(feed) {
  const { text } = await fetchText(feed.url);
  const doc = parse(text);
  return doc.querySelectorAll('.tgme_widget_message[data-post]').map((m) => {
    const post = m.getAttribute('data-post');
    const cuerpo = m.querySelector('.tgme_widget_message_text');
    const foto = m.querySelector('.tgme_widget_message_photo_wrap')?.getAttribute('style') || '';
    const texto = cuerpo ? stripHtml(cuerpo.innerHTML) : '';
    return {
      guid: post,
      title: texto.split('\n')[0].slice(0, 140),
      text: texto.slice(0, 1500),
      url: `https://t.me/${post}`,
      image: foto.match(/url\('([^']+)'\)/)?.[1] || null,
      published: m.querySelector('time[datetime]')?.getAttribute('datetime') || null,
    };
  });
}

// API oficial de X (requiere X_BEARER_TOKEN). X cobra por cada post devuelto,
// así que se guarda el id del usuario y el último post visto (since_id): cada
// post se paga una sola vez y una consulta sin novedades no devuelve nada.
// Además hay un tope mensual de posts leídos (X_LIMITE_MENSUAL).
async function leerXApi(feed, { feedEstado, global }) {
  const headers = { Authorization: `Bearer ${config.x.bearer}` };
  const mes = new Date().toISOString().slice(0, 7);
  const uso = (global.usoX ||= { mes, posts: 0 });
  if (uso.mes !== mes) Object.assign(uso, { mes, posts: 0 });
  if (uso.posts >= config.x.limiteMensual) throw new Error(`Tope mensual de X alcanzado (${uso.posts} posts)`);

  if (!feedEstado.xUsuarioId) {
    const r = await fetchJson(`https://api.x.com/2/users/by/username/${feed.ident}`, { headers });
    if (!r.data?.id) throw new Error(`Usuario de X no encontrado: ${feed.ident}`);
    feedEstado.xUsuarioId = r.data.id;
  }
  const params = new URLSearchParams({ exclude: 'replies,retweets', 'tweet.fields': 'created_at', max_results: '5' });
  if (feedEstado.xSinceId) {
    params.set('since_id', feedEstado.xSinceId);
    params.set('max_results', '20');
  }
  const r = await fetchJson(`https://api.x.com/2/users/${feedEstado.xUsuarioId}/tweets?${params}`, { headers });
  uso.posts += r.meta?.result_count || 0;
  if (r.meta?.newest_id) feedEstado.xSinceId = r.meta.newest_id;
  return (r.data || []).map((t) => ({
    guid: t.id,
    title: t.text.split('\n')[0].slice(0, 140),
    text: t.text,
    url: `https://x.com/${feed.ident}/status/${t.id}`,
    image: null,
    published: t.created_at,
  }));
}

const LECTORES = { rss: leerRss, telegram: leerTelegram, 'x-api': leerXApi };

/** ctx: { feedEstado, global } para lectores que necesitan recordar algo entre pasadas. */
export async function leerFeed(feed, ctx) {
  const items = await LECTORES[feed.tipo](feed, ctx);
  return items.filter((i) => i.guid);
}
