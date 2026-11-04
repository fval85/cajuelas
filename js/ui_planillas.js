// Pestaña «Planillas»: el encargado registra las horas de su gente por día (empleado por empleado) y envía el día completo.
import { h, clear, toast, aviso, elegir, dialogo, normalizar, fmtCant, diaHoy, fmtMoney2 } from './util.js';
import { db, configurado } from './store.js';
import { nombreUsuario, puede } from './users.js';
import { tarjeta, etiqueta, banda, selector, boton, pedirMotivo, verDocumento } from './ui.js';
import { planillaDatos, planillaAnular, planillaMontos, payloadPlanilla, encolar, pendientes } from './sync.js';
import { paginasPlanilla, paginasTablas, cargarFuentes } from './draw.js';
import * as D from './planillas_data.js';

export function crearPlanillas(nav) {
  const raiz = h('div', { class: 'pagina' });
  let datos = null, cargando = false, ultimaCarga = 0, errorCarga = '';
  let soc = '', fin = '', dia = diaHoy();
  const uk = (k) => 'pl_' + k + '_' + normalizar(nombreUsuario() || '_');
  const norm = normalizar;
  const key = () => D.claveDia(dia, soc, fin);
  const leer = () => { datos = db.get(uk('datos'), null); };

  // ---------- Datos del servidor ----------
  async function cargar(forzar = false) {
    if (!configurado() || cargando) return;
    if (!forzar && Date.now() - ultimaCarga < 60000) return;
    cargando = true; ultimaCarga = Date.now();
    const hoy = diaHoy();
    const desde = D.sumarDias(D.viernesDe(hoy), -7);
    const r = await planillaDatos(desde, hoy);
    cargando = false;
    if (r.error) { errorCarga = r.error; if (!raiz.hidden) pintar(); return; }
    errorCarga = '';
    datos = { t: Date.now(), empleados: r.empleados || [], tareasFinca: r.tareasFinca || [], registros: r.registros || [], admin: !!r.admin, aviso: r.aviso || '', desde, hasta: hoy };
    db.set(uk('datos'), datos);
    if (!raiz.hidden) pintar();
  }

  // ---------- Borradores y envíos ----------
  const draftAll = () => db.get(uk('draft'), {});
  const draftDia = () => draftAll()[key()] || {};
  const guardarEntrada = (num, e) => { const d = draftAll(); (d[key()] = d[key()] || {})[num] = e; db.set(uk('draft'), d); };
  const enviadosLocal = () => db.get(uk('enviados'), {});
  const colaTiene = (k) => pendientes().some((p) => p.formato === 'planilla' && D.claveDia(p.dia, p.sociedad, p.finca) === k);
  const regsDe = (d, s, f) => (datos ? datos.registros : []).filter((r) => r.dia === d && norm(r.sociedad) === norm(s) && norm(r.finca) === norm(f) && r.estado !== 'ANULADO');
  /** ¿El día ya fue enviado? (confirmado por la hoja, o enviado desde este teléfono y todavía en cola/por confirmar). */
  function estadoDia() {
    const regs = regsDe(dia, soc, fin);
    if (regs.length) return { bloqueado: true, entradas: D.entradasDeRegistros(regs), enCola: false, usuario: regs[0].usuario };
    const k = key(), env = enviadosLocal(), loc = env[k];
    if (loc) {
      if (colaTiene(k) || !datos || loc.t > datos.t - 120000) return { bloqueado: true, entradas: loc.entradas, enCola: colaTiene(k), usuario: loc.usuario };
      delete env[k]; db.set(uk('enviados'), env); // el administrador lo anuló
    }
    return { bloqueado: false };
  }

  // ---------- Selección ----------
  function ajustarSeleccion() {
    const emps = datos ? datos.empleados : [];
    const socs = D.sociedadesDe(emps);
    if (!socs.some((s) => norm(s) === norm(soc))) { const g = db.get(uk('soc'), ''); soc = socs.find((s) => norm(s) === norm(g)) || (socs.length === 1 ? socs[0] : ''); }
    const fincas = soc ? D.fincasDe(emps, soc) : [];
    if (!fincas.some((f) => norm(f) === norm(fin))) { const g = db.get(uk('finca'), ''); fin = fincas.find((f) => norm(f) === norm(g)) || (fincas.length === 1 ? fincas[0] : ''); }
  }
  const diasElegibles = () => { const s = D.semanaDe(diaHoy()); return s.dias.filter((d) => d <= diaHoy()); };

  const pickSoc = selector('Seleccione la sociedad', async () => {
    const socs = D.sociedadesDe(datos ? datos.empleados : []);
    const v = await elegir('Sociedad', socs.map((s) => ({ etiqueta: s, valor: s })), { buscar: false });
    if (v === undefined) return; soc = v; fin = ''; db.set(uk('soc'), soc); db.set(uk('finca'), ''); ajustarSeleccion(); pintar();
  });
  const pickFin = selector('Seleccione la finca', async () => {
    if (!soc) return toast('Primero elija la sociedad.');
    const v = await elegir('Finca', D.fincasDe(datos ? datos.empleados : [], soc).map((f) => ({ etiqueta: f, valor: f })), { buscar: false });
    if (v === undefined) return; fin = v; db.set(uk('finca'), fin); pintar();
  });
  const pickDia = selector('Fecha', async () => {
    const v = await elegir('Día de la planilla', diasElegibles().slice().reverse().map((d) => ({ etiqueta: D.etiquetaDia(d), valor: d })), { buscar: false });
    if (v === undefined) return; dia = v; pintar();
  });

  // ---------- Pantalla ----------
  const chip = (ok, texto) => h('span', { class: 'pl-chip ' + (ok ? 'ok' : 'pend') }, texto || (ok ? '✓ Listo' : 'Pendiente'));
  function pintar() {
    clear(raiz);
    raiz.append(banda('Planillas'));
    if (!configurado()) { raiz.append(h('p', { class: 'estado aviso' }, 'Falta configurar la sincronización (Ajustes). Planillas necesita conexión con la hoja al menos la primera vez.')); return; }
    if (!datos) {
      raiz.append(h('p', { class: 'estado aviso' }, cargando ? 'Descargando empleados…' : (errorCarga || 'Todavía no se han descargado los empleados.')),
        h('button', { type: 'button', class: 'btn-texto primario', onclick: () => cargar(true) }, 'Reintentar'));
      return;
    }
    if (!datos.empleados.length) { raiz.append(h('p', { class: 'estado aviso' }, datos.aviso || 'No hay empleados asignados a su usuario.')); return; }
    ajustarSeleccion();
    if (!diasElegibles().includes(dia)) dia = diaHoy();
    pickSoc.poner(soc); pickFin.poner(fin); pickDia.poner(D.etiquetaDia(dia));
    raiz.append(tarjeta(etiqueta('Sociedad'), pickSoc, etiqueta('Finca'), pickFin, etiqueta('Fecha'), pickDia));
    const sem = D.semanaDe(dia);
    if (errorCarga) raiz.append(h('p', { class: 'estado aviso' }, '⚠ No se pudo actualizar: ' + errorCarga + ' (se usan los datos guardados).'));
    if (!soc || !fin) { raiz.append(h('div', { class: 'resumen' }, D.semanaTexto(sem) + '\nElija la sociedad y la finca.')); pieSemanal(false); return; }
    const emps = D.empleadosDeFinca(datos.empleados, soc, fin);
    const est = estadoDia();
    if (est.bloqueado) return pintarBloqueado(emps, est, sem);
    const dr = draftDia();
    const listos = emps.filter((e) => dr[e.num]).length;
    raiz.append(h('div', { class: 'resumen' }, `${D.semanaTexto(sem)}\n${listos} de ${emps.length} empleados listos`));
    if (!D.tareasDeFinca(datos.tareasFinca, soc, fin).length) raiz.append(h('p', { class: 'estado aviso' }, 'Esta finca no tiene tareas en la hoja «Tareas por finca». Avise al administrador.'));
    emps.forEach((e) => {
      const en = dr[e.num];
      raiz.append(h('button', { type: 'button', class: 'pl-fila ' + (en ? 'ok' : 'pend'), onclick: () => editar(e) },
        h('div', { class: 'pl-tx' }, h('b', null, `${e.num} · ${e.nombre}`), h('small', null, D.resumenEntrada(en))), chip(!!en)));
    });
    raiz.append(h('div', { class: 'pl-pie' },
      h('div', { class: 'pl-prog' }, h('span', null, `${listos} de ${emps.length} listos`), h('span', null, listos === emps.length ? 'Todo completo' : `Faltan ${emps.length - listos}`)),
      h('div', { class: 'pl-barra' }, h('div', { style: { width: (emps.length ? 100 * listos / emps.length : 0) + '%' } })),
      h('button', { type: 'button', class: 'btn c-verde ancho-total' + (listos === emps.length ? '' : ' casi'), onclick: () => enviar(emps) }, h('span', null, 'Enviar el día'))));
    pieSemanal(true);
  }
  function pieSemanal(hay) {
    const bs = [];
    if (hay) bs.push(boton('Resumen semanal', 'resumen', 'c-azul ancho-total', verSemana));
    bs.push(h('div', { 'data-permiso': 'config' }, boton('Montos de la semana (administración)', 'reportes', 'c-azul ancho-total', verMontos)));
    raiz.append(h('div', { class: 'pl-extra' }, ...bs));
  }

  function pintarBloqueado(emps, est, sem) {
    raiz.append(h('div', { class: 'resumen' }, `${D.semanaTexto(sem)}\n${emps.length} empleados · día enviado`));
    raiz.append(h('div', { class: 'pl-bloq' }, `🔒 El día ${D.fmtDMA(dia)} ya fue enviado${est.usuario ? ' por ' + est.usuario : ''}${est.enCola ? ' (está en cola: se enviará apenas haya Internet)' : ''}. Si hay un error, pida al administrador que lo anule para volver a llenarlo.`));
    emps.forEach((e) => raiz.append(h('button', { type: 'button', class: 'pl-fila bloq', onclick: () => verBloqueado(e, est.entradas[e.num]) },
      h('div', { class: 'pl-tx' }, h('b', null, `🔒 ${e.num} · ${e.nombre}`), h('small', null, D.resumenEntrada(est.entradas[e.num]))))));
    if (puede('anular')) raiz.append(h('div', { class: 'pl-extra' }, boton('Anular este día (administrador)', 'anular', 'c-rojo ancho-total', anularDia)));
    pieSemanal(true);
  }
  function verBloqueado(e, en) {
    dialogo({ titulo: `${e.num} · ${e.nombre}`, cuerpo: [h('p', { class: 'pre' }, detalleEntrada(en)), h('p', { class: 'nota' }, 'Día enviado: solo el administrador puede corregirlo.')] });
  }
  const detalleEntrada = (en) => {
    if (!en) return 'Sin registro.';
    if (!D.totalNormales(en) && !(en.extras > 0)) return 'Sin labor.';
    return [...en.lineas.filter((l) => l.horas > 0).map((l) => `${l.tarea}: ${fmtCant(l.horas)} h`), en.extras > 0 ? `Extras: ${fmtCant(en.extras)} h (${en.tareaExtra})` : ''].filter(Boolean).join('\n');
  };

  async function anularDia() {
    const motivo = await pedirMotivo({ titulo: 'Anular el día', detalle: `${D.etiquetaDia(dia)}\n${soc}\n${fin}\n\nEl encargado podrá volver a llenarlo y enviarlo.`, placeholder: 'Ej. se registró con una tarea equivocada' });
    if (!motivo) return;
    toast('Anulando…', 1500);
    const r = await planillaAnular({ dia, sociedad: soc, finca: fin, motivo });
    if (r.error) return aviso('No se pudo anular', r.error);
    const env = enviadosLocal(); delete env[key()]; db.set(uk('enviados'), env);
    await cargar(true);
    toast('Día anulado. Ya se puede volver a llenar.', 4000);
    pintar();
  }

  // ---------- Un empleado ----------
  function editar(emp) {
    const tareas = D.tareasDeFinca(datos.tareasFinca, soc, fin);
    const previo = draftDia()[emp.num] || null;
    const ultima = (db.get(uk('ult_tarea'), {}) || {})[emp.num] || '';
    const sug = D.horasSugeridas(emp.horas);
    const lineas = previo ? previo.lineas.map((l) => ({ ...l })) : [{ tarea: ultima, horas: sug }];
    let extras = previo ? previo.extras : 0, tareaExtra = previo ? previo.tareaExtra : '';
    const cont = h('div');
    const elegirTarea = async (actual) => { const v = await elegir('Tarea', tareas.map((t) => ({ etiqueta: t, valor: t })), { vacio: 'Esta finca no tiene tareas en la hoja.' }); return v === undefined ? actual : v; };
    function pintarForm() {
      clear(cont);
      lineas.forEach((l, i) => {
        const s = selector('Elija la tarea', async () => { l.tarea = await elegirTarea(l.tarea); pintarForm(); }); s.poner(l.tarea);
        const inp = h('input', { class: 'campo num', type: 'text', inputmode: 'decimal', value: String(l.horas), 'aria-label': 'Horas' });
        inp.addEventListener('focus', () => inp.select());
        inp.addEventListener('input', () => { const v = D.numTxt(inp.value); l.horas = Number.isNaN(v) ? inp.value : v; });
        cont.append(h('div', { class: 'pl-linea' }, h('div', { class: 'pl-tarea' }, etiqueta('Tarea'), s), h('div', { class: 'pl-horas' }, etiqueta('Horas'), inp),
          lineas.length > 1 ? h('button', { type: 'button', class: 'pl-quitar', 'aria-label': 'Quitar tarea', onclick: () => { lineas.splice(i, 1); pintarForm(); } }, '✕') : null));
      });
      cont.append(h('button', { type: 'button', class: 'btn-texto', onclick: () => { lineas.push({ tarea: lineas[lineas.length - 1].tarea, horas: 0 }); pintarForm(); } }, '+ Otra tarea'));
      const ex = h('input', { class: 'campo num', type: 'text', inputmode: 'decimal', value: String(extras || 0), 'aria-label': 'Horas extra' });
      ex.addEventListener('focus', () => ex.select());
      const selEx = selector('Tarea de las extras', async () => { tareaExtra = await elegirTarea(tareaExtra); pintarForm(); }); selEx.poner(tareaExtra);
      ex.addEventListener('input', () => { const v = D.numTxt(ex.value); extras = Number.isNaN(v) ? ex.value : v; boxEx.hidden = !(Number(extras) > 0); if (!boxEx.hidden && !tareaExtra) { tareaExtra = lineas[0].tarea; selEx.poner(tareaExtra); } });
      const boxEx = h('div', { hidden: !(Number(extras) > 0) }, etiqueta('Tarea de las horas extra'), selEx);
      cont.append(h('div', { class: 'pl-extras' }, etiqueta('Horas extra'), ex), boxEx);
    }
    pintarForm();
    dialogo({
      titulo: `${emp.num} · ${emp.nombre}`,
      cuerpo: [h('p', { class: 'nota' }, `Horas sugeridas: ${sug} por día (${emp.horas} a la semana). Para un día sin trabajo deje 0 horas.`), cont,
        h('p', { class: 'nota' }, 'Al guardar queda «Listo». Puede volver a abrirlo y corregirlo hasta que envíe el día.')],
      botones: [{ texto: 'Cancelar' }, { texto: 'Guardar', clase: 'primario', onclick: () => {
        const en = { lineas: lineas.map((l) => ({ tarea: l.tarea, horas: Number(l.horas) })), extras: Number(extras) || 0, tareaExtra: tareaExtra };
        if (lineas.some((l) => !Number.isFinite(Number(l.horas))) || !Number.isFinite(Number(extras))) { toast('Revise las horas: solo números.'); return false; }
        if (!(en.extras > 0)) en.tareaExtra = '';
        const err = D.validarEntrada(en);
        if (err) { toast(err, 5000); return false; }
        en.lineas = en.lineas.filter((l, i) => l.horas > 0 || (i === 0 && en.lineas.length === 1));
        guardarEntrada(emp.num, en);
        const ut = db.get(uk('ult_tarea'), {}) || {}; const t1 = en.lineas.find((l) => l.horas > 0); if (t1) { ut[emp.num] = t1.tarea; db.set(uk('ult_tarea'), ut); }
        pintar();
        return true;
      } }]
    });
  }

  // ---------- Enviar el día ----------
  function enviar(emps) {
    if (estadoDia().bloqueado) return pintar();
    const dr = draftDia();
    const faltan = emps.filter((e) => !dr[e.num]);
    if (faltan.length) {
      dialogo({ titulo: '⚠ Por procesar', cuerpo: [
        h('p', null, `No se puede enviar el día. ${faltan.length === 1 ? 'Falta 1 empleado' : 'Faltan ' + faltan.length + ' empleados'} por procesar:`),
        h('div', { class: 'pl-faltan' }, ...faltan.map((e) => h('div', null, `${e.num} · ${e.nombre}`))),
        h('p', { class: 'nota' }, 'Guárdelos y vuelva a presionar «Enviar el día».')], botones: [{ texto: 'Entendido', clase: 'primario' }] });
      return;
    }
    const tn = emps.reduce((t, e) => t + D.totalNormales(dr[e.num]), 0), te = emps.reduce((t, e) => t + (Number(dr[e.num].extras) || 0), 0);
    dialogo({ titulo: '¿Enviar el día?', cuerpo: [
      h('p', null, `${D.etiquetaDia(dia)} · ${emps.length} empleados · ${fmtCant(tn)} h normales · ${fmtCant(te)} h extra.`),
      h('p', { class: 'pl-rojo' }, 'Después de enviar, el día queda bloqueado y solo un administrador podrá corregirlo.'),
      h('p', null, '¿Está seguro de que todo está correcto?')],
    botones: [{ texto: 'No, revisar' }, { texto: 'Sí, enviar', clase: 'primario', onclick: () => {
      const empleados = emps.map((e) => ({ num: e.num, lineas: dr[e.num].lineas.filter((l) => l.horas > 0), extras: dr[e.num].extras || 0, tareaExtra: dr[e.num].tareaExtra || '' }));
      const k = key();
      encolar(payloadPlanilla({ reportId: `PLA|${k}|${Date.now()}`, dia, sociedad: soc, finca: fin, empleados }));
      const env = enviadosLocal(); env[k] = { t: Date.now(), entradas: dr, usuario: nombreUsuario() }; db.set(uk('enviados'), env);
      const d = draftAll(); delete d[k]; db.set(uk('draft'), d);
      toast('Día enviado. Queda bloqueado.', 4000);
      pintar();
    } }] });
  }

  // ---------- Reportes ----------
  async function elegirSemana() {
    const hoy = D.semanaDe(diaHoy()), ant = D.semanaDe(D.sumarDias(hoy.desde, -1));
    return elegir('Semana', [{ etiqueta: 'Esta semana', detalle: D.semanaTexto(hoy), valor: hoy }, { etiqueta: 'Semana anterior', detalle: D.semanaTexto(ant), valor: ant }], { buscar: false });
  }
  async function verSemana() {
    const sem = await elegirSemana(); if (!sem) return;
    const emps = D.empleadosDeFinca(datos.empleados, soc, fin);
    const porDia = {};
    sem.dias.forEach((d) => {
      let ent = D.entradasDeRegistros(regsDe(d, soc, fin));
      if (!Object.keys(ent).length) { const loc = enviadosLocal()[D.claveDia(d, soc, fin)]; if (loc) ent = loc.entradas; }
      porDia[d] = ent;
    });
    const empleados = emps.map((e) => {
      const pd = {};
      sem.dias.forEach((d) => {
        const en = porDia[d][e.num]; if (!en) return;
        const ppal = en.lineas.slice().sort((a, b) => b.horas - a.horas)[0];
        pd[d] = { tarea: ppal ? D.codigoTarea(ppal.tarea) : '', horas: D.totalNormales(en), tareaExtra: D.codigoTarea(en.tareaExtra), extras: Number(en.extras) || 0 };
      });
      return { num: e.num, nombre: e.nombre, porDia: pd };
    });
    await cargarFuentes();
    const paginas = paginasPlanilla({ sociedad: soc, finca: fin, encargado: nombreUsuario(), desde: sem.desde, hasta: sem.hasta, dias: sem.dias, empleados, tareas: D.tareasDeFinca(datos.tareasFinca, soc, fin) });
    verDocumento({ titulo: 'Planilla semanal', paginas, nombrePdf: `Planilla_${fin.replace(/[^A-Za-z0-9]+/g, '_')}_${sem.desde}.pdf`, ancho: true, maxPaginas: 8,
      intro: `${soc} · ${fin} · ${D.semanaTexto(sem)}. Si un empleado hizo varias tareas el mismo día, aquí se muestra la de más horas.` });
  }
  async function verMontos() {
    const sem = await elegirSemana(); if (!sem) return;
    toast('Calculando montos…', 2000);
    const r = await planillaMontos(sem.desde, sem.hasta);
    if (r.error) return aviso('No se pudieron calcular', r.error);
    const porSoc = {};
    r.filas.forEach((f) => (porSoc[f.sociedad] = porSoc[f.sociedad] || []).push(f));
    const sum = (a, k) => a.reduce((t, x) => t + (x[k] || 0), 0);
    const cols = [['N°', 28, 1], ['Nombre', 150], ['Finca', 110], ['Horas', 32, 0, 1], ['Extra', 32, 0, 1], ['Ordinario', 62, 0, 1], ['Extras ₡', 56, 0, 1], ['Bruto', 62, 0, 1], ['CCSS', 54, 0, 1], ['Neto', 62, 0, 1], ['Cesantía', 54, 0, 1]]
      .map(([titulo, ancho, centro, derecha]) => ({ titulo, ancho, centro: !!centro, derecha: !!derecha }));
    const m = (v) => fmtMoney2(v);
    const tablas = Object.keys(porSoc).sort((a, b) => a.localeCompare(b, 'es')).map((s) => {
      const a = porSoc[s].sort((x, y) => Number(x.num) - Number(y.num));
      const filas = a.map((f) => ({ celdas: [f.num, f.nombre, f.finca, fmtCant(f.horas), fmtCant(f.extras), m(f.ordinario), m(f.extrasMonto), m(f.bruto), m(f.ccss), m(f.neto), m(f.cesantia)] }));
      filas.push({ negrita: true, fondo: '#DCFCE7', celdas: ['', 'TOTAL', '', fmtCant(sum(a, 'horas')), fmtCant(sum(a, 'extras')), m(sum(a, 'ordinario')), m(sum(a, 'extrasMonto')), m(sum(a, 'bruto')), m(sum(a, 'ccss')), m(sum(a, 'neto')), m(sum(a, 'cesantia'))] });
      return { titulos: [[s, 11], [`Planilla ${D.semanaTexto(sem)} · montos`, 8.5]], columnas: cols, filas, nota: 'Extras a valor hora × 1,5 · CCSS 10,83 % · Cesantía 5,333 % · Neto = bruto − CCSS. Solo administración.' };
    });
    await cargarFuentes();
    verDocumento({ titulo: 'Montos de la semana', paginas: paginasTablas(tablas, 842, 595), nombrePdf: `Planilla_Montos_${sem.desde}.pdf`, ancho: true, maxPaginas: 8, intro: D.semanaTexto(sem) });
  }

  // ---------- Ciclo de vida ----------
  const api = {
    el: raiz,
    refrescar() { leer(); pintar(); cargar(); },
    reiniciar() { dia = diaHoy(); leer(); pintar(); cargar(true); }
  };
  leer();
  pintar();
  return api;
}
