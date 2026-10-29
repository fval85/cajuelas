// Pestaña «Boletos»: inventario de fichas de colores.
import { h, clear, toast, aviso, confirmar, elegir, normalizar, fmtNum, diaHoy, diaLegible, ahoraTxt, uuid, stampCorto, dialogo } from './util.js';
import { db, bol, bolCosecha, bolSociedad, cosechaActiva, deviceName, configurado, valorCajuelas, fichaKey } from './store.js';
import { nombreUsuario, puede } from './users.js';
import { boletos, payloadBoleto, tipoBoletoEtiqueta, totalFichas, totalCajuelasMov, filasSaldo, saldoInicial, disponible, inventario, claveLinea, etiquetaFicha,
  BOL_ENTREGA, BOL_REFUERZO, BOL_SALDO, BOL_PERDIDA, BOL_CONTEO } from './data.js';
import { cargarFuentes, paginasBoletos, paginasTablas, MODO } from './draw.js';
import { encolar, movimientosBoletos } from './sync.js';
import { tarjeta, etiqueta, banda, selector, boton, verDocumento, listaBuscable, pedirMotivo, usuarioCoincide, opcionesUsuarios } from './ui.js';
import { normalizarMedida } from './store.js';

/** Grupo de botones con título; si el usuario no puede usar ninguno, todo el grupo se oculta. */
function grupoBotones(titulo, ...botones) {
  return h('div', { class: 'grupo-botones' }, h('p', { class: 'grupo-titulo' }, titulo), h('div', { class: 'fila-botones acciones-g' }, ...botones));
}

export function crearBoletos(nav) {
  const raiz = h('div', { class: 'pagina' });
  let selOficina = db.get('bol_oficina', '');
  let selSociedad = db.get('bol_sociedad', '');
  let fecha = diaHoy();
  let firma = '';
  let inputs = [];
  const cosechaNombre = () => cosechaActiva();
  const bc = () => bolCosecha(cosechaNombre());
  const socActual = () => bolSociedad(bc(), selSociedad);

  const pickOf = selector('Seleccione la oficina', () => elegirOficina());
  const pickSoc = selector('Seleccione la sociedad', () => elegirSociedad());
  const inFecha = h('input', { class: 'campo', type: 'date', value: fecha });
  inFecha.addEventListener('change', () => { if (inFecha.value) { fecha = inFecha.value; reconstruir(); } });
  const infoSaldo = h('div', { class: 'resumen' });
  const cajaFichas = h('div', { class: 'fichas' });

  function refrescar() {
    const c = bc();
    const ofs = c ? c.oficinas : [];
    selOficina = ofs.find((o) => normalizar(o) === normalizar(selOficina)) || (ofs.length === 1 ? ofs[0] : '');
    const socs = c ? c.sociedades : [];
    const s = socs.find((x) => normalizar(x.nombre) === normalizar(selSociedad));
    selSociedad = s ? s.nombre : '';
    pickOf.poner(selOficina); pickSoc.poner(selSociedad);
    if (!puede('todos')) fecha = diaHoy(); // usuarios normales: siempre la fecha de hoy
    inFecha.value = fecha; inFecha.disabled = !puede('todos');
    db.set('bol_oficina', selOficina); db.set('bol_sociedad', selSociedad);
    reconstruir();
  }

  function guardarBorrador() {
    const vals = {};
    inputs.forEach((i) => { vals[i.dataset.k] = i.value; });
    db.set('bol_draft', { sociedad: selSociedad, vals });
  }
  function reconstruir() {
    const soc = socActual();
    const saldo = soc ? saldoInicial(boletos.items(), cosechaNombre(), soc.nombre, deviceName(), fecha) : {};
    const f = (soc ? soc.nombre : '') + '#' + (soc ? soc.fichas.map((x) => fichaKey(x.color, x.medida)).join(',') : '') + '#' + fecha + '#' + JSON.stringify(saldo);
    if (f === firma) return;
    firma = f;
    const previo = db.get('bol_draft', { sociedad: '', vals: {} });
    clear(cajaFichas); inputs = [];
    if (!soc || !soc.fichas.length) {
      const hay = bc() && bc().sociedades.length;
      cajaFichas.append(h('p', { class: 'nota' }, !cosechaNombre() ? 'Primero elija la cosecha activa en Ajustes.'
        : !hay ? `No hay sociedades o fichas para la cosecha «${cosechaNombre()}». Reciba el catálogo de Google Sheets en Ajustes.`
        : soc ? `La sociedad «${soc.nombre}» no tiene fichas en la hoja «Boletos Fichas».` : 'Seleccione la sociedad: aquí aparecerán solo las fichas (colores) de esa sociedad.'));
      infoSaldo.textContent = soc ? 'Sin fichas configuradas' : 'Seleccione la sociedad';
      return;
    }
    let totalIni = 0, cajIni = 0;
    cajaFichas.append(h('p', { class: 'nota' }, `Fichas de ${soc.nombre}`));
    soc.fichas.forEach((fi) => {
      const key = fichaKey(fi.color, fi.medida);
      const ini = saldo[key] || 0;
      totalIni += ini; cajIni += ini * valorCajuelas(fi.medida);
      const inp = h('input', { class: 'campo num', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', placeholder: '0', autocomplete: 'off' });
      inp.dataset.k = key;
      if (normalizar(previo.sociedad) === normalizar(soc.nombre) && previo.vals[key]) inp.value = previo.vals[key];
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, ''); guardarBorrador(); });
      inp.addEventListener('focus', () => inp.select());
      inputs.push(inp);
      cajaFichas.append(h('div', { class: 'ficha' }, h('span', { class: 'ficha-nombre' }, `${fi.color} · ${fi.medida}`.toUpperCase()), h('span', { class: 'ficha-ini' }, `Inicial ${ini}`), inp));
    });
    infoSaldo.textContent = `Saldo inicial de ${diaLegible(fecha)}: ${totalIni} fichas · ${fmtNum(cajIni, 2)} cajuelas`;
  }

  function sinDatos(t) { aviso('Sin datos', t + ' Cárguelas en la hoja de Google y use «Recibir catálogo» en Ajustes.'); }
  async function elegirOficina() {
    const l = bc() ? bc().oficinas : [];
    if (!l.length) return sinDatos('Todavía no hay oficinas para esta cosecha.');
    const v = await elegir('Oficina', l.map((o) => ({ etiqueta: o, valor: o })), { buscar: false });
    if (v !== undefined) { selOficina = v; refrescar(); }
  }
  async function elegirSociedad() {
    const l = bc() ? bc().sociedades : [];
    if (!l.length) return sinDatos('Todavía no hay sociedades con fichas para esta cosecha.');
    const v = await elegir('Sociedad', l.map((s) => ({ etiqueta: s.nombre, valor: s.nombre })), { buscar: false });
    if (v !== undefined) { if (normalizar(selSociedad) !== normalizar(v)) firma = ''; selSociedad = v; refrescar(); }
  }

  async function mostrar(items, titulo, nombre, intro) {
    await cargarFuentes();
    verDocumento({ titulo, paginas: paginasBoletos(items), nombrePdf: nombre, intro, maxPaginas: 1, textoBoton: 'Compartir PDF', tiquete: true });
  }

  async function emitir(tipo) {
    if ([BOL_ENTREGA, BOL_REFUERZO, BOL_CONTEO].includes(tipo) && !puede('todos')) return toast('Solo un administrador puede hacer este movimiento.');
    if (!puede('todos') && fecha !== diaHoy()) { fecha = diaHoy(); inFecha.value = fecha; reconstruir(); }
    if (!cosechaNombre()) return toast('Primero elija la cosecha activa en Ajustes.');
    if (!selOficina) return toast('Seleccione la oficina.');
    const soc = socActual();
    if (!soc || !soc.fichas.length) return toast('Seleccione una sociedad con fichas.');
    const textos = inputs.map((i) => i.value.trim());
    const todas = soc.fichas.map((fi, i) => ({ color: fi.color, medida: fi.medida, cantidad: parseInt(textos[i], 10) || 0 }));
    const ls = tipo === BOL_SALDO ? todas.filter((_, i) => textos[i] !== '') : todas.filter((l) => l.cantidad > 0 || tipo === BOL_CONTEO);
    if (tipo === BOL_SALDO && !ls.length) return toast('Escriba el saldo de al menos una ficha (si no sobró ninguna, escriba 0).', 6000);
    if (tipo !== BOL_SALDO && tipo !== BOL_CONTEO && !ls.length) return toast('Escriba la cantidad de al menos una ficha.');
    if (tipo === BOL_SALDO) {
      const disp = disponible(boletos.items(), cosechaNombre(), soc.nombre, deviceName(), fecha);
      const errores = ls.filter((l) => l.cantidad > (disp[claveLinea(l)] || 0)).map((l) => {
        const t = disp[claveLinea(l)] || 0;
        return t === 0 ? `${etiquetaFicha(l)}: no ha recibido fichas` : `${etiquetaFicha(l)}: tiene ${t}, no puede quedar ${l.cantidad}`;
      });
      if (errores.length) return aviso('Revise el saldo', errores.join('\n') + '\n\nEl saldo no puede ser mayor a lo recibido (saldo inicial + entregas + refuerzos − fichas dañadas).');
    }
    if (tipo === BOL_PERDIDA) {
      const motivo = await pedirMotivo({ titulo: 'Fichas dañadas', etiquetaCampo: 'Motivo (obligatorio)', placeholder: 'Ej. Fichas dañadas o extraviadas', ok: 'Aceptar' });
      if (motivo) guardar(tipo, ls, motivo);
    } else if (tipo === BOL_CONTEO) {
      const ok = await confirmar('Conteo general', `Registra el conteo real de fichas de «${soc.nombre}» al terminar la cosecha. La diferencia contra el inventario histórico se reporta como pérdidas/mal estado.`, { si: 'Guardar' });
      if (ok) guardar(tipo, ls, '');
    } else guardar(tipo, ls, '');
  }
  function guardar(tipo, ls, nota) {
    const m = { id: uuid(), numero: boletos.siguiente(), dia: fecha, emitido: ahoraTxt(), cosecha: cosechaNombre(), sociedad: selSociedad, oficina: selOficina,
      dispositivo: deviceName(), usuario: nombreUsuario(), tipo, lineas: ls, nota, anulado: false, motivoAnul: '', anuladoFecha: '' };
    boletos.agregar(m);
    encolar(payloadBoleto(m, 'BOL_' + m.id, m.emitido, 'ACTIVO', '', false));
    nav.pendientes();
    db.set('bol_draft', { sociedad: '', vals: {} });
    firma = ''; reconstruir();
    mostrar([{ m, modo: MODO.NORMAL }], `Boletos ${m.numero}`, `boletos_${m.numero}.pdf`);
  }

  const resumenMov = (m) => `${m.numero} · ${tipoBoletoEtiqueta(m.tipo).toLowerCase()} · ${m.sociedad}`;
  async function reimprimir() {
    const todos = boletos.items().slice().reverse();
    if (!todos.length) return toast('Todavía no hay movimientos para reimprimir.');
    const m = await listaBuscable({
      titulo: 'Reimprimir comprobante', placeholder: 'Buscar: número, sociedad, tipo, fecha...', texto: 'movimientos',
      items: todos.map((x) => ({
        titulo: resumenMov(x) + (x.anulado ? '  ·  ANULADO' : ''), rojo: x.anulado,
        detalle: `${x.emitido}  ·  ${totalFichas(x)} fichas  ·  ${fmtNum(totalCajuelasMov(x), 2)} cajuelas`,
        busqueda: `${x.numero} ${x.sociedad} ${x.tipo} ${tipoBoletoEtiqueta(x.tipo)} ${x.oficina} ${x.emitido} ${diaLegible(x.dia)}`, valor: x
      }))
    });
    if (m) mostrar([{ m, modo: m.anulado ? MODO.NORMAL : MODO.REIMPRESION }], `Boletos ${m.numero}`, `boletos_${m.numero}.pdf`);
  }
  async function anular() {
    const activos = boletos.items().filter((x) => !x.anulado).reverse().slice(0, 60);
    if (!activos.length) return toast('No hay movimientos para anular.');
    const m = await elegir('¿Qué movimiento desea anular?', activos.map((x) => ({ etiqueta: resumenMov(x) + ' · ' + diaLegible(x.dia), valor: x })), { buscar: false });
    if (!m) return;
    const motivo = await pedirMotivo({
      titulo: 'Anular movimiento', placeholder: 'Ej. Se digitó una cantidad equivocada',
      detalle: `${resumenMov(m)}\n${diaLegible(m.dia)} · ${totalFichas(m)} fichas (${fmtNum(totalCajuelasMov(m), 2)} cajuelas)`,
      aviso: 'El movimiento quedará ANULADO y los saldos se recalculan. Esta acción no se puede deshacer.'
    });
    if (!motivo) return;
    const sello = ahoraTxt();
    const a = boletos.anular(m.id, motivo, sello);
    if (!a) return;
    encolar(payloadBoleto(a, 'ANUL_' + stampCorto() + '_' + m.numero, sello, 'ANULACIÓN', motivo, true));
    nav.pendientes();
    firma = ''; reconstruir();
    mostrar([{ m: a, modo: MODO.ANULACION }], `Anulación ${a.numero}`, `anulacion_${a.numero}.pdf`);
  }

  // ---------- Reportes ----------
  function reportes() {
    const cosecha = cosechaNombre(), c = bc();
    if (!cosecha || !c) return toast('Primero elija la cosecha activa y reciba las fichas de Boletos.');
    let desde = fecha, hasta = fecha, sociedadFiltro = '', usuarioFiltro = '';
    const gr = 'tipo-rep';
    const rMov = h('input', { type: 'radio', name: gr, checked: true }), rInv = h('input', { type: 'radio', name: gr }), rDet = h('input', { type: 'radio', name: gr });
    const iDesde = h('input', { class: 'campo', type: 'date', value: desde }), iHasta = h('input', { class: 'campo', type: 'date', value: hasta });
    iDesde.addEventListener('change', () => { if (iDesde.value) { desde = iDesde.value; if (hasta < desde) { hasta = desde; iHasta.value = hasta; } } });
    iHasta.addEventListener('change', () => { if (iHasta.value) { hasta = iHasta.value; if (desde > hasta) { desde = hasta; iDesde.value = desde; } } });
    const pSoc = selector('Todas las sociedades', async () => {
      const nombres = ['Todas las sociedades', ...c.sociedades.map((s) => s.nombre)];
      const v = await elegir('Sociedad', nombres.map((n, i) => ({ etiqueta: n, valor: i })), { buscar: false });
      if (v === undefined) return;
      sociedadFiltro = v === 0 ? '' : nombres[v]; pSoc.poner(nombres[v]);
    });
    pSoc.poner('Todas las sociedades');
    const solo = h('input', { type: 'checkbox' });
    const admin = puede('todos');
    const nombresUs = opcionesUsuarios();
    const pUs = selector('Todos los usuarios', async () => {
      const v = await elegir('Usuario', nombresUs.map((n, i) => ({ etiqueta: n, valor: i })), { buscar: false });
      if (v === undefined) return;
      usuarioFiltro = v === 0 ? '' : nombresUs[v]; pUs.poner(nombresUs[v]);
    });
    pUs.poner('Todos los usuarios');
    const cuerpo = [
      h('label', { class: 'radio' }, rMov, ' Movimientos y saldos por día'),
      h('label', { class: 'radio' }, rInv, ' Inventario general (por sociedad)'),
      h('label', { class: 'radio' }, rDet, ' Comprobantes emitidos (detalle, con usuario)'),
      etiqueta('Desde'), iDesde, etiqueta('Hasta'), iHasta, etiqueta('Sociedad'), pSoc,
      admin ? etiqueta('Usuario (solo para «Comprobantes emitidos»)') : null, admin ? pUs : null,
      h('label', { class: 'radio' }, solo, ' Solo movimientos de este dispositivo'),
      !admin && nombreUsuario() ? h('p', { class: 'nota' }, `«Comprobantes emitidos» solo incluye los que emitió ${nombreUsuario()}.`) : null,
      h('p', { class: 'nota' }, 'Con Internet usa los datos de Google Sheets (todos los dispositivos); sin conexión, solo los de este dispositivo.')
    ];
    dialogo({
      titulo: 'Reportes de Boletos', cuerpo,
      botones: [{ texto: 'Cerrar' }, { texto: 'Generar PDF', clase: 'primario', onclick: () => { generar(rDet.checked ? 'det' : rInv.checked ? 'inv' : 'mov', cosecha, desde, hasta, sociedadFiltro, solo.checked, admin ? usuarioFiltro : nombreUsuario()); return false; } }]
    });
  }
  async function generar(modo, cosecha, desde, hasta, sociedad, soloMio, usuarioFiltro = '') {
    const esInventario = modo === 'inv';
    toast('Preparando el reporte…', 2500);
    const disp = deviceName();
    const remoto = configurado() ? await movimientosBoletos(cosecha, hasta, normalizarMedida) : null;
    const usarRemoto = remoto && !remoto.error;
    const locales = boletos.items().filter((m) => normalizar(m.cosecha) === normalizar(cosecha));
    let todos;
    if (usarRemoto) {
      const clave = (m) => m.numero + '|' + m.dispositivo + '|' + m.dia;
      const anuladosLocal = new Set(locales.filter((m) => m.anulado).map(clave));
      const remotos = remoto.lista.filter((m) => !anuladosLocal.has(clave(m)));
      const claves = new Set(remotos.map(clave));
      todos = [...remotos, ...locales.filter((m) => !m.anulado && !claves.has(clave(m)))];
    } else todos = locales;
    await cargarFuentes();
    let paginas, nombre;
    if (modo === 'det') {
      const docs = todos.filter((m) => m.dia >= desde && m.dia <= hasta && (!sociedad || normalizar(m.sociedad) === normalizar(sociedad)) &&
        (!soloMio || normalizar(m.dispositivo) === normalizar(disp)) && usuarioCoincide(m.usuario, usuarioFiltro));
      paginas = reporteDetalle(docs, cosecha, desde, hasta, `Sociedad: ${sociedad || 'todas'} · Usuario: ${usuarioFiltro || 'todos'}`);
      nombre = 'boletos_comprobantes.pdf';
    } else if (esInventario) {
      const socs = (bc() ? bc().sociedades : []).filter((s) => !sociedad || normalizar(s.nombre) === normalizar(sociedad));
      if (!socs.length) return toast('No hay sociedades con fichas para el inventario.');
      paginas = reporteInventario(cosecha, socs.map((s) => [s.nombre, inventario(todos, cosecha, s, hasta)]), hasta);
      nombre = 'inventario_boletos.pdf';
    } else {
      const filas = filasSaldo(todos, cosecha, hasta, sociedad || null, soloMio ? disp : null)
        .filter((f) => f.dia >= desde && f.inicial + f.entregas + f.refuerzos + f.perdidas + f.saldo > 0);
      paginas = reporteMovimientos(filas, cosecha, desde, hasta, `Sociedad: ${sociedad || 'todas'} · Dispositivo: ${soloMio ? disp : 'todos'}`);
      nombre = 'boletos_movimientos.pdf';
    }
    const nota = usarRemoto ? 'Datos de todos los dispositivos (Google Sheets).' : remoto ? `Sin conexión con la hoja (${remoto.error}). Solo movimientos de este dispositivo.` : 'Sin sincronización configurada. Solo movimientos de este dispositivo.';
    verDocumento({ titulo: modo === 'det' ? 'Comprobantes de Boletos' : esInventario ? 'Inventario de Boletos' : 'Movimientos y saldos', paginas, nombrePdf: nombre, ancho: true, intro: nota, textoCompartir: 'Reporte de Boletos. ' + nota });
  }

  raiz.append(
    banda('Inventario de Boletos'),
    tarjeta(etiqueta('Oficina'), pickOf, etiqueta('Sociedad'), pickSoc, etiqueta('Fecha del movimiento'), inFecha),
    infoSaldo,
    tarjeta(etiqueta('Cantidad de fichas'), cajaFichas),
    grupoBotones('Movimientos del día',
      boton('Entrega de fichas', 'emitir', 'c-verde', () => emitir(BOL_ENTREGA), 'todos'), boton('Refuerzo', 'emitir', 'c-ambar', () => emitir(BOL_REFUERZO), 'todos'),
      boton('Saldo', 'enviar', 'c-azul', () => emitir(BOL_SALDO)), boton('Fichas dañadas', 'anular', 'c-rojo', () => emitir(BOL_PERDIDA))),
    grupoBotones('Consultas',
      boton('Reimprimir', 'imprimir', 'c-teal', reimprimir, 'reimprimir'), boton('Reportes', 'resumen', 'c-azul', reportes, 'resumenes')),
    grupoBotones('Solo administración',
      boton('Conteo general', 'enviar', 'c-ambar', () => emitir(BOL_CONTEO), 'todos'), boton('Anular', 'anular', 'c-rojo', anular, 'anular'))
  );
  refrescar();
  return { el: raiz, refrescar };
}

// ---------- Reportes en PDF ----------
function reporteDetalle(docs, cosecha, desde, hasta, filtro) {
  const cols = [['Fecha', 60], ['Hora', 40], ['Comprobante', 70], ['Tipo', 110], ['Sociedad', 160], ['Oficina', 100], ['Usuario', 100], ['Dispositivo', 100], ['Fichas', 48], ['Cajuelas', 56]]
    .map(([titulo, ancho], i) => ({ titulo, ancho, derecha: i >= 8 }));
  const ord = docs.slice().sort((a, b) => (a.dia + (a.emitido || '')) < (b.dia + (b.emitido || '')) ? -1 : 1);
  const rows = ord.map((m) => ({ celdas: [diaLegible(m.dia), (m.emitido || '').split(' ')[1] || '', m.numero, tipoBoletoEtiqueta(m.tipo), m.sociedad, m.oficina, m.usuario || '—', m.dispositivo, String(totalFichas(m)), fmtNum(totalCajuelasMov(m), 2)] }));
  const periodo = desde === hasta ? `FECHA: ${diaLegible(desde)}` : `DEL ${diaLegible(desde)} AL ${diaLegible(hasta)}`;
  const titulos = [['BOLETOS · COMPROBANTES EMITIDOS', 15], [`COSECHA ${cosecha} · ${periodo}`, 10], [filtro, 9]];
  const ancho = Math.max(842, Math.ceil(cols.reduce((t, c) => t + c.ancho, 0) + 48) + 1);
  return paginasTablas([{ titulos, columnas: cols, filas: rows.length ? rows : [{ celdas: ['Sin comprobantes con ese filtro.'] }], nota: 'No incluye los comprobantes anulados.' }], ancho, 595);
}

function reporteMovimientos(filas, cosecha, desde, hasta, filtro) {
  const cols = [['Fecha', 56], ['Dispositivo', 108], ['Sociedad', 150], ['Ficha', 96], ['Medida', 40], ['Saldo inicial', 52], ['Entregas', 52], ['Refuerzos', 54],
    ['Fichas dañadas', 54], ['Saldo final', 52], ['Usadas', 48], ['Cajuelas usadas', 54]].map(([titulo, ancho], i) => ({ titulo, ancho, derecha: i >= 5 }));
  const rows = filas.map((f) => ({
    celdas: [diaLegible(f.dia), f.dispositivo, f.sociedad, f.color, f.medida, String(f.inicial), String(f.entregas), String(f.refuerzos), String(f.perdidas),
      f.saldo + (f.conConteo ? '' : '*'), f.conConteo ? String(f.usadas) : '—', f.conConteo ? fmtNum(f.cajuelasUsadas, 2) : '—'],
    rojas: f.perdidas > 0 ? [8] : []
  }));
  if (filas.length) {
    const cc = filas.filter((f) => f.conConteo);
    const s = (a, k) => a.reduce((t, x) => t + x[k], 0);
    rows.push({ celdas: ['TOTAL', '', '', '', '', '', String(s(filas, 'entregas')), String(s(filas, 'refuerzos')), String(s(filas, 'perdidas')), '', String(s(cc, 'usadas')), fmtNum(s(cc, 'cajuelasUsadas'), 2)], negrita: true, fondo: '#D7E6DB' });
  }
  const periodo = desde === hasta ? `FECHA: ${diaLegible(desde)}` : `DEL ${diaLegible(desde)} AL ${diaLegible(hasta)}`;
  const titulos = [['BOLETOS · MOVIMIENTOS Y SALDOS', 15], [`COSECHA ${cosecha} · ${periodo}`, 10], [filtro, 9]];
  const ancho = Math.max(842, Math.ceil(cols.reduce((t, c) => t + c.ancho, 0) + 48) + 1);
  if (!rows.length) return paginasTablas([{ titulos, columnas: cols, filas: [{ celdas: ['Sin movimientos en este rango.'] }], nota: '' }], ancho, 595);
  return paginasTablas([{ titulos, columnas: cols, filas: rows, nota: '* Sin conteo de saldo ese día: se muestra el saldo esperado (inicial + entregas + refuerzos − fichas dañadas). Usadas = inicial + entregas + refuerzos − fichas dañadas − saldo reportado. Solo se listan las fichas con movimiento.' }], ancho, 595);
}
function reporteInventario(cosecha, datos, hasta) {
  const cols = [['FICHAS', 118], ['MEDIDA', 54], ['INVENTARIO HIST.', 80], ['PERDIDAS / MAL ESTADO', 96], ['SALDO FINAL COSECHA', 92], ['EN CAMPO', 60], ['EN OFICINAS', 62]].map(([titulo, ancho]) => ({ titulo, ancho }));
  const tablas = datos.map(([soc, filas]) => {
    const rows = filas.map((f) => ({ celdas: [f.color.toUpperCase(), f.medida, String(f.historico), String(f.perdidas), String(f.saldoFinal), String(f.enCampo), String(f.enOficinas)], rojas: [3] }));
    const s = (k) => String(filas.reduce((t, x) => t + x[k], 0));
    rows.push({ celdas: ['TOTAL FICHAS', '', s('historico'), s('perdidas'), s('saldoFinal'), s('enCampo'), s('enOficinas')], negrita: true, fondo: '#D7E6DB', rojas: [3] });
    return { titulos: [['INVENTARIO BOLETOS', 15], [`COSECHA ${cosecha}`, 12], [`SOCIEDAD: ${soc}`, 12], [`Al ${diaLegible(hasta)}`, 9]], columnas: cols, filas: rows, bordes: true,
      nota: 'Pérdidas/mal estado = pérdidas reportadas, o inventario histórico menos el conteo general si ya se hizo. En campo = saldo en manos de encargados; en oficinas = saldo final menos en campo.' };
  });
  return paginasTablas(tablas, Math.max(595, Math.ceil(cols.reduce((t, c) => t + c.ancho, 0) + 48) + 1), 842);
}
