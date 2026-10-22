// Pestaña «Diario»: recibo de café en el beneficio.
import { h, toast, aviso, elegir, normalizar, fmtNum, fmtCant, diaHoy, ahoraTxt, uuid, stampCorto, diaLegible } from './util.js';
import { db, findCosecha, cosechaActiva, deviceName, configurado, findDiarioSociedad } from './store.js';
import { recibos, rc, payloadRecibo } from './data.js';
import { cargarFuentes, paginasRecibos, paginasResumenDiario, MODO } from './draw.js';
import { encolar, recibosDelDia } from './sync.js';
import { tarjeta, etiqueta, banda, selector, boton, campoBusqueda, verDocumento, listaBuscable, pedirMotivo } from './ui.js';

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

  function sinDatos(t) { aviso('Sin datos', t + '\n\nEn Ajustes > Sincronización use «Recibir catálogo de Google Sheets».'); }
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
    const s = lista.find((x) => normalizar(x.nombre) === normalizar(selSociedad)) || (lista.length === 1 ? lista[0] : null);
    selSociedad = s ? s.nombre : '';
    pickSoc.poner(selSociedad); db.set('dia_sociedad', selSociedad);
  }

  async function mostrar(items, titulo, nombre, intro) {
    await cargarFuentes();
    const paginas = paginasRecibos(items);
    verDocumento({ titulo, paginas, nombrePdf: nombre, intro: intro || (items.length > 1 ? `${items.length} recibos en un solo PDF (una página por recibo).` : null), maxPaginas: 2, textoBoton: 'Compartir PDF' });
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
      medidas: num(5), cajuelas: num(6), cuartillos: cuart, dispositivo: deviceName(), anulado: false, motivo: '', anuladoFecha: ''
    };
    if (rc(r).recibidoCajuelas <= 0) return toast('Escriba la cantidad recibida (medidas, cajuelas o cuartillos).');
    recibos.agregar(r);
    encolar(payloadRecibo(r, 'REC_' + r.id, r.emitido, 'ACTIVO', '', false));
    nav.pendientes();
    inputs.forEach((i) => { i.value = ''; }); guardarBorrador(); inputs[0].focus();
    mostrar([{ r, modo: MODO.NORMAL }], `Recibo ${r.numero}`, `recibo_${r.numero}.pdf`);
  }

  async function reimprimir() {
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
    const del = recibos.items().filter((r) => r.dia === diaHoy() && !r.anulado);
    if (!del.length) return toast('Hoy todavía no hay recibos para enviar.');
    mostrar(del.map((r) => ({ r, modo: MODO.NORMAL })), 'Recibos del día', `recibos_dia_${diaHoy().replace(/-/g, '')}.pdf`,
      `${del.length} recibos de hoy en un solo PDF (una página por recibo). Vista previa de los dos primeros.`);
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
    const dia = diaHoy();
    toast('Preparando el resumen…', 2000);
    const remoto = configurado() ? await recibosDelDia(dia) : null;
    const local = recibos.items().filter((r) => r.dia === dia && !r.anulado);
    const usarRemoto = remoto && !remoto.error;
    const lista = usarRemoto ? remoto.lista : local;
    if (!lista.length) return toast(usarRemoto ? 'La hoja todavía no tiene recibos de hoy.' : 'Hoy todavía no hay recibos.');
    const n = (s) => normalizar(s);
    const ord = lista.slice().sort((a, b) => n(a.sociedad).localeCompare(n(b.sociedad)) || n(a.finca).localeCompare(n(b.finca)) || n(a.lote).localeCompare(n(b.lote)) || (a.emitido < b.emitido ? -1 : 1));
    await cargarFuentes();
    const paginas = paginasResumenDiario(ord, dia);
    const nota = usarRemoto ? 'Datos de todos los teléfonos (Google Sheets).' : remoto ? `Sin conexión con la hoja (${remoto.error}). Solo recibos de este dispositivo.` : 'Sin sincronización configurada. Solo recibos de este dispositivo.';
    verDocumento({ titulo: 'Resumen del día', paginas, nombrePdf: `resumen_diario_${dia.replace(/-/g, '')}.pdf`, ancho: true, intro: nota, textoCompartir: 'Resumen diario de café recibido. ' + nota });
  }

  raiz.append(
    banda('Recibo de Café en Beneficio'),
    tarjeta(etiqueta('Beneficio'), pickBen, etiqueta('Sociedad'), pickSoc,
      h('div', { class: 'dos-col' }, h('div', null, etiqueta('Finca'), finca), h('div', null, etiqueta('Corte/Lote'), lote))),
    tarjeta(cuadroMuestra, h('div', { class: 'titulo-cuadro' }, 'CANTIDAD'), h('div', { class: 'cuadro-centro' }, cuadroCant)),
    h('div', { class: 'fila-botones cuatro' },
      boton('Emitir', 'emitir', 'c-verde', emitir), boton('Reimprimir', 'imprimir', 'c-teal', reimprimir),
      boton('Envío\nmasivo', 'enviar', 'c-ambar', masivo), boton('Anular', 'anular', 'c-rojo', anular)),
    boton('Resumen del día', 'resumen', 'c-azul ancho-total', resumenDelDia)
  );
  refrescar();
  return { el: raiz, refrescar };
}
