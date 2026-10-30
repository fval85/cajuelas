// Pestaña «Boletos»: inventario de fichas de colores.
import { h, clear, toast, aviso, confirmar, elegir, normalizar, fmtNum, diaHoy, diaLegible, ahoraTxt, uuid, stampCorto, dialogo } from './util.js';
import { db, bol, bolCosecha, bolSociedad, cosechaActiva, deviceName, configurado, valorCajuelas, fichaKey } from './store.js';
import { nombreUsuario, puede } from './users.js';
import { boletos, payloadBoleto, tipoBoletoEtiqueta, totalFichas, totalCajuelasMov, filasSaldo, saldoInicial, disponible, inventario, claveLinea, etiquetaFicha, circulacion, claveOrden,
  BOL_ENTREGA, BOL_REFUERZO, BOL_SALDO, BOL_PERDIDA, BOL_CONTEO, BOL_DEVOLUCION } from './data.js';
import { cargarFuentes, paginasBoletos, paginasTablas, MODO } from './draw.js';
import { encolar, movimientosBoletos, pendientes } from './sync.js';
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
  let selDest = db.get('bol_dest', '');   // administrador: dispositivo al que entrega las fichas
  let fecha = diaHoy();
  let firma = '';
  let inputs = [];
  const cosechaNombre = () => cosechaActiva();
  const bc = () => bolCosecha(cosechaNombre());
  const socActual = () => bolSociedad(bc(), selSociedad);

  const pickOf = selector('Seleccione la oficina', () => elegirOficina());
  const pickSoc = selector('Seleccione la sociedad', () => elegirSociedad());
  const pickDest = selector('Seleccione el dispositivo', () => elegirDestino());
  const etDest = etiqueta('Entregar a / Recibido de (dispositivo)');
  const inFecha = h('input', { class: 'campo', type: 'date', value: fecha });
  inFecha.addEventListener('change', () => { if (inFecha.value) { fecha = inFecha.value; reconstruir(); } });
  const infoSaldo = h('div', { class: 'resumen' });
  const cajaFichas = h('div', { class: 'fichas' });

  const esAdmin = () => puede('todos');
  const miDisp = () => deviceName();
  const todosMovs = () => boletos.items().concat(db.get('bol_remotos', []));
  const filasDisp = () => db.get('boletos_disp', []).filter((r) => normalizar(r[0]) === normalizar(cosechaNombre()) && normalizar(r[1]) === normalizar(selSociedad));
  const dispositivosSoc = () => { const v = []; filasDisp().forEach((r) => { if (!v.some((x) => normalizar(x) === normalizar(r[2]))) v.push(r[2]); }); return v.sort((a, b) => normalizar(a).localeCompare(normalizar(b))); };
  const entregaOtro = () => esAdmin() && selDest && normalizar(selDest) !== normalizar(miDisp());
  /** Fichas del formulario: las del dispositivo elegido (administrador entregando a otro) o las propias. */
  function fichasForm() {
    const soc = socActual();
    if (entregaOtro()) {
      const lista = [];
      filasDisp().filter((r) => normalizar(r[2]) === normalizar(selDest)).forEach((r) => {
        const med = normalizarMedida(r[4]);
        if (!lista.some((x) => fichaKey(x.color, x.medida) === fichaKey(r[3], med))) lista.push({ color: r[3], medida: med });
      });
      return lista;
    }
    return soc ? soc.fichas : [];
  }
  let ultimaBajada = 0;
  /** Trae de Google Sheets las entregas que el administrador hizo para este dispositivo. */
  async function bajarRemotos(forzar) {
    if (!configurado() || !cosechaNombre()) return;
    if (!forzar && Date.now() - ultimaBajada < 20000) return;
    ultimaBajada = Date.now();
    // Foto previa a la descarga: solo se juzgan los movimientos que ya estaban enviados antes de pedir la lista a la hoja.
    const colaAntes = new Set(pendientes().map((q) => q.reportId));
    const idsAntes = new Set(boletos.items().map((m) => m.id));
    const r = await movimientosBoletos(cosechaNombre(), diaHoy(), normalizarMedida);
    if (r.error) return;
    const yo = normalizar(miDisp());
    const anuladasAqui = new Set(db.get('bol_anul_rem', []));
    const clave = (m) => normalizar(m.numero) + '|' + normalizar(m.dispositivo) + '|' + m.dia;
    // Administrador: baja los movimientos de TODOS los dispositivos (para ver las fichas en circulación y poder anular a distancia).
    // Usuario normal: solo lo que el administrador le entregó.
    const otros = r.lista.filter((m) => normalizar(m.dispositivo) !== yo && !anuladasAqui.has(clave(m)) &&
      (esAdmin() || (m.para && normalizar(m.para) === yo)));
    db.set('bol_remotos', otros);
    // Si el administrador anuló desde otro teléfono un movimiento de este dispositivo, desaparece de la hoja: aquí se marca ANULADO.
    if (r.lista.length) {
      const enHoja = new Set(r.lista.map(clave));
      const hoy = diaHoy();
      const locales = boletos.items();
      let cambio = false;
      const nuevos = locales.map((m) => {
        if (m.anulado || normalizar(m.dispositivo) !== yo || normalizar(m.cosecha) !== normalizar(cosechaNombre()) || m.dia > hoy) return m;
        if (!idsAntes.has(m.id) || colaAntes.has('BOL_' + m.id) || enHoja.has(clave(m))) return m;
        cambio = true;
        return { ...m, anulado: true, motivoAnul: 'Anulado por el administrador', anuladoFecha: ahoraTxt(), anuladoPor: 'Administrador' };
      });
      if (cambio) boletos.guardar(nuevos);
    }
    firma = ''; reconstruir();
  }

  function refrescar() {
    bajarRemotos(false);
    const c = bc();
    const ofs = c ? c.oficinas : [];
    selOficina = ofs.find((o) => normalizar(o) === normalizar(selOficina)) || (ofs.length === 1 ? ofs[0] : '');
    const socs = c ? c.sociedades : [];
    const s = socs.find((x) => normalizar(x.nombre) === normalizar(selSociedad));
    selSociedad = s ? s.nombre : '';
    pickOf.poner(selOficina); pickSoc.poner(selSociedad);
    const lDest = dispositivosSoc();
    if (selDest && !lDest.some((d) => normalizar(d) === normalizar(selDest))) selDest = '';
    pickDest.poner(selDest); etDest.hidden = pickDest.hidden = !esAdmin();
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
    const fichas = fichasForm();
    const otro = entregaOtro();
    const saldo = soc && !otro ? saldoInicial(todosMovs(), cosechaNombre(), soc.nombre, deviceName(), fecha) : {};
    const recibido = {};
    if (soc && !otro) todosMovs().filter((m) => !m.anulado && m.dia === fecha && normalizar(m.cosecha) === normalizar(cosechaNombre()) && normalizar(m.sociedad) === normalizar(soc.nombre) && m.para && normalizar(m.para) === normalizar(miDisp()) && normalizar(m.dispositivo) !== normalizar(miDisp()) && (m.tipo === BOL_ENTREGA || m.tipo === BOL_REFUERZO))
      .forEach((m) => m.lineas.forEach((l) => { const k = claveLinea(l); recibido[k] = (recibido[k] || 0) + l.cantidad; }));
    const circ = soc && otro ? circulacion(todosMovs(), cosechaNombre(), soc.nombre, selDest) : {};
    const f = (soc ? soc.nombre : '') + '#' + fichas.map((x) => fichaKey(x.color, x.medida)).join(',') + '#' + fecha + '#' + selDest + '#' + JSON.stringify(saldo) + JSON.stringify(recibido) + JSON.stringify(circ);
    if (f === firma) return;
    firma = f;
    const previo = db.get('bol_draft', { sociedad: '', vals: {} });
    clear(cajaFichas); inputs = [];
    if (!soc || !fichas.length) {
      const hay = bc() && bc().sociedades.length;
      cajaFichas.append(h('p', { class: 'nota' }, !cosechaNombre() ? 'Primero elija la cosecha activa en Ajustes.'
        : !hay ? `No hay sociedades o fichas para la cosecha «${cosechaNombre()}». Reciba el catálogo de Google Sheets en Ajustes.`
        : soc ? (otro ? `El dispositivo «${selDest}» no tiene fichas de «${soc.nombre}» en la hoja «Boletos Fichas».` : `La sociedad «${soc.nombre}» no tiene fichas en la hoja «Boletos Fichas».`) : 'Seleccione la sociedad: aquí aparecerán solo las fichas (colores) de esa sociedad.'));
      infoSaldo.textContent = soc ? 'Sin fichas configuradas' : 'Seleccione la sociedad';
      return;
    }
    let totalIni = 0, cajIni = 0, totalRec = 0;
    cajaFichas.append(h('p', { class: 'nota' }, otro ? `Fichas de ${soc.nombre} · ${selDest}` : `Fichas de ${soc.nombre}`));
    fichas.forEach((fi) => {
      const key = fichaKey(fi.color, fi.medida);
      const ini = saldo[key] || 0;
      const rec = recibido[key] || 0;
      totalIni += ini; cajIni += ini * valorCajuelas(fi.medida); totalRec += rec;
      const inp = h('input', { class: 'campo num', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', placeholder: '0', autocomplete: 'off' });
      inp.dataset.k = key;
      if (normalizar(previo.sociedad) === normalizar(soc.nombre) && previo.vals[key]) inp.value = previo.vals[key];
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, ''); guardarBorrador(); });
      inp.addEventListener('focus', () => inp.select());
      inputs.push(inp);
      cajaFichas.append(h('div', { class: 'ficha' }, h('span', { class: 'ficha-nombre' }, `${fi.color} · ${fi.medida}`.toUpperCase()), h('span', { class: 'ficha-ini' }, otro ? `En circulación ${(circ[key] || { pendiente: 0 }).pendiente}` : rec ? h('span', null, `Inicial ${ini} · `, h('b', { class: 'ficha-rec' }, `Recibido ${rec}`)) : `Inicial ${ini}`), inp));
    });
    infoSaldo.textContent = otro ? `Entrega o devolución con ${selDest}` : `Saldo inicial de ${diaLegible(fecha)}: ${totalIni} fichas · ${fmtNum(cajIni, 2)} cajuelas`;
    if (!otro && totalRec) infoSaldo.append(h('br'), h('b', null, `Recibido hoy del administrador: ${totalRec} fichas`));
  }

  function sinDatos(t) { aviso('Sin datos', t + ' Cárguelas en la hoja de Google y use «Recibir catálogo» en Ajustes.'); }
  async function elegirOficina() {
    const l = bc() ? bc().oficinas : [];
    if (!l.length) return sinDatos('Todavía no hay oficinas para esta cosecha.');
    const v = await elegir('Oficina', l.map((o) => ({ etiqueta: o, valor: o })), { buscar: false });
    if (v !== undefined) { selOficina = v; refrescar(); }
  }
  async function elegirDestino() {
    if (!selSociedad) return toast('Primero seleccione la sociedad.');
    const l = dispositivosSoc();
    if (!l.length) return sinDatos('No hay dispositivos con fichas de esta sociedad en la hoja «Boletos Fichas».');
    const v = await elegir('Entregar a (dispositivo)', l.map((d) => ({ etiqueta: d + (normalizar(d) === normalizar(miDisp()) ? ' (este dispositivo)' : ''), valor: d })), { buscar: false });
    if (v !== undefined) { selDest = v; db.set('bol_dest', selDest); firma = ''; refrescar(); }
  }
  async function elegirSociedad() {
    const l = bc() ? bc().sociedades : [];
    if (!l.length) return sinDatos('Todavía no hay sociedades con fichas para esta cosecha.');
    const v = await elegir('Sociedad', l.map((s) => ({ etiqueta: s.nombre, valor: s.nombre })), { buscar: false });
    if (v !== undefined) { if (normalizar(selSociedad) !== normalizar(v)) { firma = ''; selDest = ''; db.set('bol_dest', ''); } selSociedad = v; refrescar(); }
  }

  async function mostrar(items, titulo, nombre, intro) {
    await cargarFuentes();
    verDocumento({ titulo, paginas: paginasBoletos(items), nombrePdf: nombre, intro, maxPaginas: 1, textoBoton: 'Compartir PDF', tiquete: true });
  }

  async function emitir(tipo) {
    if ([BOL_ENTREGA, BOL_REFUERZO, BOL_CONTEO, BOL_DEVOLUCION].includes(tipo) && !puede('todos')) return toast('Solo un administrador puede hacer este movimiento.');
    if (!puede('todos') && fecha !== diaHoy()) { fecha = diaHoy(); inFecha.value = fecha; reconstruir(); }
    if (!cosechaNombre()) return toast('Primero elija la cosecha activa en Ajustes.');
    if (!selOficina) return toast('Seleccione la oficina.');
    const soc = socActual();
    const fichas = fichasForm();
    if (!soc || !fichas.length) return toast('Seleccione una sociedad con fichas.');
    const entrega = tipo === BOL_ENTREGA || tipo === BOL_REFUERZO;
    const devol = tipo === BOL_DEVOLUCION;
    if (devol && !entregaOtro()) return toast('Seleccione el dispositivo que le devuelve las fichas («Recibido de»).', 5000);
    if (esAdmin() && entrega && !selDest) return toast('Seleccione a qué dispositivo entrega las fichas («Entregar a»).', 5000);
    if (esAdmin() && !entrega && !devol && entregaOtro()) return toast('Para este movimiento deje «Entregar a» en este dispositivo.', 5000);
    const textos = inputs.map((i) => i.value.trim());
    const todas = fichas.map((fi, i) => ({ color: fi.color, medida: fi.medida, cantidad: parseInt(textos[i], 10) || 0 }));
    const ls = tipo === BOL_SALDO ? todas : todas.filter((l) => l.cantidad > 0 || tipo === BOL_CONTEO);
    if (tipo === BOL_SALDO && textos.some((t) => t === '')) return aviso('Saldo incompleto', 'Escriba el saldo de TODAS las fichas. Si de alguna no sobró ninguna, escriba 0.');
    if (tipo !== BOL_SALDO && tipo !== BOL_CONTEO && !ls.length) return toast('Escriba la cantidad de al menos una ficha.');
    if (tipo === BOL_SALDO) {
      const disp = disponible(todosMovs(), cosechaNombre(), soc.nombre, deviceName(), fecha);
      const errores = ls.filter((l) => l.cantidad > (disp[claveLinea(l)] || 0)).map((l) => {
        const t = disp[claveLinea(l)] || 0;
        return t === 0 ? `${etiquetaFicha(l)}: no ha recibido fichas` : `${etiquetaFicha(l)}: tiene ${t}, no puede quedar ${l.cantidad}`;
      });
      if (errores.length) return aviso('Revise el saldo', errores.join('\n') + '\n\nEl saldo no puede ser mayor a lo recibido (saldo inicial + entregas + refuerzos − fichas dañadas).');
    }
    if (tipo === BOL_SALDO) {
      const previo = boletos.items().find((x) => !x.anulado && x.tipo === BOL_SALDO && x.dia === fecha && eq2(x.sociedad, soc.nombre) && eq2(x.dispositivo, deviceName()));
      if (previo && !esAdmin()) return aviso('Saldo ya registrado', `Hoy ya registró el saldo de «${soc.nombre}» (${previo.numero}). Solo se permite un saldo por día.\n\nSi se equivocó, pida al administrador que lo anule y luego lo vuelve a registrar.`);
      const ok = await confirmar('Registrar saldo', previo
        ? `Ya existe el saldo ${previo.numero} de hoy. Si registra este, el nuevo será el saldo válido del día. ¿Continuar?`
        : `Solo puede registrar UN saldo por día. Revise bien las cantidades antes de continuar.\n\n¿Registrar el saldo de «${soc.nombre}»?`);
      if (ok) guardar(tipo, ls, '');
      return;
    }
    if (devol) {
      const circ = circulacion(todosMovs(), cosechaNombre(), soc.nombre, selDest);
      const sobran = ls.filter((l) => l.cantidad > ((circ[claveLinea(l)] || {}).pendiente || 0)).map((l) => `${etiquetaFicha(l)}: recibe ${l.cantidad}, en circulación ${(circ[claveLinea(l)] || {}).pendiente || 0}`);
      const ok = await confirmar('Devolución de fichas', `Recibe de «${selDest}» (${soc.nombre}): ${ls.reduce((t, l) => t + l.cantidad, 0)} fichas.` +
        (sobran.length ? `\n\nOjo, es más de lo que figura en circulación:\n${sobran.join('\n')}\n(puede faltar un saldo de ese dispositivo)` : '') + '\n\n¿Registrar la devolución?');
      if (ok) guardar(tipo, ls, '', selDest);
      return;
    }
    if (tipo === BOL_PERDIDA) {
      const motivo = await pedirMotivo({ titulo: 'Fichas dañadas', etiquetaCampo: 'Motivo (obligatorio)', placeholder: 'Ej. Fichas dañadas o extraviadas', ok: 'Aceptar' });
      if (motivo) guardar(tipo, ls, motivo);
    } else if (tipo === BOL_CONTEO) {
      const ok = await confirmar('Conteo general', `Registra el conteo real de fichas de «${soc.nombre}» al terminar la cosecha. La diferencia contra el inventario histórico se reporta como pérdidas/mal estado.`, { si: 'Guardar' });
      if (ok) guardar(tipo, ls, '');
    } else guardar(tipo, ls, '', entrega && entregaOtro() ? selDest : '');
  }
  const eq2 = (a, b) => normalizar(a) === normalizar(b);
  function guardar(tipo, ls, nota, para = '') {
    const m = { id: uuid(), numero: boletos.siguiente(), dia: fecha, emitido: ahoraTxt(), cosecha: cosechaNombre(), sociedad: selSociedad, oficina: selOficina,
      dispositivo: deviceName(), para, usuario: nombreUsuario(), tipo, lineas: ls, nota, anulado: false, motivoAnul: '', anuladoFecha: '' };
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
    const yo = normalizar(miDisp());
    const locales = boletos.items().filter((x) => !x.anulado);
    // El administrador también ve (y puede anular) los movimientos de los demás dispositivos que bajó de Google Sheets.
    const claveL = (x) => normalizar(x.numero) + '|' + normalizar(x.dispositivo) + '|' + x.dia;
    const propias = new Set(locales.map(claveL));
    const ajenos = esAdmin() ? db.get('bol_remotos', []).filter((x) => normalizar(x.dispositivo) !== yo && !propias.has(claveL(x))) : [];
    const activos = locales.concat(ajenos).sort((a, b) => (claveOrden(a) < claveOrden(b) ? 1 : -1)).slice(0, 80);
    if (!activos.length) return toast('No hay movimientos para anular.');
    const etiq = (x) => resumenMov(x) + ' · ' + diaLegible(x.dia) + (normalizar(x.dispositivo) !== yo ? ' · de ' + x.dispositivo : '');
    const m = await elegir('¿Qué movimiento desea anular?', activos.map((x) => ({ etiqueta: etiq(x), valor: x })), { buscar: false });
    if (!m) return;
    const ajeno = normalizar(m.dispositivo) !== yo;
    const motivo = await pedirMotivo({
      titulo: 'Anular movimiento', placeholder: 'Ej. Se digitó una cantidad equivocada',
      detalle: `${resumenMov(m)}${ajeno ? '\nDispositivo: ' + m.dispositivo : ''}\n${diaLegible(m.dia)} · ${totalFichas(m)} fichas (${fmtNum(totalCajuelasMov(m), 2)} cajuelas)`,
      aviso: ajeno ? 'El movimiento quedará ANULADO en Google Sheets. El teléfono de esa persona lo marca anulado la próxima vez que abra la app con Internet. No se puede deshacer.'
        : 'El movimiento quedará ANULADO y los saldos se recalculan. Esta acción no se puede deshacer.'
    });
    if (!motivo) return;
    const sello = ahoraTxt();
    let a;
    if (ajeno) {
      a = { ...m, anulado: true, motivoAnul: motivo, anuladoFecha: sello, anuladoPor: nombreUsuario() };
      const claves = new Set(db.get('bol_anul_rem', [])); claves.add(claveL(m)); db.set('bol_anul_rem', [...claves]);
      db.set('bol_remotos', db.get('bol_remotos', []).filter((x) => claveL(x) !== claveL(m)));
    } else {
      a = boletos.anular(m.id, motivo, sello);
      if (!a) return;
    }
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
    tarjeta(etiqueta('Oficina'), pickOf, etiqueta('Sociedad'), pickSoc, etDest, pickDest, etiqueta('Fecha del movimiento'), inFecha),
    infoSaldo,
    tarjeta(etiqueta('Cantidad de fichas'), cajaFichas),
    grupoBotones('Movimientos del día',
      boton('Entrega de fichas', 'emitir', 'c-verde', () => emitir(BOL_ENTREGA), 'todos'), boton('Refuerzo', 'emitir', 'c-ambar', () => emitir(BOL_REFUERZO), 'todos'),
      boton('Saldo', 'enviar', 'c-azul', () => emitir(BOL_SALDO)), boton('Fichas dañadas', 'anular', 'c-rojo', () => emitir(BOL_PERDIDA))),
    grupoBotones('Consultas',
      boton('Reimprimir', 'imprimir', 'c-teal', reimprimir, 'reimprimir'), boton('Reportes', 'resumen', 'c-azul', reportes, 'resumenes')),
    grupoBotones('Solo administración',
      boton('Devolución', 'emitir', 'c-teal', () => emitir(BOL_DEVOLUCION), 'todos'), boton('Conteo general', 'enviar', 'c-ambar', () => emitir(BOL_CONTEO), 'todos'), boton('Anular', 'anular', 'c-rojo', anular, 'anular'))
  );
  refrescar();
  return { el: raiz, refrescar };
}

// ---------- Reportes en PDF ----------
function reporteDetalle(docs, cosecha, desde, hasta, filtro) {
  const cols = [['Fecha', 60], ['Hora', 40], ['Comprobante', 70], ['Tipo', 110], ['Sociedad', 160], ['Oficina', 100], ['Usuario', 100], ['Dispositivo', 100], ['Fichas', 48], ['Cajuelas', 56]]
    .map(([titulo, ancho], i) => ({ titulo, ancho, derecha: i >= 8 }));
  const ord = docs.slice().sort((a, b) => (a.dia + (a.emitido || '')) < (b.dia + (b.emitido || '')) ? -1 : 1);
  const rows = ord.map((m) => ({ celdas: [diaLegible(m.dia), (m.emitido || '').split(' ')[1] || '', m.numero, tipoBoletoEtiqueta(m.tipo), m.sociedad, m.oficina, m.usuario || '—', m.para || m.dispositivo, String(totalFichas(m)), fmtNum(totalCajuelasMov(m), 2)] }));
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
