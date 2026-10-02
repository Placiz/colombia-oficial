import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const env = (k, d = '') => (process.env[k] ?? d).trim();
const num = (k, d) => Number(env(k, String(d))) || d;

export const config = {
  // Carpeta del estado (en GitHub Actions se sincroniza con la rama `datos`)
  datos: env('DATOS', 'datos'),
  // Carpeta donde se genera la web estática
  salida: env('SALIDA', 'dist'),
  puerto: num('PUERTO', 3000),
  concurrencia: num('CONCURRENCIA', 6),
  // No se notifica nada publicado hace más de estas horas (evita avalanchas
  // cuando un feed reordena o republica contenido viejo).
  maxAntiguedadH: num('MAX_ANTIGUEDAD_H', 24),

  telegram: {
    token: env('TELEGRAM_TOKEN'),
    canal: env('TELEGRAM_CANAL'),
  },

  // X cobra ~0,005 USD por post leído: 15.000 posts/mes ≈ 75 USD como máximo.
  x: { bearer: env('X_BEARER_TOKEN'), limiteMensual: num('X_LIMITE_MENSUAL', 15000) },

  // Plantillas de "puente" a RSS para redes sin feed público.
  // Ej. RSSHub: PUENTE_X=https://mi-rsshub.com/twitter/user/{usuario}
  puentes: {
    x: env('PUENTE_X'),
    facebook: env('PUENTE_FACEBOOK'),
    instagram: env('PUENTE_INSTAGRAM'),
    tiktok: env('PUENTE_TIKTOK'),
    threads: env('PUENTE_THREADS'),
  },
};
