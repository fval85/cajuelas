// Pestaña «Reportes» (solo administradores): comparativos de cosechas con los datos del Google Sheet «Históricos».
import { h, clear, toast, elegir, normalizar, diaHoy, ahoraTxt, confirmar } from './util.js';
import { puede } from './users.js';
import { modoPruebas } from './store.js';
import { historicos, pasarAHistoricos } from './sync.js';
import { tarjeta, etiqueta, banda, selector, boton, verDocumento } from './ui.js';
import { cargarFuentes, paginasReporte, lienzoGrafico } from './draw.js';
import { parseFilas, cosechasDe, ultimaFecha, armarReporte, filasExcel, celdaTxt, pctSigno, fmtFechaDMA, VISTAS, DIMENSIONES, inicioAnio } from './rep_calc.js';

const LLAVE_CACHE = 'cajuelas_hist' + (modoPruebas ? '_t' : '');
const MIN_REFRESCO = 30; // minutos antes de volver a pedir los datos al abrir la pestaña
function leerCache() { try { return JSON.parse(localStorage.getItem(LLAVE_CACHE) || 'null'); } catch { return null; } }
function guardarCache(o) { try { localStorage.setItem(LLAVE_CACHE, JSON.stringify(o)); } catch { /* sin espacio: se pedirá de nuevo */ } }

export function crearReportes(nav) {
  const raiz = h('div', { class: 'pagina' });
  let datos = null;              // {filas (objetos), cosechas, t, actualizado}
  let f = { cos: '', desde: '', corte: '', soc: '', tipo: '', cli: '', dim: 'Mes', solo: false };
  let vista = 'comparativo';
  let cargando = false, errorCarga = '';

  const estado = h('p', { class: 'nota' });
  const btnAct = boton('Actualizar datos', null, 'c-agregar ancho-total', () => cargar(true));
  const pCos = selector('Cosecha', async () => {
    if (!datos) return;
    const v = await elegir('Cosecha', cosechasDe(datos.filas).map((c) => ({ etiqueta: c, valor: c })), { buscar: false });
    if (v === undefined) return;
    f.cos = v; f.desde = ''; f.corte = ultimaFecha(datos.filas, v); f.soc = ''; pintarFiltros(); pintar();
  });
  const iDesde = h('input', { class: 'campo', type: 'date' });
  iDesde.addEventListener('change', () => { f.desde = iDesde.value || ''; if (f.desde && f.corte && f.desde > f.corte) { f.corte = f.desde; } pintarFiltros(); pintar(); });
  const iCorte = h('input', { class: 'campo', type: 'date' });
  iCorte.addEventListener('change', () => { if (iCorte.value) { f.corte = iCorte.value; if (f.desde && f.desde > f.corte) f.desde = f.corte; pintarFiltros(); pintar(); } });
  const bUltima = h('button', { type: 'button', class: 'btn-texto', onclick: () => { f.desde = ''; f.corte = ultimaFecha(datos.filas, f.cos); pintarFiltros(); pintar(); } }, 'Toda la cosecha hasta la última fecha');
  const pSoc = selector('Todas las sociedades', async () => {
    if (!datos) return;
    const nombres = [...new Set(datos.filas.filter((r) => r.cos === f.cos).map((r) => r.soc).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const v = await elegir('Sociedad', [{ etiqueta: 'Todas las sociedades', valor: '' }, ...nombres.map((n) => ({ etiqueta: n, valor: n }))]);
    if (v === undefined) return;
    f.soc = v; pintarFiltros(); pintar();
  });
  const pTipo = selector('Todos los tipos', async () => {
    if (!datos) return;
    const tipos = [...new Set(datos.filas.map((r) => r.tipo).filter(Boolean))].sort();
    const v = await elegir('Tipo', [{ etiqueta: 'Todos los tipos', valor: '' }, ...tipos.map((n) => ({ etiqueta: n, valor: n }))], { buscar: false });
    if (v === undefined) return;
    f.tipo = v; pintarFiltros(); pintar();
  });
  const iCli = h('input', { class: 'campo', type: 'search', placeholder: 'Cliente (opcional)', autocomplete: 'off' });
  let temporizador = 0;
  iCli.addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { f.cli = iCli.value.trim(); pintar(); }, 350); });

  let panelAbierto = true, busqueda = '';
  const chkSolo = h('input', { type: 'checkbox' });
  chkSolo.addEventListener('change', () => { f.solo = chkSolo.checked; pintar(); });
  const resumenFiltros = h('button', { type: 'button', class: 'resumen-filtros', onclick: () => { panelAbierto = true; pintarFiltros(); window.scrollTo(0, 0); } });
  const btnVer = h('button', { type: 'button', class: 'btn-texto primario ancho', onclick: () => { panelAbierto = false; pintarFiltros(); window.scrollTo(0, 0); } }, 'Ver reporte');
  const tarjFiltros = tarjeta(
    etiqueta('Cosecha'), pCos,
    h('div', { class: 'dos-col' }, h('div', null, etiqueta('Desde'), iDesde), h('div', null, etiqueta('Hasta'), iCorte)), bUltima,
    h('div', { class: 'dos-col' }, h('div', null, etiqueta('Sociedad'), pSoc), h('div', null, etiqueta('Tipo'), pTipo)),
    etiqueta('Cliente'), iCli,
    h('label', { class: 'radio' }, chkSolo, ' Solo esta cosecha (sin comparar con las anteriores)'),
    btnVer
  );
  const chips = h('div', { class: 'chips' });
  const zona = h('div', { class: 'rep-zona' });
  const barraDim = h('div', { class: 'chips chicas', hidden: true });
  const btnCompartir = boton('Compartir PDF', 'compartir', 'c-azul ancho-total', () => compartirReporte());

  function pintarFiltros() {
    pCos.poner(f.cos);
    iDesde.value = f.desde || ''; iCorte.value = f.corte || '';
    pSoc.poner(f.soc); pTipo.poner(f.tipo); chkSolo.checked = !!f.solo;
    tarjFiltros.hidden = !datos || !panelAbierto;
    resumenFiltros.hidden = !datos || panelAbierto;
    const rango = f.desde ? `${fmtFechaDMA(f.desde)} al ${fmtFechaDMA(f.corte)}` : `hasta ${fmtFechaDMA(f.corte)}`;
    resumenFiltros.textContent = `⚙ Cosecha ${f.cos} · ${rango}${f.soc ? ' · ' + f.soc : ''}${f.tipo ? ' · ' + f.tipo : ''}${f.cli ? ' · ' + f.cli : ''}${f.solo ? ' · sin comparar' : ''}  ›  Cambiar`;
  }
  function pintarChips() {
    clear(chips);
    VISTAS.forEach(([k, t]) => chips.append(h('button', { type: 'button', class: 'chip' + (k === vista ? ' on' : ''), onclick: () => { vista = k; pintarChips(); pintar(); } }, t)));
    clear(barraDim);
    DIMENSIONES.forEach((d) => barraDim.append(h('button', { type: 'button', class: 'chip' + (d === f.dim ? ' on' : ''), onclick: () => { f.dim = d; pintarChips(); pintar(); } }, d)));
    barraDim.hidden = vista !== 'desglose';
  }

  // ---------- Carga de datos ----------
  function usar(o) {
    datos = { filas: parseFilas(o.filas), cosechas: o.cosechas || [], t: o.t, actualizado: o.actualizado || '' };
    const cs = cosechasDe(datos.filas);
    if (!cs.includes(f.cos)) { f.cos = cs[0] || ''; f.corte = ''; }
    if (!f.corte) f.corte = ultimaFecha(datos.filas, f.cos);
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
      const o = { t: Date.now(), filas: r.filas, cosechas: r.cosechas, actualizado: r.actualizado };
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
      if (r.accion) tr.addEventListener('click', () => { f.soc = r.accion.soc; vista = 'fincas'; pintarFiltros(); pintarChips(); pintar(); window.scrollTo(0, 0); });
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
    zona.append(h('h2', { class: 'rep-titulo' }, rep.titulo), h('p', { class: 'nota' }, rep.subtitulos.join('\n')));
    if (!rep.ctx.base.rows.length) zona.append(h('p', { class: 'estado aviso' }, 'No hay datos con estos filtros en la fecha de corte.'));
    if (rep.kpis && rep.kpis.length) {
      zona.append(h('div', { class: 'kpis' }, ...rep.kpis.map((k) => h('div', { class: 'kpi' },
        h('small', null, k.t), h('b', null, k.v),
        k.d != null ? h('span', { class: k.d < -0.0005 ? 'neg' : 'pos' }, `${pctSigno(k.d)} ${k.ref}`) : h('span', null, ' ')))));
    }
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
  function pintarTodo() { pintarFiltros(); pintarChips(); pintar(); }

  // ---------- Compartir ----------
  async function compartirReporte() {
    if (!ultimo) return;
    await cargarFuentes();
    const pie = `Generado ${ahoraTxt()} · Fuente: Históricos${datos && datos.actualizado ? ' (' + datos.actualizado + ')' : ''}`;
    const paginas = paginasReporte(ultimo, pie);
    const sello = `${ultimo.vista}_${f.cos}_${f.desde ? f.desde.replace(/-/g, '') + '_' : ''}${(f.corte || diaHoy()).replace(/-/g, '')}`;
    verDocumento({
      titulo: ultimo.titulo, paginas, nombrePdf: `Reporte_${sello}.pdf`, ancho: true, maxPaginas: 4,
      textoBoton: 'Compartir PDF',
      intro: ultimo.subtitulos[0]
    });
  }

  // ---------- Pasar el día a Históricos (solo administradores) ----------
  const iPasar = h('input', { class: 'campo', type: 'date', value: diaHoy() });
  const btnPasar = boton('Revisar y pasar a Históricos', null, 'c-azul ancho-total', async () => {
    const fecha = iPasar.value;
    if (!fecha) { toast('Escoja la fecha del día.'); return; }
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
  });
  const tarjPasar = tarjeta(
    etiqueta('Pasar un día de Diario a Históricos'), iPasar, btnPasar,
    h('p', { class: 'nota' }, 'Solo administradores. Si vuelve a pasar el mismo día, las líneas se actualizan (no se duplican).')
  );
  tarjPasar.hidden = !puede('todos');

  raiz.append(
    banda('Reportes'),
    tarjeta(estado, btnAct),
    tarjPasar,
    tarjFiltros, resumenFiltros, chips, barraDim, zona, btnCompartir
  );
  tarjFiltros.hidden = true; resumenFiltros.hidden = true; btnCompartir.hidden = true;
  pintarChips(); pintarEstado();
  return {
    el: raiz,
    refrescar() { /* no hace falta: los datos se leen al abrir la pestaña */ },
    // Cada vez que se entra a la pestaña empieza limpia: filtros por defecto y datos al día.
    reiniciar() {
      f = { cos: '', desde: '', corte: '', soc: '', tipo: '', cli: '', dim: 'Mes', solo: false }; vista = 'comparativo'; iCli.value = ''; panelAbierto = true; busqueda = '';
      const cache = leerCache();
      if (cache) usar(cache);
      tarjPasar.hidden = !puede('todos'); iPasar.value = diaHoy();
      pintarTodo();
      cargar(false);
    }
  };
}
