// Pestaña «Diario»: recibo de café en el beneficio.
import { h, toast, aviso, elegir, normalizar, fmtNum, fmtCant, diaHoy, ahoraTxt, uuid, stampCorto, diaLegible } from './util.js';
import { db, findCosecha, cosechaActiva, deviceName, configurado, findDiarioSociedad } from './store.js';
import { nombreUsuario, puede } from './users.js';
import { recibos, rc, payloadRecibo } from './data.js';
import { cargarFuentes, paginasRecibos, paginasResumenDiario, paginasResumenSimple, MODO } from './draw.js';
import { pdfDePaginas } from './files.js';
import { encolar, recibosDelDia, recibosDelRango } from './sync.js';
import { ajuste } from './apariencia.js';
import { buscarRecibosHoja, filtrarSociedades, itemRecibo, corregirFechaComprobante } from './ui_admin.js';
import { tarjeta, etiqueta, banda, selector, boton, campoBusqueda, verDocumento, listaBuscable, pedirMotivo, pedirPeriodo, usuarioCoincide } from './ui.js';

export function crearDiario(nav) {
  const raiz = h('div', { class: 'pagina' });
  let selSociedad = db.get('dia_sociedad', '');
  let selBeneficio = db.get('dia_beneficio', '');
  const borrador = db.get('dia_draft', { v: Array(8).fill('') });
  const cosecha = () => findCosecha(cosechaActiva());
  const sociedades = () => (cosecha() || { diarioSociedades: [] }).diarioSociedades;
  const beneficios = () => (cosecha() || { diarioBeneficios: [] }).diarioBeneficios;
  const socActual = () => sociedades().find((s) => normalizar(s.nombre) === normalizar(selSociedad)) || null;

  const pickBen = selector('Seleccione el beneficio', () => elegirBeneficio());
  const pickSoc = selector('Seleccione la sociedad', () => elegirSociedad());
  const finca = campoBusqueda({
    placeholder: 'Finca', valor: db.get('dia_finca', ''),
    fuente: () => ((socActual() || {}).fincas || []).map((f) => ({ etiqueta: f, valor: f })),
    alCambiar: () => { db.set('dia_finca', finca.input.value); }
  });
  const lote = campoBusqueda({
    placeholder: 'Corte/Lote', valor: db.get('dia_lote', ''),
    fuente: () => {
      const s = socActual(); if (!s) return [];
      const f = s.fincas.find((x) => normalizar(x) === normalizar(finca.input.value));
      const lista = f ? s.lotes[f] || [] : Object.values(s.lotes).flat();
      const vistos = new Set();
      return lista.filter((l) => { const k = normalizar(l); if (vistos.has(k)) return false; vistos.add(k); return true; }).map((l) => ({ etiqueta: l, valor: l }));
    },
    alCambiar: () => { db.set('dia_lote', lote.input.value); }
  });

  // Buscar por finca: al elegirla se llenan solas la sociedad y la finca.
  const buscaFinca = campoBusqueda({
    placeholder: 'Ej. Los Patios, Montecristo', mayus: true,
    fuente: () => sociedades().flatMap((s) => s.fincas.map((f) => ({ etiqueta: f, valor: f, detalle: s.nombre, soc: s.nombre }))),
    alElegir: (v, o) => {
      if (normalizar(selSociedad) !== normalizar(o.soc)) { lote.input.value = ''; db.set('dia_lote', ''); }
      selSociedad = o.soc; finca.input.value = v; db.set('dia_finca', v);
      buscaFinca.input.value = ''; refrescar();
      toast(`Sociedad: ${o.soc}`, 2500);
    }
  });

  const inputs = [];
  const celdaEnc = (t, extra = '') => h('div', { class: 'enc ' + extra }, t);
  const celdaIn = () => {
    const i = h('input', { class: 'celda-in', type: 'text', inputmode: 'decimal', placeholder: '0', autocomplete: 'off', value: borrador.v[inputs.length] || '' });
    i.addEventListener('focus', () => i.select());
    i.addEventListener('input', () => guardarBorrador());
    inputs.push(i);
    return i;
  };
  const guardarBorrador = () => db.set('dia_draft', { v: inputs.map((i) => i.value) });
  const cuadroMuestra = h('div', { class: 'cuadro' },
    h('div', { class: 'cuadro-fila g' }, h('div', { class: 'enc grupo izq', style: { gridColumn: 'span 2' } }, 'MUESTRA'), h('div', { class: 'enc grupo', style: { gridColumn: 'span 3' } }, 'FLOTES')),
    h('div', { class: 'cuadro-fila c5' }, ...['TOTAL', 'VERDES', 'MADUROS', 'SECOS', 'BROCA'].map((t) => celdaEnc(t))),
    h('div', { class: 'cuadro-fila c5' }, ...[0, 1, 2, 3, 4].map(() => celdaIn())));
  const cuadroCant = h('div', { class: 'cuadro' },
    h('div', { class: 'cuadro-fila c3' }, ...['MEDIDAS', 'CAJUELAS', 'CUARTILLOS'].map((t) => celdaEnc(t))),
    h('div', { class: 'cuadro-fila c3' }, ...[5, 6, 7].map(() => celdaIn())));

  const num = (i) => {
    const v = Number(inputs[i].value.trim().replace(',', '.'));
    const x = Number.isFinite(v) ? v : 0;
    return i === 7 && x > 0 && x < 1 ? Math.round(x * 100) : x;
  };
  inputs[7].addEventListener('blur', () => {
    const v = num(7), txt = inputs[7].value.trim();
    if (txt && v !== Number(txt.replace(',', '.'))) { inputs[7].value = fmtCant(v); guardarBorrador(); }
  });

  function sinDatos(t) { aviso('Sin datos', t + '\n\nEn Ajustes > Administración use «Recibir catálogo de Google Sheets».'); }
  async function elegirBeneficio() {
    const co = cosecha(), lista = beneficios();
    if (!co) return sinDatos('Primero elija la cosecha activa en Ajustes.');
    if (!lista.length) return sinDatos(`La cosecha «${co.nombre}» todavía no tiene beneficios.`);
    const v = await elegir('Beneficio', lista.map((b) => ({ etiqueta: b, valor: b })), { buscar: false });
    if (v === undefined) return;
    selBeneficio = v; refrescar();
  }
  async function elegirSociedad() {
    const co = cosecha(), lista = sociedades();
    if (!co) return sinDatos('Primero elija la cosecha activa en Ajustes.');
    if (!lista.length) return sinDatos(`La cosecha «${co.nombre}» todavía no tiene sociedades para recibos.`);
    const v = await elegir('Sociedad', lista.map((s) => ({ etiqueta: s.nombre, valor: s.nombre })));
    if (v === undefined) return;
    if (normalizar(selSociedad) !== normalizar(v)) { finca.input.value = ''; lote.input.value = ''; db.set('dia_finca', ''); db.set('dia_lote', ''); }
    selSociedad = v; refrescar();
  }
  function refrescar() {
    const bens = beneficios();
    selBeneficio = bens.find((b) => normalizar(b) === normalizar(selBeneficio)) || (bens.length === 1 ? bens[0] : '');
    pickBen.poner(selBeneficio); db.set('dia_beneficio', selBeneficio);
    const lista = sociedades();
    if (!selSociedad) selSociedad = ajuste('soc', '');
    const s = lista.find((x) => normalizar(x.nombre) === normalizar(selSociedad)) || (lista.length === 1 ? lista[0] : null);
    selSociedad = s ? s.nombre : '';
    pickSoc.poner(selSociedad); db.set('dia_sociedad', selSociedad);
  }

  async function mostrar(items, titulo, nombre, intro) {
    await cargarFuentes();
    const paginas = paginasRecibos(items);
    verDocumento({ titulo, paginas, nombrePdf: nombre, intro: intro || (items.length > 1 ? `${items.length} recibos en un solo PDF (una página por recibo).` : null), maxPaginas: 2, textoBoton: 'Compartir PDF', tiquete: true });
  }

  async function emitir() {
    const co = cosecha();
    if (!co) return toast('Primero elija la cosecha activa en Ajustes.');
    if (!co.diarioReceptora) return toast('Falta la sociedad que hace los recibos. Defínala en la hoja de Google (pestaña Beneficios) y reciba el catálogo.', 6000);
    if (!selBeneficio) return toast('Seleccione el beneficio.');
    const soc = socActual();
    if (!soc) return toast('Seleccione la sociedad.');
    const f = finca.input.value.trim();
    if (!f) return toast('Escriba o seleccione la finca.');
    const l = lote.input.value.trim();
    const cuart = num(7);
    if (cuart < 0 || cuart >= 100) return toast('Los cuartillos deben ser 25, 50 o 75 (menos de 100).');
    const muestra = num(0);
    if (num(1) + num(2) + num(3) + num(4) > 0 && muestra <= 0) return toast('Escriba la muestra TOTAL.');
    const r = {
      id: uuid(), numero: recibos.siguiente(), dia: diaHoy(), emitido: ahoraTxt(), cosecha: co.nombre, beneficio: selBeneficio, receptora: co.diarioReceptora,
      sociedad: soc.nombre, compra: soc.tipo, finca: f, lote: l, muestraTotal: muestra, verdes: num(1), maduros: num(2), secos: num(3), broca: num(4),
      medidas: num(5), cajuelas: num(6), cuartillos: cuart, dispositivo: deviceName(), usuario: nombreUsuario(), anulado: false, motivo: '', anuladoFecha: ''
    };
    if (rc(r).recibidoCajuelas <= 0) return toast('Escriba la cantidad recibida (medidas, cajuelas o cuartillos).');
    recibos.agregar(r);
    encolar(payloadRecibo(r, 'REC_' + r.id, r.emitido, 'ACTIVO', '', false));
    nav.pendientes();
    inputs.forEach((i) => { i.value = ''; }); guardarBorrador(); inputs[0].focus();
    mostrar([{ r, modo: MODO.NORMAL }], `Recibo ${r.numero}`, `recibo_${r.numero}.pdf`);
  }

  async function reimprimir() {
    if (puede('todos') && configurado()) {
      const donde = await elegir('Reimprimir recibo', [{ etiqueta: 'De este dispositivo', valor: 'local' }, { etiqueta: 'De cualquier usuario, dispositivo o fecha (Google Sheets)', valor: 'hoja' }], { buscar: false });
      if (!donde) return;
      if (donde === 'hoja') {
        const b = await buscarRecibosHoja('Buscar recibos para reimprimir');
        if (!b) return;
        const r = await listaBuscable({ titulo: 'Reimprimir recibo', placeholder: 'Buscar: número, sociedad, finca, usuario...', texto: 'recibos', items: b.lista.map(itemRecibo) });
        if (r) mostrar([{ r, modo: MODO.REIMPRESION }], `Recibo ${r.numero}`, `recibo_${r.numero}.pdf`);
        return;
      }
    }
    const todos = recibos.items().slice().reverse();
    if (!todos.length) return toast('Todavía no hay recibos emitidos para reimprimir.');
    const r = await listaBuscable({
      titulo: 'Reimprimir recibo', placeholder: 'Buscar: número, sociedad, finca, fecha...', texto: 'recibos',
      items: todos.map((x) => ({
        titulo: `${x.numero}  ·  ${x.sociedad}${x.anulado ? '  ·  ANULADO' : ''}`, rojo: x.anulado,
        detalle: `${x.emitido}  ·  ${x.finca}  ·  ${fmtNum(rc(x).recibidoCajuelas, 2)} cajuelas`,
        busqueda: `${x.numero} ${x.sociedad} ${x.finca} ${x.lote} ${x.beneficio} ${x.emitido}`, valor: x
      }))
    });
    if (r) mostrar([{ r, modo: r.anulado ? MODO.NORMAL : MODO.REIMPRESION }], `Recibo ${r.numero}`, `recibo_${r.numero}.pdf`);
  }

  async function masivo() {
    if (puede('todos') && configurado()) {
      const donde = await elegir('Envío masivo de recibos', [{ etiqueta: 'Los de hoy en este dispositivo', valor: 'local' }, { etiqueta: 'Cualquier usuario, dispositivo, fecha o sociedad (Google Sheets)', valor: 'hoja' }], { buscar: false });
      if (!donde) return;
      if (donde === 'hoja') {
        const b = await buscarRecibosHoja('Recibos para enviar en masa');
        if (!b) return;
        const lista = await filtrarSociedades(b.lista);
        if (!lista) return;
        if (!lista.length) return toast('No quedó ningún recibo.');
        const ord = lista.slice().sort((a, c) => (a.dia + a.emitido) < (c.dia + c.emitido) ? -1 : 1);
        return mostrar(ord.map((r) => ({ r, modo: MODO.REIMPRESION })), 'Recibos del día', `recibos_${b.desde.replace(/-/g, '')}_${b.hasta.replace(/-/g, '')}.pdf`,
          `${ord.length} recibos de la hoja (${diaLegible(b.desde)} a ${diaLegible(b.hasta)}) en un solo PDF, una página por recibo.`);
      }
    }
    const del = recibos.items().filter((r) => r.dia === diaHoy() && !r.anulado);
    if (!del.length) return toast('Hoy todavía no hay recibos para enviar.');
    mostrar(del.map((r) => ({ r, modo: MODO.NORMAL })), 'Recibos del día', `recibos_dia_${diaHoy().replace(/-/g, '')}.pdf`,
      `${del.length} recibos de hoy en un solo PDF (una página por recibo). Vista previa de los dos primeros.`);
  }

  async function corregirFecha() {
    const b = await buscarRecibosHoja('Buscar el recibo con fecha equivocada');
    if (!b) return;
    const r = await listaBuscable({ titulo: 'Recibo a corregir', placeholder: 'Buscar: número, sociedad, finca, usuario...', texto: 'recibos', items: b.lista.map(itemRecibo) });
    if (!r) return;
    await corregirFechaComprobante('recibo', { numero: r.numero, dispositivo: r.dispositivo, dia: r.dia, detalle: `${r.sociedad} · ${r.finca}${r.lote ? ' · ' + r.lote : ''}` });
  }

  async function anular() {
    const activos = recibos.items().filter((r) => r.dia === diaHoy() && !r.anulado).reverse();
    if (!activos.length) return toast('No hay recibos de hoy para anular.');
    const r = await elegir('¿Qué recibo desea anular?', activos.map((x) => ({ etiqueta: `${x.numero} · ${x.sociedad} · ${fmtNum(rc(x).recibidoCajuelas, 2)} cajuelas`, valor: x })), { buscar: false });
    if (!r) return;
    const k = rc(r);
    const motivo = await pedirMotivo({
      titulo: 'Anular recibo', placeholder: 'Ej. Se digitó una cantidad equivocada',
      detalle: `Recibo ${r.numero}\n${r.sociedad}\n${r.finca}${r.lote ? ' · ' + r.lote : ''}\nRecibido: ${fmtNum(k.recibidoCajuelas, 2)} cajuelas (${fmtNum(k.fanegas, 2)} fanegas)`,
      aviso: 'El recibo quedará marcado como ANULADO y se generará un comprobante de anulación. Esta acción no se puede deshacer.'
    });
    if (!motivo) return;
    const sello = ahoraTxt();
    const a = recibos.anular(r.numero, r.dia, motivo, sello);
    if (!a) return;
    encolar(payloadRecibo(a, 'ANUL_' + stampCorto() + '_' + r.numero, sello, 'ANULACIÓN', motivo, true));
    nav.pendientes();
    if (inputs.every((i) => !i.value.trim())) {
      [a.muestraTotal, a.verdes, a.maduros, a.secos, a.broca, a.medidas, a.cajuelas, a.cuartillos].forEach((v, i) => { if (v !== 0) inputs[i].value = fmtCant(v); });
      finca.input.value = a.finca; lote.input.value = a.lote; db.set('dia_finca', a.finca); db.set('dia_lote', a.lote); guardarBorrador();
    }
    mostrar([{ r: a, modo: MODO.ANULACION }], `Anulación ${a.numero}`, `anulacion_${a.numero}.pdf`,
      'Recibo anulado. Las cantidades quedaron en el formulario por si desea corregirlas y emitir de nuevo.');
  }

  async function resumenDelDia() {
    const f = await pedirPeriodo({ titulo: 'Resumen de Diario', usuarios: puede('todos') });
    if (!f) return;
    // Administradores: cualquier usuario. Los demás: solo lo que ellos mismos emitieron.
    const { desde, hasta } = f;
    const usuarioFiltro = f.usuario || (puede('todos') ? '' : nombreUsuario());
    const unDia = desde === hasta;
    toast('Preparando el resumen…', 2000);
    const remoto = configurado() ? (unDia ? await recibosDelDia(desde) : await recibosDelRango(desde, hasta)) : null;
    const local = recibos.items().filter((r) => r.dia >= desde && r.dia <= hasta && !r.anulado);
    const usarRemoto = remoto && !remoto.error;
    const lista = (usarRemoto ? remoto.lista : local).filter((r) => usuarioCoincide(r.usuario, usuarioFiltro));
    const cuando = unDia ? `del ${diaLegible(desde)}` : `del ${diaLegible(desde)} al ${diaLegible(hasta)}`;
    if (!lista.length) return toast(usarRemoto ? `La hoja no tiene recibos ${cuando}${usuarioFiltro ? ' de ' + usuarioFiltro : ''}.` : `No hay recibos ${cuando} en este dispositivo.`, 5000);
    const n = (s) => normalizar(s);
    const ord = lista.slice().sort((a, b) => n(a.sociedad).localeCompare(n(b.sociedad)) || n(a.finca).localeCompare(n(b.finca)) || n(a.lote).localeCompare(n(b.lote)) || ((a.dia + a.emitido) < (b.dia + b.emitido) ? -1 : 1));
    const cual = await elegir('¿Qué reporte desea?', [
      { etiqueta: 'Detallado (con porcentajes y equivalentes)', valor: 'det' },
      { etiqueta: 'Simple (formato de planilla, total de cajuelas y fanegas)', valor: 'sim' },
      { etiqueta: 'Los dos (2 PDF)', valor: 'ambos' }
    ], { buscar: false });
    if (!cual) return;
    await cargarFuentes();
    const nota = (usarRemoto ? 'Datos de todos los teléfonos (Google Sheets).' : remoto ? `Sin conexión con la hoja (${remoto.error}). Solo recibos de este dispositivo.` : 'Sin sincronización configurada. Solo recibos de este dispositivo.') + (usuarioFiltro ? ` Usuario: ${usuarioFiltro}.` : '');
    const sello = unDia ? desde.replace(/-/g, '') : `${desde.replace(/-/g, '')}_${hasta.replace(/-/g, '')}`;
    const det = () => paginasResumenDiario(ord, desde, hasta), sim = () => paginasResumenSimple(ord, desde, hasta);
    const texto = 'Resumen de café recibido. ' + nota;
    if (cual === 'det') verDocumento({ titulo: 'Resumen de Diario (detallado)', paginas: det(), nombrePdf: `resumen_diario_detallado_${sello}.pdf`, ancho: true, intro: nota, textoCompartir: texto });
    else if (cual === 'sim') verDocumento({ titulo: 'Resumen de Diario (simple)', paginas: sim(), nombrePdf: `resumen_diario_simple_${sello}.pdf`, ancho: true, intro: nota, textoCompartir: texto });
    else {
      const p1 = det(), p2 = sim();
      const aBlob = (ps) => pdfDePaginas(ps.map((p) => ({ canvas: p.canvas, ancho: p.ancho, alto: p.alto })));
      const [blob1, blob2] = await Promise.all([aBlob(p1), aBlob(p2)]);
      const a1 = { blob: blob1, nombre: `resumen_diario_detallado_${sello}.pdf` }, a2 = { blob: blob2, nombre: `resumen_diario_simple_${sello}.pdf` };
      verDocumento({ titulo: 'Resumen de Diario (2 reportes)', paginas: [...p1, ...p2], paginasPdf: p1, nombrePdf: `resumen_diario_detallado_${sello}.pdf`, ancho: true, intro: nota + ' Son 2 archivos PDF distintos: el detallado y el simple. También puede compartir cada uno por separado.', maxPaginas: 8,
        adicionales: [a2], botonesAparte: [{ texto: 'Solo detallado', archivo: a1 }, { texto: 'Solo simple', archivo: a2 }], textoBoton: 'Compartir los 2 (por separado)', textoCompartir: texto });
    }
  }

  raiz.append(
    banda('Recibo de Café en Beneficio'),
    tarjeta(etiqueta('Beneficio'), pickBen, etiqueta('Buscar por finca (llena la sociedad)'), buscaFinca, etiqueta('Sociedad'), pickSoc,
      h('div', { class: 'dos-col' }, h('div', null, etiqueta('Finca'), finca), h('div', null, etiqueta('Corte/Lote'), lote))),
    tarjeta(cuadroMuestra, h('div', { class: 'titulo-cuadro' }, 'CANTIDAD'), h('div', { class: 'cuadro-centro' }, cuadroCant)),
    h('div', { class: 'acciones' },
      boton('Emitir recibo', 'emitir', 'c-verde', emitir), boton('Reimprimir', 'imprimir', 'c-teal', reimprimir, 'reimprimir'), boton('Resumen', 'resumen', 'c-azul', resumenDelDia, 'resumenes'),
      boton('Envío masivo', 'enviar', 'c-ambar', masivo, 'resumenes'), boton('Anular', 'anular', 'c-rojo', anular, 'anular'), boton('Corregir\nfecha', 'registro', 'c-azul', corregirFecha, 'todos'))
  );
  refrescar();
  return { el: raiz, refrescar };
}
