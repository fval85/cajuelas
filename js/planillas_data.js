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

/** Valida lo que el encargado escribió para un empleado. Devuelve un mensaje de error o null. */
export function validarEntrada(e) {
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
export const totalNormales = (e) => e.lineas.reduce((t, l) => t + (Number(l.horas) || 0), 0);

/** Agrupa filas del servidor (una por tarea) en una entrada por empleado: {lineas, extras, tareaExtra, sinLabor}. */
export function entradasDeRegistros(regs) {
  const por = {};
  regs.forEach((r) => {
    if (r.estado === 'ANULADO') return;
    const e = por[r.num] || (por[r.num] = { lineas: [], extras: 0, tareaExtra: '', sinLabor: false });
    if (r.tarea === 'SIN LABOR') { e.sinLabor = true; return; }
    if (r.horas > 0) e.lineas.push({ tarea: r.tarea, horas: r.horas });
    if (r.extras > 0) { e.extras += r.extras; e.tareaExtra = e.tareaExtra || r.tarea; }
  });
  return por;
}

/** Tareas que se ofrecen para una sociedad + finca (hoja «Tareas por finca»). */
export function tareasDeFinca(tareasFinca, soc, fin) {
  const t = (tareasFinca || []).find((x) => normalizar(x.sociedad) === normalizar(soc) && normalizar(x.finca) === normalizar(fin));
  return t ? t.tareas : [];
}
export const sociedadesDe = (emps) => [...new Set(emps.map((e) => e.sociedad))].sort((a, b) => a.localeCompare(b, 'es'));
export const fincasDe = (emps, soc) => [...new Set(emps.filter((e) => normalizar(e.sociedad) === normalizar(soc)).map((e) => e.finca))].sort((a, b) => a.localeCompare(b, 'es'));
export const empleadosDeFinca = (emps, soc, fin) => emps.filter((e) => normalizar(e.sociedad) === normalizar(soc) && normalizar(e.finca) === normalizar(fin)).sort((a, b) => Number(a.num) - Number(b.num));

/** Descripción corta de una entrada para la lista. */
export function resumenEntrada(e) {
  if (!e) return 'Sin registrar';
  const n = totalNormales(e);
  if (!n && !(Number(e.extras) > 0)) return 'Sin labor';
  const tareas = [...new Set(e.lineas.filter((l) => l.horas > 0).map((l) => l.tarea))];
  const base = tareas.length ? `${tareas.length > 1 ? tareas.length + ' tareas' : tareas[0]} · ${n} h` : '';
  return base + (e.extras > 0 ? `${base ? ' · ' : ''}extras ${e.extras}` : '');
}
