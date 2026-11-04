// Avisos y pendientes: recordatorio de saldo (7:00 pm) para quien usa Boletos y panel «Pendientes» para administradores.
import { db, deviceName, cat } from './store.js';
import { normalizar, diaHoy } from './util.js';
import { puede } from './users.js';
import { boletos, destinoMov, BOL_SALDO } from './data.js';
import { cuantosPendientes } from './sync.js';

export const HORA_SALDO = 19;
const eq = (a, b) => normalizar(a) === normalizar(b);
const pasoLaHora = () => new Date().getHours() >= HORA_SALDO;
const hace = (dia, n) => { const d = new Date(); d.setDate(d.getDate() - n); return dia >= `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Dispositivo propio sin saldo de hoy (después de las 7 pm), siempre que haya usado Boletos en los últimos 10 días. */
export function saldoPendienteHoy() {
  if (!puede('boletos') || puede('config') || !pasoLaHora()) return false;
  const yo = deviceName(), hoy = diaHoy();
  const mios = boletos.items().filter((m) => !m.anulado && eq(m.dispositivo, yo));
  if (!mios.some((m) => hace(m.dia, 10))) return false;
  return !mios.some((m) => m.tipo === BOL_SALDO && m.dia === hoy);
}

/** Para administradores: dispositivos con movimientos recientes que no han registrado el saldo de hoy (según lo último que se descargó en Boletos). */
export function saldosFaltantes() {
  if (!pasoLaHora()) return [];
  const hoy = diaHoy();
  const todos = boletos.items().concat(db.get('bol_remotos', [])).filter((m) => !m.anulado);
  const disp = new Map();
  todos.forEach((m) => { if (hace(m.dia, 10)) { const d = m.tipo === BOL_SALDO ? m.dispositivo : destinoMov(m); if (d && !disp.has(normalizar(d))) disp.set(normalizar(d), d); } });
  return [...disp.entries()].filter(([k]) => !todos.some((m) => m.tipo === BOL_SALDO && m.dia === hoy && normalizar(m.dispositivo) === k)).map(([, v]) => v).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Lista de pendientes para el administrador: [{ic, texto, accion?}]. */
export function pendientesAdmin() {
  const out = [];
  const n = cuantosPendientes();
  if (n) out.push({ ic: '⏳', texto: `${n} ${n === 1 ? 'envío pendiente' : 'envíos pendientes'} de enviar a Google Sheets`, accion: 'enviar' });
  if (document.getElementById('aviso-act')) out.push({ ic: '⬆', texto: 'Hay una versión nueva de la aplicación', accion: 'actualizar' });
  const falt = saldosFaltantes();
  if (falt.length) out.push({ ic: '🎟', texto: `Saldo de boletos sin registrar hoy: ${falt.join(', ')}` });
  if (!cat.actualizado || Date.now() - cat.actualizado > 24 * 3600000) out.push({ ic: '📚', texto: 'El catálogo lleva más de un día sin actualizarse', accion: 'catalogo' });
  const resp = db.get('ultimo_respaldo', 0);
  if (!resp || Date.now() - resp > 7 * 86400000) out.push({ ic: '💾', texto: 'Hace más de 7 días que no hace una copia de seguridad' });
  return out;
}
