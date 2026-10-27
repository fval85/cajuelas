// Pestaña «Registro»: comprobantes de cambio de fichas por persona.
import { h, clear, toast, aviso, confirmar, elegir, normalizar, parseQty, canonQty, fmtQty, fmtMoney, diaHoy, ahoraTxt, diaLegible, fechaLarga, plainNumber, stampCorto } from './util.js';
import { db, cat, deviceName, configurado, findCosecha, findSociedad, findPersona, cosechaActiva, siguienteNumero, confirmarNumero } from './store.js';
import { nombreUsuario, puede } from './users.js';
import { lineas, montoLinea, aGrupo, todosLosComprobantes, payloadRegistro, idReporte } from './data.js';
import { cargarFuentes, paginasTexto, lineasComprobante, lineasAnulacion, paginasResumenRegistro } from './draw.js';
import { xlsx } from './files.js';
import { encolar, registroDelDia } from './sync.js';
import { tarjeta, etiqueta, banda, selector, boton, campoBusqueda, verDocumento, listaBuscable, pedirMotivo, icono, filtrosAdmin, usuarioCoincide } from './ui.js';

export function crearRegistro(nav) {
  const raiz = h('div', { class: 'pagina' });
  let selSociedad = db.get('reg_sociedad', '');
  let selFinca = db.get('reg_finca', '');
  let filas = []; // {q, p}
  const borrador = db.get('reg_draft', { persona: '', filas: [] });
  filas = (borrador.filas || []).map((f) => ({ q: f.q || '', p: f.p || '' }));

  const cosecha = () => findCosecha(cosechaActiva());
  const sociedad = () => findSociedad(cosecha(), selSociedad);

  const pickSoc = selector('Seleccione la sociedad', () => elegirSociedad());
  const pickFinca = selector('Seleccione la finca', () => elegirFinca());
  const persona = campoBusqueda({
    placeholder: 'Escriba para buscar',
    fuente: () => ((sociedad() || {}).personas || []).map((p) => ({ etiqueta: p.nombre, valor: p.nombre, detalle: p.codigo ? 'Código ' + p.codigo : '' })),
    alCambiar: () => guardarBorrador()
  });
  // Buscar también por código.
  persona.input.addEventListener('input', () => {});
  // Buscar por finca: al elegirla se llenan solas la sociedad y la finca.
  const buscaFinca = campoBusqueda({
    placeholder: 'Ej. Caledonia',
    fuente: () => ((cosecha() || { sociedades: [] }).sociedades).flatMap((s) => s.fincas.map((f) => ({ etiqueta: f, valor: f, detalle: s.nombre, soc: s.nombre }))),
    alElegir: (v, o) => {
      if (normalizar(selSociedad) !== normalizar(o.soc)) persona.input.value = '';
      selSociedad = o.soc; selFinca = v; buscaFinca.input.value = '';
      validarSeleccion(); pintar(); guardarBorrador();
      toast(`Sociedad: ${o.soc}`, 2500);
    }
  });
  const zonaFilas = h('div', { class: 'lineas' });
  const resumen = h('div', { class: 'resumen' });
  const pista = h('p', { class: 'nota' }, 'Toque «+ Agregar línea» para registrar cantidad y precio.');
  const cabeceraCols = h('div', { class: 'cols-linea' }, h('span', null, 'Cantidad'), h('span', null, 'Precio (₡)'), h('span'));

  function guardarBorrador() {
    db.set('reg_draft', { persona: persona.input.value, filas });
  }
  persona.input.value = borrador.persona || '';

  function validarSeleccion() {
    let co = cosecha();
    if (!co && cat.cosechas.length === 1 && !cosechaActiva()) co = cat.cosechas[0];
    if (!co) { selSociedad = ''; selFinca = ''; }
    else {
      const s = findSociedad(co, selSociedad);
      if (!s) { selSociedad = ''; selFinca = ''; }
      else {
        selSociedad = s.nombre;
        const f = s.fincas.find((x) => normalizar(x) === normalizar(selFinca));
        selFinca = f || (s.fincas.length === 1 ? s.fincas[0] : '');
      }
    }
    db.set('reg_sociedad', selSociedad); db.set('reg_finca', selFinca);
  }

  async function elegirSociedad() {
    const co = cosecha();
    if (!co) { sinCatalogo('Primero elija la cosecha activa en Ajustes (o reciba el catálogo de Google Sheets).'); return; }
    if (!co.sociedades.length) { sinCatalogo(`La cosecha «${co.nombre}» todavía no tiene sociedades. Reciba el catálogo desde Google Sheets en Ajustes.`); return; }
    const v = await elegir(`Sociedad de ${co.nombre}`, co.sociedades.map((s) => ({ etiqueta: s.nombre, valor: s.nombre })));
    if (v === undefined) return;
    if (normalizar(selSociedad) !== normalizar(v)) persona.input.value = '';
    selSociedad = v; selFinca = '';
    validarSeleccion(); pintar(); guardarBorrador();
  }
  async function elegirFinca() {
    if (!selSociedad) { toast('Primero seleccione la sociedad.'); return; }
    const fincas = (sociedad() || {}).fincas || [];
    if (!fincas.length) { sinCatalogo(`La sociedad «${selSociedad}» todavía no tiene fincas.`); return; }
    const v = await elegir(`Finca de ${selSociedad}`, fincas.map((f) => ({ etiqueta: f, valor: f })));
    if (v === undefined) return;
    selFinca = v; validarSeleccion(); pintar();
  }
  function sinCatalogo(texto) {
    aviso('Sin datos', texto + '\n\nEn Ajustes > Administración use «Recibir catálogo de Google Sheets».');
  }

  async function elegirPrecio(fila, btn) {
    const v = await elegir('Precio (₡)', cat.precios.map((p) => ({ etiqueta: fmtMoney(p), valor: p })), { buscar: false });
    if (v === undefined) return;
    fila.p = plainNumber(v); btn.value = fmtMoney(v); guardarBorrador(); actualizarResumen();
  }

  function pintarFilas() {
    clear(zonaFilas);
    filas.forEach((f) => {
      const q = h('input', { class: 'campo num', type: 'text', inputmode: 'decimal', placeholder: 'Ej. 123', value: f.q, autocomplete: 'off', enterkeyhint: 'next' });
      q.addEventListener('input', () => { f.q = q.value; guardarBorrador(); actualizarResumen(); });
      let p;
      if (cat.precios.length) {
        p = h('input', { class: 'campo num selec', type: 'text', readonly: true, placeholder: 'Precio', value: f.p ? fmtMoney(parseQty(f.p)) : '' });
        p.addEventListener('click', () => elegirPrecio(f, p));
      } else {
        p = h('input', { class: 'campo num', type: 'text', inputmode: 'decimal', placeholder: 'Ej. 1500', value: f.p, autocomplete: 'off' });
        p.addEventListener('input', () => { f.p = p.value; guardarBorrador(); actualizarResumen(); });
      }
      const del = h('button', { type: 'button', class: 'icono-borrar', 'aria-label': 'Eliminar línea', onclick: () => { filas = filas.filter((x) => x !== f); pintarFilas(); guardarBorrador(); } }, icono('borrar', 20));
      zonaFilas.append(h('div', { class: 'linea' }, q, p, del));
    });
    cabeceraCols.hidden = !filas.length;
    pista.hidden = filas.length > 0;
    actualizarResumen();
  }
  const validas = () => filas.filter((f) => f.q.trim() && f.p.trim());
  function actualizarResumen() {
    const v = validas();
    const sumN = v.reduce((t, f) => t + parseQty(f.q), 0);
    const sumP = v.reduce((t, f) => t + parseQty(f.p), 0);
    const tot = v.reduce((t, f) => t + parseQty(f.q) * parseQty(f.p), 0);
    resumen.textContent = `Líneas completas: ${v.length}\nSuma de cantidades: ${fmtQty(sumN)}\nSuma de precios: ${fmtMoney(sumP)}\nTOTAL CANTIDAD × PRECIO: ${fmtMoney(tot)}`;
  }
  function agregarFila(q = '', p = '') {
    filas.push({ q, p }); pintarFilas(); guardarBorrador();
    const ult = zonaFilas.querySelector('.linea:last-child input'); if (ult && !q) ult.focus();
  }

  // ---------- Emitir ----------
  async function emitir() {
    const valid = validas().map((f) => [canonQty(f.q), parseQty(f.p)]);
    if (!valid.length) return toast('Complete al menos una línea con cantidad y precio.');
    const co = cosechaActiva();
    if (!co) return toast('Elija la cosecha activa en Ajustes.');
    if (!selSociedad) return toast('Seleccione la sociedad.');
    if (!selFinca) return toast('Seleccione la finca.');
    const escrito = persona.input.value.trim();
    if (!escrito) { persona.input.focus(); return toast('Ingrese el nombre y los apellidos de la persona.'); }
    const soc = sociedad();
    const p = findPersona(soc, escrito);
    let provisional = false;
    if (soc && soc.personas.length && !p) {
      if (!puede('provisional')) { persona.input.focus(); return toast('Elija a la persona de la lista de esta sociedad: escriba unas letras y toque el nombre. Si no está en la lista, un administrador puede emitirle un tiquete provisional.', 7000); }
      const limpio = escrito.replace(/\s+/g, ' ');
      if (limpio.split(' ').length < 2 || limpio.length < 6) { persona.input.focus(); return toast('Para un tiquete provisional escriba el nombre y al menos un apellido.', 6000); }
      const ok = await confirmar('Persona no registrada', `«${limpio}» no está en la lista de ${selSociedad}.\n\nSe emitirá un tiquete PROVISIONAL, sin tarjeta ni deducción. Quedará marcado en el tiquete y en Google Sheets para que se agregue a la base.\n\n¿Emitir provisional?`, { si: 'Emitir provisional' });
      if (!ok) return;
      provisional = true;
    }
    const deduccion = p ? p.deduccion : 0;
    const bruto = valid.reduce((t, v) => t + parseQty(v[0]) * v[1], 0);
    if (deduccion > 0 && deduccion > bruto + 0.005) {
      const ok = await confirmar('Deducción mayor al total',
        `La deducción de ${p.nombre} (${fmtMoney(deduccion)}) es mayor que el total de este comprobante (${fmtMoney(bruto)}). El total a pagar quedaría negativo.\n\n¿Emitir de todas formas?`, { si: 'Emitir' });
      if (!ok) return;
    }
    registrar(valid, co, selSociedad, selFinca, p ? p.nombre : escrito.replace(/\s+/g, ' '), p, provisional);
  }

  async function registrar(valid, co, soc, finca, nombre, p, provisional = false) {
    const ahora = new Date();
    const numero = siguienteNumero('next_comprobante', 'C-');
    const texto = ahoraTxt(ahora), dia = diaHoy(ahora);
    const codigo = p ? p.codigo : '', tarj = p ? p.tarjeta : '', ded = p ? p.deduccion : 0;
    const reporte = idReporte(finca);
    const todas = lineas.todas();
    valid.forEach((v, i) => todas.push({
      date: dia, sociedad: soc, finca, personName: nombre, quantity: v[0], price: v[1], comprobante: numero, anulado: false, motivo: '', anuladoFecha: '',
      emitido: texto, cosecha: co, codigo, tarjeta: tarj, deduccion: i === 0 ? ded : 0, usuario: nombreUsuario(), provisional
    }));
    lineas.guardar(todas);
    confirmarNumero('next_comprobante');
    const grupo = aGrupo(todas.filter((l) => l.comprobante === numero && l.date === dia));
    persona.input.value = ''; filas = []; pintarFilas(); guardarBorrador();
    encolar(payloadRegistro({ reportId: reporte, dateText: texto, cosecha: co, sociedad: soc, finca, personName: nombre, codigo, tarjeta: tarj, deduccion: ded, valid, comprobante: numero, provisional }));
    nav.pendientes();
    await mostrarTiquetes([lineasComprobante(grupo, false)], `Comprobante ${numero}`, `tiquete_${numero}.pdf`);
  }

  async function mostrarTiquetes(lineasPorDoc, titulo, nombre, intro) {
    await cargarFuentes();
    const paginas = paginasTexto(lineasPorDoc);
    verDocumento({ titulo, paginas, nombrePdf: nombre, intro, maxPaginas: 6, tiquete: true, textoBoton: lineasPorDoc.length > 1 ? 'Compartir PDF (un tiquete por página)' : 'Compartir PDF' });
  }

  // ---------- Reimprimir ----------
  async function reimprimir() {
    const todos = todosLosComprobantes();
    if (!todos.length) return toast('Todavía no hay comprobantes emitidos para reimprimir.');
    const g = await listaBuscable({
      titulo: 'Reimprimir comprobante', placeholder: 'Buscar: número, nombre, finca, fecha...', texto: 'comprobantes',
      items: todos.map((x) => ({
        titulo: `${x.numero}  ·  ${x.persona}${x.provisional ? '  ·  PROVISIONAL' : ''}${x.anulado ? '  ·  ANULADO' : ''}`, rojo: x.anulado,
        detalle: `${diaLegible(x.date)}  ·  ${x.sociedad}  ·  ${x.finca}  ·  ${fmtMoney(x.neto)}`,
        busqueda: `${x.numero} ${x.persona} ${x.cosecha} ${x.sociedad} ${x.finca} ${diaLegible(x.date)} ${x.emitido}`, valor: x
      }))
    });
    if (g) mostrarTiquetes([lineasComprobante(g, true)], `Comprobante ${g.numero}`, `tiquete_${g.numero}.pdf`);
  }

  // ---------- Anular ----------
  async function anular() {
    const hoy = diaHoy();
    const mapa = new Map();
    lineas.todas().filter((l) => l.date === hoy && l.comprobante && !l.anulado).forEach((l) => { if (!mapa.has(l.comprobante)) mapa.set(l.comprobante, []); mapa.get(l.comprobante).push(l); });
    const grupos = [...mapa.values()].reverse();
    if (!grupos.length) return toast('No hay comprobantes de hoy para anular.');
    const g = await elegir('¿Qué comprobante desea anular?', grupos.map((ls) => ({
      etiqueta: `${ls[0].comprobante} · ${ls[0].personName} · ${fmtMoney(ls.reduce((t, l) => t + montoLinea(l) - l.deduccion, 0))}`, valor: ls
    })), { buscar: false });
    if (!g) return;
    const first = g[0];
    const ded = g.reduce((t, l) => t + l.deduccion, 0);
    const detalle = `Comprobante ${first.comprobante}\n${first.personName}\n${first.sociedad} · ${first.finca}\n\n` +
      g.map((l) => `${fmtQty(parseQty(l.quantity))} × ${fmtMoney(l.price)} = ${fmtMoney(montoLinea(l))}`).join('\n') +
      (ded > 0 ? `\nDeducción: ${fmtMoney(ded)}` : '') + `\n\nTotal a pagar: ${fmtMoney(g.reduce((t, l) => t + montoLinea(l), 0) - ded)}`;
    const motivo = await pedirMotivo({
      titulo: 'Anular comprobante', detalle, placeholder: 'Ej. Se registró a la persona equivocada',
      aviso: 'El comprobante quedará marcado como ANULADO y se generará un comprobante de anulación. Esta acción no se puede deshacer.'
    });
    if (!motivo) return;
    anularComprobante(first.comprobante, first.date, motivo);
  }
  async function anularComprobante(numero, dia, motivo) {
    const ahora = new Date(), sello = ahoraTxt(ahora);
    const todas = lineas.todas().map((l) => (l.comprobante === numero && l.date === dia && !l.anulado ? { ...l, anulado: true, motivo, anuladoFecha: sello, anuladoPor: nombreUsuario() } : l));
    lineas.guardar(todas);
    const anuladas = todas.filter((l) => l.comprobante === numero && l.date === dia);
    if (!anuladas.length) return;
    const first = anuladas[0];
    const grupo = aGrupo(anuladas);
    const negadas = anuladas.map((l) => [plainNumber(-parseQty(l.quantity)), l.price]);
    encolar(payloadRegistro({
      reportId: 'ANUL_' + stampCorto(ahora) + '_' + numero, dateText: sello, cosecha: grupo.cosecha, sociedad: first.sociedad, finca: first.finca,
      personName: first.personName, codigo: first.codigo, tarjeta: grupo.tarjeta, deduccion: -anuladas.reduce((t, l) => t + l.deduccion, 0),
      valid: negadas, comprobante: numero, estado: 'ANULACIÓN', motivo, provisional: !!grupo.provisional
    }));
    nav.pendientes();
    if (!persona.input.value.trim() && filas.every((f) => !f.q.trim() && !f.p.trim())) {
      filas = anuladas.map((l) => ({ q: l.quantity, p: plainNumber(l.price) }));
      pintarFilas(); guardarBorrador();
      toast(`Comprobante ${numero} anulado. Se cargaron sus líneas: elija a la persona correcta y emita el comprobante nuevo.`, 7000);
    }
    await mostrarTiquetes([lineasAnulacion(grupo)], `Anulación ${numero}`, `anulacion_${numero}.pdf`);
  }

  // ---------- Tiquetes del día ----------
  async function tiquetesDelDia() {
    const hoy = diaHoy();
    const grupos = todosLosComprobantes().filter((g) => g.date === hoy && !g.anulado).reverse();
    if (!grupos.length) return toast('Hoy todavía no hay comprobantes para compartir.');
    await mostrarTiquetes(grupos.map((g) => lineasComprobante(g, false)), 'Tiquetes del día', `tiquetes_dia_${hoy.replace(/-/g, '')}.pdf`,
      `${grupos.length} comprobantes de hoy · Total a pagar ${fmtMoney(grupos.reduce((t, g) => t + g.neto, 0))}. Un solo PDF con un tiquete por página; no incluye los anulados.`);
  }

  // ---------- Resumen del día ----------
  async function resumen_() {
    const co = cosechaActiva();
    if (puede('todos')) return resumenAdmin(co);
    if (!co || !selSociedad) return toast('Elija la cosecha activa en Ajustes y la sociedad para generar su resumen.');
    const hoy = diaHoy();
    const deSoc = lineas.todas().filter((l) => l.date === hoy && normalizar(l.sociedad) === normalizar(selSociedad) && (!l.cosecha || normalizar(l.cosecha) === normalizar(co)));
    return armarResumen(co, hoy, selSociedad, deSoc, '');
  }
  /** Administrador: cualquier fecha, sociedad y usuario, con los comprobantes de todos los dispositivos. */
  async function resumenAdmin(co) {
    const cs = cosecha();
    if (!co || !cs || !cs.sociedades.length) return toast('Elija la cosecha activa en Ajustes y reciba el catálogo.');
    const f = await filtrosAdmin({ titulo: 'Resumen de Registro', sociedades: cs.sociedades.map((x) => x.nombre), sociedad: selSociedad });
    if (!f) return;
    toast('Preparando el resumen…', 2500);
    const n = normalizar;
    const disp = deviceName();
    const locales = lineas.todas().filter((l) => l.date === f.dia && l.comprobante && (!l.cosecha || n(l.cosecha) === n(co))).map((l) => ({ ...l, dispositivo: disp }));
    let todas = locales, nota = 'Solo comprobantes de este dispositivo.';
    if (configurado()) {
      const r = await registroDelDia(f.dia);
      if (!r.error) {
        const propios = new Set(locales.map((l) => l.comprobante));
        todas = [...r.lista.filter((l) => (!l.cosecha || n(l.cosecha) === n(co)) && !(n(l.dispositivo) === n(disp) && propios.has(l.comprobante))), ...locales];
        nota = 'Datos de todos los dispositivos (Google Sheets).';
      } else nota = `Sin conexión con la hoja (${r.error}). Solo comprobantes de este dispositivo.`;
    }
    const deSoc = todas.filter((l) => n(l.sociedad) === n(f.sociedad) && usuarioCoincide(l.usuario, f.usuario));
    return armarResumen(co, f.dia, f.sociedad, deSoc, `${nota} Usuario: ${f.usuario || 'todos'}.`);
  }
  async function armarResumen(co, dia, socNombre, deSoc, extra) {
    const hoyLineas = deSoc.filter((l) => !l.anulado);
    if (!hoyLineas.length) return toast(!deSoc.length ? `No hay comprobantes registrados el ${diaLegible(dia)} para ${socNombre}.` : `Todos los comprobantes del ${diaLegible(dia)} para ${socNombre} están anulados.`, 6000);
    const anulados = [...deSoc.filter((l) => l.anulado).reduce((m, l) => { if (!m.has(l.comprobante)) m.set(l.comprobante, []); m.get(l.comprobante).push(l); return m; }, new Map()).entries()]
      .map(([num, ls]) => ({ numero: num, nombre: ls[0].personName, monto: ls.reduce((t, l) => t + montoLinea(l) - l.deduccion, 0), motivo: ls[0].motivo, fecha: ls[0].anuladoFecha }));
    const fincas = [...new Set(hoyLineas.map((l) => l.finca).filter(Boolean))].sort((a, b) => normalizar(a).localeCompare(normalizar(b)));
    const precios = [...new Set(hoyLineas.map((l) => l.price))].sort((a, b) => a - b);
    const soc = findSociedad(findCosecha(co), socNombre);
    const porNombre = new Map();
    hoyLineas.forEach((l) => { const k = l.personName.trim(); if (!porNombre.has(k)) porNombre.set(k, []); porNombre.get(k).push(l); });
    const personas = [...porNombre.entries()].sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase(), 'es')).map(([name, ls]) => {
      const cant = {};
      ls.forEach((l) => { cant[l.price] = (cant[l.price] || 0) + parseQty(l.quantity); });
      const reg = findPersona(soc, name);
      const codigo = (ls.find((l) => l.codigo) || {}).codigo || (reg ? reg.codigo : '') || '';
      const tarj = ((ls.find((l) => l.tarjeta) || {}).tarjeta || (reg ? reg.tarjeta : '') || '').replace(/\D/g, '');
      const total = Object.entries(cant).reduce((t, [pr, q]) => t + Number(pr) * q, 0);
      const deduccion = ls.reduce((t, l) => t + (l.deduccion || 0), 0);
      return { name, codigo, tarjeta: tarj, deduccion, cant, total, neto: total - deduccion, provisional: ls.some((l) => l.provisional) };
    });
    const totalBruto = hoyLineas.reduce((t, l) => t + montoLinea(l), 0);
    const totalDed = hoyLineas.reduce((t, l) => t + (l.deduccion || 0), 0);
    const cantidadPorPrecio = {};
    precios.forEach((p) => { cantidadPorPrecio[p] = hoyLineas.filter((l) => l.price === p).reduce((t, l) => t + parseQty(l.quantity), 0); });
    const d = {
      fecha: fechaLarga(new Date(dia + 'T12:00:00')), cosecha: co, sociedad: socNombre, fincaTitulo: fincas.length === 1 ? 'Finca' : 'Fincas', fincasTxt: fincas.join(', '),
      precios, personas, lineasOriginales: hoyLineas.length, cantidadPorPrecio, totalBruto, totalDed, total: totalBruto - totalDed, anulados
    };
    await cargarFuentes();
    const paginas = paginasResumenRegistro(d);
    // Excel
    const nf = (v) => String(new Intl.NumberFormat('es-CR', { maximumFractionDigits: 4, useGrouping: false }).format(v));
    const dec = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? v : { n: v });
    const f = [['Resumen General de Cajuelas'], ['Fecha', d.fecha], ['Cosecha', co], ['Sociedad', socNombre], [d.fincaTitulo, d.fincasTxt], []];
    const enc = ['Código', 'Tarjeta', 'Nombre del cogedor'];
    precios.forEach((p) => { enc.push(`Cantidad ¢${nf(p)}`, `Monto ¢${nf(p)}`); });
    enc.push('Deducción', 'Total a pagar');
    f.push(enc);
    personas.forEach((p) => {
      const r = [p.codigo, p.tarjeta || (p.provisional ? 'PROVISIONAL' : ''), p.name];
      precios.forEach((pr) => { r.push(dec(p.cant[pr] || 0), (p.cant[pr] || 0) * pr); });
      r.push(p.deduccion, p.neto); f.push(r);
    });
    const tr = ['TOTAL GENERAL', '', ''];
    precios.forEach((pr) => { const q = personas.reduce((t, p) => t + (p.cant[pr] || 0), 0); tr.push(dec(q), q * pr); });
    tr.push(totalDed, d.total); f.push(tr, []);
    f.push(['Personas', personas.length], ['Líneas originales', hoyLineas.length]);
    if (totalDed > 0) f.push(['Total bruto', totalBruto], ['Total deducciones', totalDed]);
    f.push(['TOTAL GENERAL A PAGAR', d.total]);
    if (anulados.length) {
      f.push([], ['COMPROBANTES ANULADOS (no incluidos en los totales)'], ['Comprobante', 'Nombre', 'Monto anulado', 'Fecha de anulación', 'Motivo']);
      anulados.forEach((a) => f.push([a.numero, a.nombre, a.monto, a.fecha, a.motivo]));
    }
    const sello = dia.replace(/-/g, '');
    const libro = new Blob([xlsx('Resumen', f)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    verDocumento({
      titulo: 'Resumen general', paginas, nombrePdf: `Resumen_General_de_Cajuelas_${sello}.pdf`, ancho: true,
      adicionales: [{ blob: libro, nombre: `Resumen_General_de_Cajuelas_${sello}.xlsx` }], textoBoton: 'Compartir PDF y Excel',
      intro: `${socNombre} · ${personas.length} personas · Total a pagar ${fmtMoney(d.total)}${extra ? '\n' + extra : ''}`
    });
  }

  // ---------- Armado ----------
  raiz.append(
    banda('Registro de Cajuelas'),
    tarjeta(etiqueta('Buscar por finca (llena la sociedad)'), buscaFinca, etiqueta('Sociedad'), pickSoc, etiqueta('Finca'), pickFinca),
    tarjeta(
      h('p', { class: 'nota' }, 'Escriba unas letras del nombre o del código para buscar a la persona, y registre la cantidad y el precio en cada línea.'),
      etiqueta('Nombre y apellidos'), persona, cabeceraCols, pista, zonaFilas
    ),
    boton('+  Agregar línea', null, 'c-agregar ancho-total', () => agregarFila()),
    resumen,
    h('div', { class: 'acciones' },
      boton('Emitir comprobante', 'emitir', 'c-verde', emitir), boton('Reimprimir', 'imprimir', 'c-teal', reimprimir, 'reimprimir'), boton('Resumen', 'resumen', 'c-azul', resumen_, 'resumenes'),
      boton('Envío masivo', 'enviar', 'c-ambar', tiquetesDelDia, 'resumenes'), boton('Anular', 'anular', 'c-rojo', anular, 'anular'))
  );

  function pintar() {
    pickSoc.poner(selSociedad); pickFinca.poner(selFinca);
    pintarFilas();
  }
  return {
    el: raiz,
    refrescar() { validarSeleccion(); pintar(); },
    // Búsqueda por código además del nombre.
  };
}
