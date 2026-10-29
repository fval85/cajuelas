// «Ventas de exportación» dentro de Reportes: lee el Google Sheet «Exportaciones» (archivo aparte que el usuario edita).
// Pestañas: Contratos (tarjetas), Seguimiento (por entregar / por cobrar / cerrados + alertas) y Tablas (reportes con PDF).
import { h, clear, toast, normalizar, diaHoy, ahoraTxt, elegirVarios, elegir } from './util.js';
import { modoPruebas, db } from './store.js';
import { exportaciones } from './sync.js';
import { tarjeta, etiqueta, boton, verDocumento } from './ui.js';
import { barraCompacta, hojaFiltros, guardadosDe } from './ui_filtros.js';
import { cargarFuentes, paginasReporte, lienzoGrafico } from './draw.js';
import { celdaTxt } from './rep_calc.js';
import { parseExp, FILTROS, filtrar, opcionesFiltro, armarReporte, reporteContrato, estadoCuenta, VISTAS, DIMENSIONES, MEDIDAS, MEDIDAS_INI, GRAFICOS, grafIni, dinero$, dec2, ent0, SEM_TXT, mesTxt, hoyIso } from './exp_calc.js';

const LLAVE = 'cajuelas_exp' + (modoPruebas ? '_t' : '');
const MIN_REFRESCO = 30;
const leerCache = () => { try { const o = JSON.parse(localStorage.getItem(LLAVE) || 'null'); return o && o.v === 1 ? o : null; } catch { return null; } };
const guardarCache = (o) => { try { localStorage.setItem(LLAVE, JSON.stringify(o)); } catch { /* sin espacio: se pedirá de nuevo */ } };
const fechaCorta = (x) => (x ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : 's/f');
const ORDEN_SEM = { rojo: 0, ambar: 1, gris: 2, verde: 3 };

export function crearVentasExp({ abrir, volver, alCambiar }) {
  let crudo = null, datos = null, error = '', cargando = false;
  let f = { fl: {}, dims: ['comp'], med: [...MEDIDAS_INI], graf: grafIni() };
  let vista = 'contratos', tab = 'contratos', sub = 'entregar', detalleId = null, ultimo = null;
  const guard = guardadosDe('exp');

  // ---- Cabecera: «‹ Ventas de exportación» o «‹ Contrato X» ----
  const tituloCab = h('h1', null, 'Ventas de exportación');
  const cab = h('header', { class: 'cab-sub' }, h('button', { type: 'button', class: 'atras', 'aria-label': 'Volver', onclick: () => atras() }, '‹'), tituloCab);
  function atras() { if (detalleId) { detalleId = null; redibujar(); window.scrollTo(0, 0); } else volver(); }

  const estado = h('p', { class: 'nota estado-datos' });
  const barra = barraCompacta();
  const tabs = h('div', { class: 'seg seg-tabs', role: 'tablist' });
  const barraFiltros = h('div', { class: 'barra-filtros' }, barra.el);

  // ---------- Filtros ----------
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
  const nContratos = () => (datos ? filtrar(datos.contratos, f.fl).length : 0);
  const estadoGuardable = () => ({ fl: JSON.parse(JSON.stringify(f.fl)) });
  // «Mes actual»: el filtro guardado «Por entregar este mes» se resuelve con el mes de hoy.
  function aplicarGuardado(e) {
    const fl = JSON.parse(JSON.stringify(e.fl || {}));
    if (e.mesActual) fl.mes = [mesTxt(hoyIso().slice(0, 7))];
    f.fl = fl; pintarFiltros(); pintar();
  }
  function sembrar() {
    try {
      if (db.get('exp_sembrados', false)) return;
      guard.agregar('Por cobrar', { fl: { cob: ['Pendiente', 'Pago Parcial'] } });
      guard.agregar('Por entregar este mes', { fl: { ent: ['Por Entregar', 'Entrega Parcial'] }, mesActual: true });
      db.set('exp_sembrados', true);
    } catch { /* nada */ }
  }
  function abrirHoja() {
    if (!datos) return;
    hojaFiltros({
      titulo: 'Filtros · Ventas de exportación', guardados: guard, guardable: estadoGuardable, aplicar: aplicarGuardado,
      limpiar: () => { f.fl = {}; pintarFiltros(); pintar(); },
      contar: () => `Ver resultados · ${nContratos()} contratos`,
      alCerrar: () => { pintarFiltros(); pintar(); },
      filas: () => FILTROS.map((x) => { const v = f.fl[x.k] || []; return { t: x.t, valor: !v.length ? 'Todos' : v.length === 1 ? v[0] : `${v.length} de ${opcionesFiltro(datos.contratos, {}, x.k).length}`, on: v.length > 0, abrir: () => abrirFiltro(x.k) }; })
    });
  }
  function segmento() {
    const tipos = [...new Set(datos.contratos.map((c) => c.tipo).filter(Boolean))].sort();
    const cur = f.fl.tipo || [];
    const set = (t) => { if (t) f.fl.tipo = [t]; else delete f.fl.tipo; pintarFiltros(); pintar(); };
    return { opciones: [{ t: 'Todos', on: !cur.length, click: () => set('') }, ...tipos.map((t) => ({ t: t === 'EXP' ? 'Exportación' : t === 'CN' ? 'Nacional' : t, on: cur.length === 1 && normalizar(cur[0]) === normalizar(t), click: () => set(t) }))] };
  }
  function pintarFiltros() {
    barraFiltros.hidden = !datos || !!detalleId;
    if (!datos) return;
    const act = FILTROS.filter((x) => (f.fl[x.k] || []).length);
    const activos = act.map((x) => ({ t: textoFiltro(x), abrir: () => abrirFiltro(x.k), quitar: () => { delete f.fl[x.k]; pintarFiltros(); pintar(); } }));
    const gs = guard.lista().map((g) => ({ n: g.n, on: !g.est.mesActual && JSON.stringify(g.est.fl || {}) === JSON.stringify(f.fl), click: () => aplicarGuardado(g.est) }));
    barra.pintar({ nFiltros: act.length, onFiltros: abrirHoja, segmento: segmento(), guardados: gs, activos, onLimpiar: () => { f.fl = {}; pintarFiltros(); pintar(); } });
  }
  function pintarTabs() {
    clear(tabs);
    [['contratos', 'Contratos'], ['seguimiento', 'Seguimiento'], ['tablas', 'Tablas']].forEach(([k, t]) => tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'on' : '', onclick: () => { tab = k; detalleId = null; redibujar(); } },
      t, k === 'seguimiento' && datos && datos.alertas.lista.length ? h('span', { class: 'punto-alerta' }, String(datos.alertas.lista.length)) : null)));
    tabs.hidden = !datos || !!detalleId;
  }

  // ---------- Opciones de Tablas ----------
  const chips = h('div', { class: 'chips' });
  const chipsDim = h('div', { class: 'chips envuelve chicas' });
  const chipsMed = h('div', { class: 'chips envuelve chicas' });
  const chipsGraf = h('div', { class: 'chips envuelve chicas' });
  const bloquePers = h('div', null, etiqueta('Agrupar por (toque en el orden que quiera)'), chipsDim, etiqueta('Datos que se suman'), chipsMed);
  const bloqueGraf = h('div', null, etiqueta('Gráficos'), chipsGraf);
  const opciones = tarjeta(bloquePers, bloqueGraf);
  const agrupar = h('div', { class: 'agrupar' }, etiqueta('Agrupar por'), chips);
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
    opciones.hidden = !datos || tab !== 'tablas' || vista === 'entregas';
    agrupar.hidden = !datos || tab !== 'tablas';
  }
  function pintarChips() {
    clear(chips);
    VISTAS.forEach(([k, t]) => chips.append(h('button', { type: 'button', class: 'chip' + (k === vista ? ' on' : ''), onclick: () => { vista = k; pintarChips(); pintarOpciones(); pintar(); } }, t)));
  }

  // ---------- Contenido ----------
  const zona = h('div', { class: 'rep-zona' });
  const btnCompartir = boton('Compartir PDF', 'compartir', 'c-azul ancho-total compartir-fijo', () => compartir());
  function tablaHtml(rep) {
    const t = h('table', { class: 'tabla-rep centrada' });
    t.append(h('thead', null, h('tr', null, ...rep.cols.map((c, i) => h('th', { class: i === 0 ? 'fija' : '' }, c.t)))));
    const cuerpo = h('tbody');
    rep.filas.forEach((r) => {
      const tr = h('tr', { class: (r.negrita ? 'total ' : '') + (r.sem ? 'sem-' + r.sem : '') });
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
    else estado.textContent = error ? '⚠ ' + error : 'Todavía no hay datos. Toque ↻ en Reportes.';
    estado.style.whiteSpace = 'pre-line';
  }
  const punto = (sem) => h('span', { class: 'semaforo sem-' + sem, 'aria-hidden': 'true' });
  const chipSem = (sem) => h('span', { class: 'estado-chip sem-' + sem }, SEM_TXT[sem]);
  const barraProg = (c) => {
    const pct = c.sacC ? Math.min(100, Math.round(c.sacE / c.sacC * 100)) : 0;
    return h('div', { class: 'progreso', role: 'img', 'aria-label': `${pct}% de los sacos entregados` }, h('i', { style: `width:${pct}%` }));
  };
  const ordenar = (l) => l.slice().sort((a, b) => ORDEN_SEM[a.sem] - ORDEN_SEM[b.sem] || a.id.localeCompare(b.id, 'es', { numeric: true }));

  function tarjetaContrato(c) {
    const al = datos.alertas.por.get(c.id) || [];
    return h('div', { class: 'tarj-contrato', role: 'button', tabindex: '0', onclick: () => { detalleId = c.id; redibujar(); window.scrollTo(0, 0); } },
      h('h3', null, h('span', null, punto(c.sem), c.id), chipSem(c.sem)),
      h('p', { class: 'sub' }, `${c.comp} · ${c.tipo} · ${c.cos}`),
      barraProg(c),
      h('p', { class: 'sub' }, `${ent0(c.sacE)} de ${ent0(c.sacC)} sacos entregados · faltan ${ent0(c.sacP)}`),
      h('p', { class: 'sub' }, `Entregado ${dinero$(c.monE)} · Pagado ${dinero$(c.pag)} · Por cobrar ${dinero$(c.cobrar)}`),
      al.length ? h('p', { class: 'sub alerta-txt' }, '⚠ ' + al.map((a) => a.t).join(' · ')) : null);
  }
  function pintarContratos() {
    const filas = ordenar(filtrar(datos.contratos, f.fl));
    zona.append(h('p', { class: 'nota' }, `${filas.length} ${filas.length === 1 ? 'contrato' : 'contratos'}${Object.keys(f.fl).length ? ' con los filtros elegidos' : ''}. Toque uno para ver su detalle.`));
    if (!filas.length) zona.append(h('p', { class: 'estado aviso' }, 'No hay contratos con estos filtros.'));
    filas.forEach((c) => zona.append(tarjetaContrato(c)));
  }

  // ---- Seguimiento ----
  function alertasVista(filas) {
    const ids = new Set(filas.map((c) => c.id));
    const l = datos.alertas.lista.filter((a) => !a.id || ids.has(a.id));
    if (!l.length) return h('p', { class: 'nota' }, '✓ Sin alertas: ningún contrato requiere atención.');
    return h('div', null, h('div', { class: 'titulo-grupo' }, `Alertas (${l.length})`), ...l.map((a) => h('div', { class: 'alerta' + (a.nivel === 'roja' ? ' roja' : ''), role: a.id ? 'button' : null, onclick: a.id ? () => { detalleId = a.id; redibujar(); window.scrollTo(0, 0); } : null },
      h('span', { 'aria-hidden': 'true' }, a.nivel === 'roja' ? '⛔' : '⚠'), h('span', null, h('b', null, a.id || 'Datos'), a.t))));
  }
  function filaSeg(c, der, sub2) {
    return h('div', { class: 'tarj-contrato', role: 'button', tabindex: '0', onclick: () => { detalleId = c.id; redibujar(); window.scrollTo(0, 0); } },
      h('h3', null, h('span', null, punto(c.sem), c.id), h('span', { class: 'der' }, der)), h('p', { class: 'sub' }, `${c.comp} · ${sub2}`));
  }
  async function pdfEstadoCuenta(comp) {
    await cargarFuentes();
    const rep = estadoCuenta(datos, comp);
    const pie = `Generado ${ahoraTxt()} · Fuente: Exportaciones${crudo && crudo.actualizado ? ' (' + crudo.actualizado + ')' : ''}`;
    verDocumento({ titulo: rep.titulo, paginas: paginasReporte(rep, pie), nombrePdf: `Estado_de_cuenta_${comp.replace(/[^A-Za-z0-9]+/g, '_')}_${diaHoy().replace(/-/g, '')}.pdf`, ancho: true, maxPaginas: 2, textoBoton: 'Compartir PDF', intro: rep.subtitulos[0], textoCompartir: `Estado de cuenta de ${comp}` });
  }
  function pintarSeguimiento() {
    const filas = filtrar(datos.contratos, f.fl);
    zona.append(alertasVista(filas));
    const seg = h('div', { class: 'seg seg-sub', role: 'tablist' }, ...[['entregar', 'Por entregar'], ['cobrar', 'Por cobrar'], ['cerrados', 'Cerrados']].map(([k, t]) => h('button', { type: 'button', class: sub === k ? 'on' : '', onclick: () => { sub = k; redibujar(); } }, t)));
    zona.append(seg);
    if (sub === 'entregar') {
      const l = filas.filter((c) => ['por entregar', 'entrega parcial'].includes(normalizar(c.ent))).sort((a, b) => (a.fent || '9999').localeCompare(b.fent || '9999') || a.id.localeCompare(b.id, 'es', { numeric: true }));
      zona.append(h('p', { class: 'nota' }, `${l.length} contratos con café pendiente · ${ent0(l.reduce((t, c) => t + c.sacP, 0))} sacos por entregar`));
      if (!l.length) zona.append(h('p', { class: 'estado aviso' }, 'No hay entregas pendientes.'));
      l.forEach((c) => zona.append(filaSeg(c, `${ent0(c.sacP)} sacos`, `entrega prevista ${fechaCorta(c.fent)}`)));
    } else if (sub === 'cobrar') {
      const l = filas.filter((c) => c.cobrar > 0.005).sort((a, b) => b.cobrar - a.cobrar);
      const porComp = new Map();
      l.forEach((c) => porComp.set(c.comp, (porComp.get(c.comp) || 0) + c.cobrar));
      zona.append(h('div', { class: 'titulo-grupo' }, 'Pendiente por comprador'));
      if (!porComp.size) zona.append(h('p', { class: 'estado aviso' }, 'No hay montos pendientes de cobro.'));
      [...porComp.entries()].sort((a, b) => b[1] - a[1]).forEach(([comp, m]) => zona.append(h('div', { class: 'tarj-contrato' },
        h('h3', null, h('span', null, comp), h('span', { class: 'der' }, dinero$(m))),
        h('p', { class: 'sub' }, `${l.filter((c) => c.comp === comp).length} contratos con saldo`),
        h('button', { type: 'button', class: 'btn-texto ancho', onclick: () => pdfEstadoCuenta(comp) }, '📄 Estado de cuenta (PDF)'))));
      if (l.length) zona.append(h('div', { class: 'titulo-grupo' }, 'Contratos con saldo'));
      l.forEach((c) => zona.append(filaSeg(c, dinero$(c.cobrar), `entregado ${dinero$(c.monE)} · pagado ${dinero$(c.pag)}`)));
    } else {
      const l = filas.filter((c) => c.sem === 'verde').sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
      zona.append(h('p', { class: 'nota' }, `${l.length} contratos cerrados y pagados`));
      if (!l.length) zona.append(h('p', { class: 'estado aviso' }, 'Todavía no hay contratos cerrados y pagados.'));
      l.forEach((c) => zona.append(filaSeg(c, dinero$(c.pag), 'cerrado y pagado')));
    }
  }

  // ---- Detalle de un contrato ----
  const par = (t, v) => h('div', null, h('small', null, t), h('b', null, v));
  async function compartirContrato(c) {
    await cargarFuentes();
    const rep = reporteContrato(datos, c);
    const pie = `Generado ${ahoraTxt()} · Fuente: Exportaciones${crudo && crudo.actualizado ? ' (' + crudo.actualizado + ')' : ''}`;
    verDocumento({ titulo: rep.titulo, paginas: paginasReporte(rep, pie), nombrePdf: `Contrato_${c.id.replace(/[^A-Za-z0-9.]+/g, '_')}_${diaHoy().replace(/-/g, '')}.pdf`, ancho: true, maxPaginas: 2, textoBoton: 'Compartir PDF del contrato', intro: rep.subtitulos[0], textoCompartir: `Contrato ${c.id} · ${c.comp}` });
  }
  function pintarDetalle() {
    const c = datos.contratos.find((x) => x.id === detalleId);
    if (!c) { detalleId = null; return pintarContratos(); }
    tituloCab.textContent = 'Contrato ' + c.id;
    const al = datos.alertas.por.get(c.id) || [];
    const ents = datos.entregas.filter((e) => e.id === c.id).sort((a, b) => String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')));
    const pagos = datos.pagos.filter((p) => p.id === c.id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    zona.append(
      h('div', { class: 'tarjeta' },
        h('div', { class: 'fuente-cab' }, h('h3', null, punto(c.sem), c.id), chipSem(c.sem)),
        h('p', { class: 'sub' }, `${c.comp} · ${c.tipo} · cosecha ${c.cos}${c.fent ? ' · entrega prevista ' + fechaCorta(c.fent) : ''}`),
        barraProg(c),
        h('p', { class: 'sub' }, `${ent0(c.sacE)} de ${ent0(c.sacC)} sacos entregados (${c.sacC ? Math.round(c.sacE / c.sacC * 100) : 0}%) · Entrega: ${c.ent || '—'} · Cobro: ${c.cob || '—'}`)),
      ...al.map((a) => h('div', { class: 'alerta' + (a.nivel === 'roja' ? ' roja' : '') }, h('span', { 'aria-hidden': 'true' }, a.nivel === 'roja' ? '⛔' : '⚠'), h('span', null, a.t))),
      h('div', { class: 'tarjeta' }, h('div', { class: 'pares' },
        par('Sacos del contrato', ent0(c.sacC)), par('Sacos por entregar', ent0(c.sacP)),
        par('Kilos entregados', dec2(c.kgE)), par('Kilos por entregar', dec2(c.kgP)),
        par('Monto del contrato', dinero$(c.monC)), par('Monto entregado', dinero$(c.monE)),
        par('Pagado', dinero$(c.pag)), par('Por cobrar', dinero$(c.cobrar)),
        par('Kilos a favor / contra', c.fav == null ? '—' : dec2(c.fav)), par('Efecto en $', c.efe == null ? '—' : dinero$(c.efe)))),
      h('div', { class: 'tarjeta' }, h('b', null, 'Para cerrar el contrato'),
        h('div', { class: 'pares' }, par('Sacos sugeridos', c.sug == null ? '—' : ent0(c.sug)), par('Promedio kg por saco', c.prom == null ? '—' : dec2(c.prom)))),
      h('div', { class: 'titulo-grupo' }, `Entregas (${ents.length})`));
    if (!ents.length) zona.append(h('p', { class: 'nota' }, 'Este contrato todavía no tiene entregas en la hoja Entregas.'));
    else zona.append(h('div', { class: 'tarjeta' }, h('div', { class: 'linea-tiempo' }, ...ents.map((e) => {
      const dif = e.sob ? `sobrante ${dec2(e.sob)} kg` : e.fal ? `faltante ${dec2(e.fal)} kg` : '';
      return h('div', { class: 'ev' }, h('b', null, `${e.fecha ? fechaCorta(e.fecha) : 'Por entregar'} · ${ent0(e.sacos)} sacos`),
        h('small', null, `${e.boleta ? 'Boleta ' + e.boleta + ' · ' : ''}${dec2(e.kg)} kg enviados${e.neto != null ? ' · neto ' + dec2(e.neto) + ' kg' : ''}${dif ? ' · ' + dif : ''}`),
        h('small', null, e.guia || ''));
    }))));
    zona.append(h('div', { class: 'titulo-grupo' }, `Pagos (${pagos.length})`));
    if (!pagos.length) zona.append(h('p', { class: 'nota' }, 'Todavía no hay pagos registrados.'));
    else zona.append(h('div', { class: 'tarjeta' }, ...pagos.map((p) => h('p', { class: 'fila-pago' }, `${fechaCorta(p.fecha)} · ${dinero$(p.monto)}${p.nota ? ' · ' + p.nota : ''}`))));
  }

  // ---- Tablas (reportes con gráficos y PDF) ----
  function pintarTablas() {
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
  function pintar() {
    clear(zona); pintarEstado(); btnCompartir.hidden = true;
    tituloCab.textContent = 'Ventas de exportación';
    if (!datos) { zona.append(tarjeta(h('p', { class: 'nota' }, cargando ? 'Descargando…' : 'Para ver estos reportes la app necesita leer el Google Sheet «Exportaciones». Revise que en la hoja Configuración esté el enlace en la fila «Exportaciones» y toque ↻ en Reportes.'))); return; }
    if (detalleId) { pintarDetalle(); const c = datos.contratos.find((x) => x.id === detalleId); if (c) zona.append(boton('Compartir PDF del contrato', 'compartir', 'c-azul ancho-total', () => compartirContrato(c))); return; }
    if (tab === 'contratos') pintarContratos();
    else if (tab === 'seguimiento') pintarSeguimiento();
    else pintarTablas();
  }
  async function compartir() {
    if (!ultimo) return;
    await cargarFuentes();
    const pie = `Generado ${ahoraTxt()} · Fuente: Exportaciones${crudo && crudo.actualizado ? ' (' + crudo.actualizado + ')' : ''}`;
    const paginas = paginasReporte(ultimo, pie);
    verDocumento({ titulo: ultimo.titulo, paginas, nombrePdf: `Exportaciones_${ultimo.vista}_${diaHoy().replace(/-/g, '')}.pdf`, ancho: true, maxPaginas: 4, textoBoton: 'Compartir PDF', intro: ultimo.subtitulos[0] });
  }
  const el = h('div', { class: 'rep-detalle', hidden: true }, tabs, barraFiltros, agrupar, opciones, zona, btnCompartir);

  // ---- Datos ----
  function usar(o) { crudo = o; datos = parseExp(o); error = ''; }
  async function cargar(forzar) {
    if (cargando) return;
    const cache = leerCache();
    if (!forzar && cache && Date.now() - cache.t < MIN_REFRESCO * 60000) { if (!datos) usar(cache); redibujar(); return; }
    if (cache && !datos) { usar(cache); redibujar(); }
    cargando = true; pintarEstado(); alCambiar();
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
  function redibujar() { pintarTabs(); pintarFiltros(); pintarChips(); pintarOpciones(); pintar(); alCambiar(); }

  // ---- Tarjeta de la pantalla inicial de Reportes ----
  function tarjetaHub(opc = {}) {
    const ocultar = !!(opc.ocultar && opc.ocultar());
    const m = (v, mask) => (ocultar ? mask : v);
    const refBtn = () => h('button', { type: 'button', class: 'hub-ref' + (opc.gira && opc.gira() ? ' gira' : ''), 'aria-label': 'Actualizar todo', onclick: (e) => { e.stopPropagation(); if (opc.alRefrescar) opc.alRefrescar(); } }, '↻');
    const cab3 = () => h('div', { class: 'fuente-cab' }, h('h3', null, '🚢 Ventas de exportación'));
    if (!datos) {
      return h('div', { class: 'fuente vacia hub-fuente' }, refBtn(), cab3(), h('p', { class: 'sub' }, cargando ? 'Descargando datos…' : error ? '⚠ ' + error : 'Toque ↻ para traer los contratos del archivo Exportaciones.'));
    }
    const rows = filtrar(datos.contratos, {});
    const S = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
    const pct = S('sacC') ? Math.min(100, Math.round(S('sacE') / S('sacC') * 100)) : 0;
    const cosechas = [...new Set(rows.map((r) => r.cos).filter(Boolean))].sort().reverse();
    const nSem = (k) => rows.filter((r) => r.sem === k).length;
    const nAl = datos.alertas.lista.length;
    const ir = (t, v) => { tab = t; if (v) vista = v; detalleId = null; pintarChips(); redibujar(); abrir(); };
    return h('div', { class: 'fuente toque hub-fuente' + (opc.gira && opc.gira() ? ' carga' : ''), role: 'button', tabindex: '0', onclick: () => ir('contratos') }, refBtn(), cab3(),
      h('p', { class: 'sub' }, `${rows.length} ${rows.length === 1 ? 'contrato' : 'contratos'}${cosechas.length ? ' · cosecha ' + cosechas.join(', ') : ''}`),
      h('div', { class: 'hub-dos' },
        h('div', null, h('p', { class: 'hub-v' }, m(`${ent0(S('sacP'))} sacos`, '**** sacos')), h('p', { class: 'hub-et' }, 'por entregar')),
        h('div', null, h('p', { class: 'hub-v' }, m(dinero$(S('cobrar')), '$ ******')), h('p', { class: 'hub-et' }, 'por cobrar'))),
      h('div', { class: 'progreso', role: 'img', 'aria-label': `${pct}% de los sacos entregados` }, h('i', { style: `width:${pct}%` })),
      h('p', { class: 'sub sem-resumen' }, ...['rojo', 'ambar', 'gris', 'verde'].filter((k) => nSem(k)).map((k) => h('span', null, punto(k), `${nSem(k)} `)), nAl ? `· ${nAl} ${nAl === 1 ? 'alerta' : 'alertas'}` : ''),
      h('span', { class: 'hub-flecha', 'aria-hidden': 'true' }, '›'));
  }
  pintarTabs(); pintarChips(); pintarOpciones(); pintarFiltros(); pintarEstado(); sembrar();
  return {
    cab, el, tarjetaHub, cargar, ocupado: () => cargando,
    reiniciar() { f = { fl: {}, dims: ['comp'], med: [...MEDIDAS_INI], graf: grafIni() }; vista = 'contratos'; tab = 'contratos'; sub = 'entregar'; detalleId = null; sembrar(); const c = leerCache(); if (c) usar(c); redibujar(); cargar(false); },
    estado,
    estadoDatos() { return { ok: !!datos, contratos: datos ? datos.contratos.length : 0, entregas: datos ? datos.entregas.length : 0, pagos: datos ? datos.pagos.length : 0, alertas: datos ? datos.alertas.lista.length : 0, error, t: crudo ? crudo.t : 0 }; }
  };
}
