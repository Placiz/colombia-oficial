# Colombia Oficial

Web y canal de Telegram que reúnen lo que publican las entidades del Estado
colombiano en sus canales oficiales.

Funciona sin servidor: una GitHub Action revisa las fuentes cada ~10 minutos,
envía lo nuevo al canal de Telegram y regenera la web estática en GitHub Pages.
No hay nada que mantener encendido ni que pagar.

## Cómo funciona

```
cada ~10 min (GitHub Actions)
  ├─ lee webs oficiales (RSS) y canales de YouTube de 61 entidades
  ├─ compara con el estado guardado en la rama `datos`
  ├─ envía lo nuevo al canal de Telegram
  ├─ guarda el estado (rama `datos`, un solo commit que se reemplaza)
  └─ publica la web en GitHub Pages
```

La primera vez que se lee cada fuente, su historial se guarda sin notificar.
Desde ahí solo lo nuevo llega a Telegram.

## Activar el canal de Telegram

1. Habla con [@BotFather](https://t.me/BotFather), usa `/newbot` y copia el token.
2. Crea un canal público y agrega al bot como **administrador**.
3. En el repositorio: **Settings → Secrets and variables → Actions**
   - pestaña *Secrets*: `TELEGRAM_TOKEN` = el token
   - pestaña *Variables*: `TELEGRAM_CANAL` = `@nombre_del_canal`
4. **Actions → Monitor → Run workflow** para probar.

La web mostrará el botón "Seguir en Telegram" automáticamente.

## Qué se monitorea

`entidades.json` lista las entidades (Presidencia, ministerios, Congreso, altas
cortes, Fiscalía, órganos de control, Registraduría, Fuerza Pública,
superintendencias, etc.). `npm run descubrir` visita la web oficial de cada una,
extrae sus cuentas oficiales y feeds RSS, y los guarda en `fuentes.json`
(editable a mano).

| Red | Cómo se lee | Estado |
|---|---|---|
| Sitios web (.gov.co) | RSS publicado por la entidad | Activo |
| YouTube | Feed RSS público del canal | Activo |
| Telegram | Vista pública `t.me/s/<canal>` | Activo si la entidad tiene canal |
| X, Facebook, Instagram, TikTok, Threads | Puente RSS propio o API de X | Requiere configuración |

### X (Twitter)

`fuentes.json` tiene la cuenta oficial de X de 58 de las 61 entidades. Sin
pagar nada, la web las muestra en la sección "En X" (con la última actividad
conocida de cada entidad) y cada mensaje de Telegram enlaza la cuenta de X de
la entidad. En la web, el selector "Mostrar" permite elegir qué fuentes ver
(página oficial, YouTube, X) y la elección se recuerda.

Opcional y de pago: para leer los posts de X se usa la API oficial, que cobra unos 0,005 USD por post leído
(pago por uso, sin cuota fija). El monitor guarda el último post visto de cada
cuenta, así que cada post se paga una sola vez y una revisión sin novedades no
cuesta nada. Para activarlo:

1. Crea una app en [console.x.com](https://console.x.com), carga saldo y copia el *Bearer Token*.
2. En el repositorio, Secrets: `X_BEARER_TOKEN`.
3. Opcional, Variables: `X_LIMITE_MENSUAL` (posts por mes, por defecto 15000, unos 75 USD como máximo).

### Facebook, Instagram, TikTok, Threads

Meta y TikTok no ofrecen feeds públicos y bloquean la lectura automática.
Para incluirlas hace falta un puente como [RSSHub](https://docs.rsshub.app)
alojado por ti; luego defines las variables `PUENTE_X`, `PUENTE_INSTAGRAM`, etc.
(ver `.env.example`). Mientras tanto, la pestaña **Fuentes** de la web muestra
esas cuentas como "solo enlace".

## En local

Requiere Node.js 22.5 o superior.

```bash
npm install
npm run ciclo   # una pasada: lee fuentes y genera dist/
npm run ver     # http://localhost:3000
```

## Límites conocidos

- GitHub ejecuta los cron "lo mejor que puede": en horas de mucha carga una
  pasada de 10 minutos puede retrasarse.
- En repositorios públicos, GitHub pausa los workflows programados tras 60 días
  sin actividad en el repositorio. Si pasa, se reactiva desde la pestaña Actions.
- Algunos sitios .gov.co bloquean conexiones desde fuera de Colombia o tienen
  certificados mal configurados; aparecen como "con errores" en **Fuentes**.
