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

// API oficial de X (requiere X_BEARER_TOKEN; es de pago).
const idsX = new Map();
async function leerXApi(feed) {
  const headers = { Authorization: `Bearer ${config.x.bearer}` };
  let id = idsX.get(feed.ident);
  if (!id) {
    const r = await fetchJson(`https://api.x.com/2/users/by/username/${feed.ident}`, { headers });
    id = r.data?.id;
    if (!id) throw new Error(`Usuario de X no encontrado: ${feed.ident}`);
    idsX.set(feed.ident, id);
  }
  const r = await fetchJson(
    `https://api.x.com/2/users/${id}/tweets?max_results=5&exclude=replies,retweets&tweet.fields=created_at`,
    { headers }
  );
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

export async function leerFeed(feed) {
  const items = await LECTORES[feed.tipo](feed);
  return items.filter((i) => i.guid);
}
