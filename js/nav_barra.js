// Barra inferior por perfil: módulos permitidos, orden definido por el administrador (hoja Usuarios) o por el usuario («Mi barra»).
import { db } from './store.js';
import { normalizar } from './util.js';
import { puede, nombreUsuario, barraDeUsuario } from './users.js';

export const MODULOS = [
  { k: 'registro', n: 'Registro', ic: 'registro', permiso: 'registro' },
  { k: 'diario', n: 'Diario', ic: 'diario', permiso: 'diario' },
  { k: 'boletos', n: 'Boletos', ic: 'boletos', permiso: 'boletos' },
  { k: 'reportes', n: 'Reportes', ic: 'reportes', permiso: 'reportes' },
  { k: 'planillas', n: 'Planillas', ic: 'planillas', permiso: 'planillas' },
  { k: 'ajustes', n: 'Ajustes', ic: 'ajustes', permiso: null }
];
export const modulo = (k) => MODULOS.find((m) => m.k === k) || null;
export const permitidos = () => MODULOS.filter((m) => !m.permiso || puede(m.permiso));
export const clavePorNombre = (t) => { const x = normalizar(t); const m = MODULOS.find((q) => normalizar(q.n) === x || q.k === x); return m ? m.k : null; };

const llavePersonal = () => 'mi_barra_' + normalizar(nombreUsuario() || '_');
export const barraPersonal = () => { const v = db.get(llavePersonal(), null); return Array.isArray(v) ? v.filter((k) => modulo(k)) : null; };
export const guardarBarraPersonal = (lista) => db.set(llavePersonal(), lista);
export const borrarBarraPersonal = () => db.del(llavePersonal());
export const barraDelAdmin = () => (barraDeUsuario().barra || []).map(clavePorNombre).filter(Boolean);
export const barraBloqueada = () => barraDeUsuario().bloquear && barraDelAdmin().length > 0;

/** Lista explícita (orden elegido) o null si se usa el orden normal. Orden de prioridad: administrador bloqueado, personal, administrador, normal. */
export function listaExplicita() {
  const adm = barraDelAdmin();
  if (barraBloqueada()) return adm;
  const per = barraPersonal();
  if (per && per.length) return per;
  return adm.length ? adm : null;
}

/** { barra: [claves en la barra], mas: [claves dentro de «Más»] }. Máximo 4 en la barra cuando hay «Más» (hasta 5 si caben todas). */
export function distribucion() {
  const perm = permitidos().map((m) => m.k);
  const permSet = new Set(perm);
  const exp = listaExplicita();
  let orden = exp ? [...new Set(exp)].filter((k) => permSet.has(k)) : [];
  if (!orden.length) return repartir(perm, []);
  const resto = perm.filter((k) => !orden.includes(k));
  return repartir(orden, resto);
}
function repartir(orden, resto) {
  if (!resto.length && orden.length <= 5) return { barra: orden, mas: [] };
  return { barra: orden.slice(0, 4), mas: [...orden.slice(4), ...resto] };
}
