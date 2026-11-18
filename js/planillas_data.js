// Planillas: semana (viernes a jueves), horas sugeridas y agrupación de registros. Sin interfaz: así se puede probar aparte.
import { normalizar } from './util.js';

const p2 = (n) => String(n).padStart(2, '0');
export const isoDe = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const fechaDe = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d, 12, 0, 0); };
export const sumarDias = (iso, n) => { const d = fechaDe(iso); d.setDate(d.getDate() + n); return isoDe(d); };
/** Viernes que inicia la semana (viernes a jueves) que contiene el día. */
export function viernesDe(iso) { const d = fechaDe(iso); return sumarDias(iso, -((d.getDay() + 2) % 7)); }
export const semanaDe = (iso) => { const v = viernesDe(iso); return { desde: v, hasta: sumarDias(v, 6), dias: Array.from({ length: 7 }, (_, i) => sumarDias(v, i)) }; };
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const nombreDia = (iso) => DIAS[fechaDe(iso).getDay()];
export const fmtDM = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const fmtDMA = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const etiquetaDia = (iso) => `${nombreDia(iso)} ${fmtDMA(iso)}`;
export const semanaTexto = (s) => `Semana del vie ${fmtDM(s.desde)} al jue ${fmtDM(s.hasta)}`;

/** Horas sugeridas por día = horas semanales ÷ 6 (48→8, 42→7, 30→5, 24→4). */
export const horasSugeridas = (semanales) => (semanales > 0 ? Math.round(semanales / 6) : 8);
export const codigoTarea = (t) => { const m = String(t || '').match(/^\s*(\d+)/); return m ? m[1].padStart(2, '0') : ''; };

export const claveDia = (dia, soc, fin) => `${dia}|${normalizar(soc)}|${normalizar(fin)}`;
export const numTxt = (v) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : NaN; };

export const ESTADOS = [
  { v: 'TRABAJO', t: 'Trabajó', ic: '✅' }, { v: 'INCAPACIDAD', t: 'Incapacidad', ic: '🏥' }, { v: 'VACACIONES', t: 'Vacaciones', ic: '🏖' },
  { v: 'PERMISO', t: 'Permiso', ic: '📝' }, { v: 'AUSENTE', t: 'Ausente', ic: '🚫' }];
export const estadoTxt = (v) => (ESTADOS.find((x) => x.v === v) || ESTADOS[0]).t;
/** Estados en que se pagan/cuentan horas (llevan tareas). Incapacidad, permiso y ausencia van en 0 horas. */
export const conHoras = (est) => !est || est === 'TRABAJO' || est === 'VACACIONES';
export const estadoDeEntrada = (e) => (e && e.estadoDia) || 'TRABAJO';

/** Valida lo que el encargado escribió para un empleado. Devuelve un mensaje de error o null. */
export function validarEntrada(e) {
  if (e.nota && String(e.nota).length > 200) return 'La nota no puede pasar de 200 letras.';
  const est = estadoDeEntrada(e);
  if (est === 'INCAPACIDAD') {
    if (!e.inc || !['CCSS', 'INS'].includes(e.inc.tipo)) return 'Elija el tipo de incapacidad: CCSS o INS.';
    if (e.inc.hasta && e.inc.dia && e.inc.hasta < e.inc.dia) return 'La fecha «Hasta» no puede ser anterior al día.';
  }
  if (!conHoras(est)) return null;
  const horas = e.lineas.reduce((t, l) => t + (Number(l.horas) || 0), 0);
  const extras = Number(e.extras) || 0;
  for (const l of e.lineas) {
    const h = Number(l.horas);
    if (!Number.isFinite(h) || h < 0 || h > 24) return 'Las horas de cada tarea deben estar entre 0 y 24.';
    if (h > 0 && !l.tarea) return 'Elija la tarea de cada línea que tiene horas.';
  }
  if (!Number.isFinite(extras) || extras < 0 || extras > 24) return 'Las horas extra deben estar entre 0 y 24.';
  if (extras > 0 && !e.tareaExtra) return 'Elija la tarea de las horas extra.';
  if (horas + extras > 24) return 'Entre horas normales y extra no pueden pasar de 24 en un día.';
  return null;
}
export const totalNormales = (e) => (e && conHoras(e.estadoDia) ? e.lineas.reduce((t, l) => t + (Number(l.horas) || 0), 0) : 0);

/** Agrupa filas del servidor (una por tarea) en una entrada por empleado. */
export function entradasDeRegistros(regs) {
  const por = {};
  regs.forEach((r) => {
    if (r.estado === 'ANULADO') return;
    const e = por[r.num] || (por[r.num] = { estadoDia: 'TRABAJO', lineas: [], extras: 0, tareaExtra: '', sinLabor: false, nota: '', inc: null });
    if (r.estadoDia) e.estadoDia = r.estadoDia;
    if (r.nota && !e.nota) e.nota = r.nota;
    if (r.estadoDia === 'INCAPACIDAD') e.inc = { tipo: r.incTipo || '', boleta: r.incBoleta || '', hasta: r.incHasta || '' };
    if (!conHoras(r.estadoDia)) return;
    if (r.tarea === 'SIN LABOR') { e.sinLabor = true; return; }
    if (r.horas > 0) e.lineas.push({ tarea: r.tarea, horas: r.horas });
    if (r.extras > 0) { e.extras += r.extras; e.tareaExtra = e.tareaExtra || r.tarea; }
  });
  return por;
}

/** Datos que se mandan al servidor por empleado. */
export function empleadoParaEnvio(num, en, dia) {
  const est = estadoDeEntrada(en);
  const o = { num, estadoDia: est, nota: en.nota || '' };
  if (conHoras(est)) { o.lineas = en.lineas.filter((l) => l.horas > 0); o.extras = en.extras || 0; o.tareaExtra = en.tareaExtra || ''; }
  if (est === 'INCAPACIDAD') o.inc = { tipo: en.inc.tipo, boleta: en.inc.boleta || '', hasta: en.inc.hasta || dia };
  return o;
}

/** ¿El empleado (con su vigencia desde/hasta) pertenece a la sociedad y finca ese día? */
export const vigenteEn = (e, dia) => (!e.desde || e.desde <= dia) && (!e.hasta || e.hasta >= dia);
/** Empleados con vigencia ese día (si no se da día, todas las vigencias). */
export const empsDia = (emps, dia) => (dia ? emps.filter((e) => vigenteEn(e, dia)) : emps);
/** Incapacidades que cubren ese día para un empleado, o null. */
export const incapacidadDe = (incs, num, dia) => (incs || []).find((i) => String(i.num) === String(num) && i.desde <= dia && i.hasta >= dia) || null;

/** Tareas que se ofrecen para una sociedad + finca (hoja «Tareas por finca»). */
export function tareasDeFinca(tareasFinca, soc, fin) {
  const t = (tareasFinca || []).find((x) => normalizar(x.sociedad) === normalizar(soc) && normalizar(x.finca) === normalizar(fin));
  return t ? t.tareas : [];
}
export const sociedadesDe = (emps, dia) => [...new Set(empsDia(emps, dia).map((e) => e.sociedad))].sort((a, b) => a.localeCompare(b, 'es'));
export const fincasDe = (emps, soc, dia) => [...new Set(empsDia(emps, dia).filter((e) => normalizar(e.sociedad) === normalizar(soc)).map((e) => e.finca))].sort((a, b) => a.localeCompare(b, 'es'));
export const empleadosDeFinca = (emps, soc, fin, dia) => empsDia(emps, dia).filter((e) => normalizar(e.sociedad) === normalizar(soc) && normalizar(e.finca) === normalizar(fin)).sort((a, b) => Number(a.num) - Number(b.num));

/** Descripción corta de una entrada para la lista. */
export function resumenEntrada(e) {
  if (!e) return 'Sin registrar';
  const est = estadoDeEntrada(e), nt = e.nota ? ' · 📝' : '';
  if (est === 'INCAPACIDAD') return `Incapacidad ${e.inc && e.inc.tipo ? e.inc.tipo : ''}${e.inc && e.inc.boleta ? ' · ' + e.inc.boleta : ''}${nt}`;
  if (est === 'PERMISO' || est === 'AUSENTE') return estadoTxt(est) + nt;
  const n = totalNormales(e), pre = est === 'VACACIONES' ? 'Vacaciones · ' : '';
  if (!n && !(Number(e.extras) > 0)) return (pre ? 'Vacaciones' : 'Sin labor') + nt;
  const tareas = [...new Set(e.lineas.filter((l) => l.horas > 0).map((l) => l.tarea))];
  const base = tareas.length ? `${tareas.length > 1 ? tareas.length + ' tareas' : tareas[0]} · ${n} h` : '';
  return pre + base + (e.extras > 0 ? `${base ? ' · ' : ''}extras ${e.extras}` : '') + nt;
}
