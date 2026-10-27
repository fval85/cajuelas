// «Ventas de exportación» dentro de Reportes: lee el Google Sheet «Exportaciones» (archivo aparte que el usuario edita).
import { h, clear, toast, normalizar, diaHoy, ahoraTxt, elegirVarios } from './util.js';
import { modoPruebas } from './store.js';
import { exportaciones } from './sync.js';
import { tarjeta, etiqueta, boton, verDocumento, cabSub } from './ui.js';
import { cargarFuentes, paginasReporte, lienzoGrafico } from './draw.js';
import { celdaTxt } from './rep_calc.js';
import { parseExp, FILTROS, filtrar, opcionesFiltro, armarReporte, VISTAS, DIMENSIONES, MEDIDAS, MEDIDAS_INI, GRAFICOS, grafIni, dinero$, dec2, ent0 } from './exp_calc.js';

const LLAVE = 'cajuelas_exp' + (modoPruebas ? '_t' : '');
const MIN_REFRESCO = 30;
const leerCache = () => { try { const o = JSON.parse(localStorage.getItem(LLAVE) || 'null'); return o && o.v === 1 ? o : null; } catch { return null; } };
const guardarCache = (o) => { try { localStorage.setItem(LLAVE, JSON.stringify(o)); } catch { /* sin espacio: se pedirá de nuevo */ } };

export function crearVentasExp({ abrir, volver, alCambiar }) {
  let crudo = null, datos = null, error = '', cargando = false;
  let f = { fl: {}, dims: ['comp'], med: [...MEDIDAS_INI], graf: grafIni() };
  let vista = 'contratos', filtrosAbiertos = false, ultimo = null;

  const cab = cabSub('Ventas de exportación', volver);
  const estado = h('p', { class: 'nota estado-datos' });
  const chips = h('div', { class: 'chips' });
  // ---- Filtros ----
  const chipsActivos = h('div', { class: 'chips envuelve chicas filtros-activos' });
  const chipsAgregar = h('div', { class: 'chips envuelve chicas' });
  const btnLimpiar = h('button', { type: 'button', class: 'btn-texto limpiar', onclick: () => { f.fl = {}; pintarFiltros(); pintar(); } }, 'Limpiar todos');
  const panelFiltros = tarjeta(etiqueta('Agregar filtro'), chipsAgregar);
  const btnFiltros = h('button', { type: 'button', class: 'chip', onclick: () => { filtrosAbiertos = !filtrosAbiertos; pintarFiltros(); } }, '+ Filtro ▾');
  const barraFiltros = h('div', { class: 'barra-filtros' }, h('div', { class: 'chips envuelve chicas fila-chips' }, btnFiltros), chipsActivos, btnLimpiar, panelFiltros);
  async function abrirFiltro(k) {
    if (!datos) return;
    const x = FILTROS.find((y) => y.k === k);
    const ops = opcionesFiltro(datos.contratos, f.fl, k);
    const otros = FILTROS.filter((y) => y.k !== k && (f.fl[y.k] || []).length).length;
    const r = await elegirVarios(x.t, ops, f.fl[k] || [], { detalle: `${ops.length} ${ops.length === 1 ? 'opción' : 'opciones'}${otros ? ' con los otros filtros ya elegidos' : ''}. Toque las que quiera; sin marcar ninguna son todas.` });
    if (r === undefined) return;
    if (r.length) f.fl[k] = r; else delete f.fl[k];
    pintarFiltros(); pintar();
  }
  const textoFiltro = (x) => { const v = f.fl[x.k]; return v.length === 1 ? `${x.t}: ${v[0]}` : `${x.t}: ${v.length}`; };
  function pintarFiltros() {
    clear(chipsActivos); clear(chipsAgregar);
    const act = FILTROS.filter((x) => (f.fl[x.k] || []).length);
    act.forEach((x) => chipsActivos.append(h('span', { class: 'chip on con-x' },
      h('button', { type: 'button', class: 'txt', onclick: () => abrirFiltro(x.k) }, textoFiltro(x)),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Quitar el filtro ' + x.t, onclick: () => { delete f.fl[x.k]; pintarFiltros(); pintar(); } }, '✕'))));
    FILTROS.filter((x) => !(f.fl[x.k] || []).length).forEach((x) => chipsAgregar.append(h('button', { type: 'button', class: 'chip', onclick: () => abrirFiltro(x.k) }, '+ ' + x.t)));
    chipsActivos.hidden = !act.length; btnLimpiar.hidden = act.length < 2;
    btnFiltros.textContent = `+ Filtro${act.length ? ' (' + act.length + ')' : ''} ${filtrosAbiertos ? '▴' : '▾'}`;
    btnFiltros.classList.toggle('on', act.length > 0);
    panelFiltros.hidden = !filtrosAbiertos;
    barraFiltros.hidden = !datos;
  }
  // ---- Opciones del reporte ----
  const chipsDim = h('div', { class: 'chips envuelve chicas' });
  const chipsMed = h('div', { class: 'chips envuelve chicas' });
  const chipsGraf = h('div', { class: 'chips envuelve chicas' });
  const bloquePers = h('div', null, etiqueta('Agrupar por (toque en el orden que quiera)'), chipsDim, etiqueta('Datos que se suman'), chipsMed);
  const bloqueGraf = h('div', null, etiqueta('Gráficos'), chipsGraf);
  const opciones = tarjeta(bloquePers, bloqueGraf);
  function pintarOpciones() {
    clear(chipsDim); clear(chipsMed); clear(chipsGraf);
    DIMENSIONES.forEach((d) => {
      const pos = f.dims.indexOf(d.k);
      chipsDim.append(h('button', { type: 'button', class: 'chip' + (pos >= 0 ? ' on' : ''), onclick: () => {
        f.dims = pos >= 0 ? (f.dims.length > 1 ? f.dims.filter((x) => x !== d.k) : f.dims) : [...f.dims, d.k]; pintarOpciones(); pintar();
      } }, (pos >= 0 && f.dims.length > 1 ? (pos + 1) + '. ' : '') + d.t));
    });
    MEDIDAS.forEach((m) => chipsMed.append(h('button', { type: 'button', class: 'chip' + (f.med.includes(m.k) ? ' on' : ''), onclick: () => {
      f.med = f.med.includes(m.k) ? (f.med.length > 1 ? f.med.filter((x) => x !== m.k) : f.med) : [...f.med, m.k]; pintarOpciones(); pintar();
    } }, m.t)));
    GRAFICOS.forEach(([k, t]) => chipsGraf.append(h('button', { type: 'button', class: 'chip' + (f.graf[k] ? ' on' : ''), onclick: () => { f.graf[k] = !f.graf[k]; pintarOpciones(); pintar(); } }, t)));
    bloquePers.hidden = vista !== 'personalizado';
    bloqueGraf.hidden = vista === 'entregas';
    opciones.hidden = !datos || (vista === 'entregas');
  }
  function pintarChips() {
    clear(chips);
    VISTAS.forEach(([k, t]) => chips.append(h('button', { type: 'button', class: 'chip' + (k === vista ? ' on' : ''), onclick: () => { vista = k; pintarChips(); pintarOpciones(); pintar(); } }, t)));
  }

  // ---- Reporte en pantalla ----
  const zona = h('div', { class: 'rep-zona' });
  const btnCompartir = boton('Compartir PDF', 'compartir', 'c-azul ancho-total', () => compartir());
  function tablaHtml(rep) {
    const t = h('table', { class: 'tabla-rep centrada' });
    t.append(h('thead', null, h('tr', null, ...rep.cols.map((c, i) => h('th', { class: i === 0 ? 'fija' : '' }, c.t)))));
    const cuerpo = h('tbody');
    rep.filas.forEach((r) => {
      const tr = h('tr', { class: r.negrita ? 'total' : '' });
      r.v.forEach((v, i) => {
        const c = rep.cols[i];
        const neg = c.neg && typeof v === 'number' && v < -0.0005, pos = c.neg && c.sig === 'fav' && typeof v === 'number' && v > 0.0005;
        tr.append(h('td', { class: (i === 0 ? 'fija ' : '') + (neg ? 'neg ' : '') + (pos ? 'pos' : '') }, celdaTxt(c, v)));
      });
      cuerpo.append(tr);
    });
    t.append(cuerpo);
    return h('div', { class: 'tabla-scroll' }, t);
  }
  function pintarEstado() {
    if (cargando) estado.textContent = 'Descargando datos de Exportaciones…';
    else if (datos) estado.textContent = `Exportaciones: ${datos.contratos.length} contratos · ${datos.entregas.length} entregas${crudo && crudo.actualizado ? ' · actualizado ' + crudo.actualizado : ''}${error ? '\n⚠ ' + error : ''}`;
    else estado.textContent = error ? '⚠ ' + error : 'Todavía no hay datos. Toque «Actualizar datos» en Reportes.';
    estado.style.whiteSpace = 'pre-line';
  }
  function pintar() {
    clear(zona); pintarEstado(); btnCompartir.hidden = true;
    if (!datos) { zona.append(tarjeta(h('p', { class: 'nota' }, cargando ? 'Descargando…' : 'Para ver estos reportes la app necesita leer el Google Sheet «Exportaciones». Revise que en la hoja Configuración esté el enlace en la fila «Exportaciones» y toque «Actualizar datos».'))); return; }
    const rep = armarReporte(vista, datos, f);
    ultimo = rep;
    zona.append(h('h2', { class: 'rep-titulo centrado' }, rep.titulo), h('p', { class: 'nota centrado', style: 'white-space:pre-line' }, rep.subtitulos.join('\n')));
    if (!rep.ctx.n) { zona.append(h('p', { class: 'estado aviso' }, 'No hay contratos con estos filtros.')); return; }
    zona.append(h('div', { class: 'kpis centrada' }, ...rep.kpis.map((k) => h('div', { class: 'kpi' }, h('small', null, k.t), h('b', null, k.v)))));
    if (rep.datos.length) zona.append(h('div', { class: 'tarjeta rep-datos' }, h('b', null, 'Datos de interés'), ...rep.datos.map((t) => h('p', null, t))));
    rep.graficos.forEach((g) => {
      const alto = Math.max(200, 56 + g.cats.length * (g.series.length > 2 ? 40 : g.series.length > 1 ? 30 : 22));
      const cv = lienzoGrafico(g, 360, alto); cv.classList.add('grafico');
      zona.append(h('div', { class: 'tarjeta grafico-caja' }, cv));
    });
    if (rep.filas.length) zona.append(tablaHtml(rep));
    else zona.append(h('p', { class: 'nota centrado' }, 'Este contrato todavía no tiene entregas en la pestaña Entregas.'));
    if (rep.nota) zona.append(h('p', { class: 'nota centrado' }, rep.nota));
    btnCompartir.hidden = false;
  }
  async function compartir() {
    if (!ultimo) return;
    await cargarFuentes();
    const pie = `Generado ${ahoraTxt()} · Fuente: Exportaciones${crudo && crudo.actualizado ? ' (' + crudo.actualizado + ')' : ''}`;
    const paginas = paginasReporte(ultimo, pie);
    verDocumento({ titulo: ultimo.titulo, paginas, nombrePdf: `Exportaciones_${ultimo.vista}_${diaHoy().replace(/-/g, '')}.pdf`, ancho: true, maxPaginas: 4, textoBoton: 'Compartir PDF', intro: ultimo.subtitulos[0] });
  }
  const el = h('div', { class: 'rep-detalle', hidden: true }, chips, barraFiltros, opciones, zona, btnCompartir);

  // ---- Datos ----
  function usar(o) {
    crudo = o; datos = parseExp(o); error = '';
  }
  async function cargar(forzar) {
    if (cargando) return;
    const cache = leerCache();
    if (!forzar && cache && Date.now() - cache.t < MIN_REFRESCO * 60000) { if (!datos) usar(cache); redibujar(); return; }
    if (cache && !datos) { usar(cache); redibujar(); }
    cargando = true; pintarEstado();
    const r = await exportaciones();
    cargando = false;
    if (r.error) {
      error = r.error;
      if (cache && !datos) usar(cache);
      if (forzar) toast('Exportaciones: ' + r.error + (datos ? '\nSe muestran los últimos datos guardados.' : ''), 7000);
    } else {
      const o = { v: 1, t: Date.now(), resumen: r.resumen, contratos: r.contratos, entregas: r.entregas, pagos: r.pagos, actualizado: r.actualizado };
      guardarCache(o); usar(o);
      if (forzar) toast('Datos de Exportaciones actualizados.');
    }
    redibujar();
  }
  function redibujar() { pintarFiltros(); pintarChips(); pintarOpciones(); pintar(); alCambiar(); }

  // ---- Tarjeta de la pantalla inicial de Reportes ----
  function tarjetaHub() {
    const cab3 = (sub) => h('div', { class: 'fuente-cab' }, h('h3', null, '🚢 Ventas de exportación'), h('span', null, 'Exportaciones'));
    if (!datos) {
      return h('div', { class: 'fuente vacia' }, cab3(), h('p', { class: 'sub' }, cargando ? 'Descargando datos…' : error ? '⚠ ' + error : 'Toque «Actualizar datos» para traer los contratos del archivo Exportaciones.'));
    }
    const rows = filtrar(datos.contratos, {});
    const S = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
    const pct = S('sacC') ? Math.min(100, Math.round(S('sacE') / S('sacC') * 100)) : 0;
    const cosechas = [...new Set(rows.map((r) => r.cos).filter(Boolean))].sort().reverse();
    return h('div', { class: 'fuente' }, cab3(),
      h('p', { class: 'sub' }, `${rows.length} ${rows.length === 1 ? 'contrato' : 'contratos'}${cosechas.length ? ' · cosecha ' + cosechas.join(', ') : ''}`),
      h('p', { class: 'cifra' }, `${ent0(S('sacP'))} sacos por entregar`),
      h('p', { class: 'sub' }, `Entregado ${dinero$(S('monE'))} · Por cobrar ${dinero$(S('cobrar'))}`),
      h('div', { class: 'progreso', role: 'img', 'aria-label': `${pct}% de los sacos entregados` }, h('i', { style: `width:${pct}%` })),
      h('p', { class: 'sub' }, `${ent0(S('sacE'))} de ${ent0(S('sacC'))} sacos entregados (${pct}%)`),
      h('div', { class: 'chips envuelve chicas' }, ...VISTAS.map(([k, t]) => h('button', { type: 'button', class: 'chip', onclick: () => { vista = k; pintarChips(); pintarOpciones(); pintar(); abrir(); } }, t))));
  }
  pintarChips(); pintarOpciones(); pintarFiltros(); pintarEstado();
  return {
    cab, el, tarjetaHub, cargar,
    reiniciar() { f = { fl: {}, dims: ['comp'], med: [...MEDIDAS_INI], graf: grafIni() }; vista = 'contratos'; filtrosAbiertos = false; const c = leerCache(); if (c) usar(c); redibujar(); cargar(false); },
    estado
  };
}
