// Pestaña «Reportes» (solo administradores): comparativos de cosechas con los datos del Google Sheet «Históricos».
import { h, clear, toast, elegir, normalizar, diaHoy, ahoraTxt, confirmar, dialogo } from './util.js';
import { puede } from './users.js';
import { modoPruebas } from './store.js';
import { historicos, pasarAHistoricos } from './sync.js';
import { elegirVarios } from './util.js';
import { barraCompacta, hojaFiltros, guardadosDe, elegirPeriodo } from './ui_filtros.js';
import { tarjeta, etiqueta, banda, selector, boton, verDocumento, cabSub } from './ui.js';
import { crearVentasExp } from './ui_export.js';
import { cargarFuentes, paginasReporte, lienzoGrafico } from './draw.js';
import { desplazar, sumarDias, FILTROS, opcionesFiltro, filtrar, suma, cajF, parseFilas, cosechasDe, ultimaFecha, armarReporte, filasExcel, celdaTxt, pctSigno, fmtFechaDMA, VISTAS, DIMENSIONES, inicioAnio, MEDIDAS, MEDIDAS_INI, AGRUPACIONES } from './rep_calc.js';

const LLAVE_CACHE = 'cajuelas_hist' + (modoPruebas ? '_t' : '');
const MIN_REFRESCO = 30; // minutos antes de volver a pedir los datos al abrir la pestaña
const VERSION_CACHE = 2; // 2 = trae estatus, IVA y días
function leerCache() { try { const o = JSON.parse(localStorage.getItem(LLAVE_CACHE) || 'null'); return o && o.v === VERSION_CACHE ? o : null; } catch { return null; } }
function guardarCache(o) { try { localStorage.setItem(LLAVE_CACHE, JSON.stringify(o)); } catch { /* sin espacio: se pedirá de nuevo */ } }

export function crearReportes(nav) {
  const raiz = h('div', { class: 'pagina' });
  let datos = null;              // {filas (objetos), cosechas, t, actualizado}
  const nuevoF = () => ({ cos: '', desde: '', corte: '', per: 'cosecha', fl: {}, dim: 'Mes', solo: false, dims: ['soc'], med: [...MEDIDAS_INI], comp: [], compFor: '', modo: 'fecha', graf: true });
  let f = nuevoF();
  let vista = 'comparativo';
  let pantalla = 'inicio';       // 'inicio' (tarjetas por fuente) o 'detalle' (un reporte)
  let cargando = false, errorCarga = '';

  const estado = h('p', { class: 'nota estado-datos' });
  const actualizarTodo = () => { cargar(true); exp.cargar(true); };
  let busqueda = '';
  const guard = guardadosDe('cafe');
  const barra = barraCompacta();
  // Cosecha: se cambia desde la hoja de filtros (fila «Cosecha»).
  // ---- Periodo unificado ----
  const ref = () => ultimaFecha(datos.filas, f.cos);
  function aplicarPer(per, d, hasta) {
    f.per = per;
    const ult = ref();
    if (per === 'hoy') { f.desde = ult; f.corte = ult; }
    else if (per === 'semana') { const dow = (new Date(ult + 'T12:00:00Z').getUTCDay() + 6) % 7; f.desde = sumarDias(ult, -dow); f.corte = ult; }
    else if (per === 'mes') { f.desde = ult.slice(0, 8) + '01'; f.corte = ult; }
    else if (per === 'rango') { f.desde = d; f.corte = hasta; }
    else { f.desde = ''; f.corte = ult; }
  }
  const dm = (x) => (x ? `${x.slice(8, 10)}/${x.slice(5, 7)}` : '');
  function textoPeriodo() {
    if (!datos || !f.cos) return 'Periodo';
    const ult = ref();
    const base = { hoy: ult === diaHoy() ? `Hoy ${dm(ult)}` : `Último día ${dm(ult)}`, semana: `Esta semana (${dm(f.desde)}–${dm(f.corte)})`, mes: `Este mes (${dm(f.desde)}–${dm(f.corte)})`, rango: `${dm(f.desde)} – ${dm(f.corte)}`, cosecha: 'Toda la cosecha' }[f.per] || 'Toda la cosecha';
    return base;
  }
  async function pedirPer() {
    if (!datos) return;
    const r = await elegirPeriodo({ actual: f.per, desde: f.desde, hasta: f.corte, ref: ref() });
    if (!r) return;
    aplicarPer(r.per, r.desde, r.hasta); pintarFiltros(); pintar(); pintarInicio();
  }
  async function elegirCosechaDlg() {
    const cs = cosechasDe(datos.filas);
    const v = await elegir('Cosecha', cs.map((c) => ({ etiqueta: c, valor: c })), { buscar: false });
    if (v === undefined) return;
    f.cos = v; f.compFor = ''; ajustarComp(); aplicarPer(f.per === 'rango' ? 'cosecha' : f.per); f.fl = {};
    pintarFiltros(); pintar(); pintarInicio();
  }
  async function elegirComparar() {
    const v = await elegir('Comparar con', [{ etiqueta: 'Cosechas anteriores (a la misma fecha)', valor: false }, { etiqueta: 'Sin comparar (solo esta cosecha)', valor: true }], { buscar: false });
    if (v === undefined) return;
    f.solo = v; pintarFiltros(); pintar();
  }
  // ---- Opciones del reporte personalizado ----
  const chipsDim = h('div', { class: 'chips envuelve chicas' });
  const chipsMed = h('div', { class: 'chips envuelve chicas' });
  const chipsComp = h('div', { class: 'chips envuelve chicas' });
  const chipsModo = h('div', { class: 'chips envuelve chicas' });
  const chkGraf = h('input', { type: 'checkbox' });
  chkGraf.addEventListener('change', () => { f.graf = chkGraf.checked; pintar(); });
  const cuerpoOp = h('div', null,
    etiqueta('Columnas de texto (toque las que quiera, en el orden que quiera)'), chipsDim,
    etiqueta('Datos que se suman (toque los que quiera)'), chipsMed,
    etiqueta('Comparar con otras cosechas'), chipsComp, chipsModo,
    h('label', { class: 'radio' }, chkGraf, ' Mostrar gráficos'));
  const btnOp = h('button', { type: 'button', class: 'btn-texto ancho', onclick: () => { cuerpoOp.hidden = !cuerpoOp.hidden; btnOp.textContent = cuerpoOp.hidden ? 'Mostrar opciones del reporte ▾' : 'Ocultar opciones ▴'; } }, 'Ocultar opciones ▴');
  const opPers = tarjeta(cuerpoOp, btnOp);
  function ajustarComp() {
    if (!datos || !f.cos || f.compFor === f.cos) return;
    f.comp = []; f.compFor = f.cos; // por defecto solo la cosecha elegida; las demás se tocan para comparar
  }
  function pintarOpPers() {
    clear(chipsDim); clear(chipsMed); clear(chipsComp); clear(chipsModo);
    AGRUPACIONES.forEach((d) => {
      const pos = f.dims.indexOf(d.k);
      chipsDim.append(h('button', { type: 'button', class: 'chip' + (pos >= 0 ? ' on' : ''), onclick: () => {
        f.dims = pos >= 0 ? f.dims.filter((x) => x !== d.k) : [...f.dims, d.k]; pintarOpPers(); pintar();
      } }, (pos >= 0 && f.dims.length > 1 ? (pos + 1) + '. ' : '') + d.t));
    });
    MEDIDAS.forEach((m) => chipsMed.append(h('button', { type: 'button', class: 'chip' + (f.med.includes(m.k) ? ' on' : ''), onclick: () => {
      f.med = f.med.includes(m.k) ? (f.med.length > 1 ? f.med.filter((x) => x !== m.k) : f.med) : [...f.med, m.k]; pintarOpPers(); pintar();
    } }, m.t)));
    const otras = datos ? cosechasDe(datos.filas).filter((c) => c !== f.cos) : [];
    if (!otras.length) chipsComp.append(h('span', { class: 'nota' }, 'No hay otras cosechas cargadas.'));
    otras.forEach((c) => chipsComp.append(h('button', { type: 'button', class: 'chip' + (f.comp.includes(c) ? ' on' : ''), onclick: () => {
      f.comp = f.comp.includes(c) ? f.comp.filter((x) => x !== c) : [...f.comp, c]; pintarOpPers(); pintar();
    } }, c)));
    [['fecha', 'A la misma fecha'], ['completa', 'Cosecha completa']].forEach(([k, t]) => chipsModo.append(h('button', { type: 'button', class: 'chip' + (f.modo === k ? ' on' : ''), onclick: () => { f.modo = k; pintarOpPers(); pintar(); } }, t)));
  }
  // ---- Filtros: hoja inferior + chips activos ----
  async function abrirFiltro(k) {
    if (!datos) return;
    const x = FILTROS.find((y) => y.k === k);
    const ops = opcionesFiltro(datos.filas, f.cos, f.fl, k);
    const otros = FILTROS.filter((y) => y.k !== k && (f.fl[y.k] || []).length).length;
    const r = await elegirVarios(x.t, ops, f.fl[k] || [], { detalle: `${ops.length} ${ops.length === 1 ? 'opción' : 'opciones'}${otros ? ' con los otros filtros ya elegidos' : ''}. Toque las que quiera; sin marcar ninguna son todas.` });
    if (r === undefined) return;
    if (r.length) f.fl[k] = r; else delete f.fl[k];
    pintarFiltros(); pintar();
  }
  const textoFiltro = (x) => { const v = f.fl[x.k]; return v.length === 1 ? `${x.t}: ${v[0]}` : `${x.t}: ${v.length}`; };
  const nActivos = () => FILTROS.filter((x) => (f.fl[x.k] || []).length).length + (f.solo && vista !== 'personalizado' ? 1 : 0);
  const nRecibos = () => (datos && f.cos ? filtrar(datos.filas, f.cos, f.corte || ref(), f, f.desde || '').length : 0);
  const estadoGuardable = () => ({ fl: JSON.parse(JSON.stringify(f.fl)), per: f.per, desde: f.per === 'rango' ? f.desde : '', corte: f.per === 'rango' ? f.corte : '', solo: !!f.solo });
  function aplicarGuardado(e) {
    f.fl = JSON.parse(JSON.stringify(e.fl || {})); f.solo = !!e.solo; aplicarPer(e.per || 'cosecha', e.desde, e.corte);
    pintarFiltros(); pintar();
  }
  function abrirHoja() {
    if (!datos) return;
    hojaFiltros({
      titulo: 'Filtros · Café recibido', guardados: guard, guardable: estadoGuardable, aplicar: aplicarGuardado,
      limpiar: () => { f.fl = {}; f.solo = false; aplicarPer('cosecha'); pintarFiltros(); pintar(); },
      contar: () => `Ver resultados · ${nRecibos()} recibos`,
      alCerrar: () => { pintarFiltros(); pintar(); pintarInicio(); },
      filas: () => [
        { t: 'Cosecha', valor: f.cos, abrir: elegirCosechaDlg },
        { t: 'Periodo', valor: textoPeriodo(), on: f.per !== 'cosecha', abrir: pedirPer },
        { t: 'Comparar con', valor: f.solo ? 'Sin comparar' : 'Cosechas anteriores', on: f.solo, abrir: elegirComparar },
        ...FILTROS.map((x) => { const v = f.fl[x.k] || []; return { t: x.t, valor: !v.length ? 'Todos' : v.length === 1 ? v[0] : `${v.length} de ${opcionesFiltro(datos.filas, f.cos, {}, x.k).length}`, on: v.length > 0, abrir: () => abrirFiltro(x.k) }; })
      ]
    });
  }
  // Segmento rápido Todos / Interno / Externo (sobre el filtro Cliente)
  const esInterno = (v) => normalizar(v) === 'interno';
  function segmento() {
    const cli = f.fl.cli || [];
    const set = (k) => {
      if (k === 'todos') delete f.fl.cli;
      else {
        const ops = opcionesFiltro(datos.filas, f.cos, { ...f.fl, cli: [] }, 'cli');
        const l = ops.filter((o) => (k === 'interno' ? esInterno(o) : !esInterno(o)));
        if (l.length) f.fl.cli = l; else { toast(k === 'interno' ? 'No hay clientes internos con estos filtros.' : 'No hay clientes externos con estos filtros.'); return; }
      }
      pintarFiltros(); pintar();
    };
    const on = !cli.length ? 'todos' : cli.length === 1 && esInterno(cli[0]) ? 'interno' : cli.some(esInterno) ? '' : 'externo';
    return { opciones: [['todos', 'Todos'], ['interno', 'Interno'], ['externo', 'Externo']].map(([k, t]) => ({ t, on: on === k, click: () => set(k) })) };
  }
  const barraFiltros = h('div', { class: 'barra-filtros' }, barra.el);
  const chips = h('div', { class: 'chips' });
  const zona = h('div', { class: 'rep-zona' });
  const barraDim = h('div', { class: 'chips chicas', hidden: true });
  const agrupar = h('div', { class: 'agrupar' }, etiqueta('Agrupar por'), chips);
  const btnCompartir = boton('Compartir PDF', 'compartir', 'c-azul ancho-total compartir-fijo', () => compartirReporte());

  function pintarFiltros() {
    const pers = vista === 'personalizado';
    opPers.hidden = !pers || !datos;
    if (pers) { chkGraf.checked = f.graf !== false; pintarOpPers(); }
    barraFiltros.hidden = !datos;
    if (!datos) return;
    const act = FILTROS.filter((x) => (f.fl[x.k] || []).length);
    const activos = act.map((x) => ({ t: textoFiltro(x), abrir: () => abrirFiltro(x.k), quitar: () => { delete f.fl[x.k]; pintarFiltros(); pintar(); } }));
    if (!pers && f.solo) activos.push({ t: 'Sin comparar', abrir: elegirComparar, quitar: () => { f.solo = false; pintarFiltros(); pintar(); } });
    const gs = guard.lista().map((g) => ({ n: g.n, on: JSON.stringify(g.est.fl || {}) === JSON.stringify(f.fl) && (g.est.per || 'cosecha') === f.per && !!g.est.solo === !!f.solo, click: () => aplicarGuardado(g.est) }));
    barra.pintar({ periodo: textoPeriodo(), nFiltros: nActivos(), onPeriodo: pedirPer, onFiltros: abrirHoja, segmento: segmento(), guardados: gs, activos,
      onLimpiar: () => { f.fl = {}; f.solo = false; pintarFiltros(); pintar(); } });
  }
  function pintarChips() {
    clear(chips);
    VISTAS.forEach(([k, t]) => chips.append(h('button', { type: 'button', class: 'chip' + (k === vista ? ' on' : ''), onclick: () => { vista = k; pintarChips(); pintarFiltros(); pintar(); } }, t)));
    clear(barraDim);
    DIMENSIONES.forEach((d) => barraDim.append(h('button', { type: 'button', class: 'chip' + (d === f.dim ? ' on' : ''), onclick: () => { f.dim = d; pintarChips(); pintar(); } }, d)));
    barraDim.hidden = vista !== 'desglose';
  }

  // ---------- Carga de datos ----------
  function usar(o) {
    datos = { filas: parseFilas(o.filas), cosechas: o.cosechas || [], t: o.t, actualizado: o.actualizado || '' };
    const cs = cosechasDe(datos.filas);
    if (!cs.includes(f.cos)) { f.cos = cs[0] || ''; f.corte = ''; f.per = 'cosecha'; f.desde = ''; }
    if (!f.corte || f.per !== 'rango') aplicarPer(f.per === 'rango' ? 'cosecha' : f.per, f.desde, f.corte);
    ajustarComp();
    errorCarga = '';
  }
  async function cargar(forzar) {
    if (cargando) return;
    const cache = leerCache();
    if (!forzar && cache && Date.now() - cache.t < MIN_REFRESCO * 60000) { if (!datos) usar(cache); pintarTodo(); return; }
    if (cache && !datos) { usar(cache); pintarTodo(); }
    cargando = true; pintarEstado();
    const r = await historicos();
    cargando = false;
    if (r.error) {
      errorCarga = r.error;
      if (cache && !datos) usar(cache);
      if (forzar) toast(r.error + (datos ? '\nSe muestran los últimos datos guardados.' : ''), 7000);
    } else {
      const o = { v: VERSION_CACHE, t: Date.now(), filas: r.filas, cosechas: r.cosechas, actualizado: r.actualizado };
      guardarCache(o); usar(o);
      if (forzar) toast('Datos actualizados desde Históricos.');
    }
    pintarTodo();
  }
  function pintarEstado() {
    if (cargando) estado.textContent = 'Descargando datos de Históricos…';
    else if (datos) estado.textContent = `Históricos: ${datos.filas.length} filas · cosechas ${[...new Set(datos.filas.map((r) => r.cos))].sort().join(', ')}${datos.actualizado ? ' · actualizado ' + datos.actualizado : ''}${errorCarga ? '\n⚠ ' + errorCarga : ''}`;
    else estado.textContent = errorCarga ? '⚠ ' + errorCarga : 'Todavía no hay datos. Toque «Actualizar datos».';
    estado.style.whiteSpace = 'pre-line';
  }

  // ---------- Reporte en pantalla ----------
  let ultimo = null;
  function tablaHtml(rep) {
    const t = h('table', { class: 'tabla-rep' });
    t.append(h('thead', null, h('tr', null, ...rep.cols.map((c, i) => h('th', { class: i === 0 ? 'fija' : '' }, c.t)))));
    const cuerpo = h('tbody');
    rep.filas.forEach((r) => {
      const tr = h('tr', { class: (r.negrita ? 'total ' : '') + (r.accion ? 'clic ' : '') + (r.fondo === '#FEF3C7' ? 'destacada' : '') });
      r.v.forEach((v, i) => {
        const c = rep.cols[i];
        const neg = c.tipo === 'pct' && typeof v === 'number' && v < -0.0005, pos = c.tipo === 'pct' && typeof v === 'number' && v > 0.0005;
        tr.append(h('td', { class: (i === 0 ? 'fija ' : '') + (c.tipo !== 'txt' ? 'der ' : '') + (neg ? 'neg ' : '') + (pos ? 'pos' : '') }, celdaTxt(c, v)));
      });
      if (r.accion) tr.addEventListener('click', () => { f.fl.soc = [r.accion.soc]; vista = 'fincas'; pintarFiltros(); pintarChips(); pintar(); window.scrollTo(0, 0); });
      cuerpo.append(tr);
    });
    t.append(cuerpo);
    return h('div', { class: 'tabla-scroll' }, t);
  }
  function pintar() {
    clear(zona);
    pintarEstado();
    btnCompartir.hidden = true;
    if (!datos) {
      zona.append(tarjeta(h('p', { class: 'nota' }, cargando ? 'Descargando…' : 'Para ver los reportes la app necesita leer el Google Sheet «Históricos». Revise que en la hoja Configuración del libro de Google Sheets esté el enlace en la fila «Históricos» y toque «Actualizar datos».')));
      return;
    }
    if (!f.cos) { zona.append(tarjeta(h('p', { class: 'nota' }, 'El archivo Históricos no tiene datos.'))); return; }
    const rep = armarReporte(vista, datos.filas, f);
    ultimo = rep;
    zona.append(h('h2', { class: 'rep-titulo' }, rep.titulo), h('p', { class: 'nota', style: 'white-space:pre-line' }, rep.subtitulos.join('\n')));
    if (!rep.ctx.base.rows.length) zona.append(h('p', { class: 'estado aviso' }, 'No hay datos con estos filtros en la fecha de corte.'));
    if (rep.kpis && rep.kpis.length) {
      zona.append(h('div', { class: 'kpis' }, ...rep.kpis.map((k) => h('div', { class: 'kpi' },
        h('small', null, k.t), h('b', null, k.v),
        k.d != null ? h('span', { class: k.d < -0.0005 ? 'neg' : 'pos' }, `${pctSigno(k.d)} ${k.ref}`) : h('span', null, ' ')))));
    }
    if (rep.datos && rep.datos.length) zona.append(h('div', { class: 'tarjeta rep-datos' }, h('b', null, 'Datos de interés'), ...rep.datos.map((t) => h('p', null, t))));
    (rep.graficos || []).forEach((g) => {
      const alto = g.tipo === 'barrasH' ? Math.max(200, 56 + g.cats.length * (g.series.length > 2 ? 40 : g.series.length > 1 ? 30 : 22)) : 250;
      const cv = lienzoGrafico(g, 360, alto);
      cv.classList.add('grafico');
      zona.append(h('div', { class: 'tarjeta grafico-caja' }, cv));
    });
    if (rep.filas.length > 8 && vista !== 'comparativo' && vista !== 'dia') {
      const q = h('input', { class: 'campo', type: 'search', placeholder: 'Buscar en la tabla…', value: busqueda, autocomplete: 'off' });
      const filtrarTabla = () => { const t = normalizar(q.value).split(' ').filter(Boolean); busqueda = q.value; zona.querySelectorAll('.tabla-rep tbody tr:not(.total)').forEach((tr) => { const x = normalizar(tr.firstChild.textContent); tr.hidden = !t.every((k) => x.includes(k)); }); };
      q.addEventListener('input', filtrarTabla);
      zona.append(q, tablaHtml(rep));
      if (busqueda) filtrarTabla();
    } else if (rep.filas.length) zona.append(tablaHtml(rep));
    if (rep.nota) zona.append(h('p', { class: 'nota' }, rep.nota));
    btnCompartir.hidden = false;
  }
  function pintarTodo() { pintarFiltros(); pintarChips(); pintar(); pintarInicio(); }

  // ---------- Compartir ----------
  async function compartirReporte() {
    if (!ultimo) return;
    await cargarFuentes();
    const pie = `Generado ${ahoraTxt()} · Fuente: Históricos${datos && datos.actualizado ? ' (' + datos.actualizado + ')' : ''}`;
    const extra = [`Periodo: ${textoPeriodo()}`, ...(vista === 'personalizado' ? [] : [f.solo ? 'Sin comparar con otras cosechas' : 'Comparado con cosechas anteriores a la misma fecha'])];
    const gn = guard.lista().find((g) => JSON.stringify(g.est.fl || {}) === JSON.stringify(f.fl) && (g.est.per || 'cosecha') === f.per && !!g.est.solo === !!f.solo);
    if (gn) extra.push('Filtro guardado: ' + gn.n);
    const paginas = paginasReporte({ ...ultimo, subtitulos: [...ultimo.subtitulos, extra.join(' · ')] }, pie);
    const sello = `${ultimo.vista}_${f.cos}_${f.desde ? f.desde.replace(/-/g, '') + '_' : ''}${(f.corte || diaHoy()).replace(/-/g, '')}`;
    verDocumento({
      titulo: ultimo.titulo, paginas, nombrePdf: `Reporte_${sello}.pdf`, ancho: true, maxPaginas: 4,
      textoBoton: 'Compartir PDF',
      intro: ultimo.subtitulos[0]
    });
  }

  // ---------- Pasar el día a Históricos (solo administradores) ----------
  async function pasarDia(fecha) {
    btnPasar.disabled = true;
    try {
      toast('Revisando recibos de Diario…');
      const v = await pasarAHistoricos({ fecha, soloVer: true });
      if (v.error) { toast(v.error, 7000); return; }
      const miles = (n) => Number(n).toLocaleString('es-CR', { maximumFractionDigits: 2 });
      let texto = `${v.lineas} línea(s) · ${miles(v.cajuelas)} cajuelas (${miles(v.cajuelas / 20)} fanegas) del ${fmtFechaDMA(fecha)}.\nUna línea por sociedad y finca, sin los recibos anulados. El tipo queda en M.`;
      if (v.reemplaza) texto += `\n\nYa se habían pasado ${v.reemplaza} línea(s) de este día: se reemplazan (se conservan el tipo y el N° de recibo que haya escrito).`;
      if (v.sinSociedad && v.sinSociedad.length) texto += `\n\n⚠ Sociedades que no están en la hoja «Sociedades» de Históricos:\n• ${v.sinSociedad.join('\n• ')}`;
      if (v.sinFinca && v.sinFinca.length) texto += `\n\n⚠ Fincas sin número en la hoja «Fincas»:\n• ${v.sinFinca.join('\n• ')}`;
      if (!await confirmar('Pasar a Históricos', texto, { si: 'Pasar al Históricos' })) return;
      let forzar = false;
      if (v.manuales) {
        if (!await confirmar('Ese día ya tiene líneas', `En Históricos ya hay ${v.manuales} línea(s) del ${fmtFechaDMA(fecha)} escritas a mano. Si continúa se agregan las de Diario además de esas (podrían quedar repetidas).`, { si: 'Agregar de todos modos', peligro: true })) return;
        forzar = true;
      }
      toast('Pasando a Históricos…');
      const r = await pasarAHistoricos({ fecha, forzar });
      if (r.error) { toast(r.error, 8000); return; }
      toast(r.message, 6000);
      try { localStorage.removeItem(LLAVE_CACHE); } catch { /* nada */ }
      cargar(true);
    } finally { btnPasar.disabled = false; }
  }
  const btnPasar = { disabled: false };
  function abrirPasar() {
    const iPasar = h('input', { class: 'campo', type: 'date', value: diaHoy() });
    dialogo({
      titulo: 'Pasar un día a Históricos',
      cuerpo: [h('p', { class: 'nota' }, 'Solo administradores. Escoja el día de Diario que quiere pasar. Si vuelve a pasar el mismo día, las líneas se actualizan (no se duplican).'), iPasar],
      botones: [{ texto: 'Cancelar' }, { texto: 'Revisar', clase: 'primario', onclick: () => { if (!iPasar.value) { toast('Escoja la fecha del día.'); return false; } const fch = iPasar.value; setTimeout(() => pasarDia(fch), 0); } }]
    });
  }
  async function menuMas() {
    const op = [{ etiqueta: '↻ Actualizar datos', valor: 'act' }];
    if (puede('todos')) op.push({ etiqueta: 'Pasar día a Históricos', valor: 'pasar' });
    const v = await elegir('Reportes', op, { buscar: false });
    if (v === 'act') actualizarTodo(); else if (v === 'pasar') abrirPasar();
  }
  const tarjAcciones = tarjeta(estado);

  // ---------- Inicio: tarjetas por fuente de datos ----------
  const inicio = h('div', { class: 'rep-inicio' });
  const detalle = h('div', { class: 'rep-detalle', hidden: true }, barraFiltros, agrupar, barraDim, opPers, zona, btnCompartir);
  const bandaInicio = banda('Reportes');
  const btnRefrescar = h('button', { type: 'button', class: 'hub-menu', 'aria-label': 'Actualizar datos', onclick: actualizarTodo }, '↻');
  const btnMas = h('button', { type: 'button', class: 'hub-menu', 'aria-label': 'Más opciones', onclick: menuMas }, '⋯');
  bandaInicio.append(btnMas);
  const cabDetalle = cabSub('Café recibido', () => ir('inicio'));
  cabDetalle.hidden = true;
  const exp = crearVentasExp({ abrir: () => ir('exp'), volver: () => ir('inicio'), alCambiar: () => { if (pantalla === 'inicio') pintarInicio(); } });
  exp.cab.hidden = true;
  function ir(p) { pantalla = p; mostrar(); window.scrollTo(0, 0); }
  function mostrar() {
    const det = pantalla === 'detalle';
    const ex = pantalla === 'exp';
    bandaInicio.hidden = det || ex; inicio.hidden = det || ex; cabDetalle.hidden = !det; detalle.hidden = !det; exp.cab.hidden = !ex; exp.el.hidden = !ex;
  }
  const colones = (v) => '₡ ' + Math.round(v).toLocaleString('es-CR').replace(/[  ]/g, ' ');
  function sparkline(valores) {
    const ns = 'http://www.w3.org/2000/svg', W = 300, H = 44;
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('class', 'spark'); s.setAttribute('aria-hidden', 'true');
    if (valores.length < 2) return s;
    const mx = Math.max(...valores), mn = Math.min(...valores), rg = mx - mn || 1;
    const pts = valores.map((v, i) => `${(i / (valores.length - 1) * (W - 4) + 2).toFixed(1)},${(H - 4 - (v - mn) / rg * (H - 8)).toFixed(1)}`).join(' ');
    const l = document.createElementNS(ns, 'polyline'); l.setAttribute('points', pts); l.setAttribute('fill', 'none'); l.setAttribute('stroke', 'var(--verde)'); l.setAttribute('stroke-width', '2.5'); l.setAttribute('stroke-linejoin', 'round'); l.setAttribute('stroke-linecap', 'round'); l.setAttribute('vector-effect', 'non-scaling-stroke');
    s.append(l); return s;
  }
  function serieAcumulada(rows) {
    const porDia = new Map();
    rows.forEach((r) => porDia.set(r.f, (porDia.get(r.f) || 0) + r.caj));
    let acc = 0; const v = [...porDia.keys()].sort().map((k) => (acc += porDia.get(k)));
    if (v.length <= 40) return v;
    return Array.from({ length: 40 }, (_, i) => v[Math.round(i * (v.length - 1) / 39)]);
  }
  function hace() {
    if (!datos || !datos.t) return '';
    const m = Math.max(0, Math.round((Date.now() - datos.t) / 60000));
    return m < 1 ? 'Actualizado ahora' : m < 60 ? `Actualizado hace ${m} min` : m < 1440 ? `Actualizado hace ${Math.round(m / 60)} h` : `Actualizado hace ${Math.round(m / 1440)} d`;
  }
  function pintarInicio() {
    clear(inicio);
    if (!datos || !f.cos) {
      inicio.append(exp.tarjetaHub(actualizarTodo), tarjeta(h('p', { class: 'nota' }, cargando ? 'Descargando…' : datos ? 'El archivo Históricos no tiene datos.' : 'Para ver los reportes la app necesita leer el Google Sheet «Históricos». Revise que en la hoja Configuración del libro de Google Sheets esté el enlace en la fila «Históricos» y toque ↻.')), tarjAcciones);
      return;
    }
    const corte = f.corte || ref();
    const rows = filtrar(datos.filas, f.cos, corte, {}, f.desde || '');
    const t = suma(rows);
    const todas = cosechasDe(datos.filas), ant = todas.filter((c) => inicioAnio(c) < inicioAnio(f.cos))[0];
    let pill = null, pillNeg = false;
    if (ant) {
      const dif = inicioAnio(ant) - inicioAnio(f.cos);
      const tp = suma(filtrar(datos.filas, ant, desplazar(corte, dif), {}, f.desde ? desplazar(f.desde, dif) : ''));
      if (tp.caj > 0) { const d = t.caj / tp.caj - 1; pillNeg = d < -0.0005; pill = `${pctSigno(d)} vs ${ant}`; }
    }
    const subeBaja = pill ? h('p', { class: 'vs ' + (pillNeg ? 'baja' : 'sube') }, (pillNeg ? '▼ ' : '▲ ') + pill) : null;
    const cafe = h('div', { class: 'fuente toque hub-fuente', role: 'button', tabindex: '0', onclick: () => ir('detalle') },
      h('button', { type: 'button', class: 'hub-ref', 'aria-label': 'Actualizar todo', onclick: (e) => { e.stopPropagation(); actualizarTodo(); } }, '↻'),
      h('div', { class: 'fuente-cab' }, h('h3', null, '☕ Café recibido')),
      h('p', { class: 'hub-fecha' }, h('i'), `Cosecha ${f.cos} · hasta ${fmtFechaDMA(corte)}`),
      h('p', { class: 'hub-act' }, '↻ ' + (hace() || 'Sin actualizar') + (errorCarga ? ' · ⚠ sin conexión' : '')),
      h('div', { class: 'hub-dos' },
        h('div', null, h('p', { class: 'hub-et' }, 'Cajuelas'), h('p', { class: 'hub-v' }, cajF(t.caj)), h('p', { class: 'sub' }, `${cajF(t.fan)} fanegas · ${t.n} recibos`)),
        h('div', null, h('p', { class: 'hub-et' }, 'Adelantos'), h('p', { class: 'hub-v' }, colones(t.ade)), h('p', { class: 'sub' }, `Intereses ${colones(t.int)}`))),
      subeBaja, h('span', { class: 'hub-flecha', 'aria-hidden': 'true' }, '›'));
    inicio.append(cafe, exp.tarjetaHub(actualizarTodo), tarjAcciones);
  }

  raiz.append(bandaInicio, cabDetalle, exp.cab, inicio, detalle, exp.el);
  barraFiltros.hidden = true; opPers.hidden = true; btnCompartir.hidden = true;
  pintarChips(); pintarEstado(); pintarInicio(); mostrar();
  return {
    el: raiz,
    refrescar() { /* no hace falta: los datos se leen al abrir la pestaña */ },
    // Cada vez que se entra a la pestaña empieza limpia: filtros por defecto y datos al día.
    reiniciar() {
      f = nuevoF(); vista = 'comparativo'; pantalla = 'inicio'; mostrar(); busqueda = '';
      exp.reiniciar();
      const cache = leerCache();
      if (cache) usar(cache);
      pintarTodo();
      cargar(false);
    },
    estadoDatos() { return { ok: !!datos, filas: datos ? datos.filas.length : 0, cosechas: datos ? cosechasDe(datos.filas) : [], error: errorCarga, t: datos ? datos.t : 0 }; }
  };
}
