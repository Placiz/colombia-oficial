// Una pasada completa: lee todas las fuentes, envía lo nuevo a Telegram,
// guarda el estado y genera la web estática en ./dist.
// Es lo que ejecuta GitHub Actions cada ~10 minutos.
import { construirFeeds } from '../src/fuentes.js';
import { cargar } from '../src/almacen.js';
import { ciclo } from '../src/monitor.js';
import { enviarPendientes, telegramActivo } from '../src/telegram.js';
import { construirSitio } from '../src/sitio.js';

const feeds = construirFeeds();
const almacen = cargar();

await ciclo(feeds, almacen);

const pendientes = almacen.pendientes();
if (telegramActivo()) {
  const enviados = await enviarPendientes(pendientes);
  console.log(`[telegram] ${enviados} enviados, ${almacen.pendientes().length} pendientes para la próxima pasada`);
} else {
  for (const p of pendientes) p.notificado = true;
  if (pendientes.length) console.log('[telegram] Sin TELEGRAM_TOKEN/TELEGRAM_CANAL: no se envía nada.');
}

almacen.guardar();
construirSitio(feeds, almacen);
