const $ = (s) => document.querySelector(s);
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONO = {
  web: 'ph-globe', youtube: 'ph-youtube-logo', x: 'ph-x-logo', facebook: 'ph-facebook-logo',
  instagram: 'ph-instagram-logo', tiktok: 'ph-tiktok-logo', telegram: 'ph-telegram-logo', threads: 'ph-threads-logo',
};
const POR_PAGINA = 60;
const REFRESCO_MS = 90_000;
const ZONA = 'America/Bogota';

const fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDiaClave = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
const fmtDiaAnio = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

let meta = null;
let pubs = [];
let entidades = new Map();
let pendientes = [];
let resaltar = new Set();
const estado = { vista: 'feed', categoria: '', entidad: '', q: '', limite: POR_PAGINA, redes: new Set(), xExpandido: false };
// Orden en que se ofrecen las fuentes en el selector "Mostrar".
const ORDEN_FUENTES = ['web', 'youtube', 'x', 'telegram', 'facebook', 'instagram', 'tiktok', 'threads'];
const X_COLAPSADO = 4;
let disponibles = [];

// ---------- Utilidades ----------

const PALABRAS_VACIAS = /^(de|del|la|las|el|los|y|e|para|en)$/i;
function iniciales(nombre) {
  const p = nombre.replace(/[(),.]/g, ' ').split(/\s+/).filter((w) => w && !PALABRAS_VACIAS.test(w));
  if (p.length === 1) return p[0].slice(0, 3).toUpperCase();
  if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(p[0])) return p[0].slice(0, 4);
  return p.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function haceCuanto(fecha) {
  const s = (Date.parse(fecha) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'hace un momento';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

function etiquetaDia(clave, fecha) {
  const hoy = fmtDiaClave.format(new Date());
  const ayer = fmtDiaClave.format(new Date(Date.now() - 86400_000));
  const mismoAnio = clave.slice(0, 4) === hoy.slice(0, 4);
  const largo = (mismoAnio ? fmtDia : fmtDiaAnio).format(fecha);
  if (clave === hoy) return ['Hoy', largo];
  if (clave === ayer) return ['Ayer', largo];
  return [largo.charAt(0).toUpperCase() + largo.slice(1), ''];
}

const normalizar = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- URL ----------

function leerUrl() {
  const u = new URLSearchParams(location.search);
  for (const k of ['categoria', 'entidad', 'q']) estado[k] = u.get(k) || '';
  estado.vista = u.get('vista') === 'fuentes' ? 'fuentes' : 'feed';
  let redes = u.get('redes') ?? (u.get('red') || null);
  if (redes == null) {
    try { redes = localStorage.getItem('redes'); } catch {}
  }
  estado.redesGuardadas = redes ? redes.split(',').filter(Boolean) : null;
}
function redesPorDefecto() {
  return disponibles.length > 0 && estado.redes.size === disponibles.length;
}
function escribirUrl() {
  const u = new URLSearchParams();
  if (estado.vista === 'fuentes') u.set('vista', 'fuentes');
  for (const k of ['categoria', 'entidad', 'q']) if (estado[k]) u.set(k, estado[k]);
  if (disponibles.length && !redesPorDefecto()) u.set('redes', [...estado.redes].join(','));
  const qs = u.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ---------- Datos ----------

async function cargarDatos() {
  const t = Date.now();
  const [m, p] = await Promise.all([
    fetch(`data/meta.json?t=${t}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    fetch(`data/publicaciones.json?t=${t}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  ]);
  meta = m;
  entidades = new Map(m.entidades.map((e) => [e.id, e]));
  return p.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function filtradas() {
  const q = normalizar(estado.q.trim());
  return pubs.filter((p) => {
    const e = entidades.get(p.entidad);
    if (estado.categoria && e?.categoriaId !== estado.categoria) return false;
    if (!estado.redes.has(p.red)) return false;
    if (estado.entidad && p.entidad !== estado.entidad) return false;
    if (q && !normalizar(`${p.titulo} ${p.texto} ${e?.nombre || ''}`).includes(q)) return false;
    return true;
  });
}

// ---------- Publicaciones ----------

function item(p) {
  const e = entidades.get(p.entidad);
  const red = meta.redes[p.red]?.nombre || p.red;
  const titulo = p.titulo || (p.texto || '').split('\n')[0];
  const cuerpo = p.texto && p.texto !== p.titulo && p.titulo ? p.texto : '';
  const fecha = new Date(p.fecha);
  return `
    <article class="item${resaltar.has(p.id) ? ' nueva' : ''}">
      <time class="hora" datetime="${esc(p.fecha)}" title="${esc(fecha.toLocaleString('es-CO', { timeZone: ZONA }))}">${fmtHora.format(fecha)}</time>
      <div class="cuerpo">
        <div class="item-meta">
          <button type="button" class="ent" data-entidad="${esc(p.entidad)}" title="Ver solo ${esc(e?.nombre || p.entidad)}">${esc(e?.nombre || p.entidad)}</button>
          <span class="red"><i class="ph ${ICONO[p.red] || 'ph-globe'}" aria-hidden="true"></i>${esc(red)}</span>
          <span class="hora-movil">${fmtHora.format(fecha)}</span>
        </div>
        <h3><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(titulo)}</a></h3>
        ${cuerpo ? `<p>${esc(cuerpo)}</p>` : ''}
      </div>
      ${p.imagen ? `<img class="miniatura" src="${esc(p.imagen)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    </article>`;
}

// X no permite leer sus publicaciones sin pagar: en su lugar se muestran las
// cuentas oficiales con contexto (última actividad conocida de la entidad).
function cuentasX() {
  const q = normalizar(estado.q.trim());
  const ultima = new Map();
  for (const p of pubs) if (!ultima.has(p.entidad)) ultima.set(p.entidad, p);
  return meta.entidades
    .map((e) => ({ e, x: e.cuentas.find((c) => c.red === 'x'), ultima: ultima.get(e.id) }))
    .filter(({ e, x }) => x
      && (!estado.categoria || e.categoriaId === estado.categoria)
      && (!estado.entidad || e.id === estado.entidad)
      && (!q || normalizar(`${e.nombre} ${x.usuario}`).includes(q)))
    .sort((a, b) => (b.ultima?.fecha || '').localeCompare(a.ultima?.fecha || ''));
}

function bloqueX(soloX) {
  const cuentas = cuentasX();
  if (!cuentas.length) return '';
  const completo = soloX || estado.xExpandido || estado.entidad;
  const mostrar = completo ? cuentas : cuentas.slice(0, X_COLAPSADO);
  const tarjeta = ({ e, x, ultima }) => {
    const ctx = ultima ? `Publicó ${haceCuanto(ultima.fecha)}` : 'Sin actividad reciente';
    const detalle = ultima
      ? `Última publicación oficial ${haceCuanto(ultima.fecha)} en ${meta.redes[ultima.red]?.nombre || ultima.red}: ${ultima.titulo || ''}`
      : 'Sin publicaciones recientes en sus otras fuentes';
    return `<a class="xcuenta" href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(detalle)}">
      <span class="mono" aria-hidden="true">${esc(iniciales(e.nombre))}</span>
      <span class="xc-texto"><b>${esc(e.nombre)}</b><span class="xc-usuario">@${esc(x.usuario)}</span><span class="xc-ctx">${ctx}</span></span>
      <span class="xc-ir">Ver en X<i class="ph ph-arrow-up-right" aria-hidden="true"></i></span>
    </a>`;
  };
  let pie = '';
  if (!completo && cuentas.length > X_COLAPSADO) pie = `<button type="button" class="enlace" data-accion="expandir-x">Ver las ${cuentas.length} cuentas</button>`;
  else if (!soloX && !estado.entidad && estado.xExpandido && cuentas.length > X_COLAPSADO) pie = `<button type="button" class="enlace" data-accion="expandir-x">Mostrar menos</button>`;
  return `<section class="bloque-x" aria-labelledby="titulo-x">
    <div class="bloque-x-h">
      <h2 id="titulo-x"><i class="ph ph-x-logo" aria-hidden="true"></i>En X</h2>
      <p>X no permite leer sus publicaciones gratis, así que aquí te llevamos directo a cada cuenta oficial.</p>
    </div>
    <div class="xcuentas${soloX || completo ? '' : ' colapsadas'}">${mostrar.map(tarjeta).join('')}</div>
    ${pie}
  </section>`;
}

function pintarPerfil() {
  const cont = $('#perfil');
  const e = entidades.get(estado.entidad);
  cont.hidden = !e;
  if (!e) return (cont.innerHTML = '');
  const enlaces = [{ red: 'web', url: e.web, usuario: '' }, ...e.cuentas];
  cont.innerHTML = `<div class="perfil">
    <span class="mono" aria-hidden="true">${esc(iniciales(e.nombre))}</span>
    <div class="perfil-texto"><h2>${esc(e.nombre)}</h2><p>${esc(e.categoria)}</p></div>
    <div class="perfil-cuentas">${enlaces
      .map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.usuario ? '@' + c.usuario : e.web)}"><i class="ph ${ICONO[c.red] || 'ph-globe'}" aria-hidden="true"></i>${esc(meta.redes[c.red]?.nombre || c.red)}</a>`)
      .join('')}</div>
  </div>`;
}

function pintarLista() {
  const lista = $('#lista');
  const todas = filtradas();
  const visibles = todas.slice(0, estado.limite);
  lista.removeAttribute('aria-busy');
  const conX = estado.redes.has('x');
  const soloX = conX && estado.redes.size === 1;
  const htmlX = conX ? bloqueX(soloX) : '';

  if (!estado.redes.size) {
    lista.innerHTML = `<div class="vacio"><h3>No hay fuentes seleccionadas</h3><p>Elige en "Mostrar" si quieres ver páginas oficiales, YouTube o X.</p></div>`;
    $('#mas').hidden = true;
    return;
  }
  if (soloX) {
    lista.innerHTML = htmlX || `<div class="vacio"><h3>Sin cuentas de X para este filtro</h3><p>Esta entidad no enlaza una cuenta de X desde su web oficial.</p></div>`;
    $('#mas').hidden = true;
    return;
  }

  if (!visibles.length) {
    if (htmlX) {
      lista.innerHTML = htmlX;
      $('#mas').hidden = true;
      return;
    }
    const hayFiltros = estado.categoria || estado.entidad || estado.q || !redesPorDefecto();
    lista.innerHTML = hayFiltros
      ? `<div class="vacio"><h3>Nada coincide con estos filtros</h3><p>Prueba con otra palabra o quita alguno de los filtros activos.</p><button type="button" class="btn-secundario" data-accion="limpiar">Quitar filtros</button></div>`
      : `<div class="vacio"><h3>Todavía no hay publicaciones</h3><p>El monitor revisa las fuentes cada 10 minutos. Vuelve en un rato.</p></div>`;
    $('#mas').hidden = true;
    return;
  }

  const grupos = new Map();
  for (const p of visibles) {
    const clave = fmtDiaClave.format(new Date(p.fecha));
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  lista.innerHTML = htmlX + [...grupos]
    .map(([clave, items]) => {
      const [titulo, sub] = etiquetaDia(clave, new Date(items[0].fecha));
      return `<section class="dia" aria-label="${esc(titulo)}"><h2 class="dia-titulo">${esc(titulo)}${sub ? ` <span>${esc(sub)}</span>` : ''}</h2>${items.map(item).join('')}</section>`;
    })
    .join('');
  $('#mas').hidden = todas.length <= estado.limite;
}

function pintarActivos() {
  const cont = $('#activos');
  const chips = [];
  const cat = meta.categorias.find((c) => c.id === estado.categoria);
  if (cat) chips.push(['categoria', cat.nombre]);
  if (estado.entidad) chips.push(['entidad', entidades.get(estado.entidad)?.nombre || estado.entidad]);
  cont.hidden = !chips.length;
  cont.innerHTML =
    chips.map(([k, v]) => `<button type="button" class="quitar" data-quitar="${k}" aria-label="Quitar filtro ${esc(v)}">${esc(v)}<i class="ph ph-x" aria-hidden="true"></i></button>`).join('') +
    (chips.length > 1 ? `<button type="button" class="enlace limpiar" data-accion="limpiar">Quitar todos</button>` : '');
}

function pintarFiltros() {
  const hace24h = Date.now() - 86400_000;
  const recientes = pubs.filter((p) => Date.parse(p.fecha) >= hace24h);
  const porCat = {};
  for (const p of recientes) {
    const c = entidades.get(p.entidad)?.categoriaId;
    porCat[c] = (porCat[c] || 0) + 1;
  }

  const btn = (attrs, contenido, activo) =>
    `<button type="button" class="filtro" ${attrs} aria-pressed="${activo}">${contenido}</button>`;
  $('#filtro-categorias').innerHTML =
    btn('data-categoria=""', '<span>Todas</span>', !estado.categoria) +
    meta.categorias
      .map((c) =>
        btn(
          `data-categoria="${c.id}" title="${porCat[c.id] || 0} publicaciones en las últimas 24 horas"`,
          `<span>${esc(c.nombre)}</span><span class="n">${porCat[c.id] || ''}</span>`,
          estado.categoria === c.id
        )
      )
      .join('');

  $('#mostrar').innerHTML = disponibles
    .map((r) => {
      const activo = estado.redes.has(r);
      return `<button type="button" class="opcion" data-red="${r}" aria-pressed="${activo}"><i class="ph ${ICONO[r]}" aria-hidden="true"></i>${esc(meta.redes[r].nombre)}<i class="ph ph-check marca-check" aria-hidden="true"></i></button>`;
    })
    .join('');

  $('#chips').innerHTML =
    `<button type="button" class="chip" data-categoria="" aria-pressed="${!estado.categoria}">Todas</button>` +
    meta.categorias.map((c) => `<button type="button" class="chip" data-categoria="${c.id}" aria-pressed="${estado.categoria === c.id}">${esc(c.nombre)}</button>`).join('');

  $('#entidad').value = estado.entidad;
  $('#q').value = estado.q;
}

function calcularDisponibles() {
  const s = new Set(pubs.map((p) => p.red));
  if (meta.entidades.some((e) => e.cuentas.some((c) => c.red === 'x'))) s.add('x');
  disponibles = ORDEN_FUENTES.filter((r) => s.has(r) && meta.redes[r]);
  const guardadas = estado.redesGuardadas?.filter((r) => disponibles.includes(r));
  estado.redes = new Set(guardadas?.length ? guardadas : disponibles);
}

function guardarRedes() {
  estado.redesGuardadas = [...estado.redes];
  try {
    redesPorDefecto() ? localStorage.removeItem('redes') : localStorage.setItem('redes', [...estado.redes].join(','));
  } catch {}
}

function pintarResumen() {
  const hace24h = Date.now() - 86400_000;
  const recientes = pubs.filter((p) => Date.parse(p.fecha) >= hace24h);
  const conteo = new Map();
  for (const p of recientes) conteo.set(p.entidad, (conteo.get(p.entidad) || 0) + 1);
  $('#cifra-24h').textContent = recientes.length.toLocaleString('es-CO');
  $('#cifra-24h-sub').textContent =
    recientes.length === 1 ? 'publicación de 1 entidad' : `publicaciones de ${conteo.size} ${conteo.size === 1 ? 'entidad' : 'entidades'}`;
  const top = [...conteo].sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('#ranking').innerHTML = top.length
    ? top
        .map(([id, n]) => {
          const e = entidades.get(id);
          return `<li><button type="button" data-entidad="${esc(id)}"><span class="mono" aria-hidden="true">${esc(iniciales(e?.nombre || id))}</span><span class="nombre">${esc(e?.nombre || id)}</span><span class="n">${n}</span></button></li>`;
        })
        .join('')
    : `<li class="cifra-sub">Sin actividad en las últimas 24 horas.</li>`;

  const totalEnt = meta.entidades.length;
  $('#intro-sub').textContent = `Páginas oficiales, YouTube y cuentas de X de ${totalEnt} entidades nacionales, revisadas cada 10 minutos.`;
}

function pintarEstado() {
  const el = $('#actualizado');
  const min = (Date.now() - Date.parse(meta.generado)) / 60000;
  el.hidden = false;
  el.textContent = `Actualizado ${haceCuanto(meta.generado)}`;
  el.title = new Date(meta.generado).toLocaleString('es-CO', { timeZone: ZONA });
  el.classList.toggle('atrasado', min > 30);

  if (meta.telegram) {
    const a = $('#cta-telegram');
    a.href = `https://t.me/${meta.telegram.replace(/^@/, '')}`;
    a.hidden = false;
  }
  if (meta.repo) {
    const a = $('#pie-repo');
    a.href = meta.repo;
    a.hidden = false;
  }
}

// ---------- Fuentes ----------

function pintarFuentes() {
  const cuentas = meta.entidades.reduce((s, e) => s + e.cuentas.length, 0);
  $('#fuentes-sub').textContent =
    `${meta.entidades.length} entidades y ${cuentas} cuentas oficiales, tomadas de la web de cada entidad. ` +
    `${meta.stats.feedsOk} de ${meta.stats.feeds} fuentes se revisan automáticamente.`;

  const boton = (e, red, url, st, usuario) => {
    const nombre = red === 'web' ? 'Sitio web' : meta.redes[red]?.nombre || red;
    const clase = st.monitoreada ? (st.error ? 'err' : 'ok') : '';
    const estadoTxt = st.monitoreada ? (st.error ? 'con errores recientes' : 'se revisa cada 10 minutos') : 'solo enlace';
    const etiqueta = `${nombre}${usuario ? ` (${usuario})` : ''}: ${estadoTxt}`;
    return `<a class="red-btn ${clase}" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${esc(etiqueta)}" title="${esc(etiqueta)}"><i class="ph ${ICONO[red] || 'ph-globe'}" aria-hidden="true"></i></a>`;
  };

  $('#fuentes').innerHTML = meta.categorias
    .map((c) => {
      const ents = meta.entidades.filter((e) => e.categoriaId === c.id);
      return `<section class="categoria"><h2>${esc(c.nombre)} <span>${ents.length}</span></h2><div class="rejilla">${ents
        .map(
          (e) => `<article class="entidad">
            <div class="entidad-h"><span class="mono" aria-hidden="true">${esc(iniciales(e.nombre))}</span>
              <button type="button" data-entidad="${esc(e.id)}" title="Ver publicaciones de ${esc(e.nombre)}">${esc(e.nombre)}</button></div>
            <div class="redes">${boton(e, 'web', e.web, { monitoreada: e.webMonitoreada, error: e.webError })}${e.cuentas
              .map((a) => boton(e, a.red, a.url, a, a.red === 'youtube' ? '' : `@${a.usuario}`))
              .join('')}</div>
          </article>`
        )
        .join('')}</div></section>`;
    })
    .join('');
}

// ---------- Vistas y eventos ----------

function vista(v, { scroll = true } = {}) {
  estado.vista = v;
  document.querySelectorAll('.vistas button').forEach((b) =>
    b.dataset.vista === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')
  );
  $('#vista-feed').hidden = v !== 'feed';
  $('#vista-fuentes').hidden = v !== 'fuentes';
  if (v === 'fuentes') pintarFuentes();
  escribirUrl();
  if (scroll) window.scrollTo(0, 0);
}

function aplicar() {
  estado.limite = POR_PAGINA;
  resaltar = new Set();
  pendientes = [];
  pintarAviso();
  pintarFiltros();
  pintarActivos();
  pintarPerfil();
  pintarLista();
  escribirUrl();
}

function filtrarEntidad(id) {
  estado.entidad = id;
  if (estado.vista !== 'feed') vista('feed');
  aplicar();
  window.scrollTo({ top: 0 });
}

function pintarAviso() {
  const b = $('#aviso');
  b.hidden = !pendientes.length;
  b.querySelector('span').textContent =
    pendientes.length === 1 ? '1 publicación nueva' : `${pendientes.length} publicaciones nuevas`;
}

function mostrarPendientes() {
  resaltar = new Set(pendientes.map((p) => p.id));
  pendientes = [];
  pintarAviso();
  pintarLista();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

async function refrescar() {
  if (document.hidden) return;
  try {
    const nuevas = await cargarDatos();
    const conocidas = new Set(pubs.map((p) => p.id));
    const llegadas = nuevas.filter((p) => !conocidas.has(p.id));
    pubs = nuevas;
    calcularDisponibles();
    pintarEstado();
    pintarResumen();
    if (!llegadas.length) return;
    const ids = new Set(llegadas.map((p) => p.id));
    const visibles = filtradas().filter((p) => ids.has(p.id));
    if (!visibles.length) return pintarFiltros();
    $('#anuncio').textContent = `${visibles.length} publicaciones nuevas`;
    if (window.scrollY < 240 && !pendientes.length) {
      resaltar = new Set(visibles.map((p) => p.id));
      pintarLista();
    } else {
      pendientes = [...visibles, ...pendientes];
      pintarAviso();
    }
    pintarFiltros();
  } catch {
    /* Sin conexión: se reintenta en el próximo ciclo. */
  }
}

function esqueleto() {
  $('#lista').innerHTML = Array.from({ length: 6 }, () =>
    `<div class="esqueleto" aria-hidden="true"><i class="h"></i><div><i class="l1"></i><i class="l2"></i><i class="l3"></i></div><i class="t"></i></div>`
  ).join('');
}

function errorCarga() {
  $('#lista').removeAttribute('aria-busy');
  $('#lista').innerHTML = `<div class="vacio"><h3>No se pudieron cargar las publicaciones</h3><p>Revisa tu conexión e inténtalo de nuevo.</p><button type="button" class="btn-secundario" data-accion="reintentar"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>Reintentar</button></div>`;
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button, a');
  if (!t) return;
  if (t.dataset.vista) return vista(t.dataset.vista);
  if (t.dataset.entidad !== undefined && t.tagName === 'BUTTON') return filtrarEntidad(t.dataset.entidad);
  if (t.dataset.categoria !== undefined) {
    estado.categoria = estado.categoria === t.dataset.categoria ? '' : t.dataset.categoria;
    t.classList.contains('chip') && t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return aplicar();
  }
  if (t.dataset.red) {
    estado.redes.has(t.dataset.red) ? estado.redes.delete(t.dataset.red) : estado.redes.add(t.dataset.red);
    guardarRedes();
    return aplicar();
  }
  if (t.dataset.accion === 'expandir-x') {
    estado.xExpandido = !estado.xExpandido;
    return pintarLista();
  }
  if (t.dataset.quitar) {
    estado[t.dataset.quitar] = '';
    return aplicar();
  }
  if (t.dataset.accion === 'limpiar') {
    Object.assign(estado, { categoria: '', entidad: '', q: '' });
    estado.redes = new Set(disponibles);
    guardarRedes();
    return aplicar();
  }
  if (t.dataset.accion === 'reintentar') return iniciar();
});

let temporizador;
$('#q').addEventListener('input', (e) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    estado.q = e.target.value;
    aplicar();
  }, 200);
});
$('#entidad').addEventListener('change', (e) => { estado.entidad = e.target.value; aplicar(); });
$('#aviso').addEventListener('click', mostrarPendientes);
$('#mas').addEventListener('click', () => { estado.limite += POR_PAGINA; pintarLista(); });
document.addEventListener('visibilitychange', () => !document.hidden && refrescar());

async function iniciar() {
  leerUrl();
  esqueleto();
  vista(estado.vista, { scroll: false });
  try {
    pubs = await cargarDatos();
  } catch {
    return errorCarga();
  }
  const sel = $('#entidad');
  sel.length = 1;
  for (const c of meta.categorias) {
    const g = document.createElement('optgroup');
    g.label = c.nombre;
    for (const e of meta.entidades.filter((x) => x.categoriaId === c.id)) g.append(new Option(e.nombre, e.id));
    sel.append(g);
  }
  calcularDisponibles();
  pintarEstado();
  pintarResumen();
  aplicar();
  if (estado.vista === 'fuentes') pintarFuentes();
}

await iniciar();
setInterval(refrescar, REFRESCO_MS);
setInterval(() => meta && pintarEstado(), 30_000);
