import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry', 'link', 'media:thumbnail', 'media:content'].includes(name),
});

const txt = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return txt(v[0]);
  return v['#text'] != null ? String(v['#text']) : '';
};

export function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function pickLink(links, base) {
  if (!links) return '';
  for (const l of [].concat(links)) {
    if (typeof l === 'string') return l;
    if (l['@href'] && (!l['@rel'] || l['@rel'] === 'alternate')) return l['@href'];
    if (l['#text']) return l['#text'];
  }
  return base || '';
}

function toIso(d) {
  const t = Date.parse(txt(d));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Parsea RSS 2.0 / Atom / RDF. Devuelve null si no es un feed. */
export function parseFeed(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  const rss = doc.rss?.channel || doc['rdf:RDF'];
  const atom = doc.feed;
  if (!rss && !atom) return null;

  const rawItems = rss ? [].concat(rss.item || doc['rdf:RDF']?.item || []) : [].concat(atom.entry || []);
  const items = rawItems.map((it) => {
    const link = pickLink(it.link) || txt(it.guid);
    const thumb =
      it['media:group']?.['media:thumbnail']?.[0]?.['@url'] ||
      it['media:thumbnail']?.[0]?.['@url'] ||
      it['media:content']?.find?.((m) => (m['@medium'] || m['@type'] || '').includes('image'))?.['@url'] ||
      (it.enclosure?.['@type']?.startsWith('image') ? it.enclosure['@url'] : null) ||
      (String(it['content:encoded'] || it.description || '').match(/<img[^>]+src=["']([^"']+)/i) || [])[1] ||
      null;
    const body =
      it['media:group']?.['media:description'] ?? it['content:encoded'] ?? it.description ?? it.summary ?? it.content;
    return {
      guid: txt(it.guid) || txt(it.id) || link,
      title: stripHtml(txt(it.title)),
      text: stripHtml(txt(body)).slice(0, 1500),
      url: link,
      image: thumb,
      published: toIso(it.pubDate || it.published || it.updated || it['dc:date']),
    };
  });
  return { title: txt(rss?.title || atom?.title), items };
}
