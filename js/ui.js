// Piezas de interfaz compartidas: tarjetas, selectores, botones, buscador y visor de documentos.
import { h, clear, dialogo, toast, normalizar, confirmar, elegir, diaHoy } from './util.js';
import { pdfDePaginas, compartir, descargar } from './files.js';
import { esComputadora, imprimirTiquetes } from './imprimir.js';
import { hayControl, sesion, salir, lista as listaUsuarios } from './users.js';

export const ICONOS = {
  emitir: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8l-9 9z',
  imprimir: 'M19 8H5c-1.7 0-3 1.3-3 3v6h4v4h12v-4h4v-6c0-1.7-1.3-3-3-3zm-3 11H8v-5h8v5zm3-7c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zM18 3H6v4h12V3z',
  anular: 'M12 2a10 10 0 100 20 10 10 0 000-20zm5 13.6L15.6 17 12 13.4 8.4 17 7 15.6 10.6 12 7 8.4 8.4 7l3.6 3.6L15.6 7 17 8.4 13.4 12 17 15.6z',
  resumen: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  enviar: 'M2 21l21-9L2 3v7l15 2-15 2z',
  compartir: 'M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.3-2.9-2.9-2.9z',
  registro: 'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  diario: 'M2 21h18v-2H2v2zM20 8h-2V5h2v3zm0-5H4v10c0 2.2 1.8 4 4 4h6c2.2 0 4-1.8 4-4v-3h2c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z',
  boletos: 'M22 10V6c0-1.1-.9-2-2-2H4c-1.1 0-1.99.9-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z',
  ajustes: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  borrar: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  reportes: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z'
};
export function icono(nombre, tam = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', tam); s.setAttribute('height', tam); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', ICONOS[nombre]); p.setAttribute('fill', 'currentColor');
  s.append(p);
  return s;
}

export const tarjeta = (...hijos) => h('section', { class: 'tarjeta' }, ...hijos);
export const etiqueta = (t) => h('label', { class: 'etiqueta' }, t);
export function banda(titulo) {
  const el = h('header', { class: 'banda' });
  const chip = h('button', { type: 'button', class: 'user-chip', hidden: true, onclick: async () => {
    const s = sesion(); if (!s) return;
    if (await confirmar('Cerrar sesión', `Sesión de ${s.nombre} (${s.rol}).\n\n¿Cerrar la sesión?`, { si: 'Cerrar sesión' })) salir();
  } });
  el.pintarUsuario = () => { const s = hayControl() ? sesion() : null; chip.hidden = !s; const t = s ? '👤 ' + s.nombre : ''; if (chip.textContent !== t) chip.textContent = t; };
  el.append(chip, h('h1', null, titulo));
  el.classList.add('con-usuario');
  el.pintarUsuario();
  return el;
}

/** Campo de solo lectura que abre una lista al tocarlo. */
export function selector(placeholder, onClick) {
  const el = h('button', { type: 'button', class: 'selector vacio', onclick: onClick }, h('span', { class: 'sel-texto' }, placeholder),
    h('span', { class: 'sel-flecha', 'aria-hidden': 'true' }, '▾'));
  el.poner = (texto) => {
    el.querySelector('.sel-texto').textContent = texto || placeholder;
    el.classList.toggle('vacio', !texto);
  };
  return el;
}

export function boton(texto, icon, clase, onClick, permiso) {
  return h('button', { type: 'button', class: 'btn ' + clase, onclick: onClick, 'data-permiso': permiso || null }, icon ? icono(icon, 22) : null,
    h('span', null, texto.split('\n').flatMap((t, i) => (i ? [h('br'), t] : [t]))));
}

/** Campo de texto con lista de sugerencias debajo (deja escribir cualquier valor). */
export function campoBusqueda({ placeholder, fuente, alElegir, mayus = true, valor = '', alCambiar }) {
  const input = h('input', {
    class: 'campo', type: 'text', placeholder, autocomplete: 'off', autocorrect: 'off', autocapitalize: mayus ? 'words' : 'none',
    spellcheck: 'false', value: valor
  });
  const lista = h('div', { class: 'sugerencias', hidden: true });
  const cont = h('div', { class: 'busqueda' }, input, lista);
  const pintar = () => {
    const toks = normalizar(input.value).split(' ').filter(Boolean);
    const items = fuente().filter((o) => { const t = normalizar((o.etiqueta || o) + " " + (o.detalle || "")); return toks.every((k) => t.includes(k)); });
    items.sort((a, b) => {
      const ta = normalizar(a.etiqueta || a), tb = normalizar(b.etiqueta || b);
      const sa = toks.length && ta.startsWith(toks[0]) ? 0 : 1, sb = toks.length && tb.startsWith(toks[0]) ? 0 : 1;
      return sa - sb || ta.localeCompare(tb);
    });
    clear(lista);
    const solo = items.slice(0, 40);
    solo.forEach((o) => lista.append(h('button', {
      type: 'button', class: 'sug',
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => { const v = o.valor !== undefined ? o.valor : (o.etiqueta || o); input.value = v; lista.hidden = true; if (alElegir) alElegir(v, o); if (alCambiar) alCambiar(); }
    }, h('span', null, o.etiqueta || o), o.detalle ? h('small', null, o.detalle) : null)));
    lista.hidden = !solo.length || (solo.length === 1 && normalizar(solo[0].valor !== undefined ? solo[0].valor : (solo[0].etiqueta || solo[0])) === normalizar(input.value));
  };
  input.addEventListener('focus', () => { pintar(); setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250); });
  input.addEventListener('input', () => { pintar(); if (alCambiar) alCambiar(); });
  input.addEventListener('blur', () => setTimeout(() => { lista.hidden = true; }, 150));
  cont.input = input;
  return cont;
}

/**
 * Ventana con la vista previa de un documento (páginas ya dibujadas) y el botón para compartir el PDF
 * (y archivos adicionales, como el Excel). El PDF se prepara al abrir para que el botón responda al instante.
 */
export function verDocumento({ titulo, paginas, nombrePdf, intro, adicionales = [], textoBoton = 'Compartir PDF', maxPaginas = 6, ancho = false, textoCompartir = '', tiquete = false, paginasPdf = null, botonesAparte = [] }) {
  const zona = h('div', { class: ancho ? 'visor ancho' : 'visor' });
  paginas.slice(0, maxPaginas).forEach((p) => { p.canvas.classList.add('hoja'); zona.append(p.canvas); });
  if (paginas.length > maxPaginas) zona.append(h('p', { class: 'nota' }, `… y ${paginas.length - maxPaginas} páginas más (todas van en el PDF).`));
  let archivos = null;
  const btn = h('button', { type: 'button', class: 'btn-texto primario', disabled: true }, 'Preparando…');
  const dlg = dialogo({
    titulo,
    cuerpo: [intro ? h('p', { class: 'nota' }, intro) : null, zona],
    botones: [{ texto: 'Cerrar' }]
  });
  const barra = dlg.caja.querySelector('.dialogo-botones');
  barra.prepend(btn);
  botonesAparte.slice().reverse().forEach((b) => barra.prepend(h('button', { type: 'button', class: 'btn-texto', onclick: async () => {
    const r = await compartir([b.archivo], titulo, textoCompartir || titulo);
    if (r === 'descargado') toast('Se descargó el archivo (este navegador no puede abrir «Compartir»).');
  } }, b.texto)));
  if (tiquete && esComputadora()) {
    barra.prepend(h('button', { type: 'button', class: 'btn-texto primario', onclick: () => imprimirTiquetes(paginas) }, '🖨 Imprimir (80 mm)'));
  }
  btn.addEventListener('click', async () => {
    if (!archivos) return;
    const r = await compartir(archivos, titulo, textoCompartir || titulo);
    if (r === 'descargado') toast('Se descargó el archivo (este navegador no puede abrir «Compartir»).');
  });
  (async () => {
    try {
      const pdf = await pdfDePaginas((paginasPdf || paginas).map((p) => ({ canvas: p.canvas, ancho: p.ancho, alto: p.alto })));
      archivos = [{ blob: pdf, nombre: nombrePdf }, ...adicionales];
      btn.textContent = textoBoton; btn.disabled = false;
    } catch (e) { btn.textContent = 'No se pudo preparar'; toast('No se pudo generar el PDF: ' + (e.message || e)); }
  })();
  return dlg;
}

/** Lista con buscador para reimprimir / anular. items: [{titulo, detalle, rojo, valor}] */
export function listaBuscable({ titulo, items, placeholder, vacio, texto }) {
  return new Promise((res) => {
    let hecho = false;
    const q = h('input', { type: 'search', class: 'campo', placeholder, autocomplete: 'off' });
    const cuenta = h('p', { class: 'nota' });
    const lista = h('div', { class: 'lista alta' });
    const pintar = () => {
      clear(lista);
      const toks = normalizar(q.value).split(' ').filter(Boolean);
      const ok = items.filter((it) => toks.every((k) => normalizar(it.busqueda).includes(k)));
      ok.slice(0, 100).forEach((it) => lista.append(h('button', {
        type: 'button', class: 'item', onclick: () => { hecho = true; d.cerrar(); res(it.valor); }
      }, h('span', { class: it.rojo ? 'rojo' : '' }, it.titulo), h('small', null, it.detalle))));
      cuenta.textContent = !ok.length ? 'Ningún elemento coincide con la búsqueda.' : ok.length > 100 ? `Mostrando 100 de ${ok.length}. Escriba para filtrar.` : `${ok.length} ${texto}`;
    };
    q.addEventListener('input', pintar);
    const d = dialogo({ titulo, cuerpo: [q, cuenta, lista], botones: [{ texto: 'Cerrar' }] });
    d.alCerrar = () => { if (!hecho) res(undefined); };
    pintar();
  });
}

/** Pide un motivo obligatorio. Devuelve el texto o null. */
export function pedirMotivo({ titulo, detalle, etiquetaCampo = 'Motivo de la anulación (obligatorio)', placeholder, aviso, ok = 'Anular' }) {
  return new Promise((res) => {
    let hecho = false;
    const campo = h('input', { class: 'campo', type: 'text', placeholder, autocomplete: 'off', autocapitalize: 'sentences' });
    const d = dialogo({
      titulo,
      cuerpo: [detalle ? h('p', { class: 'pre' }, detalle) : null, h('label', { class: 'etiqueta' }, etiquetaCampo), campo, aviso ? h('p', { class: 'nota' }, aviso) : null],
      botones: [
        { texto: 'Cancelar' },
        { texto: ok, clase: 'peligro', onclick: () => { const t = campo.value.trim(); if (!t) { toast('Escriba el motivo.'); return false; } hecho = true; res(t); } }
      ]
    });
    d.alCerrar = () => { if (!hecho) res(null); };
    setTimeout(() => campo.focus(), 60);
  });
}

export { descargar };

/** ¿El usuario del documento coincide con el filtro? (filtro vacío = todos; '(sin usuario)' = los que no tienen). */
export function usuarioCoincide(usuarioDoc, filtro) {
  if (!filtro) return true;
  if (filtro === '(sin usuario)') return !String(usuarioDoc || '').trim();
  return normalizar(usuarioDoc) === normalizar(filtro);
}
export function opcionesUsuarios() { return ['Todos los usuarios', ...(listaUsuarios() || []).map((u) => u.nombre), '(sin usuario)']; }
/** Para administradores: elegir fecha, sociedad y usuario antes de generar un reporte. Devuelve {dia, sociedad, usuario} o null. */
export function filtrosAdmin({ titulo, sociedades = null, sociedad = '', usuarios = true, nota = '' }) {
  return new Promise((res) => {
    let dia = diaHoy(), usuario = '', soc = sociedad, hecho = false;
    const iDia = h('input', { class: 'campo', type: 'date', value: dia });
    iDia.addEventListener('change', () => { if (iDia.value) dia = iDia.value; });
    const pSoc = sociedades ? selector('Seleccione la sociedad', async () => {
      const v = await elegir('Sociedad', sociedades.map((n) => ({ etiqueta: n, valor: n })), { buscar: false });
      if (v !== undefined) { soc = v; pSoc.poner(v); }
    }) : null;
    if (pSoc) pSoc.poner(soc);
    const nombres = opcionesUsuarios();
    const pUs = selector('Todos los usuarios', async () => {
      const v = await elegir('Usuario', nombres.map((n, i) => ({ etiqueta: n, valor: i })), { buscar: false });
      if (v === undefined) return;
      usuario = v === 0 ? '' : nombres[v]; pUs.poner(nombres[v]);
    });
    pUs.poner('Todos los usuarios');
    const d = dialogo({
      titulo,
      cuerpo: [etiqueta('Fecha'), iDia, pSoc ? etiqueta('Sociedad') : null, pSoc, usuarios ? etiqueta('Usuario que emitió') : null, usuarios ? pUs : null,
        nota ? h('p', { class: 'nota' }, nota) : null],
      botones: [{ texto: 'Cancelar' }, { texto: 'Generar', clase: 'primario', onclick: () => {
        if (sociedades && !soc) { toast('Seleccione la sociedad.'); return false; }
        hecho = true; res({ dia, sociedad: soc, usuario }); } }]
    });
    d.alCerrar = () => { if (!hecho) res(null); };
  });
}

function sumarDias(dia, n) {
  const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Elegir el período de un reporte: hoy, ayer o un rango de fechas (y, si se pide, el usuario). Devuelve {desde, hasta, usuario} o null. */
export function pedirPeriodo({ titulo, usuarios = false, textoBoton = 'Generar', nota = '' }) {
  return new Promise((res) => {
    const hoy = diaHoy(), ayer = sumarDias(hoy, -1);
    let desde = hoy, hasta = hoy, usuario = '', hecho = false;
    const gr = 'per-' + Math.random().toString(36).slice(2);
    const rHoy = h('input', { type: 'radio', name: gr, checked: true }), rAyer = h('input', { type: 'radio', name: gr }), rRango = h('input', { type: 'radio', name: gr });
    const iDesde = h('input', { class: 'campo', type: 'date', value: hoy }), iHasta = h('input', { class: 'campo', type: 'date', value: hoy });
    const cajaRango = h('div', null, etiqueta('Desde'), iDesde, etiqueta('Hasta'), iHasta);
    const pintar = () => { cajaRango.hidden = !rRango.checked; };
    [rHoy, rAyer, rRango].forEach((r) => r.addEventListener('change', pintar));
    pintar();
    iDesde.addEventListener('change', () => { if (iDesde.value) { desde = iDesde.value; if (hasta < desde) { hasta = desde; iHasta.value = hasta; } } });
    iHasta.addEventListener('change', () => { if (iHasta.value) { hasta = iHasta.value; if (desde > hasta) { desde = hasta; iDesde.value = desde; } } });
    const nombres = opcionesUsuarios();
    const pUs = selector('Todos los usuarios', async () => {
      const v = await elegir('Usuario', nombres.map((n, i) => ({ etiqueta: n, valor: i })), { buscar: false });
      if (v === undefined) return;
      usuario = v === 0 ? '' : nombres[v]; pUs.poner(nombres[v]);
    });
    pUs.poner('Todos los usuarios');
    const d = dialogo({
      titulo,
      cuerpo: [h('label', { class: 'radio' }, rHoy, ' Hoy'), h('label', { class: 'radio' }, rAyer, ' Ayer'), h('label', { class: 'radio' }, rRango, ' Rango de fechas'), cajaRango,
        usuarios ? etiqueta('Usuario que emitió') : null, usuarios ? pUs : null, nota ? h('p', { class: 'nota' }, nota) : null],
      botones: [{ texto: 'Cancelar' }, { texto: textoBoton, clase: 'primario', onclick: () => {
        let a = hoy, b = hoy;
        if (rAyer.checked) { a = ayer; b = ayer; } else if (rRango.checked) { a = desde; b = hasta; if (!a || !b) { toast('Elija las dos fechas.'); return false; } }
        if ((new Date(b) - new Date(a)) / 86400000 > 366) { toast('El rango máximo es de un año.'); return false; }
        hecho = true; res({ desde: a, hasta: b, usuario }); } }]
    });
    d.alCerrar = () => { if (!hecho) res(null); };
  });
}
