// Cálculos de la pestaña «Reportes»: todo sale de las filas de la hoja GENERAL del Google Sheet «Históricos».
// Fanegas = cajuelas ÷ 20. El corte se define para la cosecha elegida y se traslada a la misma fecha de las cosechas anteriores.
import { normalizar } from './util.js';

export const FANEGA = 20;
export const ANTERIORES = 3; // cosechas anteriores que se comparan con la elegida
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ---------- Formatos ----------
const nf = (min, max) => new Intl.NumberFormat('es-CR', { minimumFractionDigits: min, maximumFractionDigits: max });
const nf0 = nf(0, 0), nf1 = nf(1, 1);
const limpio = (t) => t.replace(/[  ]/g, ' ');
export const miles = (v) => limpio(nf0.format(Math.round(v)));
export const miles1 = (v) => limpio(nf1.format(v));
export const dinero = (v) => '₡' + miles(v);
export const fmtFechaDMA = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
export function pctSigno(d) {
  if (d == null || !Number.isFinite(d)) return '—';
  const t = (Math.abs(d) * 100).toFixed(1).replace('.', ',');
  return (d > 0.0005 ? '+' : d < -0.0005 ? '-' : '') + t + '%';
}
export const pctSimple = (v) => (v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%');
export function celdaTxt(col, v) {
  if (v == null || v === '') return col.tipo === 'pct' ? '—' : '';
  switch (col.tipo) {
    case 'int': return miles(v);
    case 'dec': return miles1(v);
    case 'mon': return dinero(v);
    case 'pct': return pctSigno(v);
    case 'pcta': return pctSimple(v);
    case 'fecha': return fmtFechaDMA(v);
    default: return String(v);
  }
}

// ---------- Fechas y cosechas ----------
export const inicioAnio = (c) => { const m = String(c || '').match(/\d{4}/); return m ? Number(m[0]) : 0; };
const bisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** Mismo día y mes, `dif` años después (29 de febrero pasa a 28 si el año no es bisiesto). */
export function desplazar(f, dif) {
  const y = Number(f.slice(0, 4)) + dif, m = f.slice(5, 7);
  let d = f.slice(8, 10);
  if (m === '02' && d === '29' && !bisiesto(y)) d = '28';
  return `${String(y).padStart(4, '0')}-${m}-${d}`;
}
const ms = (f) => Date.parse(f + 'T12:00:00Z');
export const diasEntre = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
export const sumarDias = (f, n) => new Date(ms(f) + n * 86400000).toISOString().slice(0, 10);
export const inicioCosecha = (cos) => `${inicioAnio(cos)}-10-01`;
const diaSemana = (f) => DIAS[new Date(ms(f)).getUTCDay()];
export const nombreMes = (f) => MESES[Number(f.slice(5, 7)) - 1];

/** Filas crudas del Apps Script → objetos con textos ya normalizados para filtrar rápido. */
export function parseFilas(raw) {
  return (raw || []).map((a) => ({
    cos: String(a[0] || '').trim(), mes: String(a[1] || ''), f: String(a[2] || ''), cli: String(a[3] || '').trim(), apc: String(a[4] || '').trim(),
    soc: String(a[5] || '').trim(), fin: String(a[6] || '').trim(), tipo: String(a[7] || '').trim().toUpperCase(),
    caj: Number(a[8]) || 0, ade: Number(a[9]) || 0, int: Number(a[10]) || 0
  })).filter((r) => r.cos && r.f).map((r) => ({ ...r, nc: normalizar(r.cli), ns: normalizar(r.soc), nf: normalizar(r.fin), nt: normalizar(r.tipo) }));
}
export const cosechasDe = (filas) => [...new Set(filas.map((r) => r.cos))].sort((a, b) => inicioAnio(b) - inicioAnio(a));
export function ultimaFecha(filas, cos) { let m = ''; for (const r of filas) if (r.cos === cos && r.f > m) m = r.f; return m; }

export function filtrar(filas, cos, corte, f, desde = '') {
  const toks = normalizar(f.cli || '').split(' ').filter(Boolean);
  const soc = normalizar(f.soc || ''), tipo = normalizar(f.tipo || '');
  return filas.filter((r) => r.cos === cos && r.f <= corte && (!desde || r.f >= desde) && (!soc || r.ns === soc) && (!tipo || r.nt === tipo) && (!toks.length || toks.every((k) => r.nc.includes(k))));
}
export function suma(rows) {
  let caj = 0, ade = 0, int = 0;
  for (const r of rows) { caj += r.caj; ade += r.ade; int += r.int; }
  return { n: rows.length, caj, fan: caj / FANEGA, ade, int };
}
const delta = (a, b) => (b > 0 ? a / b - 1 : null);
function agrupar(rows, kf, nf) {
  const m = new Map();
  for (const r of rows) {
    const k = kf(r);
    let g = m.get(k);
    if (!g) { g = { k, nombre: nf(r), rows: [] }; m.set(k, g); }
    g.rows.push(r);
  }
  return m;
}

/** Cosecha elegida + hasta 3 anteriores, cada una cortada en la misma fecha. */
export function contexto(filas, f) {
  const todas = cosechasDe(filas);
  const lista = [f.cos, ...todas.filter((c) => inicioAnio(c) < inicioAnio(f.cos)).slice(0, ANTERIORES)];
  const items = lista.map((c) => {
    const corte = desplazar(f.corte, inicioAnio(c) - inicioAnio(f.cos));
    const desde = f.desde ? desplazar(f.desde, inicioAnio(c) - inicioAnio(f.cos)) : '';
    const rows = filtrar(filas, c, corte, f, desde);
    return { cos: c, corte, desde, rows, s: suma(rows) };
  });
  return { items, base: items[0], prev: items[1] || null };
}
function textoFiltros(f) {
  const t = [];
  if (f.soc) t.push('Sociedad: ' + f.soc);
  if (f.tipo) t.push('Tipo: ' + f.tipo);
  if (f.cli) t.push('Cliente: ' + f.cli);
  return t.length ? t.join(' · ') : 'Sin filtros adicionales (todas las sociedades, tipos y clientes)';
}
function encabezado(titulo, ctx, f) {
  const subt = [`Cosecha ${f.cos} · ${f.desde ? 'del ' + fmtFechaDMA(ctx.base.desde) + ' al ' : 'acumulado al '}${fmtFechaDMA(ctx.base.corte)}` + (ctx.prev ? ` · comparado con la misma fecha de ${ctx.items.slice(1).map((i) => i.cos).join(', ')}` : ''), textoFiltros(f)];
  return { titulo, subtitulos: subt };
}
const pctDe = (a, tot) => (tot > 0 ? a / tot : null);

function kpisDe(ctx) {
  const b = ctx.base.s, p = ctx.prev ? ctx.prev.s : null;
  const k = (t, v, a, c) => ({ t, v, d: p ? delta(a, c) : null, ref: p ? 'vs ' + ctx.prev.cos : '' });
  return [
    k('Cajuelas', miles(b.caj), b.caj, p && p.caj), k('Fanegas', miles1(b.fan), b.fan, p && p.fan),
    k('Adelanto', dinero(b.ade), b.ade, p && p.ade), k('Intereses', dinero(b.int), b.int, p && p.int), k('Recibos', miles(b.n), b.n, p && p.n)
  ];
}
function xticksBase(ctx, xmax) {
  const ini = inicioCosecha(ctx.base.cos);
  const paso = Math.max(1, Math.ceil(xmax / 6));
  const t = [];
  for (let x = 0; x <= xmax; x += paso) t.push({ x, label: `${Number(sumarDias(ini, x).slice(8, 10))} ${nombreMes(sumarDias(ini, x)).slice(0, 3).toLowerCase()}` });
  return t;
}
/** Acumulado de cajuelas día por día desde el 1 de octubre hasta el corte de cada cosecha. */
function curvas(ctx) {
  return ctx.items.map((it, i) => {
    const ini = inicioCosecha(it.cos), fin = Math.max(0, diasEntre(ini, it.corte));
    const porDia = new Array(fin + 1).fill(0);
    for (const r of it.rows) { const d = Math.min(fin, Math.max(0, diasEntre(ini, r.f))); porDia[d] += r.caj; }
    let acc = 0;
    return { nombre: it.cos, pts: porDia.map((v, d) => [d, (acc += v)]), fin };
  });
}

// ---------- Reportes ----------
function comparativo(ctx, f) {
  const rep = encabezado('Comparativo por cosecha a la misma fecha', ctx, f);
  rep.kpis = kpisDe(ctx);
  rep.cols = [
    { t: 'Cosecha', peso: 1.3, tipo: 'txt' }, { t: f.desde ? 'Periodo' : 'Corte', peso: f.desde ? 2.1 : 1.2, tipo: f.desde ? 'txt' : 'fecha' }, { t: 'Recibos', peso: 0.9, tipo: 'int' },
    { t: 'Cajuelas', peso: 1.1, tipo: 'int' }, { t: 'Fanegas', peso: 1.1, tipo: 'dec' }, { t: 'Adelanto', peso: 1.6, tipo: 'mon' },
    { t: 'Intereses', peso: 1.4, tipo: 'mon' }, { t: 'Actual vs. ésta (cajuelas)', peso: 1.5, tipo: 'pct' }
  ];
  rep.filas = ctx.items.map((it, i) => ({
    v: [it.cos + (i === 0 ? ' (elegida)' : ''), f.desde ? `${fmtFechaDMA(it.desde)} al ${fmtFechaDMA(it.corte)}` : it.corte, it.s.n, it.s.caj, it.s.fan, it.s.ade, it.s.int, i === 0 ? null : delta(ctx.base.s.caj, it.s.caj)],
    negrita: i === 0, fondo: i === 0 ? '#E8F1EB' : null
  }));
  if (ctx.items.length > 1) {
    const ant = ctx.items.slice(1), prom = ant.reduce((t, i) => t + i.s.caj, 0) / ant.length;
    rep.filas.push({ v: [`Promedio de las ${ant.length} anteriores`, null, null, prom, prom / FANEGA, ant.reduce((t, i) => t + i.s.ade, 0) / ant.length, ant.reduce((t, i) => t + i.s.int, 0) / ant.length, delta(ctx.base.s.caj, prom)], negrita: true });
  }
  rep.nota = 'Cada cosecha se corta en el mismo día y mes que la elegida. «Actual vs. ésta» indica cuánto más (o menos) lleva la cosecha elegida respecto a esa cosecha.';
  const orden = [...ctx.items].reverse();
  const cv = curvas(ctx);
  const xmax = Math.max(1, ...cv.map((c) => c.fin));
  rep.graficos = [
    { tipo: 'barras', titulo: 'Cajuelas acumuladas a la misma fecha', cats: orden.map((i) => i.cos), series: [{ nombre: 'Cajuelas', valores: orden.map((i) => i.s.caj) }], colores: orden.map((i) => (i === ctx.base ? '#14532D' : '#86A894')) },
    { tipo: 'lineas', titulo: 'Acumulado de cajuelas día por día', series: cv.map((c, i) => ({ nombre: c.nombre, pts: c.pts })), xmax, xticks: xticksBase(ctx, xmax) }
  ];
  return rep;
}

function fincas(ctx, f) {
  const rep = encabezado('Cajuelas y fanegas por finca', ctx, f);
  const kf = (r) => r.nf || '-', nfn = (r) => r.fin || '(sin finca)';
  const gB = agrupar(ctx.base.rows, kf, nfn), gP = ctx.prev ? agrupar(ctx.prev.rows, kf, nfn) : new Map();
  const claves = new Set([...gB.keys(), ...gP.keys()]);
  const filas = [...claves].map((k) => {
    const b = gB.get(k), p = gP.get(k);
    return { nombre: (b || p).nombre, soc: (b || p).rows[0].soc, s: suma(b ? b.rows : []), sp: suma(p ? p.rows : []) };
  }).sort((a, b) => b.s.caj - a.s.caj || b.sp.caj - a.sp.caj || a.nombre.localeCompare(b.nombre, 'es'));
  const tot = ctx.base.s, totP = ctx.prev ? ctx.prev.s : { caj: 0, fan: 0 };
  const hayPrev = !!ctx.prev;
  rep.cols = [{ t: 'Finca', peso: 2.6, tipo: 'txt' }, { t: 'Sociedad', peso: 2.2, tipo: 'txt' }, { t: 'Cajuelas', peso: 1.1, tipo: 'int' }, { t: 'Fanegas', peso: 1, tipo: 'dec' }, { t: '% del total', peso: 0.9, tipo: 'pcta' }];
  if (hayPrev) rep.cols.push({ t: `Cajuelas ${ctx.prev.cos}`, peso: 1.3, tipo: 'int' }, { t: 'Variación', peso: 0.9, tipo: 'pct' });
  const fila = (v, extra = {}) => ({ v, ...extra });
  rep.filas = filas.map((x) => fila([x.nombre, x.soc, x.s.caj, x.s.fan, pctDe(x.s.caj, tot.caj), ...(hayPrev ? [x.sp.caj, delta(x.s.caj, x.sp.caj)] : [])]));
  rep.filas.push(fila(['TOTAL', (() => { const n = filas.filter((x) => x.s.caj > 0).length; return n + (n === 1 ? ' finca' : ' fincas'); })(), tot.caj, tot.fan, tot.caj > 0 ? 1 : null, ...(hayPrev ? [totP.caj, delta(tot.caj, totP.caj)] : [])], { negrita: true, fondo: '#E8F1EB' }));
  rep.nota = hayPrev ? 'Las fincas que entregaron café en la cosecha anterior a esta fecha y todavía no en la actual aparecen con 0 cajuelas.' : '';
  const top = filas.slice(0, 10);
  rep.graficos = [{
    tipo: 'barrasH', titulo: 'Las 10 fincas con más cajuelas', cats: top.map((x) => x.nombre),
    series: [{ nombre: ctx.base.cos, valores: top.map((x) => x.s.caj) }, ...(hayPrev ? [{ nombre: ctx.prev.cos, valores: top.map((x) => x.sp.caj) }] : [])]
  }];
  return rep;
}

function sociedades(ctx, f) {
  const rep = encabezado('Comparativo por sociedad', ctx, f);
  const kf = (r) => r.ns || '-', nfn = (r) => r.soc || '(sin sociedad)';
  const gs = ctx.items.map((it) => agrupar(it.rows, kf, nfn));
  const claves = new Set(gs.flatMap((g) => [...g.keys()]));
  const cajDe = (g, k) => (g.has(k) ? suma(g.get(k).rows).caj : 0);
  const filas = [...claves].map((k) => ({ k, nombre: (gs.find((g) => g.has(k)).get(k)).nombre, v: gs.map((g) => suma(g.has(k) ? g.get(k).rows : [])) }))
    .sort((a, b) => b.v[0].caj - a.v[0].caj || (b.v[1] ? b.v[1].caj - a.v[1].caj : 0));
  const tot = ctx.items.map((i) => i.s);
  rep.cols = [{ t: 'Sociedad', peso: 2.4, tipo: 'txt' }, { t: ctx.base.cos + ' cajuelas', peso: 1.3, tipo: 'int' }, { t: 'Fanegas', peso: 1, tipo: 'dec' }, { t: '% del total', peso: 0.9, tipo: 'pcta' }];
  ctx.items.slice(1).forEach((i) => rep.cols.push({ t: i.cos + ' cajuelas', peso: 1.3, tipo: 'int' }));
  if (ctx.prev) rep.cols.push({ t: `Variación vs. ${ctx.prev.cos}`, peso: 1.1, tipo: 'pct' });
  rep.cols.push({ t: 'Adelanto', peso: 1.5, tipo: 'mon' });
  const armar = (nombre, s, extra = {}) => ({
    v: [nombre, s[0].caj, s[0].fan, pctDe(s[0].caj, tot[0].caj), ...s.slice(1).map((x) => x.caj), ...(ctx.prev ? [delta(s[0].caj, s[1].caj)] : []), s[0].ade],
    ...extra
  });
  rep.filas = filas.map((x) => armar(x.nombre, x.v, { accion: { soc: x.nombre } }));
  rep.filas.push(armar('TOTAL', tot, { negrita: true, fondo: '#E8F1EB' }));
  rep.nota = 'Toque una sociedad (en la app) para ver el detalle de sus fincas. Todas las cosechas se cortan en la misma fecha.';
  const top = filas.slice(0, 8);
  rep.graficos = [{
    tipo: 'barrasH', titulo: 'Las 8 sociedades con más cajuelas', cats: top.map((x) => x.nombre),
    series: ctx.items.map((it, i) => ({ nombre: it.cos, valores: top.map((x) => x.v[i].caj) }))
  }];
  return rep;
}

export const DIMENSIONES = ['Mes', 'Tipo', 'Cliente', 'APC'];
const ORDEN_MES = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function desglose(ctx, f) {
  const dim = f.dim || 'Mes';
  const rep = encabezado(`Desglose por ${dim.toLowerCase()}`, ctx, f);
  const kf = { Mes: (r) => Number(r.f.slice(5, 7)), Tipo: (r) => r.nt || '-', Cliente: (r) => r.nc || '-', APC: (r) => normalizar(r.apc) || '-' }[dim];
  const nfn = { Mes: (r) => nombreMes(r.f), Tipo: (r) => r.tipo || '(sin tipo)', Cliente: (r) => r.cli || '(sin cliente)', APC: (r) => r.apc || '(sin APC)' }[dim];
  const gB = agrupar(ctx.base.rows, kf, nfn), gP = ctx.prev ? agrupar(ctx.prev.rows, kf, nfn) : new Map();
  const claves = [...new Set([...gB.keys(), ...gP.keys()])];
  let filas = claves.map((k) => ({ k, nombre: (gB.get(k) || gP.get(k)).nombre, s: suma(gB.has(k) ? gB.get(k).rows : []), sp: suma(gP.has(k) ? gP.get(k).rows : []) }));
  if (dim === 'Mes') filas.sort((a, b) => ORDEN_MES.indexOf(a.k) - ORDEN_MES.indexOf(b.k));
  else filas.sort((a, b) => b.s.caj - a.s.caj || b.sp.caj - a.sp.caj);
  const total = filas.length;
  const LIM = 60;
  if (filas.length > LIM) filas = filas.slice(0, LIM);
  const tot = ctx.base.s, hayPrev = !!ctx.prev;
  rep.cols = [{ t: dim, peso: 2.6, tipo: 'txt' }, { t: 'Recibos', peso: 0.9, tipo: 'int' }, { t: 'Cajuelas', peso: 1.1, tipo: 'int' }, { t: 'Fanegas', peso: 1, tipo: 'dec' },
    { t: '% del total', peso: 0.9, tipo: 'pcta' }, { t: 'Adelanto', peso: 1.5, tipo: 'mon' }, { t: 'Intereses', peso: 1.3, tipo: 'mon' }];
  if (hayPrev) rep.cols.push({ t: `Cajuelas ${ctx.prev.cos}`, peso: 1.3, tipo: 'int' }, { t: 'Variación', peso: 0.9, tipo: 'pct' });
  rep.filas = filas.map((x) => ({ v: [x.nombre, x.s.n, x.s.caj, x.s.fan, pctDe(x.s.caj, tot.caj), x.s.ade, x.s.int, ...(hayPrev ? [x.sp.caj, delta(x.s.caj, x.sp.caj)] : [])] }));
  rep.filas.push({ v: ['TOTAL', tot.n, tot.caj, tot.fan, tot.caj > 0 ? 1 : null, tot.ade, tot.int, ...(hayPrev ? [ctx.prev.s.caj, delta(tot.caj, ctx.prev.s.caj)] : [])], negrita: true, fondo: '#E8F1EB' });
  rep.nota = total > LIM ? `Se muestran los ${LIM} primeros de ${total}.` : '';
  const top = dim === 'Mes' ? filas : filas.slice(0, 10);
  const comp = [{ nombre: ctx.base.cos, valores: top.map((x) => x.s.caj) }, ...(hayPrev ? [{ nombre: ctx.prev.cos, valores: top.map((x) => x.sp.caj) }] : [])];
  rep.graficos = [dim === 'Mes' ? { tipo: 'barras', titulo: 'Cajuelas por mes', cats: top.map((x) => x.nombre.slice(0, 3)), series: comp }
    : { tipo: 'barrasH', titulo: `Las ${top.length} principales por ${dim.toLowerCase()}`, cats: top.map((x) => x.nombre), series: comp }];
  return rep;
}

function porDia(ctx, f) {
  const rep = encabezado('Recepción día por día', ctx, f);
  const dif = ctx.prev ? inicioAnio(ctx.base.cos) - inicioAnio(ctx.prev.cos) : 0;
  const g = agrupar(ctx.base.rows, (r) => r.f, (r) => r.f);
  const dias = [...g.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
  const prevDia = new Map();
  if (ctx.prev) for (const r of ctx.prev.rows) prevDia.set(r.f, (prevDia.get(r.f) || 0) + r.caj);
  const prevFechas = [...prevDia.keys()].sort();
  const accPrev = (fecha) => { let t = 0; for (const k of prevFechas) { if (k <= fecha) t += prevDia.get(k); else break; } return t; };
  let acc = 0, accAde = 0;
  const filas = dias.map((d) => {
    const s = suma(d.rows); acc += s.caj; accAde += s.ade;
    const ap = ctx.prev ? accPrev(desplazar(d.k, -dif)) : null;
    return { f: d.k, s, acc, accAde, ap };
  });
  const mejor = filas.reduce((m, x) => (x.s.caj > (m ? m.s.caj : -1) ? x : m), null);
  rep.cols = [{ t: 'Fecha', peso: 1.3, tipo: 'fecha' }, { t: 'Día', peso: 0.7, tipo: 'txt' }, { t: 'Recibos', peso: 0.9, tipo: 'int' }, { t: 'Cajuelas del día', peso: 1.2, tipo: 'int' },
    { t: 'Acumulado', peso: 1.2, tipo: 'int' }, { t: 'Fanegas acum.', peso: 1.1, tipo: 'dec' }, { t: 'Adelanto acum.', peso: 1.6, tipo: 'mon' }];
  if (ctx.prev) rep.cols.push({ t: `Acum. ${ctx.prev.cos}`, peso: 1.3, tipo: 'int' }, { t: 'Variación', peso: 0.9, tipo: 'pct' });
  rep.filas = filas.map((x) => ({
    v: [x.f, diaSemana(x.f), x.s.n, x.s.caj, x.acc, x.acc / FANEGA, x.accAde, ...(ctx.prev ? [x.ap, delta(x.acc, x.ap)] : [])],
    fondo: x === mejor ? '#FEF3C7' : null
  }));
  rep.nota = mejor ? `Día de mayor recepción: ${fmtFechaDMA(mejor.f)} con ${miles(mejor.s.caj)} cajuelas (resaltado).` : '';
  rep.graficos = [{ tipo: 'barras', titulo: 'Cajuelas recibidas por día', cats: filas.map((x) => String(Number(x.f.slice(8, 10)))), series: [{ nombre: 'Cajuelas', valores: filas.map((x) => x.s.caj) }], colores: filas.map((x) => (x === mejor ? '#D97706' : '#14532D')) }];
  return rep;
}

export const VISTAS = [['comparativo', 'Comparativo'], ['fincas', 'Fincas'], ['sociedades', 'Sociedades'], ['desglose', 'Desglose'], ['dia', 'Por día']];
export function armarReporte(vista, filas, f) {
  const ctx = contexto(filas, f);
  const fn = { comparativo, fincas, sociedades, desglose, dia: porDia }[vista] || comparativo;
  const rep = fn(ctx, f);
  rep.vista = vista;
  if (vista !== 'comparativo') rep.kpis = kpisDe(ctx);
  rep.ctx = ctx;
  return rep;
}
/** Filas de texto/números para el Excel. */
export function filasExcel(rep) {
  const out = [[rep.titulo], ...rep.subtitulos.map((s) => [s]), []];
  out.push(rep.cols.map((c) => c.t + (c.tipo === 'pct' || c.tipo === 'pcta' ? ' (%)' : '')));
  rep.filas.forEach((r) => out.push(r.v.map((v, i) => {
    const c = rep.cols[i];
    if (v == null) return '';
    if (c.tipo === 'txt') return String(v);
    if (c.tipo === 'fecha') return fmtFechaDMA(v);
    if (c.tipo === 'pct' || c.tipo === 'pcta') return Math.round(v * 1000) / 10;
    return typeof v === 'number' ? v : String(v);
  })));
  if (rep.nota) out.push([], [rep.nota]);
  return out;
}
