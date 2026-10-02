import { config } from './config.js';
import { REDES, entidadPorId, slug } from './fuentes.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function llamar(metodo, params = {}) {
  for (let intento = 0; intento < 5; intento++) {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await res.json();
    if (j.ok) return j.result;
    if (j.error_code === 429) {
      await espera(((j.parameters?.retry_after ?? 5) + 1) * 1000);
      continue;
    }
    throw new Error(`Telegram ${metodo}: ${j.description}`);
  }
  throw new Error(`Telegram ${metodo}: demasiados reintentos`);
}

export function formatear(p) {
  const ent = entidadPorId.get(p.entidad);
  const red = REDES[p.red] || { nombre: p.red };
  const cuerpo = (p.texto && p.texto !== p.titulo ? p.texto : '').slice(0, 400);
  const x = ent?.cuentas?.x;
  const bloques = [
    [`<b>${esc(ent?.nombre || p.entidad)}</b> | ${esc(red.nombre)}`],
    [p.titulo && `<b>${esc(p.titulo)}</b>`, cuerpo && esc(cuerpo) + (p.texto.length > 400 ? '…' : '')],
    [
      p.url && `<a href="${esc(p.url)}">Ver publicación</a>`,
      // X no se puede leer gratis: se enlaza la cuenta oficial como contexto.
      x && p.red !== 'x' && `También en X: <a href="https://x.com/${esc(x)}">@${esc(x)}</a>`,
    ],
    [
      [ent?.id || p.entidad, slug(ent?.categoria || ''), slug(red.nombre)]
        .map((t) => '#' + t.replace(/-/g, '').replace(/[^a-z0-9_]/gi, ''))
        .join(' '),
    ],
  ];
  return bloques.map((b) => b.filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}

export const telegramActivo = () => Boolean(config.telegram.token && config.telegram.canal);

/**
 * Envía al canal las publicaciones pendientes, respetando el límite de
 * Telegram (~20 mensajes por minuto por canal). Lo que no alcance a salir
 * en esta ejecución queda pendiente para la siguiente.
 */
export async function enviarPendientes(pendientes, { maximo = 40 } = {}) {
  let enviados = 0;
  for (const p of pendientes.slice(0, maximo)) {
    try {
      await llamar('sendMessage', {
        chat_id: config.telegram.canal,
        text: formatear(p),
        parse_mode: 'HTML',
        link_preview_options: p.url ? { url: p.url, prefer_large_media: true } : { is_disabled: true },
      });
      p.notificado = true;
      enviados++;
    } catch (e) {
      console.error(`[telegram] ${e.message}`);
      // Un error de formato o de enlace no debe bloquear la cola para siempre.
      if (!/Too Many|retries|reintentos|fetch failed|timeout/i.test(e.message)) p.notificado = true;
    }
    await espera(3100);
  }
  return enviados;
}
