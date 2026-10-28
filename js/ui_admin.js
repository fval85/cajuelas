// Herramientas de administrador: buscar en la hoja de Google (cualquier usuario, dispositivo, fecha y sociedad),
// reimprimir, reenviar en masa y corregir la fecha de un comprobante emitido con el día equivocado.
import { toast, elegir, elegirVarios, confirmar, formulario, normalizar, fmtNum, diaLegible, diaHoy } from './util.js';
import { configurado, db } from './store.js';
import { recibos, aGrupo } from './data.js';
import { recibosDelRango, registroDelDia, corregirFecha } from './sync.js';
import { pedirPeriodo, listaBuscable } from './ui.js';

const dias = (desde, hasta) => {
  const out = [];
  for (let d = new Date(desde + 'T12:00:00'), f = new Date(hasta + 'T12:00:00'); d <= f; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
};

/** Pide el periodo y el usuario y trae de Google Sheets los recibos de Diario. Devuelve {lista, desde, hasta} o null. */
export async function buscarRecibosHoja(titulo) {
  if (!configurado()) { toast('Falta configurar la conexión con Google Sheets en Ajustes.', 5000); return null; }
  const f = await pedirPeriodo({ titulo, usuarios: true, textoBoton: 'Buscar' });
  if (!f) return null;
  toast('Buscando en la hoja…', 2500);
  const r = await recibosDelRango(f.desde, f.hasta);
  if (r.error) { toast(r.error, 6000); return null; }
  const lista = r.lista.filter((x) => !f.usuario || normalizar(x.usuario) === normalizar(f.usuario) || (f.usuario === '(sin usuario)' && !x.usuario));
  if (!lista.length) { toast('No hay recibos con esos datos en la hoja.', 5000); return null; }
  return { lista, desde: f.desde, hasta: f.hasta };
}

/** Igual para Registro: agrupa las líneas en comprobantes (máximo 31 días por consulta). */
export async function buscarComprobantesHoja(titulo) {
  if (!configurado()) { toast('Falta configurar la conexión con Google Sheets en Ajustes.', 5000); return null; }
  const f = await pedirPeriodo({ titulo, usuarios: true, textoBoton: 'Buscar' });
  if (!f) return null;
  const ds = dias(f.desde, f.hasta);
  if (ds.length > 31) { toast('Para Registro el rango máximo es de 31 días.', 5000); return null; }
  toast('Buscando en la hoja…', 2500);
  const grupos = [];
  for (const d of ds) {
    const r = await registroDelDia(d);
    if (r.error) { toast(r.error, 6000); return null; }
    const mapa = new Map();
    r.lista.forEach((l) => { const k = l.comprobante + '|' + l.dispositivo; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(l); });
    mapa.forEach((ls) => {
      if (f.usuario && normalizar(ls[0].usuario) !== normalizar(f.usuario) && !(f.usuario === '(sin usuario)' && !ls[0].usuario)) return;
      grupos.push({ ...aGrupo(ls), dispositivo: ls[0].dispositivo });
    });
  }
  if (!grupos.length) { toast('No hay comprobantes con esos datos en la hoja.', 5000); return null; }
  return { lista: grupos, desde: f.desde, hasta: f.hasta };
}

/** Deja escoger las sociedades (Todas = sin filtro) de una lista de recibos o comprobantes. */
export async function filtrarSociedades(lista) {
  const nombres = [...new Set(lista.map((x) => x.sociedad).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (nombres.length < 2) return lista;
  const sel = await elegirVarios('Sociedades a incluir', nombres, [], { detalle: 'Deje «Todas» para incluirlas todas.' });
  if (sel === undefined) return null;
  return sel.length ? lista.filter((x) => sel.some((s) => normalizar(s) === normalizar(x.sociedad))) : lista;
}

export const itemRecibo = (x) => ({
  titulo: `${x.numero}  ·  ${x.sociedad}`,
  detalle: `${diaLegible(x.dia)}  ·  ${x.finca}  ·  ${fmtNum(x.medidas * 10 + x.cajuelas + x.cuartillos / 100, 2)} cajuelas  ·  ${x.usuario || 'sin usuario'}  ·  ${x.dispositivo}`,
  busqueda: `${x.numero} ${x.sociedad} ${x.finca} ${x.lote} ${x.dia} ${x.usuario} ${x.dispositivo}`, valor: x
});
export const itemComprobante = (g) => ({
  titulo: `${g.numero}  ·  ${g.persona}`,
  detalle: `${diaLegible(g.date)}  ·  ${g.sociedad}  ·  ${g.finca}  ·  ${g.usuario || 'sin usuario'}  ·  ${g.dispositivo}`,
  busqueda: `${g.numero} ${g.persona} ${g.sociedad} ${g.finca} ${g.date} ${g.usuario} ${g.dispositivo}`, valor: g
});

/** Corrige el día de un recibo/comprobante. tipo: 'recibo' | 'registro'. Devuelve true si se corrigió. */
export async function corregirFechaComprobante(tipo, { numero, dispositivo, dia, detalle }) {
  const v = await formulario('Corregir fecha', [{ etiqueta: 'Fecha correcta', tipo: 'date', valor: dia }],
    { ok: 'Continuar', detalle: `${tipo === 'recibo' ? 'Recibo' : 'Comprobante'} ${numero}\n${detalle}\nFecha actual: ${diaLegible(dia)}`,
      validar: (vals) => (!vals[0] ? 'Elija la fecha.' : vals[0] === dia ? 'La fecha es la misma.' : vals[0] > diaHoy() ? 'La fecha no puede ser futura.' : null) });
  if (!v) return false;
  const nueva = v[0];
  const si = await confirmar('¿Corregir la fecha?',
    `${numero}: del ${diaLegible(dia)} al ${diaLegible(nueva)}.\n\nSe cambia el día en la hoja de Google (también en su anulación, si la tiene) y quedará anotado en la hoja «Auditoría» con su nombre. Los reportes de ambos días se actualizan.`, { si: 'Corregir fecha' });
  if (!si) return false;
  const r = await corregirFecha({ tipo, comprobante: numero, dispositivo, diaActual: dia, diaNuevo: nueva });
  if (r.error) { toast(r.error, 7000); return false; }
  if (tipo === 'recibo') {
    const a = recibos.items();
    recibos.guardar(a.map((x) => (x.numero === numero && x.dia === dia && normalizar(x.dispositivo) === normalizar(dispositivo) ? { ...x, dia: nueva } : x)));
  }
  toast('Fecha corregida.', 4000);
  return true;
}

export { elegir, listaBuscable, db };
