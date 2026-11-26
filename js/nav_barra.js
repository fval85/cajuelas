// Módulos de la app y su orden en la pantalla de inicio (desde 2.27.0 ya no hay barra de abajo).
import { normalizar } from './util.js';
import { puede } from './users.js';

export const MODULOS = [
  { k: 'registro', n: 'Registro', ic: 'registro', permiso: 'registro' },
  { k: 'diario', n: 'Diario', ic: 'diario', permiso: 'diario' },
  { k: 'boletos', n: 'Boletos', ic: 'boletos', permiso: 'boletos' },
  { k: 'reportes', n: 'Reportes', ic: 'reportes', permiso: 'reportes' },
  { k: 'planillas', n: 'Planillas', ic: 'planillas', permiso: 'planillas' },
  { k: 'ajustes', n: 'Ajustes', ic: 'ajustes', permiso: null }
];
export const modulo = (k) => MODULOS.find((m) => m.k === k) || null;
export const puedeEntrar = (m) => !m.permiso || puede(m.permiso);
export const permitidos = () => MODULOS.filter(puedeEntrar);
export const clavePorNombre = (t) => { const x = normalizar(t); const m = MODULOS.find((q) => normalizar(q.n) === x || q.k === x); return m ? m.k : null; };

/** Orden del inicio: primero los módulos a los que SÍ puede entrar y luego los bloqueados. Ajustes siempre queda de último entre los permitidos. */
export function ordenInicio() {
  const ok = MODULOS.filter((m) => puedeEntrar(m) && m.k !== 'ajustes');
  const aj = MODULOS.filter((m) => puedeEntrar(m) && m.k === 'ajustes');
  const no = MODULOS.filter((m) => !puedeEntrar(m));
  return { permitidos: [...ok, ...aj], bloqueados: no };
}
