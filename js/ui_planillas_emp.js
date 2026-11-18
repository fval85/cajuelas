// Ajustes › Empleados de planillas (solo administradores): ver y editar empleados, salario/horas con «vale desde», traslado de sociedad,
// historial de vigencias, empleados inactivos y fincas nuevas. Todo se guarda en el servidor y queda en la auditoría.
import { h, clear, toast, confirmar, dialogo, elegir, normalizar, fmtMoney2, diaHoy } from './util.js';
import { planillasAdmin } from './sync.js';
import { cabSub, etiqueta, selector } from './ui.js';
import { fechaDe, sumarDias, fmtDMA, nombreDia } from './planillas_data.js';

const num2 = (v) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
const esViernes = (iso) => !!iso && fechaDe(iso).getDay() === 5;
const proxViernes = (hoy) => sumarDias(hoy, (5 - fechaDe(hoy).getDay() + 7) % 7);
const colones = (v) => '₡' + fmtMoney2(Number(v) || 0).replace(/^₡\s?/, '');

export function pintarEmpleadosPlanillas({ raiz, irInicio }) {
  let datos = null, cargando = false, error = '', pantalla = 'lista', actual = null, ficha = null;
  let q = '', fSoc = '', fEstado = 'Activo';
  const btn = (t, fn, cls = '') => h('button', { type: 'button', class: `btn-texto ${cls} ancho-total`, onclick: fn }, t);
  const chip = (t, c) => h('span', { class: 'chip-est ' + c }, t);

  async function cargar() {
    cargando = true; error = ''; pintar();
    const r = await planillasAdmin('lista', {});
    cargando = false;
    if (r.ok && r.json && Array.isArray(r.json.empleados)) datos = r.json; else error = r.message || 'No se pudo cargar los empleados.';
    pintar();
  }
  /** Vuelve a leer la lista sin repintar (para no perder lo que se está escribiendo en un formulario). */
  async function refrescarDatos() {
    const r = await planillasAdmin('lista', {});
    if (r.ok && r.json && Array.isArray(r.json.empleados)) datos = r.json;
  }
  async function abrirFicha(e) {
    actual = e; ficha = null; ir('ficha');
    const r = await planillasAdmin('ficha', { num: e.num });
    if (r.ok) { ficha = r.json; pintar(); } else toast(r.message, 5000);
  }
  const ir = (p) => { pantalla = p; pintar(); };
  const atras = () => {
    if (pantalla === 'lista') return irInicio();
    if (['cambio', 'traslado', 'datos'].includes(pantalla)) return ir('ficha');
    ir('lista');
  };
  const titulos = { lista: 'Empleados de planillas', ficha: 'Empleado', nuevo: 'Nuevo empleado', datos: 'Datos del empleado', cambio: 'Cambio (salario, horas, finca)', traslado: 'Trasladar de sociedad' };

  function pintar() {
    clear(raiz);
    raiz.append(cabSub(titulos[pantalla] || 'Empleados', atras));
    if (error) { raiz.append(h('p', { class: 'estado aviso' }, '⚠ ' + error), btn('Reintentar', cargar)); return; }
    if (!datos) { raiz.append(h('p', { class: 'nota' }, cargando ? 'Cargando…' : '')); return; }
    if (pantalla === 'lista') return lista();
    if (pantalla === 'ficha') return pintarFicha();
    if (pantalla === 'nuevo') return formEmpleado(null);
    if (pantalla === 'datos') return formEmpleado(actual);
    if (pantalla === 'cambio') return formVigencia('cambio');
    if (pantalla === 'traslado') return formVigencia('traslado');
  }

  // ---------- Lista ----------
  function lista() {
    const busca = h('input', { class: 'campo', type: 'search', placeholder: 'Buscar por número o nombre…', value: q, autocomplete: 'off' });
    const cuerpo = h('div');
    const filtros = h('div', { class: 'fila-opc', style: { flexWrap: 'wrap' } });
    const pintaFiltros = () => {
      clear(filtros);
      [['', 'Todas'], ...datos.sociedades.map((s) => [s, s.replace(/ S\.?A\.?$/i, '').replace(/^(SOC\. AGRICOLA COMERCIAL|HACIENDA|BENEFICIADORA)\s+/i, '')])].forEach(([v, t]) =>
        filtros.append(h('button', { type: 'button', class: 'opcion-sel' + (fSoc === v ? ' on' : ''), onclick: () => { fSoc = v; pintaFiltros(); pintaLista(); } }, h('b', null, t))));
      filtros.append(h('button', { type: 'button', class: 'opcion-sel' + (fEstado === 'Inactivo' ? ' on' : ''), onclick: () => { fEstado = fEstado === 'Activo' ? 'Inactivo' : 'Activo'; pintaFiltros(); pintaLista(); } }, h('b', null, fEstado === 'Activo' ? 'Ver inactivos' : 'Ver activos')));
    };
    const pintaLista = () => {
      clear(cuerpo);
      const toks = normalizar(q).split(' ').filter(Boolean);
      const ok = datos.empleados.filter((e) => e.estado === fEstado && (!fSoc || e.sociedad === fSoc) && toks.every((t) => normalizar(`${e.num} ${e.nombre} ${e.finca} ${e.encargado}`).includes(t)));
      cuerpo.append(h('p', { class: 'nota' }, `${ok.length} empleado${ok.length === 1 ? '' : 's'}${fEstado === 'Inactivo' ? ' inactivos' : ''}`));
      ok.slice(0, 150).forEach((e) => cuerpo.append(h('button', { type: 'button', class: 'fila-aj fila-usuario' + (e.estado === 'Inactivo' ? ' inactivo' : ''), onclick: () => abrirFicha(e) },
        h('span', { class: 'tx' }, `${e.num} · ${e.nombre}`, h('small', null, `${e.finca || '—'} · ${e.encargado || 'sin encargado'}`)),
        e.proximo ? chip('CAMBIO ' + fmtDMA(e.proximo.desde).slice(0, 5), 'ambar') : null)));
      if (ok.length > 150) cuerpo.append(h('p', { class: 'nota' }, 'Hay más: use el buscador para acotar.'));
    };
    busca.addEventListener('input', () => { q = busca.value; pintaLista(); });
    raiz.append(h('div', { class: 'fila-opc' }, btn('＋ Nuevo empleado', () => ir('nuevo'), 'primario'), btn('＋ Nueva finca', async () => { await nuevaFinca(); })), busca, filtros, cuerpo);
    pintaFiltros(); pintaLista();
  }

  // ---------- Finca nueva (para una sociedad) ----------
  async function nuevaFinca(sociedadFija) {
    let soc = sociedadFija || '', copia = '';
    const nombre = h('input', { class: 'campo', type: 'text', placeholder: 'Ej. FINCA LA PALMA', autocomplete: 'off', autocapitalize: 'characters' });
    const selSoc = selector('Elija la sociedad', async () => { const v = await elegir('Sociedad', datos.sociedades.map((s) => ({ etiqueta: s, valor: s })), { buscar: false }); if (v !== undefined) { soc = v; copia = ''; selSoc.poner(soc); selCopia.poner(copia); } });
    const selCopia = selector('Copiar las tareas de… (opcional)', async () => {
      if (!soc) return toast('Primero elija la sociedad.');
      const fs = datos.fincas.filter((f) => f.sociedad === soc).map((f) => ({ etiqueta: f.finca, valor: f.finca }));
      const v = await elegir('Copiar tareas de', [{ etiqueta: '(Tareas de campo estándar: 1 a 22 y 24)', valor: '' }, ...fs], { buscar: false });
      if (v !== undefined) { copia = v; selCopia.poner(copia); }
    });
    selSoc.poner(soc);
    return new Promise((res) => {
      let hecho = false;
      const d = dialogo({ titulo: 'Nueva finca', cuerpo: [etiqueta('Sociedad'), selSoc, etiqueta('Nombre de la finca'), nombre, etiqueta('Tareas que se ofrecen en esa finca'), selCopia,
        h('p', { class: 'nota' }, 'Después puede cambiar las tareas de la finca en la hoja «Tareas por finca» (avíseme y se agrega una pantalla para eso).')],
      botones: [{ texto: 'Cancelar' }, { texto: 'Crear finca', clase: 'primario', onclick: async () => {
        if (!soc) { toast('Elija la sociedad.'); return false; }
        if (!nombre.value.trim()) { toast('Escriba el nombre de la finca.'); return false; }
        const r = await planillasAdmin('nuevaFinca', { sociedad: soc, finca: nombre.value, copiarDe: copia });
        toast(r.message, 5000);
        if (!r.ok) return false;
        hecho = true; await refrescarDatos(); res({ sociedad: soc, finca: (r.json && r.json.finca) || nombre.value.trim().toUpperCase() });
      } }] });
      d.alCerrar = () => { if (!hecho) res(null); };
    });
  }

  // ---------- Ficha ----------
  function pintarFicha() {
    const e = actual;
    if (!ficha) { raiz.append(h('p', { class: 'nota' }, 'Cargando…')); return; }
    const hoy = datos.hoy || diaHoy();
    const vs = ficha.vigencias;
    const vig = vs.find((v) => v.desde <= hoy && (!v.hasta || v.hasta >= hoy)) || vs[0];
    raiz.append(h('div', { class: 'tarjeta' }, h('b', null, `${e.num} · ${ficha.empleado.nombre}`),
      h('p', { class: 'nota' }, `Cédula ${ficha.empleado.cedula || '—'} · Asegurado ${ficha.empleado.asegurado || '—'}\n${ficha.empleado.estado === 'Activo' ? 'Activo' : 'INACTIVO'} · ${ficha.dias} día(s) de planilla registrados`)));
    if (vig) raiz.append(h('div', { class: 'tarjeta' }, h('b', null, 'Hoy'),
      h('p', { class: 'pre' }, `${vig.sociedad}\n${vig.finca}\nEncargado: ${vig.encargado || '—'}\n${vig.horas} h a la semana · valor hora ${colones(vig.valorHora)} · deducciones ${colones(vig.deducciones)}`)));
    raiz.append(btn('✏️ Editar nombre, cédula o estado', () => ir('datos')),
      btn('💰 Cambio de salario, horas, encargado o finca', () => { actual = { ...actual, editar: null }; ir('cambio'); }, 'primario'),
      btn('🔁 Trasladar de sociedad', () => { actual = { ...actual, editar: null }; ir('traslado'); }));
    raiz.append(h('div', { class: 'titulo-grupo' }, 'Historial de cambios'));
    vs.forEach((v) => {
      const ult = vs.length === 1;
      raiz.append(h('div', { class: 'tarjeta' },
        h('b', null, `${fmtDMA(v.desde)} → ${v.hasta ? fmtDMA(v.hasta) : 'vigente'}`),
        h('p', { class: 'pre' }, `${v.sociedad} · ${v.finca}\n${v.encargado || 'sin encargado'} · ${v.horas} h · ${colones(v.valorHora)}/h · deducciones ${colones(v.deducciones)}`),
        h('div', { class: 'fila-opc' }, btn('Editar', () => { actual = { ...actual, editar: v }; ir('cambio'); }),
          ult ? null : btn('Quitar', async () => {
            if (!(await confirmar('Quitar este cambio', `Se borra el período del ${fmtDMA(v.desde)}. El período anterior se extiende hasta el siguiente cambio.`, { si: 'Quitar', peligro: true }))) return;
            const r = await planillasAdmin('quitarVigencia', { id: v.id }); toast(r.message, 6000);
            if (r.ok) { await cargar(); abrirFicha(e); }
          }, 'peligro'))));
    });
    raiz.append(ficha.empleado.estado === 'Activo'
      ? btn('Marcar como Inactivo (ya no trabaja)', () => cambiarEstado('Inactivo'), 'peligro')
      : btn('Reactivar empleado', () => cambiarEstado('Activo'), 'primario'));
  }
  async function cambiarEstado(est) {
    const em = ficha.empleado;
    if (!(await confirmar(est === 'Inactivo' ? 'Marcar como Inactivo' : 'Reactivar', est === 'Inactivo' ? 'Ya no aparece en las planillas de los encargados. Su historial se conserva y se puede reactivar.' : 'Vuelve a aparecer en las planillas.', { si: 'Aceptar' }))) return;
    const r = await planillasAdmin('guardarEmpleado', { num: em.num, nombre: em.nombre, cedula: em.cedula, asegurado: em.asegurado, estado: est });
    toast(r.message, 5000);
    if (r.ok) { await cargar(); irLista(); }
  }
  const irLista = () => ir('lista');

  // ---------- Formularios ----------
  const campo = (rot, el) => [etiqueta(rot), el];
  const txt = (valor, ph, extra = {}) => h('input', { class: 'campo', type: 'text', value: valor || '', placeholder: ph || '', autocomplete: 'off', ...extra });

  /** Sociedad + finca + encargado (con «＋ Crear finca nueva» dentro de la lista de fincas). */
  function elegirUbicacion(v) {
    const selSoc = selector('Elija la sociedad', async () => {
      const r = await elegir('Sociedad', datos.sociedades.map((s) => ({ etiqueta: s, valor: s })), { buscar: false });
      if (r !== undefined) { if (r !== v.sociedad) v.finca = ''; v.sociedad = r; selSoc.poner(v.sociedad); selFin.poner(v.finca); }
    });
    const selFin = selector('Elija la finca', async () => {
      if (!v.sociedad) return toast('Primero elija la sociedad.');
      const fs = datos.fincas.filter((f) => f.sociedad === v.sociedad).map((f) => ({ etiqueta: f.finca, valor: f.finca }));
      const r = await elegir('Finca', [...fs, { etiqueta: '＋ Crear finca nueva en esta sociedad…', valor: '__nueva__' }], { buscar: false });
      if (r === undefined) return;
      if (r === '__nueva__') { const n = await nuevaFinca(v.sociedad); if (n) { v.finca = n.finca; selFin.poner(v.finca); } return; }
      v.finca = r; selFin.poner(v.finca);
    });
    const selEnc = selector('Elija el encargado', async () => {
      const r = await elegir('Encargado (usuario que llena la planilla)', datos.encargados.map((n) => ({ etiqueta: n, valor: n })));
      if (r !== undefined) { v.encargado = r; selEnc.poner(v.encargado); }
    });
    selSoc.poner(v.sociedad); selFin.poner(v.finca); selEnc.poner(v.encargado);
    return [...campo('Sociedad', selSoc), ...campo('Finca', selFin), ...campo('Encargado', selEnc),
      h('p', { class: 'nota' }, 'El encargado debe ser un usuario de la app con el mismo nombre; si no coincide, no verá al empleado.')];
  }

  function formEmpleado(emp) {
    const nuevo = !emp;
    const v = nuevo ? { sociedad: '', finca: '', encargado: '' } : null;
    const fe = ficha && ficha.empleado;
    const nNum = txt(emp ? emp.num : '', 'Número (hasta 6 dígitos)', { inputmode: 'numeric', ...(emp ? { disabled: '' } : {}) });
    const nNom = txt(emp ? (fe ? fe.nombre : emp.nombre) : '', 'Nombre completo');
    const nCed = txt(fe ? fe.cedula : '', 'Cédula');
    const nAse = txt(fe ? fe.asegurado : '', 'N° de asegurado CCSS');
    raiz.append(...campo('N° de empleado' + (nuevo ? '' : ' (no cambia)'), nNum), ...campo('Nombre completo', nNom), ...campo('Cédula', nCed), ...campo('N° asegurado (CCSS)', nAse));
    let horas, vh, ded, desde;
    if (nuevo) {
      horas = txt('48', 'Horas por semana', { inputmode: 'decimal' }); vh = txt('', 'Valor hora ₡', { inputmode: 'decimal' }); ded = txt('0', 'Deducciones ₡', { inputmode: 'decimal' });
      desde = h('input', { class: 'campo', type: 'date', value: sumarDias(proxViernes(datos.hoy || diaHoy()), -7) });
      raiz.append(...elegirUbicacion(v), ...campo('Horas por semana (48, 42, 30, 24)', horas), ...campo('Valor hora (₡)', vh), ...campo('Deducciones (₡)', ded), ...campo('Empieza a trabajar desde', desde));
    }
    raiz.append(btn(nuevo ? 'Crear empleado' : 'Guardar datos', async () => {
      if (!nNom.value.trim()) return toast('Escriba el nombre completo.');
      if (nuevo) {
        if (!/^\d{1,6}$/.test(nNum.value.trim())) return toast('El número debe tener de 1 a 6 dígitos.');
        if (datos.empleados.some((e) => e.num === nNum.value.trim())) return toast('Ese número ya existe.');
        if (!v.sociedad || !v.finca) return toast('Elija la sociedad y la finca.');
        if (!(num2(vh.value) >= 0) || !(num2(horas.value) > 0)) return toast('Revise las horas y el valor hora.');
      }
      const r = await planillasAdmin('guardarEmpleado', { num: nNum.value.trim(), nombre: nNom.value, cedula: nCed.value, asegurado: nAse.value, estado: emp ? (fe ? fe.estado : emp.estado) : 'Activo',
        ...(nuevo ? { sociedad: v.sociedad, finca: v.finca, encargado: v.encargado, horas: horas.value, valorHora: vh.value, deducciones: ded.value, desde: desde.value } : {}) });
      toast(r.message, 5000);
      if (r.ok) { await cargar(); if (nuevo) irLista(); else abrirFicha(emp); }
    }, 'primario'), btn('Cancelar', atras));
  }

  function formVigencia(op) {
    const hoy = datos.hoy || diaHoy();
    const vs = ficha ? ficha.vigencias : [];
    const edita = actual.editar || null;
    const base = edita || vs.find((x) => x.desde <= hoy && (!x.hasta || x.hasta >= hoy)) || vs[0] || {};
    const v = { sociedad: op === 'traslado' ? '' : base.sociedad || '', finca: op === 'traslado' ? '' : base.finca || '', encargado: op === 'traslado' ? '' : base.encargado || '' };
    const desde = h('input', { class: 'campo', type: 'date', value: edita ? edita.desde : proxViernes(hoy) });
    const horas = txt(String(base.horas ?? 48), '', { inputmode: 'decimal' }), vh = txt(String(base.valorHora ?? 0), '', { inputmode: 'decimal' }), ded = txt(String(base.deducciones ?? 0), '', { inputmode: 'decimal' });
    const aviso = h('p', { class: 'nota' });
    const refresca = () => { const f = desde.value; aviso.textContent = !f ? '' : (esViernes(f) ? `Vale desde el ${nombreDia(f)} ${fmtDMA(f)}: semana completa (viernes a jueves).` : `⚠ ${fmtDMA(f)} es ${nombreDia(f)}. Debe ser un viernes: los cambios valen por semana completa.`); };
    desde.addEventListener('input', refresca);
    if (op === 'traslado') raiz.append(h('div', { class: 'tarjeta' }, h('b', null, `${actual.num} · ${actual.nombre}`), h('p', { class: 'pre' }, `Hoy: ${base.sociedad || ''}\n${base.finca || ''}\nEl N° de empleado NO cambia y el historial se conserva.`)));
    else if (edita) raiz.append(h('p', { class: 'nota' }, `Editando el período que empezó el ${fmtDMA(edita.desde)}.`));
    raiz.append(...campo(op === 'traslado' ? 'Pasa a trabajar en (desde el viernes)' : 'Vale desde (viernes)', desde), aviso, ...elegirUbicacion(v),
      ...campo('Horas por semana', horas), ...campo('Valor hora (₡)', vh), ...campo('Deducciones (₡)', ded));
    refresca();
    raiz.append(btn(op === 'traslado' ? 'Ver el efecto y trasladar' : 'Ver el efecto y guardar', async () => {
      if (!esViernes(desde.value)) return toast('La fecha debe ser un viernes.');
      if (!v.sociedad || !v.finca) return toast('Elija la sociedad y la finca.');
      if (op === 'traslado' && !edita && v.sociedad === base.sociedad) return toast('Elija una sociedad distinta a la actual.');
      if (!(num2(horas.value) > 0) || !(num2(vh.value) >= 0) || !(num2(ded.value) >= 0)) return toast('Revise las horas, el valor hora y las deducciones.');
      const cambios = [];
      const cmp = (t, a, b) => { if (String(a) !== String(b)) cambios.push(`${t}: ${a || '—'} → ${b || '—'}`); };
      cmp('Sociedad', base.sociedad, v.sociedad); cmp('Finca', base.finca, v.finca); cmp('Encargado', base.encargado, v.encargado);
      cmp('Horas', base.horas, num2(horas.value)); cmp('Valor hora', colones(base.valorHora), colones(num2(vh.value))); cmp('Deducciones', colones(base.deducciones), colones(num2(ded.value)));
      const cuerpo = `${actual.num} · ${actual.nombre}\nDesde el viernes ${fmtDMA(desde.value)} (semana completa)\n\n${cambios.length ? cambios.join('\n') : 'Sin cambios en los datos.'}\n\nLas planillas anteriores a esa fecha quedan como están${op === 'traslado' ? ' (en la sociedad actual)' : ''}. El N° de empleado no cambia.`;
      if (!(await confirmar(op === 'traslado' ? 'Confirmar traslado' : 'Confirmar cambio', cuerpo, { si: 'Confirmar' }))) return;
      const r = await planillasAdmin(op === 'traslado' && !edita ? 'traslado' : 'cambio', { num: actual.num, id: edita ? edita.id : undefined, desde: desde.value, sociedad: v.sociedad, finca: v.finca, encargado: v.encargado, horas: horas.value, valorHora: vh.value, deducciones: ded.value });
      toast(r.message, 7000);
      if (r.ok) { const e = actual; actual = { ...e, editar: null }; await cargar(); abrirFicha(e); }
    }, 'primario'), btn('Cancelar', atras));
  }

  cargar();
}
