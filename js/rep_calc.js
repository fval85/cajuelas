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
const nf02 = nf(0, 2), nf12 = nf(1, 2);
const milesR = (v) => limpio(nf0.format(Math.round(v)));
/** Cantidades (cajuelas, recibos…): sin decimales si es entero y hasta 2 si no (0,25 · 0,5 · 0,75), nunca redondeadas. */
export const miles = (v) => limpio(nf02.format(Math.round(v * 100) / 100));
export const miles1 = (v) => limpio(nf12.format(Math.round(v * 100) / 100));
export const dinero = (v) => '₡' + milesR(v);
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
    caj: Number(a[8]) || 0, ade: Number(a[9]) || 0, int: Number(a[10]) || 0,
    est: String(a[11] || '').trim(), iva: Number(a[12]) || 0, dias: Number(a[13]) || 0
  })).filter((r) => r.cos && r.f).map((r) => ({ ...r, nc: normalizar(r.cli), ns: normalizar(r.soc), nf: normalizar(r.fin), nt: normalizar(r.tipo), ne: normalizar(r.est) }));
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
  const lista = [f.cos, ...(f.solo ? [] : todas.filter((c) => inicioAnio(c) < inicioAnio(f.cos)).slice(0, ANTERIORES))];
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
  const subt = [`Cosecha ${f.cos} · ${f.desde ? 'del ' + fmtFechaDMA(ctx.base.desde) + ' al ' : 'acumulado al '}${fmtFechaDMA(ctx.base.corte)}` + (ctx.prev ? ` · comparado con la misma fecha de ${ctx.items.slice(1).map((i) => i.cos).join(', ')}` : ' · solo esta cosecha'), textoFiltros(f)];
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


// ---------- Reporte personalizado: varias medidas, 1 o 2 agrupaciones y varias cosechas ----------
export const MEDIDAS = [
  { k: 'caj', t: 'Cajuelas', tipo: 'int' }, { k: 'fan', t: 'Fanegas', tipo: 'dec' }, { k: 'ade', t: 'Adelanto', tipo: 'mon' },
  { k: 'iva', t: 'IVA', tipo: 'mon' }, { k: 'adeiva', t: 'Adelanto + IVA', tipo: 'mon' }, { k: 'int', t: 'Intereses', tipo: 'mon' },
  { k: 'adeint', t: 'Adelanto + intereses', tipo: 'mon' }, { k: 'n', t: 'Recibos', tipo: 'int' }, { k: 'dias', t: 'Días promedio', tipo: 'dec' }
];
export const MEDIDAS_INI = ['caj', 'fan', 'ade'];
const mesNum = (r) => Number(r.f.slice(5, 7));
const ordMes = (m) => ORDEN_MES.indexOf(m);
export const AGRUPACIONES = [
  { k: 'soc', t: 'Sociedad', clave: (r) => r.ns || '-', nombre: (r) => r.soc || '(sin sociedad)' },
  { k: 'apc', t: 'APC', clave: (r) => normalizar(r.apc) || '-', nombre: (r) => r.apc || '(sin APC)' },
  { k: 'cli', t: 'Cliente', clave: (r) => r.nc || '-', nombre: (r) => r.cli || '(sin cliente)' },
  { k: 'est', t: 'Estatus', clave: (r) => r.ne || '-', nombre: (r) => r.est || '(sin estatus)' },
  { k: 'mes', t: 'Mes', clave: (r) => mesNum(r), nombre: (r) => nombreMes(r.f), orden: (k) => ordMes(k) },
  { k: 'tipo', t: 'Tipo (M/V)', clave: (r) => r.nt || '-', nombre: (r) => r.tipo || '(sin tipo)' },
  { k: 'fin', t: 'Finca', clave: (r) => r.nf || '-', nombre: (r) => r.fin || '(sin finca)' },
  { k: 'dia', t: 'Día', clave: (r) => r.f.slice(5), nombre: (r) => `${r.f.slice(8, 10)}/${r.f.slice(5, 7)}`, orden: (k) => ordMes(Number(k.slice(0, 2))) * 100 + Number(k.slice(3)) }
];
export function sumaTodo(rows) {
  let caj = 0, ade = 0, iva = 0, int = 0, ds = 0;
  for (const r of rows) { caj += r.caj; ade += r.ade; iva += r.iva; int += r.int; ds += r.dias; }
  return { n: rows.length, caj, fan: caj / FANEGA, ade, iva, adeiva: ade + iva, int, adeint: ade + int, dias: rows.length ? ds / rows.length : 0 };
}
const corto = (c) => { const m = String(c).match(/(\d{4})\D+(\d{4})/); return m ? `${m[1].slice(2)}-${m[2].slice(2)}` : String(c); };
export const cosechaCorta = corto;

export function contextoPers(filas, f) {
  const todas = cosechasDe(filas);
  const extra = (f.comp || []).filter((c) => c !== f.cos && todas.includes(c)).sort((a, b) => inicioAnio(b) - inicioAnio(a));
  const items = [f.cos, ...extra].map((c) => {
    const dif = inicioAnio(c) - inicioAnio(f.cos);
    if (f.modo === 'completa') { const rows = filtrar(filas, c, '9999-12-31', f, ''); return { cos: c, corte: ultimaFecha(rows, c), desde: '', rows, s: sumaTodo(rows) }; }
    const corte = desplazar(f.corte, dif), desde = f.desde ? desplazar(f.desde, dif) : '';
    const rows = filtrar(filas, c, corte, f, desde);
    return { cos: c, corte, desde, rows, s: sumaTodo(rows) };
  });
  return { items, base: items[0], prev: items[1] || null };
}

const nomDim = (d) => (d.k === 'apc' ? 'APC' : d.t.toLowerCase());
function personalizado(filas, f) {
  const ctx = contextoPers(filas, f);
  const items = ctx.items, nC = items.length;
  const meds = MEDIDAS.filter((m) => (f.med && f.med.length ? f.med : MEDIDAS_INI).includes(m.k));
  const m0 = meds[0];
  // Las columnas de texto que se tocan (en el orden en que se tocaron) forman las filas; las de números se suman.
  const dims = (f.dims || []).map((k) => AGRUPACIONES.find((a) => a.k === k)).filter(Boolean);
  const claveDe = (r) => dims.map((d) => d.clave(r)).join('\u0001');
  const nomDe = (r) => dims.map((d) => d.nombre(r));
  const mapas = items.map((it) => agrupar(it.rows, dims.length ? claveDe : () => 'todo', dims.length ? nomDe : () => ['Todos']));
  const claves = [...new Set(mapas.flatMap((m) => [...m.keys()]))];
  const nodos = claves.map((k) => {
    const nombres = (mapas.find((m) => m.has(k)).get(k)).nombre;
    return { k, partes: k.split('\u0001'), nombres, vals: mapas.map((m) => sumaTodo(m.has(k) ? m.get(k).rows : [])) };
  });
  // Orden: por cada columna de texto, por calendario si es mes/día; si no, de mayor a menor según el total de ese grupo.
  const totPref = (n, L) => { const pre = n.partes.slice(0, L + 1).join('\u0001'); return nodos.filter((x) => x.partes.slice(0, L + 1).join('\u0001') === pre).reduce((t, x) => t + x.vals[0][m0.k], 0); };
  const cache = new Map();
  const tp = (n, L) => { const id = n.k + '|' + L; if (!cache.has(id)) cache.set(id, totPref(n, L)); return cache.get(id); };
  nodos.sort((a, b) => {
    for (let L = 0; L < dims.length; L++) {
      const d = dims[L];
      if (a.partes[L] === b.partes[L]) continue;
      if (d.orden) return d.orden(a.partes[L]) - d.orden(b.partes[L]);
      const dif = tp(b, L) - tp(a, L);
      if (dif) return dif;
      return a.nombres[L].localeCompare(b.nombres[L], 'es');
    }
    for (let i = 0; i < nC; i++) { const dd = b.vals[i][m0.k] - a.vals[i][m0.k]; if (dd) return dd; }
    return 0;
  });

  // Columnas: las de texto, y por cada medida una por cosecha y (con 2 cosechas, o solo la primera medida con más) la variación.
  const peso = { mon: 1.5, int: 1.1, dec: 1, pct: 0.95, pcta: 0.95 };
  const cols = dims.length ? dims.map((d, i) => ({ t: d.t, peso: i === 0 ? 3.2 : 2, tipo: 'txt' })) : [{ t: 'Total', peso: 2, tipo: 'txt' }];
  const plan = [];
  meds.forEach((m, mi) => {
    items.forEach((it, i) => { cols.push({ t: nC > 1 ? `${m.t} ${corto(it.cos)}` : m.t, peso: peso[m.tipo], tipo: m.tipo }); plan.push({ m, i }); });
    if (nC > 1 && (nC === 2 || mi === 0)) { cols.push({ t: `Var. ${m.t} vs ${corto(items[1].cos)}`, peso: peso.pct, tipo: 'pct' }); plan.push({ m, var: true }); }
  });
  if (nC === 1) { cols.push({ t: `% de ${m0.t}`, peso: peso.pcta, tipo: 'pcta' }); plan.push({ m: m0, pctDe: true }); }
  const totales = items.map((i) => i.s);
  const celdas = (vals) => plan.map((p) => {
    if (p.var) return delta(vals[0][p.m.k], vals[1][p.m.k]);
    if (p.pctDe) return pctDe(vals[0][p.m.k], totales[0][p.m.k]);
    return vals[p.i][p.m.k];
  });
  const LIM = 150;
  const nTxt = dims.length || 1;
  const filasT = nodos.slice(0, LIM).map((n) => ({ v: [...(dims.length ? n.nombres : ['Todos']), ...celdas(n.vals)] }));
  filasT.push({ v: ['TOTAL', ...new Array(nTxt - 1).fill(null), ...celdas(totales)], negrita: true, fondo: '#E8F1EB' });

  const periodo = f.modo === 'completa' ? 'cosecha completa de cada año' : `${f.desde ? 'del ' + fmtFechaDMA(ctx.base.desde) + ' al ' : 'acumulado al '}${fmtFechaDMA(ctx.base.corte)}${nC > 1 ? ', misma fecha en cada cosecha' : ''}`;
  const rep = {
    titulo: 'Reporte personalizado',
    subtitulos: [
      [...dims.map((d) => d.t), ...meds.map((m) => m.t)].join(' · '),
      `${nC > 1 ? 'Cosechas ' + items.map((i) => i.cos).join(', ') : 'Cosecha ' + items[0].cos} · ${periodo}`,
      textoFiltros(f)
    ],
    cols, filas: filasT, ctx
  };
  const p = ctx.prev ? ctx.prev.s : null;
  rep.kpis = meds.slice(0, 5).map((m) => ({ t: m.t, v: celdaTxt({ tipo: m.tipo }, ctx.base.s[m.k]), d: p ? delta(ctx.base.s[m.k], p[m.k]) : null, ref: p ? 'vs ' + ctx.prev.cos : '' }));
  const notas = [];
  if (nC > 2) notas.push(`La variación se muestra solo para ${m0.t}, comparando ${items[0].cos} con ${items[1].cos}.`);
  if (nodos.length > LIM) notas.push(`Se muestran las primeras ${LIM} filas de ${nodos.length}.`);
  if (meds.some((m) => m.k === 'iva' || m.k === 'adeiva') && items.some((i) => inicioAnio(i.cos) <= 2020)) notas.push('El IVA de las cosechas 2019-2020 y 2020-2021 no está registrado y se toma como 0.');
  rep.nota = notas.join(' ');
  // ----- Datos de interés (con una sola cosecha el informe se enfoca en ella) -----
  const base = ctx.base;
  const porFecha = agrupar(base.rows, (r) => r.f, (r) => r.f);
  const diasRec = [...porFecha.values()].map((g) => ({ f: g.k, caj: g.rows.reduce((t, r) => t + r.caj, 0) }));
  const datos = [];
  if (diasRec.length) {
    const mejor = diasRec.reduce((m, x) => (x.caj > m.caj ? x : m), diasRec[0]);
    datos.push(`Día de mayor recepción: ${fmtFechaDMA(mejor.f)} con ${miles(mejor.caj)} cajuelas (${miles1(mejor.caj / FANEGA)} fanegas).`);
    datos.push(`Se recibió café en ${diasRec.length} día(s): promedio de ${miles(base.s.caj / diasRec.length)} cajuelas por día de recepción.`);
  }
  const ag1 = dims[0];
  let listaG = [];
  if (ag1) {
    const g1 = items.map((it) => agrupar(it.rows, ag1.clave, ag1.nombre));
    listaG = [...new Set(g1.flatMap((m) => [...m.keys()]))].map((k) => ({ k, nombre: g1.find((m) => m.has(k)).get(k).nombre, vals: g1.map((m) => sumaTodo(m.has(k) ? m.get(k).rows : [])) }));
    const porValor = [...listaG].sort((a, b2) => b2.vals[0][m0.k] - a.vals[0][m0.k]);
    const tot = base.s[m0.k];
    if (porValor.length > 1 && tot > 0) {
      const pc = (v) => (v / tot * 100).toFixed(1).replace('.', ',') + ' %';
      datos.push(`Mayor participación en ${m0.t.toLowerCase()} (${nomDim(ag1)}): ${porValor[0].nombre} con ${pc(porValor[0].vals[0][m0.k])}.`);
      if (porValor.length >= 4) datos.push(`Las 3 principales suman ${pc(porValor.slice(0, 3).reduce((t, x) => t + x.vals[0][m0.k], 0))} del total.`);
    }
  }
  if (!(base.s.n > 0)) datos.length = 0;
  rep.datos = datos;

  if (f.graf !== false) {
    rep.graficos = [];
    if (ag1) {
      let lista = [...listaG];
      if (ag1.orden) lista.sort((a, b2) => ag1.orden(a.k) - ag1.orden(b2.k));
      else lista.sort((a, b2) => { for (let i = 0; i < nC; i++) { const dd = b2.vals[i][m0.k] - a.vals[i][m0.k]; if (dd) return dd; } return 0; });
      const total1 = lista.length;
      if (!ag1.orden) lista = lista.slice(0, 10);
      if (lista.length) {
        const series = items.slice(0, 4).map((it, i) => ({ nombre: it.cos, valores: lista.map((n) => n.vals[i][m0.k]) }));
        rep.graficos.push(ag1.orden
          ? { tipo: 'barras', titulo: `${m0.t} por ${nomDim(ag1)}`, cats: lista.map((n) => (ag1.k === 'mes' ? n.nombre.slice(0, 3) : n.nombre)), series }
          : { tipo: 'barrasH', titulo: `${m0.t}: ${lista.length < total1 ? 'los ' + lista.length + ' principales por' : 'por'} ${nomDim(ag1)}`, cats: lista.map((n) => n.nombre), series });
      }
    }
    if (nC > 1) {
      const orden = [...items].reverse();
      rep.graficos.push({ tipo: 'barras', titulo: `${m0.t} total por cosecha`, cats: orden.map((i) => i.cos), series: [{ nombre: m0.t, valores: orden.map((i) => i.s[m0.k]) }], colores: orden.map((i) => (i === ctx.base ? '#14532D' : '#86A894')) });
    } else if (base.rows.length) {
      const cv = curvas(ctx)[0];
      const xmax = Math.max(1, cv.fin);
      rep.graficos.push({ tipo: 'lineas', titulo: 'Cajuelas acumuladas día por día', series: [{ nombre: base.cos, pts: cv.pts }], xmax, xticks: xticksBase(ctx, xmax) });
    }
  }
  return rep;
}

export const VISTAS = [['comparativo', 'Comparativo'], ['fincas', 'Fincas'], ['sociedades', 'Sociedades'], ['desglose', 'Desglose'], ['dia', 'Por día'], ['personalizado', 'Personalizado']];
export function armarReporte(vista, filas, f) {
  if (vista === 'personalizado') { const rp = personalizado(filas, f); rp.vista = vista; return rp; }
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
