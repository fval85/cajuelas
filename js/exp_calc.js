// Cálculos de «Ventas de exportación»: todo sale del Google Sheet «Exportaciones» (hojas Resumen, Contratos, Entregas y Pagos).
// La app no recalcula nada: lee lo que el archivo ya calculó y solo suma, agrupa y filtra.
import { normalizar } from './util.js';
import { MESES } from './rep_calc.js';

const num = (v) => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const numN = (v) => (v === '' || v == null ? null : num(v));
const txt = (v) => String(v ?? '').trim();
const mesDe = (v) => { const m = txt(v).match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : ''; };
export const mesTxt = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');

function objetos(t) {
  const enc = (t && t.enc) || [];
  return ((t && t.filas) || []).map((f) => { const o = {}; enc.forEach((k, i) => { o[k] = f[i]; }); return o; });
}

/** Resumen (una fila por contrato) + datos de Contratos + líneas de Entregas y Pagos. */
export function parseExp(resp) {
  const cont = new Map(objetos(resp.contratos).map((o) => [txt(o['no. contrato']), o]));
  const contratos = objetos(resp.resumen).map((o) => {
    const c = cont.get(txt(o['no. contrato'])) || {};
    const sacC = num(o['sacos del contrato']), sacE = num(o['sacos entregados']);
    const qqC = num(c['quintales']) || sacC * 1.5;
    return {
      id: txt(o['no. contrato']), cos: txt(o['cosecha']), tipo: txt(o['tipo']), comp: txt(o['comprador']), est: txt(o['estado del contrato']),
      fin: txt(c['financiamiento']), cert: txt(c['certificacion']), cal: txt(c['calidad']), prep: txt(c['preparacion']), tcafe: txt(c['tipo cafe']), cat: txt(c['categoria']),
      ent: txt(o['estado de entrega']), cob: txt(o['estado de cobro']), mes: mesDe(o['fecha entrega']),
      sacC, sacE, sacP: num(o['sacos por entregar']), kgC: num(o['kilos del contrato']), kgE: num(o['kilos entregados']), kgP: num(o['kilos por entregar']),
      fav: numN(o['kilos a favor / contra']), sug: numN(o['sacos sugeridos para cerrar']), precio: num(o['precio rieles']),
      qqC, qqE: sacC ? qqC * sacE / sacC : 0,
      monC: num(o['monto del contrato $']), monE: num(o['monto entregado $']), monP: num(o['monto por entregar $']),
      efe: numN(o['efecto kilos a favor / contra $']), pag: num(o['monto pagado $']), cobrar: num(o['monto por cobrar $']), con: 1
    };
  });
  const entregas = objetos(resp.entregas).map((o) => ({
    id: txt(o['no. contrato']), comp: txt(o['comprador']), cos: txt(o['cosecha']), fecha: txt(o['fecha salida']), boleta: txt(o['boleta']), conf: txt(o['confirmacion de salida']),
    sacos: num(o['sacos']), kg: num(o['kilos']), romana: numN(o['kilos romana origen']), neto: numN(o['kilos neto entregado']),
    sob: numN(o['sobrantes kg']), fal: numN(o['faltantes kg']), dif: numN(o['diferencia romana vs comprador']), fav: numN(o['kilos a favor / contra']),
    tot: numN(o['total $']), real: numN(o['monto real $']), guia: txt(o['estado de guia'])
  }));
  const pagos = objetos(resp.pagos).map((o) => ({ id: txt(o['no. contrato']), fecha: txt(o['fecha pago']), monto: num(o['monto pagado $']), nota: txt(o['referencia / nota']) }));
  return { contratos, entregas, pagos };
}

// ---------- Filtros ----------
export const FILTROS = [
  { k: 'comp', t: 'Comprador', v: (r) => r.comp }, { k: 'id', t: 'Contrato', v: (r) => r.id }, { k: 'cos', t: 'Cosecha', v: (r) => r.cos },
  { k: 'tipo', t: 'Tipo', v: (r) => r.tipo }, { k: 'est', t: 'Estado del contrato', v: (r) => r.est }, { k: 'ent', t: 'Estado de entrega', v: (r) => r.ent },
  { k: 'cob', t: 'Estado de cobro', v: (r) => r.cob }, { k: 'mes', t: 'Mes de entrega', v: (r) => mesTxt(r.mes), orden: (r) => r.mes },
  { k: 'fin', t: 'Financiamiento', v: (r) => r.fin }, { k: 'cert', t: 'Certificación', v: (r) => r.cert }, { k: 'cal', t: 'Calidad', v: (r) => r.cal },
  { k: 'prep', t: 'Preparación', v: (r) => r.prep }, { k: 'tcafe', t: 'Tipo de café', v: (r) => r.tcafe }
];
const val = (x, r) => x.v(r) || '(sin dato)';
/** Los contratos anulados no cuentan, salvo que se pida explícitamente el estado «Anulado». */
function base(rows, fl) { return (fl.est || []).length ? rows : rows.filter((r) => normalizar(r.est) !== 'anulado'); }
export function filtrar(rows, fl, omitir = '') {
  let out = base(rows, fl);
  FILTROS.forEach((x) => {
    const sel = fl[x.k] || [];
    if (!sel.length || x.k === omitir) return;
    const set = new Set(sel.map(normalizar));
    out = out.filter((r) => set.has(normalizar(val(x, r))));
  });
  return out;
}
/** Opciones de un filtro: solo lo que queda con los OTROS filtros ya elegidos. */
export function opcionesFiltro(rows, fl, k) {
  const x = FILTROS.find((y) => y.k === k);
  const m = new Map();
  filtrar(k === 'est' ? rows : rows, fl, k).forEach((r) => { const v = val(x, r); if (!m.has(v)) m.set(v, x.orden ? x.orden(r) : v); });
  return [...m.entries()].sort((a, b) => (x.orden ? String(a[1]).localeCompare(String(b[1])) : a[0].localeCompare(b[0], 'es', { numeric: true }))).map((e) => e[0]);
}
export function textoFiltros(fl) {
  return FILTROS.filter((x) => (fl[x.k] || []).length).map((x) => `${x.t}: ${fl[x.k].join(', ')}`).join(' · ');
}

// ---------- Medidas y agrupaciones ----------
export const MEDIDAS = [
  { k: 'con', t: 'Contratos', tipo: 'int' }, { k: 'sacC', t: 'Sacos Del Contrato', tipo: 'int' }, { k: 'sacE', t: 'Sacos Entregados', tipo: 'int' }, { k: 'sacP', t: 'Sacos Por Entregar', tipo: 'int' },
  { k: 'qqC', t: 'Quintales Del Contrato', tipo: 'dec' }, { k: 'qqE', t: 'Quintales Entregados', tipo: 'dec' },
  { k: 'kgC', t: 'Kilos Del Contrato', tipo: 'dec' }, { k: 'kgE', t: 'Kilos Entregados', tipo: 'dec' }, { k: 'kgP', t: 'Kilos Por Entregar', tipo: 'dec' },
  { k: 'fav', t: 'Kilos A Favor / Contra', tipo: 'dec', neg: true },
  { k: 'monC', t: 'Monto Del Contrato $', tipo: 'usd' }, { k: 'monE', t: 'Monto Entregado $', tipo: 'usd' }, { k: 'monP', t: 'Monto Por Entregar $', tipo: 'usd' },
  { k: 'pag', t: 'Monto Pagado $', tipo: 'usd' }, { k: 'cobrar', t: 'Monto Por Cobrar $', tipo: 'usd', neg: true }, { k: 'efe', t: 'Efecto Kilos A Favor / Contra $', tipo: 'usd', neg: true }
];
export const MEDIDAS_INI = ['sacC', 'sacE', 'sacP', 'monE', 'pag', 'cobrar'];
const MED = Object.fromEntries(MEDIDAS.map((m) => [m.k, m]));
export const DIMENSIONES = [
  { k: 'id', t: 'Contrato', v: (r) => r.id }, { k: 'comp', t: 'Comprador', v: (r) => r.comp }, { k: 'mes', t: 'Mes De Entrega', v: (r) => mesTxt(r.mes), orden: (r) => r.mes },
  { k: 'tipo', t: 'Tipo', v: (r) => r.tipo }, { k: 'cos', t: 'Cosecha', v: (r) => r.cos }, { k: 'ent', t: 'Estado De Entrega', v: (r) => r.ent },
  { k: 'cob', t: 'Estado De Cobro', v: (r) => r.cob }, { k: 'cal', t: 'Calidad', v: (r) => r.cal }, { k: 'prep', t: 'Preparación', v: (r) => r.prep },
  { k: 'tcafe', t: 'Tipo De Café', v: (r) => r.tcafe }, { k: 'cert', t: 'Certificación', v: (r) => r.cert }
];
export const VISTAS = [['contratos', 'Por contrato'], ['comprador', 'Por comprador'], ['mes', 'Por mes de entrega'], ['entregas', 'Entregas de un contrato'], ['personalizado', 'Personalizado']];
const PRESET = {
  contratos: { dims: ['id'], med: ['sacC', 'sacE', 'sacP', 'kgE', 'fav', 'monC', 'monE', 'pag', 'cobrar'], extra: ['comp', 'ent', 'cob'] },
  comprador: { dims: ['comp'], med: ['con', 'sacC', 'sacE', 'sacP', 'kgE', 'monC', 'monE', 'pag', 'cobrar'] },
  mes: { dims: ['mes'], med: ['con', 'sacC', 'sacE', 'sacP', 'kgE', 'monC', 'monE', 'pag', 'cobrar'] }
};
export const GRAFICOS = [['sac', 'Sacos entregados y por entregar'], ['kg', 'Kilos entregados y por entregar'], ['mon', 'Monto entregado y por entregar'], ['cobro', 'Cobrado y por cobrar']];
const DEF_GRAF = { sac: true, kg: false, mon: false, cobro: true };
export const grafIni = () => ({ ...DEF_GRAF });

function sumar(rows, k) {
  if (k === 'fav' || k === 'efe') { const v = rows.filter((r) => r[k] != null); return v.length ? v.reduce((t, r) => t + r[k], 0) : null; }
  return rows.reduce((t, r) => t + (r[k] || 0), 0);
}
const dimDe = (k) => DIMENSIONES.find((d) => d.k === k);
function agrupar(rows, dims) {
  const m = new Map();
  rows.forEach((r) => {
    const etq = dims.map((k) => dimDe(k).v(r) || '(sin dato)');
    const key = etq.join('\u0001');
    if (!m.has(key)) m.set(key, { etq, orden: dims.map((k) => (dimDe(k).orden ? dimDe(k).orden(r) : '')), rows: [] });
    m.get(key).rows.push(r);
  });
  const g = [...m.values()];
  const porMonto = dims.length === 1 && ['comp', 'cal', 'prep', 'tcafe', 'cert', 'tipo', 'ent', 'cob'].includes(dims[0]);
  g.sort((a, b) => {
    if (porMonto) { const d = sumar(b.rows, 'monC') - sumar(a.rows, 'monC'); if (d) return d; }
    for (let i = 0; i < dims.length; i++) {
      const x = dimDe(dims[i]).orden ? String(a.orden[i]).localeCompare(String(b.orden[i])) : 0;
      if (x) return x;
      if (!dimDe(dims[i]).orden && !porMonto && dims[i] !== 'id') { const y = a.etq[i].localeCompare(b.etq[i], 'es', { numeric: true }); if (y) return y; }
    }
    return 0;
  });
  return g;
}
const contar = (rows, k) => new Set(rows.map((r) => r[k]).filter(Boolean)).size;

// ---------- Gráficos ----------
const CH = { ent: '#14532D', por: '#D97706', pag: '#2563EB' };
function graficosDe(grupos, etqs, elegidos, esMonto) {
  const tope = 12;
  const idx = grupos.map((g, i) => i);
  const usar = grupos.length > tope ? idx.sort((a, b) => sumar(grupos[b].rows, 'monC') - sumar(grupos[a].rows, 'monC')).slice(0, tope).sort((a, b) => a - b) : idx;
  const cats = usar.map((i) => etqs[i]);
  const S = (k) => usar.map((i) => Math.max(0, sumar(grupos[i].rows, k) || 0));
  const out = [];
  const def = {
    sac: () => ({ titulo: 'Sacos: entregados y por entregar', series: [{ nombre: 'Entregados', valores: S('sacE'), color: CH.ent }, { nombre: 'Por entregar', valores: S('sacP'), color: CH.por }], dec: false }),
    kg: () => ({ titulo: 'Kilos: entregados y por entregar', series: [{ nombre: 'Entregados', valores: S('kgE'), color: CH.ent }, { nombre: 'Por entregar', valores: S('kgP'), color: CH.por }], dec: true }),
    mon: () => ({ titulo: 'Monto $: entregado y por entregar', series: [{ nombre: 'Entregado', valores: S('monE'), color: CH.ent }, { nombre: 'Por entregar', valores: S('monP'), color: CH.por }], dec: true }),
    cobro: () => ({ titulo: 'Cobro $: pagado y por cobrar', series: [{ nombre: 'Pagado', valores: S('pag'), color: CH.pag }, { nombre: 'Por cobrar', valores: S('cobrar'), color: CH.por }], dec: true })
  };
  GRAFICOS.forEach(([k]) => { if (elegidos[k]) out.push({ tipo: 'barrasH', cats, ...def[k]() }); });
  return { graficos: out, recortado: grupos.length > tope };
}

// ---------- Reporte ----------
const dinero$ = (v) => '$ ' + new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.round(v * 100) / 100).replace(/[  ]/g, ' ');
const dec2 = (v) => new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.round(v * 100) / 100).replace(/[  ]/g, ' ');
const ent0 = (v) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(Math.round(v)).replace(/[  ]/g, ' ');
const fmtMed = (m, v) => (v == null ? '' : m.tipo === 'usd' ? dinero$(v) : m.tipo === 'dec' ? dec2(v) : ent0(v));

export function armarReporte(vista, d, f) {
  const filas = filtrar(d.contratos, f.fl);
  const subt = [`Ventas de exportación y consumo nacional · ${filas.length} ${filas.length === 1 ? 'contrato' : 'contratos'}`];
  const tf = textoFiltros(f.fl); if (tf) subt.push('Filtros: ' + tf);
  if (vista === 'entregas') return reporteEntregas(d, filas, f, subt);
  let dims, meds, extra = [];
  if (vista === 'personalizado') { dims = f.dims.length ? f.dims : ['comp']; meds = f.med.length ? f.med : MEDIDAS_INI; }
  else { ({ dims, med: meds, extra = [] } = PRESET[vista]); }
  const grupos = agrupar(filas, dims);
  const cols = [
    ...dims.map((k) => ({ t: dimDe(k).t, tipo: 'txt', centro: true })),
    ...extra.map((k) => ({ t: dimDe(k).t, tipo: 'txt', centro: true })),
    ...meds.map((k) => ({ t: MED[k].t, tipo: MED[k].tipo, centro: true, neg: !!MED[k].neg, sig: MED[k].k }))
  ];
  const celdas = (rows, etq) => [
    ...etq,
    ...extra.map((k) => { const v = [...new Set(rows.map((r) => dimDe(k).v(r)))]; return v.length === 1 ? v[0] : ''; }),
    ...meds.map((k) => (k === 'con' ? contar(rows, 'id') : sumar(rows, k)))
  ];
  const filasRep = grupos.map((g) => ({ v: celdas(g.rows, g.etq) }));
  if (grupos.length > 1) filasRep.push({ v: celdas(filas, ['TOTAL', ...dims.slice(1).map(() => ''), ]), negrita: true, fondo: '#E8F1EB' });
  const tot = (k) => sumar(filas, k) || 0;
  const kpis = [
    { t: 'Contratos', v: ent0(filas.length) },
    { t: 'Sacos entregados', v: `${ent0(tot('sacE'))} de ${ent0(tot('sacC'))}` },
    { t: 'Monto entregado', v: dinero$(tot('monE')) },
    { t: 'Pagado', v: dinero$(tot('pag')) },
    { t: 'Por cobrar', v: dinero$(tot('cobrar')) }
  ];
  const datos = [];
  const cuenta = (k) => { const m = new Map(); filas.forEach((r) => m.set(r[k] || '(sin dato)', (m.get(r[k] || '(sin dato)') || 0) + 1)); return [...m.entries()].map(([a, b]) => `${b} ${a.toLowerCase()}`).join(' · '); };
  if (filas.length) {
    datos.push(`Entrega: ${cuenta('ent')}.`);
    datos.push(`Cobro: ${cuenta('cob')}.`);
    const fav = sumar(filas, 'fav'), efe = sumar(filas, 'efe');
    if (fav != null) datos.push(`Kilos a favor / contra en contratos cerrados: ${dec2(fav)} kg${efe != null ? ' (' + dinero$(efe) + ')' : ''}.`);
    if (tot('kgP') > 0) datos.push(`Faltan por entregar ${dec2(tot('kgP'))} kg (${ent0(tot('sacP'))} sacos).`);
  }
  const etqs = grupos.map((g) => g.etq.join(' · '));
  const { graficos, recortado } = graficosDe(grupos, etqs, f.graf || DEF_GRAF);
  return {
    vista, titulo: vista === 'personalizado' ? 'Ventas de exportación' : 'Ventas de exportación ' + VISTAS.find((v) => v[0] === vista)[1].toLowerCase(),
    subtitulos: subt, cols, filas: filasRep, kpis, datos, graficos, centrado: true,
    nota: recortado ? 'Los gráficos muestran los 12 con mayor monto; la tabla incluye todos.' : '', ctx: { n: filas.length }
  };
}

function reporteEntregas(d, filas, f, subt) {
  const ids = new Set(filas.map((r) => r.id));
  const ent = d.entregas.filter((e) => ids.has(e.id));
  const ordenId = new Map(filas.map((r, i) => [r.id, i]));
  ent.sort((a, b) => (ordenId.get(a.id) - ordenId.get(b.id)) || String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')));
  const unico = filas.length === 1;
  const cols = [
    { t: 'No. Contrato', tipo: 'txt', centro: true }, { t: 'Fecha Salida', tipo: 'fecha', centro: true }, { t: 'Boleta', tipo: 'txt', centro: true }, { t: 'Sacos', tipo: 'int', centro: true },
    { t: 'Kilos', tipo: 'dec', centro: true }, { t: 'Kilos Neto Entregado', tipo: 'dec', centro: true }, { t: 'Sobrantes Kg', tipo: 'dec', centro: true },
    { t: 'Faltantes Kg', tipo: 'dec', centro: true, neg: true }, { t: 'Kilos A Favor / Contra', tipo: 'dec', centro: true, neg: true },
    { t: 'Monto Real $', tipo: 'usd', centro: true }, { t: 'Estado De Guía', tipo: 'txt', centro: true }
  ];
  const filasRep = ent.map((e) => ({ v: [e.id, e.fecha, e.boleta || (e.conf === 'Por Entregar' ? 'Por entregar' : ''), e.sacos, e.kg, e.neto, e.sob, e.fal, e.fav, e.real, e.guia] }));
  const s = (k) => ent.reduce((t, e) => t + (e[k] || 0), 0);
  if (ent.length > 1) filasRep.push({ negrita: true, fondo: '#E8F1EB', v: ['TOTAL', '', '', s('sacos'), s('kg'), s('neto'), s('sob'), s('fal'), '', s('real'), ''] });
  const graficos = [];
  const conNeto = ent.filter((e) => e.neto != null);
  if (conNeto.length && conNeto.length <= 14) graficos.push({
    tipo: 'barrasH', titulo: 'Kilos por entrega: enviados y neto del comprador', dec: true,
    cats: conNeto.map((e) => (unico ? '' : e.id + ' · ') + (e.fecha ? e.fecha.slice(8, 10) + '/' + e.fecha.slice(5, 7) : e.boleta)),
    series: [{ nombre: 'Kilos enviados', valores: conNeto.map((e) => e.kg), color: CH.ent }, { nombre: 'Neto entregado', valores: conNeto.map((e) => e.neto), color: CH.pag }]
  });
  const tot = (k) => filas.reduce((t, r) => t + (r[k] || 0), 0);
  const kpis = [
    { t: unico ? 'Contrato' : 'Contratos', v: unico ? filas[0].id : ent0(filas.length) },
    { t: 'Entregas', v: ent0(ent.length) }, { t: 'Kilos por entregar', v: dec2(tot('kgP')) }
  ];
  if (unico) kpis.push({ t: 'Sacos sugeridos para cerrar', v: filas[0].sug == null ? '—' : ent0(filas[0].sug) }, { t: 'Por cobrar', v: dinero$(filas[0].cobrar) });
  const datos = [];
  if (unico) {
    const r = filas[0];
    datos.push(`${r.comp} · ${r.ent} · ${r.cob}.`);
    datos.push(`Contrato: ${ent0(r.sacC)} sacos · ${dec2(r.kgC)} kg · ${dinero$(r.monC)}.`);
    if (r.fav != null) datos.push(`Kilos a favor / contra: ${dec2(r.fav)} kg${r.efe != null ? ' (' + dinero$(r.efe) + ')' : ''}.`);
  }
  if (!unico && filas.length > 1) subt.push('Tip: filtre un contrato para ver solo sus entregas.');
  return { vista: 'entregas', titulo: unico ? `Entregas del contrato ${filas[0].id}` : 'Entregas de los contratos', subtitulos: subt, cols, filas: filasRep, kpis, datos, graficos, centrado: true, nota: '', ctx: { n: filas.length } };
}

export { fmtMed, dinero$, dec2, ent0 };
