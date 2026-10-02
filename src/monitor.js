import { config } from './config.js';
import { pool } from './http.js';
import { leerFeed } from './lectores.js';
import { idDe } from './almacen.js';

/** Consulta todos los feeds una vez y guarda lo nuevo en el almacén. */
export async function ciclo(feeds, almacen) {
  const t0 = Date.now();
  const limite = Date.now() - config.maxAntiguedadH * 3600_000;

  const res = await pool(feeds, config.concurrencia, async (feed) => {
    let items;
    // Se calcula antes de leer: el lector puede crear la entrada del feed.
    const primeraVez = !almacen.feed(feed.clave)?.ultimoOk;
    try {
      items = await leerFeed(feed, { feedEstado: almacen.estadoDe(feed.clave), global: almacen.estado });
    } catch (e) {
      almacen.feedError(feed.clave, e.cause?.code || e.message);
      return { ok: false };
    }
    // La primera lectura de un feed solo "siembra": se guarda el historial
    // sin notificarlo, y desde ahí únicamente se avisa lo nuevo.
    const nuevos = almacen.registrarVistos(feed.clave, items.map((i) => i.guid));
    const ahora = new Date().toISOString();
    let notificables = 0;
    let sembradas = 0;

    for (const it of items) {
      if (!nuevos.has(it.guid)) continue;
      const viejo = it.published && Date.parse(it.published) < limite;
      const silencioso = primeraVez || viejo;
      const agregado = almacen.agregar({
        id: idDe(feed.clave, it.guid),
        entidad: feed.entidad,
        red: feed.red,
        titulo: it.title || '',
        texto: (it.text || '').slice(0, 500),
        url: it.url || '',
        imagen: it.image || null,
        fecha: it.published || ahora,
        detectado: ahora,
        notificado: silencioso,
      });
      if (agregado) silencioso ? sembradas++ : notificables++;
    }
    almacen.feedOk(feed.clave);
    return { ok: true, notificables, sembradas };
  });

  const ok = res.filter((r) => r.ok);
  const resumen = {
    feeds: feeds.length,
    ok: ok.length,
    errores: res.length - ok.length,
    nuevas: ok.reduce((s, r) => s + r.notificables, 0),
    sembradas: ok.reduce((s, r) => s + r.sembradas, 0),
    segundos: ((Date.now() - t0) / 1000).toFixed(1),
  };
  console.log(
    `[monitor] ${resumen.feeds} feeds en ${resumen.segundos}s: ${resumen.ok} ok, ${resumen.errores} con error, ` +
      `${resumen.nuevas} nuevas, ${resumen.sembradas} históricas guardadas sin notificar`
  );
  return resumen;
}
