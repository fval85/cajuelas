// Datos de Registro, Diario y Boletos: almacenes locales, cálculos y registros para Google Sheets.
import { db, siguienteNumero, confirmarNumero, valorCajuelas, fichaKey, cat, findCosecha, findSociedad, findPersona, cosechaDeSociedad, deviceName } from './store.js';
import { nombreUsuario } from './users.js';
import { normalizar, parseQty, soloDigitos, plainNumber, stampCorto, diaHoy, ahoraTxt } from './util.js';

// ====================== REGISTRO (comprobantes de cambio de fichas) ======================
export const lineas = {
  todas: () => db.get('daily_lines', []),
  guardar: (a) => db.set('daily_lines', a)
};
export const montoLinea = (l) => parseQty(l.quantity) * l.price;

/** Agrupa las líneas de un comprobante (con cosecha y tarjeta tomadas del catálogo si faltan). */
export function aGrupo(ls) {
  const f = ls[0];
  const cosecha = f.cosecha || cosechaDeSociedad(f.sociedad);
  let tarjeta = (ls.find((l) => l.tarjeta) || {}).tarjeta;
  if (!tarjeta) {
    const p = findPersona(findSociedad(findCosecha(cosecha), f.sociedad), f.personName);
    tarjeta = p ? p.tarjeta : '';
  }
  const total = ls.reduce((t, l) => t + montoLinea(l), 0);
  const deduccion = ls.reduce((t, l) => t + (l.deduccion || 0), 0);
  return {
    numero: f.comprobante, date: f.date, emitido: f.emitido, cosecha, sociedad: f.sociedad, finca: f.finca,
    persona: f.personName, tarjeta: tarjeta || '', lines: ls, anulado: ls.every((l) => l.anulado), motivo: f.motivo || '',
    anuladoFecha: f.anuladoFecha || '', usuario: f.usuario || '', anuladoPor: f.anuladoPor || '', provisional: ls.some((l) => l.provisional), total, deduccion, neto: total - deduccion
  };
}
export function todosLosComprobantes() {
  const mapa = new Map();
  lineas.todas().filter((l) => l.comprobante).forEach((l) => {
    const k = l.comprobante + '|' + l.date;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  });
  return [...mapa.values()].map(aGrupo).reverse();
}

export function payloadRegistro({ reportId, dateText, cosecha, sociedad, finca, personName, codigo, tarjeta, deduccion, valid, comprobante, estado = 'ACTIVO', motivo = '', usuario = nombreUsuario(), provisional = false }) {
  const sumNumbers = valid.reduce((t, v) => t + parseQty(v[0]), 0);
  const sumPrices = valid.reduce((t, v) => t + v[1], 0);
  const total = valid.reduce((t, v) => t + parseQty(v[0]) * v[1], 0);
  return {
    reportId, dia: diaHoy(), fechaHora: dateText, dispositivo: deviceName(), cosecha, sociedad, finca, comprobante, estado, motivo, usuario, provisional: !!provisional,
    codigo, nombreCompleto: personName, tarjeta: soloDigitos(tarjeta), deduccion, cantidadLineas: valid.length, sumaNumeros: sumNumbers,
    sumaPrecios: sumPrices, totalMultiplicado: total, totalPagar: total - deduccion,
    lineas: valid.map((v) => ({ cantidad: v[0], precio: v[1], resultado: parseQty(v[0]) * v[1] }))
  };
}
export const idReporte = (finca) => stampCorto() + '_' + String(finca).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export { plainNumber };

// ====================== DIARIO (recibos de café) ======================
export function rc(r) {
  const recibidoCajuelas = r.medidas * 10 + r.cajuelas + r.cuartillos / 100;
  const fanegas = recibidoCajuelas / 20;
  const totalFlotes = r.maduros + r.secos + r.broca;
  const pct = (x) => (r.muestraTotal > 0 ? x / r.muestraTotal : 0);
  const pVerdes = pct(r.verdes), pFlotes = pct(totalFlotes), pSecos = pct(r.secos), pMaduros = pct(r.maduros), pBroca = pct(r.broca);
  const eqVerdes = pVerdes * fanegas, eqFlotes = pFlotes * fanegas, eqBroca = pBroca * fanegas;
  return { recibidoCajuelas, fanegas, totalFlotes, pVerdes, pFlotes, pSecos, pMaduros, pBroca, eqVerdes, eqFlotes, eqBroca, eqMaduras: fanegas - (eqVerdes + eqFlotes + eqBroca) };
}
export function totalesRecibos(rows) {
  const sum = (f) => rows.reduce((t, r) => t + f(r), 0);
  const c = rows.map(rc);
  const muestra = sum((r) => r.muestraTotal), verdes = sum((r) => r.verdes), maduros = sum((r) => r.maduros), secos = sum((r) => r.secos), broca = sum((r) => r.broca);
  const flotes = maduros + secos + broca;
  const p = (x) => (muestra > 0 ? x / muestra : 0);
  const s = (f) => c.reduce((t, x) => t + f(x), 0);
  return {
    cajuelas: s((x) => x.recibidoCajuelas), fanegas: s((x) => x.fanegas), muestra, verdes, maduros, secos, broca, flotes,
    pVerdes: p(verdes), pFlotes: p(flotes), pSecos: p(secos), pMaduros: p(maduros), pBroca: p(broca),
    eqMaduras: s((x) => x.eqMaduras), eqVerdes: s((x) => x.eqVerdes), eqFlotes: s((x) => x.eqFlotes), eqBroca: s((x) => x.eqBroca)
  };
}
export const recibos = {
  items: () => db.get('diario_recibos', []),
  guardar: (a) => db.set('diario_recibos', a),
  siguiente: () => siguienteNumero('next_recibo', 'R-'),
  agregar(r) { const a = recibos.items(); a.push(r); recibos.guardar(a); confirmarNumero('next_recibo'); },
  anular(numero, dia, motivo, fecha) {
    const a = recibos.items();
    const i = a.findIndex((r) => r.numero === numero && r.dia === dia && !r.anulado);
    if (i < 0) return null;
    a[i] = { ...a[i], anulado: true, motivo, anuladoFecha: fecha, anuladoPor: nombreUsuario() };
    recibos.guardar(a);
    return a[i];
  }
};
export function payloadRecibo(r, reportId, fechaHora, estado, motivo, negativo) {
  const usuario = negativo ? nombreUsuario() : (r.usuario || nombreUsuario());
  const s = negativo ? -1 : 1;
  const c = rc(r);
  return {
    formato: 'recibo', reportId, dia: r.dia, fechaHora, dispositivo: r.dispositivo, cosecha: r.cosecha, beneficio: r.beneficio,
    receptora: r.receptora, compra: r.compra, sociedad: r.sociedad, finca: r.finca, lote: r.lote, comprobante: r.numero, estado, motivo, usuario,
    medidas: r.medidas * s, cajuelas: r.cajuelas * s, cuartillos: r.cuartillos * s, recibidoCajuelas: c.recibidoCajuelas * s,
    fanegas: c.fanegas * s, muestraTotal: r.muestraTotal * s, verdes: r.verdes * s, maduros: r.maduros * s, secos: r.secos * s,
    broca: r.broca * s, totalFlotes: c.totalFlotes * s
  };
}

// ====================== BOLETOS ======================
export const BOL_ENTREGA = 'ENTREGA', BOL_REFUERZO = 'REFUERZO', BOL_SALDO = 'SALDO', BOL_PERDIDA = 'PÉRDIDA', BOL_CONTEO = 'CONTEO';
export function tipoBoletoEtiqueta(t) {
  return ({ [BOL_ENTREGA]: 'ENTREGA DE BOLETOS', [BOL_REFUERZO]: 'REFUERZO DE BOLETOS', [BOL_SALDO]: 'SALDO DE BOLETOS', [BOL_PERDIDA]: 'FICHAS DAÑADAS', [BOL_CONTEO]: 'CONTEO GENERAL' })[t] || t;
}
export const etiquetaFicha = (l) => `${l.color} · ${l.medida}`;
export const claveLinea = (l) => fichaKey(l.color, l.medida);
export const totalFichas = (m) => m.lineas.reduce((t, l) => t + l.cantidad, 0);
export const totalCajuelasMov = (m) => m.lineas.reduce((t, l) => t + l.cantidad * valorCajuelas(l.medida), 0);

export const boletos = {
  items: () => db.get('boletos_movs', []),
  guardar: (a) => db.set('boletos_movs', a),
  siguiente: () => siguienteNumero('next_boleto', 'B-'),
  agregar(m) { const a = boletos.items(); a.push(m); boletos.guardar(a); confirmarNumero('next_boleto'); },
  anular(id, motivo, fecha) {
    const a = boletos.items();
    const i = a.findIndex((m) => m.id === id && !m.anulado);
    if (i < 0) return null;
    a[i] = { ...a[i], anulado: true, motivoAnul: motivo, anuladoFecha: fecha, anuladoPor: nombreUsuario() };
    boletos.guardar(a);
    return a[i];
  }
};
export function payloadBoleto(m, reportId, fechaHora, estado, motivo, negativo) {
  const usuario = negativo ? nombreUsuario() : (m.usuario || nombreUsuario());
  const s = negativo ? -1 : 1;
  return {
    formato: 'boleto', reportId, dia: m.dia, fechaHora, dispositivo: m.dispositivo, oficina: m.oficina, cosecha: m.cosecha, sociedad: m.sociedad,
    comprobante: m.numero, tipo: m.tipo, usuario, destino: m.para || '', estado, motivo: estado === 'ACTIVO' ? m.nota : motivo,
    lineas: m.lineas.map((l) => ({ ficha: l.color, medida: l.medida, cantidad: l.cantidad * s, cajuelas: l.cantidad * s * valorCajuelas(l.medida) }))
  };
}

const eq = (a, b) => normalizar(a) === normalizar(b);
/** Dispositivo al que pertenecen las fichas del movimiento (el destino de una entrega del administrador, o el propio). */
export const destinoMov = (m) => m.para || m.dispositivo;
const vigentes = (movs, cosecha) => movs.filter((m) => !m.anulado && eq(m.cosecha, cosecha));

/** Saldos por día, dispositivo, sociedad y ficha (misma lógica de la app Android). */
// Orden cronológico de un movimiento: «dd/mm/yyyy hh:mm» + número (solo cuenta el ÚLTIMO saldo del día).
function claveOrden(m) {
  const r = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(m.emitido || '');
  const t = r ? r[3] + r[2] + r[1] + r[4] + r[5] : '0';
  return t + '#' + String(parseInt(String(m.numero || '').replace(/\D/g, ''), 10) || 0).padStart(8, '0');
}
export function filasSaldo(movs, cosecha, hasta, sociedad = null, dispositivo = null) {
  const base = vigentes(movs, cosecha).filter((m) => m.dia <= hasta && m.tipo !== BOL_CONTEO &&
    (sociedad == null || eq(m.sociedad, sociedad)) && (dispositivo == null || eq(destinoMov(m), dispositivo)));
  const grupos = new Map();
  base.forEach((m) => m.lineas.forEach((l) => {
    const k = normalizar(destinoMov(m)) + '#' + normalizar(m.sociedad) + '#' + claveLinea(l);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push([m, l]);
  }));
  const saldoDias = new Set(base.filter((m) => m.tipo === BOL_SALDO).map((m) => normalizar(destinoMov(m)) + '#' + normalizar(m.sociedad) + '#' + m.dia));
  const out = [];
  for (const lista of grupos.values()) {
    const [m0, l0] = lista[0];
    const dispSoc = normalizar(destinoMov(m0)) + '#' + normalizar(m0.sociedad);
    const primero = lista.reduce((t, x) => (x[0].dia < t ? x[0].dia : t), lista[0][0].dia);
    const dias = new Set(lista.map((x) => x[0].dia));
    saldoDias.forEach((k) => { if (k.startsWith(dispSoc + '#')) { const d = k.slice(k.lastIndexOf('#') + 1); if (d >= primero) dias.add(d); } });
    let corriente = 0;
    for (const dia of [...dias].sort()) {
      const items = lista.filter((x) => x[0].dia === dia);
      const suma = (t) => items.filter((x) => x[0].tipo === t).reduce((a, x) => a + x[1].cantidad, 0);
      const ini = corriente, ent = suma(BOL_ENTREGA), ref = suma(BOL_REFUERZO), per = suma(BOL_PERDIDA);
      const esperado = ini + ent + ref - per;
      const hayConteo = saldoDias.has(dispSoc + '#' + dia);
      const ultimo = items.filter((x) => x[0].tipo === BOL_SALDO).sort((a, b) => claveOrden(a[0]) < claveOrden(b[0]) ? 1 : -1)[0];
      const saldo = hayConteo ? (ultimo ? ultimo[1].cantidad : 0) : esperado;
      const usadas = hayConteo ? esperado - saldo : 0;
      if (!items.length && ini === 0) continue;
      corriente = saldo;
      out.push({ dia, dispositivo: destinoMov(m0), sociedad: m0.sociedad, color: l0.color, medida: l0.medida, inicial: ini, entregas: ent, refuerzos: ref, perdidas: per, saldo, conConteo: hayConteo, usadas, cajuelasUsadas: usadas * valorCajuelas(l0.medida) });
    }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => cmp(a.dia, b.dia) || cmp(normalizar(a.sociedad), normalizar(b.sociedad)) || cmp(normalizar(a.dispositivo), normalizar(b.dispositivo)) ||
    cmp(normalizar(a.color), normalizar(b.color)) || cmp(a.medida, b.medida));
}
export function saldoInicial(movs, cosecha, sociedad, dispositivo, dia) {
  const ultimo = {};
  filasSaldo(movs, cosecha, dia, sociedad, dispositivo).filter((f) => f.dia < dia).forEach((f) => { ultimo[fichaKey(f.color, f.medida)] = f; });
  const o = {};
  Object.entries(ultimo).forEach(([k, v]) => { o[k] = v.saldo; });
  return o;
}
export function disponible(movs, cosecha, sociedad, dispositivo, dia) {
  const out = { ...saldoInicial(movs, cosecha, sociedad, dispositivo, dia) };
  vigentes(movs, cosecha).filter((m) => m.dia === dia && eq(m.sociedad, sociedad) && eq(destinoMov(m), dispositivo)).forEach((m) => {
    const signo = m.tipo === BOL_ENTREGA || m.tipo === BOL_REFUERZO ? 1 : m.tipo === BOL_PERDIDA ? -1 : 0;
    if (signo) m.lineas.forEach((l) => { const k = claveLinea(l); out[k] = (out[k] || 0) + signo * l.cantidad; });
  });
  return out;
}
export function inventario(movs, cosecha, sociedad, hasta) {
  const vig = vigentes(movs, cosecha).filter((m) => eq(m.sociedad, sociedad.nombre) && m.dia <= hasta);
  const ultimaPorDisp = {};
  filasSaldo(movs, cosecha, hasta, sociedad.nombre).forEach((f) => { ultimaPorDisp[normalizar(f.dispositivo) + '#' + fichaKey(f.color, f.medida)] = f; });
  return sociedad.fichas.map((f) => {
    const key = fichaKey(f.color, f.medida);
    const ls = vig.flatMap((m) => m.lineas.filter((l) => claveLinea(l) === key).map((l) => [m, l]));
    const perdMov = ls.filter((x) => x[0].tipo === BOL_PERDIDA).reduce((t, x) => t + x[1].cantidad, 0);
    const conteos = ls.filter((x) => x[0].tipo === BOL_CONTEO).sort((a, b) => (a[0].dia + a[0].emitido < b[0].dia + b[0].emitido ? -1 : 1));
    const conteo = conteos.length ? conteos[conteos.length - 1][1].cantidad : null;
    const perdidas = conteo != null ? f.inventario - conteo : perdMov;
    const saldoFinal = f.inventario - perdidas;
    const enCampo = Object.entries(ultimaPorDisp).filter(([k]) => k.endsWith('#' + key)).reduce((t, [, v]) => t + v.saldo, 0);
    return { color: f.color, medida: f.medida, historico: f.inventario, perdidas, saldoFinal, enCampo, enOficinas: saldoFinal - enCampo };
  });
}
