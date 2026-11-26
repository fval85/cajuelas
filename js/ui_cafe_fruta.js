// Reportes › Café en fruta VOLCAFE (solo administradores): control informativo de lo entregado a Capris.
// Recibo = Fecha, Tipo, Recibo, Finca, Sociedad, Cajuelas; las fanegas se calculan (cajuelas ÷ 20). Sin dinero.
import { h, clear, toast, confirmar, diaHoy, elegir, ahoraTxt } from './util.js';
import { boton as botonUi, verDocumento } from './ui.js';
import { cargarFuentes, paginasReporte } from './draw.js';
import { cafeFruta } from './sync.js';
import { puede } from './users.js';
import { leerArchivoTabla } from './leer_tabla.js';
import { descargar, xlsx } from './files.js';

const hoyISO = () => diaHoy();

const CAJ_FANEGA = 20;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (v, d = 1) => Number(v || 0).toLocaleString('es-CR', { maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const fan = (caj) => Number(caj || 0) / CAJ_FANEGA;
const n2 = (v) => Number(v || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const corta = (s) => String(s || '').replace(/\s*S\.?A\.?$/i, '').replace(/^BENEFICIADORA\s+/i, 'BEN. ');
const dma = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const p2 = (n) => String(n).padStart(2, '0');

/** Fecha de Excel o texto (número de serie, dd/mm/aaaa, aaaa-mm-dd) → 'aaaa-mm-dd' ('' si no se entiende). */
export function fechaISO(v) {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(t)) { const d = new Date(Math.round((Number(t) - 25569) * 86400000)); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; }
  const m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${p2(m[2])}-${p2(m[1])}`; }
  return '';
}
const esNum = (s) => /^\d+([.,]\d+)?$/.test(String(s ?? '').trim());

/** Texto pegado desde Excel → filas {fecha, tipo, recibo, finca, sociedad, cajuelas}. Orden: Fecha, Tipo, Recibo, Finca, Sociedad, Cajuelas (si trae Rec. interno antes de las cajuelas, se ignora). */
export function parsearPegado(texto) {
  const out = [];
  String(texto || '').split(/\r?\n/).forEach((l) => {
    if (!l.trim()) return;
    const c = l.split('\t').map((x) => x.trim());
    if (/fecha/i.test(c[0]) && /recibo/i.test(l)) return;
    if (c.length < 4) { out.push({ fecha: fechaISO(c[0]), tipo: c[1] || '', recibo: c[2] || '', finca: '', sociedad: '', cajuelas: '' }); return; }
    const caj = esNum(c[5]) ? c[5] : (esNum(c[6]) ? c[6] : c[5] || '');
    out.push({ fecha: fechaISO(c[0]) || c[0], tipo: c[1], recibo: c[2], finca: c[3] || '', sociedad: c[4] || '', cajuelas: caj });
  });
  return out;
}

/** Filas de un archivo (con encabezados FECHA, TIPO, RECIBO, FINCA, SOCIEDAD, CAJUELAS) → filas. */
export function filasDeArchivo(filas) {
  const ini = filas.findIndex((r) => r.some((c) => /^recibo$/i.test(String(c).trim())));
  if (ini < 0) throw new Error('No encontré la fila de encabezados (FECHA, TIPO, RECIBO, FINCA, SOCIEDAD, CAJUELAS). Use la plantilla.');
  const enc = filas[ini].map(norm), f = (re) => enc.findIndex((x) => re.test(x));
  const col = { fecha: f(/^fecha/), tipo: f(/^tipo/), recibo: f(/^recibo/), finca: f(/^finca/), sociedad: f(/^sociedad/), cajuelas: f(/^cajuela/) };
  if (col.fecha < 0 || col.tipo < 0 || col.recibo < 0 || col.cajuelas < 0) throw new Error('Al archivo le faltan columnas: necesita FECHA, TIPO, RECIBO y CAJUELAS (y FINCA, SOCIEDAD). Use la plantilla.');
  const g = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  return filas.slice(ini + 1).filter((r) => r.some((c) => String(c).trim()) && g(r, col.recibo))
    .map((r) => ({ fecha: fechaISO(g(r, col.fecha)) || g(r, col.fecha), tipo: g(r, col.tipo), recibo: g(r, col.recibo), finca: g(r, col.finca), sociedad: g(r, col.sociedad), cajuelas: g(r, col.cajuelas) }))
    .filter((x) => !/^ejemplo/i.test(x.recibo));
}

export function crearCafeFruta({ abrir, volver, alCambiar }) {
  let res = null, error = '', cargando = false;
  let pantalla = 'inicio', param = null;
  const el = h('div', { class: 'cafe-fruta' });
  const tituloCab = h('h1', null, 'Café en fruta · VOLCAFE');
  const cab = h('header', { class: 'cab-sub' }, h('button', { type: 'button', class: 'atras', 'aria-label': 'Volver', onclick: () => atras() }, '‹'), tituloCab);
  const chip = (t, c) => h('span', { class: 'chip-est ' + c }, t);
  const boton = (t, fn, cls = '') => h('button', { type: 'button', class: `btn-texto ${cls} ancho-total`.replace('  ', ' '), onclick: fn }, t);

  function ir(p, prm = null) { pantalla = p; param = prm; pintar(); window.scrollTo(0, 0); }
  function atras() {
    if (pantalla === 'inicio') volver();
    else if (pantalla === 'previa') ir(param.origen);
    else ir('inicio');
  }

  async function cargar(forzar) {
    if (!puede('todos')) return;
    if (cargando) return;
    cargando = true; error = ''; alCambiar && alCambiar(); if (pantalla === 'inicio') pintar();
    const r = await cafeFruta('resumen', {});
    cargando = false;
    if (r.ok && r.json) res = r.json; else error = r.message || 'No se pudo cargar el café en fruta.';
    alCambiar && alCambiar(); pintar();
  }

  // ---------- Tarjeta del inicio de Reportes ----------
  function tarjetaHub(opc = {}) {
    const refBtn = h('button', { type: 'button', class: 'hub-ref' + (cargando ? ' gira' : ''), 'aria-label': 'Actualizar todo', onclick: (e) => { e.stopPropagation(); opc.alRefrescar && opc.alRefrescar(); } }, '↻');
    const cab3 = h('div', { class: 'fuente-cab' }, h('h3', null, '🍒 Café en fruta · VOLCAFE'));
    if (!res) return h('div', { class: 'fuente vacia hub-fuente' }, refBtn, cab3, h('p', { class: 'sub' }, cargando ? 'Descargando datos…' : error ? '⚠ ' + error : 'Toque ↻ para traer los recibos.'));
    const etq = opc.etiqueta ? opc.etiqueta() : '';
    const nRec = res.tipos.reduce((t, x) => t + x.recibos, 0), totCaj = res.tipos.reduce((t, x) => t + Number(x.cajuelas || 0), 0);
    const tm = res.tipos.find((t) => t.maximo);
    const izq = h('div', null, h('p', { class: 'hub-et' }, 'Cajuelas'), h('p', { class: 'hub-v' }, n2(totCaj)), h('p', { class: 'sub' }, `${n2(fan(totCaj))} fanegas · ${plural(nRec, 'recibo', 'recibos')}`));
    let der = h('div', null, h('p', { class: 'hub-et' }, 'Avance'), h('p', { class: 'hub-v' }, '—'), h('p', { class: 'sub' }, 'Sin tope definido'));
    let pie = [];
    if (tm) {
      const fa = fan(tm.cajuelas), pct = Math.min(100, Math.round(fa / tm.maximo * 100)), falta = Math.max(0, tm.maximo - fa);
      der = h('div', null, h('p', { class: 'hub-et' }, tm.tipo), h('p', { class: 'hub-v' }, pct + ' %'), h('p', { class: 'sub' }, `${n2(fa)} de ${num(tm.maximo, 0)} fanegas`));
      const otros = res.tipos.filter((t) => !t.maximo && t.recibos > 0).map((t) => `${tipoCorto(t.tipo)} ${n2(fan(t.cajuelas))} fanegas`);
      pie = [h('div', { class: 'progreso', role: 'img', 'aria-label': `${pct}% entregado` }, h('i', { style: `width:${pct}%` })),
        h('p', { class: 'sub' }, (falta > 0 ? `Faltan ${n2(falta)} fanegas (${n2(falta * CAJ_FANEGA)} cajuelas)` : 'Contrato completo ✓') + (otros.length ? ' · ' + otros.join(' · ') : ''))];
    }
    return h('div', { class: 'fuente toque hub-fuente' + (cargando ? ' carga' : ''), role: 'button', tabindex: '0', onclick: () => { ir('inicio'); abrir(); } }, refBtn, cab3, etq ? h('p', { class: 'hub-fecha' }, h('i'), etq) : null,
      h('div', { class: 'hub-dos' }, izq, der), ...pie, h('span', { class: 'hub-flecha', 'aria-hidden': 'true' }, '›'));
  }

  // ---------- Pantallas ----------
  function pintar() {
    clear(el);
    const t = { inicio: 'Café en fruta · VOLCAFE', nuevo: 'Nuevo recibo', pegar: 'Pegar desde Excel', archivo: 'Subir archivo', previa: 'Vista previa', recibo: param && param.r ? `Recibo ${param.r.recibo}` : 'Recibo', maximo: 'Máximo del contrato', listo: 'Café en fruta' }[pantalla] || 'Café en fruta';
    tituloCab.textContent = t;
    if (error) { el.append(h('p', { class: 'estado aviso' }, '⚠ ' + error), boton('Reintentar', () => cargar(true))); return; }
    if (!res) { el.append(h('p', { class: 'nota' }, cargando ? 'Cargando…' : 'Sin datos todavía.')); return; }
    ({ inicio, nuevo, pegar, archivo, previa, recibo, maximo, listo })[pantalla]();
  }

  // ---------- Filtros de la pantalla (se recuerdan mientras la app está abierta) ----------
  let fTipo = '', fFinca = '', fPer = 'cosecha', selDia = '', qRec = '', verN = 40;
  const PERIODOS = [['semana', 'Esta semana'], ['mes', 'Este mes'], ['cosecha', 'Toda la cosecha']];
  const tipoCorto = (t) => { const s = String(t || '').toLowerCase().replace(/convencional/g, 'conv.').replace(/\baaa\b/g, 'AAA'); return s.charAt(0).toUpperCase() + s.slice(1); };
  const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  /** Primer día del periodo ('' = desde el principio). La semana va de lunes a hoy. */
  function iniPeriodo(p) {
    const hoy = hoyISO();
    if (p === 'mes') return hoy.slice(0, 8) + '01';
    if (p === 'semana') return sumarDias(hoy, -((new Date(hoy + 'T12:00:00').getDay() + 6) % 7));
    return '';
  }
  const sumaCaj = (rs) => rs.reduce((t, r) => t + Number(r.cajuelas || 0), 0);
  const porTipo = (rs) => rs.filter((r) => !fTipo || r.tipo === fTipo);
  const baseRecibos = () => { const i = iniPeriodo(fPer); return porTipo(res.recibos).filter((r) => !i || r.fecha >= i); }; // sin filtro de finca
  const filtrados = () => baseRecibos().filter((r) => !fFinca || r.finca === fFinca);
  const tipoMax = () => res.tipos.find((t) => t.maximo) || null;
  /** Cajuelas por día de los últimos 14 días (incluye hoy). */
  const ritmo14 = (rs) => { const ini = sumarDias(hoyISO(), -13); return sumaCaj(rs.filter((r) => r.fecha >= ini)) / 14; };
  function avanceMax() {
    const t = tipoMax(); if (!t) return null;
    const fa = fan(t.cajuelas), falta = Math.max(0, t.maximo - fa);
    const rit = ritmo14(res.recibos.filter((r) => r.tipo === t.tipo));
    return { t, fa, pct: Math.round(fa / t.maximo * 100), falta, faltaCaj: falta * CAJ_FANEGA, dias: falta > 0 && rit > 0 ? Math.ceil(falta * CAJ_FANEGA / rit) : null };
  }
  function porFinca(rs) {
    const mf = new Map();
    rs.forEach((r) => { const k = r.finca || ''; const x = mf.get(k) || { finca: k, caj: 0, n: 0 }; x.caj += Number(r.cajuelas || 0); x.n += 1; mf.set(k, x); });
    return [...mf.values()].sort((a, b) => b.caj - a.caj);
  }
  function serieDe(rs) {
    const mp = new Map();
    rs.forEach((r) => { const x = mp.get(r.fecha) || { dia: r.fecha, caj: 0, n: 0 }; x.caj += Number(r.cajuelas || 0); x.n += 1; mp.set(r.fecha, x); });
    const fin = hoyISO(); let ini = iniPeriodo(fPer);
    if (!ini) { const ds = [...mp.keys()].sort(); ini = ds[0] || fin; }
    const out = []; for (let d = ini; d <= fin && out.length < 400; d = sumarDias(d, 1)) out.push(mp.get(d) || { dia: d, caj: 0, n: 0 });
    return out;
  }
  function columnas(serie, sel, onTap) {
    const mx = Math.max(1, ...serie.map((x) => x.caj));
    const caja = h('div', { class: 'cf-cols', role: 'group', 'aria-label': 'Cajuelas entregadas por día' });
    serie.forEach((x) => caja.append(h('button', { type: 'button', class: 'cf-col' + (x.dia === sel ? ' sel' : '') + (x.caj ? '' : ' vacio'), 'aria-label': `${dma(x.dia)}: ${n2(x.caj)} cajuelas`, onclick: () => onTap(x.dia) },
      h('i', { style: `height:${Math.round(x.caj / mx * 100)}%` }))));
    return caja;
  }
  const barraH = (pct) => h('div', { class: 'progreso' }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));

  function menuCargar() {
    const caja = h('div', { class: 'cf-menu' },
      h('button', { type: 'button', onclick: () => ir('nuevo') }, '＋ Un recibo a mano'),
      h('button', { type: 'button', onclick: () => ir('pegar') }, '📋 Pegar desde Excel'),
      h('button', { type: 'button', onclick: () => ir('archivo') }, '📁 Subir archivo Excel / CSV'));
    return caja;
  }

  // ---------- PDF y Excel de lo que se ve en pantalla ----------
  function repActual() {
    const rs = filtrados().slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));
    const caj = sumaCaj(rs), av = avanceMax(), fs = porFinca(rs);
    const perTxt = PERIODOS.find((x) => x[0] === fPer)[1];
    const filtros = [fTipo ? `Tipo: ${fTipo}` : '', fFinca ? `Finca: ${fFinca}` : ''].filter(Boolean).join(' · ');
    const rit = ritmo14(porTipo(res.recibos).filter((r) => !fFinca || r.finca === fFinca));
    const datos = [`Cajuelas entregadas: ${n2(caj)} = ${n2(fan(caj))} fanegas en ${plural(rs.length, 'recibo', 'recibos')}.`];
    if (av) datos.push(`${av.t.tipo}: ${n2(av.fa)} de ${num(av.t.maximo, 0)} fanegas (${av.pct} %). Faltan ${n2(av.falta)} fanegas (${n2(av.faltaCaj)} cajuelas)${av.dias ? ` · al ritmo de los últimos 14 días, unos ${av.dias} días para cerrar` : ''}.`);
    datos.push(`Ritmo de los últimos 14 días: ${n2(rit)} cajuelas por día (${n2(fan(rit))} fanegas por día).`);
    return {
      vista: 'cafe', titulo: 'Café en fruta · VOLCAFE', centrado: true,
      subtitulos: [`${perTxt}${rs.length ? ` · del ${dma(rs[0].fecha)} al ${dma(rs[rs.length - 1].fecha)}` : ''} · ${plural(rs.length, 'recibo', 'recibos')}`, ...(filtros ? ['Filtros: ' + filtros] : [])],
      kpis: [{ t: 'Cajuelas', v: n2(caj) }, { t: 'Fanegas', v: n2(fan(caj)) }, { t: av ? `Avance ${tipoCorto(av.t.tipo)}` : 'Avance', v: av ? av.pct + ' %' : '—' }, { t: 'Ritmo caj./día (14 d)', v: n2(rit) }],
      datos,
      graficos: fs.length ? [{ tipo: 'barrasH', titulo: 'Cajuelas por finca', dec: true, cats: fs.map((x) => x.finca || 'Sin finca'), series: [{ nombre: 'Cajuelas', valores: fs.map((x) => x.caj), color: '#14532D' }] }] : [],
      cols: [{ t: 'Fecha', tipo: 'txt' }, { t: 'Tipo', tipo: 'txt' }, { t: 'Recibo', tipo: 'txt' }, { t: 'Finca', tipo: 'txt' }, { t: 'Sociedad', tipo: 'txt' }, { t: 'Cajuelas', tipo: 'dec', centro: true }, { t: 'Fanegas', tipo: 'dec', centro: true }],
      filas: [...rs.map((r) => ({ v: [dma(r.fecha), r.tipo, r.recibo, r.finca || '', corta(r.sociedad), Number(r.cajuelas), fan(r.cajuelas)] })),
        ...(rs.length > 1 ? [{ v: ['TOTAL', '', '', '', '', caj, fan(caj)], negrita: true, fondo: '#E8F1EB' }] : [])],
      ctx: { n: rs.length }, fincas: fs
    };
  }
  async function compartirPdf() {
    const rep = repActual(); if (!rep.ctx.n) return toast('No hay recibos con estos filtros.');
    await cargarFuentes();
    const pie = `Generado ${ahoraTxt()} · Fuente: Café en fruta VOLCAFE`;
    verDocumento({ titulo: rep.titulo, paginas: paginasReporte(rep, pie), nombrePdf: `Cafe_en_fruta_VOLCAFE_${hoyISO().replace(/-/g, '')}.pdf`, ancho: true, maxPaginas: 4, textoBoton: 'Compartir PDF', intro: rep.subtitulos[0], textoCompartir: rep.titulo });
  }
  function descargarExcel() {
    const rep = repActual(); if (!rep.ctx.n) return toast('No hay recibos con estos filtros.');
    const dec = (v) => ({ n: v, dec: true });
    const filas = [[rep.titulo], ...rep.subtitulos.map((t) => [t]), [], ...rep.datos.map((t) => [t]), [], ['Finca', 'Cajuelas', 'Fanegas', 'Recibos'],
      ...rep.fincas.map((x) => [x.finca || 'Sin finca', dec(x.caj), dec(fan(x.caj)), x.n]), [], rep.cols.map((c) => c.t)];
    rep.filas.forEach((f) => filas.push(f.v.map((v, i) => (v === '' || v == null ? '' : typeof v === 'number' ? dec(v) : v))));
    const bytes = xlsx('Café en fruta', filas);
    descargar(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Cafe_en_fruta_VOLCAFE_${hoyISO().replace(/-/g, '')}.xlsx`);
    toast('Se descargó el Excel.');
  }

  // ---------- Pantalla principal ----------
  function inicio() {
    let abierto = false;
    const menu = menuCargar(); menu.hidden = true;
    const bCargar = h('button', { type: 'button', class: 'btn-texto primario cf-cargar', 'aria-expanded': 'false', onclick: () => { abierto = !abierto; menu.hidden = !abierto; bCargar.textContent = abierto ? '＋ Cargar ▴' : '＋ Cargar ▾'; bCargar.setAttribute('aria-expanded', String(abierto)); } }, '＋ Cargar ▾');
    el.append(h('div', { class: 'cf-fila' }, bCargar), menu);

    // Botones rápidos: tipo, finca y periodo
    const chip = (t, on, fn) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: fn }, t);
    const tipos = res.tipos.filter((t) => t.recibos > 0 || t.maximo);
    el.append(h('div', { class: 'chips chicas envuelve' },
      chip('Todos', !fTipo, () => { fTipo = ''; selDia = ''; pintar(); }),
      ...tipos.map((t) => chip(tipoCorto(t.tipo), fTipo === t.tipo, () => { fTipo = fTipo === t.tipo ? '' : t.tipo; selDia = ''; pintar(); })),
      chip((fFinca || 'Finca') + ' ▾', !!fFinca, async () => {
        const fs = porFinca(res.recibos).map((x) => ({ etiqueta: x.finca || 'Sin finca', valor: x.finca }));
        const v = await elegir('Finca', [{ etiqueta: 'Todas las fincas', valor: '' }, ...fs], { buscar: false });
        if (v === undefined) return; fFinca = v; selDia = ''; pintar();
      })));
    el.append(h('div', { class: 'chips chicas envuelve' }, ...PERIODOS.map(([k, t]) => chip(t, fPer === k, () => { fPer = k; selDia = ''; verN = 40; pintar(); }))));

    const rs = filtrados(), caj = sumaCaj(rs), av = avanceMax();
    const rit = ritmo14(porTipo(res.recibos).filter((r) => !fFinca || r.finca === fFinca));
    const ult = [...rs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id))[0];
    const kpi = (t, v, ...subs) => h('div', { class: 'kpi' }, h('small', null, t), h('b', null, v), ...subs.filter(Boolean).map((s) => h('span', { class: 'kpi-sub' }, s)));
    el.append(h('div', { class: 'kpis' },
      kpi('Cajuelas', n2(caj), `${n2(fan(caj))} fanegas · ${plural(rs.length, 'recibo', 'recibos')}`),
      av ? kpi(`Avance ${tipoCorto(av.t.tipo)}`, `${av.pct} %`, `${n2(av.fa)} de ${num(av.t.maximo, 0)} fanegas`, av.falta > 0 ? `Faltan ${n2(av.falta)} fan. (${n2(av.faltaCaj)} caj.)` : 'Contrato completo ✓') : kpi('Avance', '—', 'Sin tope definido'),
      kpi('Ritmo · últimos 14 días', `${n2(rit)} caj./día`, `${n2(fan(rit))} fan./día`, av && av.dias ? `Para cerrar: unos ${av.dias} días` : null),
      kpi('Última entrega', ult ? dma(ult.fecha) : '—', ult ? `${ult.finca || 'Sin finca'} · recibo ${ult.recibo}` : 'Sin recibos')));

    // Gráfico por día (toque una columna → recibos de ese día)
    if (rs.length) {
      const serie = serieDe(rs); const sel = selDia && serie.some((x) => x.dia === selDia && x.n) ? selDia : '';
      const caja = h('div', { class: 'tarjeta' }, h('b', null, 'Cajuelas por día'), columnas(serie, sel, (d) => { selDia = selDia === d ? '' : d; pintar(); }),
        h('div', { class: 'cf-ejes' }, h('span', null, dma(serie[0].dia).slice(0, 5)), h('span', null, dma(serie[serie.length - 1].dia).slice(0, 5))));
      if (sel) { const dr = rs.filter((r) => r.fecha === sel), cd = sumaCaj(dr); caja.append(h('p', { class: 'sub cf-num' }, `${dma(sel)} · ${n2(cd)} cajuelas · ${n2(fan(cd))} fanegas · ${plural(dr.length, 'recibo', 'recibos')}`)); dr.forEach((r) => caja.append(filaRecibo(r))); }
      else caja.append(h('p', { class: 'nota' }, 'Toque una columna para ver los recibos de ese día.'));
      el.append(caja);
    }

    // Barras por finca (toque una → filtra esa finca)
    const fs = porFinca(baseRecibos());
    if (fs.length) {
      const mx = Math.max(1, ...fs.map((x) => x.caj));
      el.append(h('div', { class: 'titulo-grupo' }, 'Por finca'));
      fs.forEach((x) => el.append(h('button', { type: 'button', class: 'cf-finca' + (fFinca === x.finca && fFinca ? ' sel' : ''), onclick: () => { fFinca = fFinca === x.finca ? '' : x.finca; selDia = ''; pintar(); } },
        h('span', { class: 'cf-hb' }, h('span', null, x.finca || 'Sin finca'), h('b', { class: 'cf-num' }, `${n2(x.caj)} caj.`)), barraH(x.caj / mx * 100),
        h('small', null, `${n2(fan(x.caj))} fanegas · ${plural(x.n, 'recibo', 'recibos')}`))));
    }

    // Lista de recibos
    const q = h('input', { class: 'campo', type: 'search', placeholder: '🔍 Buscar recibo o finca', autocomplete: 'off', value: qRec });
    const lista = h('div');
    const dib = () => {
      clear(lista);
      const t = norm(qRec).trim();
      const l = [...rs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id)).filter((r) => !t || norm(r.recibo).includes(t) || norm(r.finca).includes(t));
      if (!l.length) lista.append(h('p', { class: 'nota' }, 'Ningún recibo coincide.'));
      l.slice(0, verN).forEach((r) => lista.append(filaRecibo(r)));
      if (l.length > verN) lista.append(h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => { verN += 40; dib(); } }, `Ver más (${l.length - verN} restantes)`));
    };
    q.addEventListener('input', () => { qRec = q.value; verN = 40; dib(); });
    el.append(h('div', { class: 'titulo-grupo' }, `Recibos (${rs.length})`), q, lista); dib();

    el.append(h('div', { class: 'botones-panel' }, botonUi('Compartir PDF', 'compartir', 'c-azul', () => compartirPdf()),
      h('button', { type: 'button', class: 'btn btn-excel', onclick: () => descargarExcel() }, '⬇ Descargar Excel')),
      boton('Cambiar el máximo del contrato', () => ir('maximo')));
  }

  const filaRecibo = (r) => h('div', { class: 'fila-aj fila-usuario', role: 'button', tabindex: '0', onclick: () => ir('recibo', { r }) },
    h('span', { class: 'tx' }, `${r.recibo}${r.finca ? ' · ' + r.finca : ''}`, h('small', null, `${dma(r.fecha)} · ${tipoCorto(r.tipo)} · ${n2(fan(r.cajuelas))} fanegas`)), h('b', null, `${n2(r.cajuelas)} caj.`));

  // ---------- Formulario de un recibo (nuevo o editar) ----------
  function formulario(ini, textoBtn, enviar) {
    const NUEVO = '__nuevo';
    const fecha = h('input', { class: 'campo', type: 'date', value: ini.fecha || diaHoy() });
    const selTipo = h('select', { class: 'campo selec' }, ...res.tipos.map((t) => h('option', { value: t.tipo }, t.tipo)), h('option', { value: NUEVO }, '＋ Tipo nuevo…'));
    const tipoNuevo = h('input', { class: 'campo', type: 'text', placeholder: 'Nombre del tipo', autocomplete: 'off', hidden: true });
    const recibo = h('input', { class: 'campo', type: 'text', inputmode: 'numeric', value: ini.recibo || '', autocomplete: 'off' });
    const selFinca = h('select', { class: 'campo selec' }, h('option', { value: '' }, '(sin finca)'), ...res.fincasLista.map((f) => h('option', { value: f.finca }, f.finca)), h('option', { value: NUEVO }, '＋ Finca nueva…'));
    const fincaNueva = h('input', { class: 'campo', type: 'text', placeholder: 'Nombre de la finca', autocomplete: 'off', hidden: true });
    const soc = h('input', { class: 'campo', type: 'text', value: ini.sociedad || '', autocomplete: 'off', list: 'cf-soc' });
    const dl = h('datalist', { id: 'cf-soc' }, ...res.sociedades.map((s) => h('option', { value: s })));
    const caj = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', value: ini.cajuelas != null ? String(ini.cajuelas) : '', autocomplete: 'off' });
    const calc = h('p', { class: 'calc-nota' });
    const defSoc = (f) => { const x = res.fincasLista.find((y) => y.finca === f); return x ? x.sociedad : ''; };
    const masUsado = [...res.tipos].sort((x, y) => y.recibos - x.recibos)[0];
    if (!ini.tipo && masUsado) selTipo.value = masUsado.tipo;
    if (ini.tipo) selTipo.value = res.tipos.some((t) => t.tipo === ini.tipo) ? ini.tipo : NUEVO;
    if (ini.tipo && selTipo.value === NUEVO) tipoNuevo.value = ini.tipo;
    if (ini.finca) selFinca.value = res.fincasLista.some((f) => f.finca === ini.finca) ? ini.finca : NUEVO;
    if (ini.finca && selFinca.value === NUEVO) fincaNueva.value = ini.finca;
    const act = () => {
      tipoNuevo.hidden = selTipo.value !== NUEVO; fincaNueva.hidden = selFinca.value !== NUEVO;
      const c = Number(String(caj.value).replace(',', '.'));
      calc.textContent = c > 0 ? `= ${n2(fan(c))} fanegas` : 'Las fanegas se calculan solas (cajuelas ÷ 20).';
    };
    selTipo.addEventListener('change', act); selFinca.addEventListener('change', () => { act(); if (selFinca.value && selFinca.value !== NUEVO) soc.value = defSoc(selFinca.value) || soc.value; }); caj.addEventListener('input', act);
    act();
    const btn = h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
      const datos = { fecha: fecha.value, tipo: selTipo.value === NUEVO ? tipoNuevo.value : selTipo.value, recibo: recibo.value, finca: selFinca.value === NUEVO ? fincaNueva.value : selFinca.value, sociedad: soc.value, cajuelas: caj.value };
      btn.disabled = true; await enviar(datos); btn.disabled = false;
    } }, textoBtn);
    return [h('label', { class: 'etiqueta' }, 'Fecha'), fecha, h('label', { class: 'etiqueta' }, 'Tipo'), selTipo, tipoNuevo, h('label', { class: 'etiqueta' }, 'Recibo'), recibo,
      h('label', { class: 'etiqueta' }, 'Finca'), selFinca, fincaNueva, h('label', { class: 'etiqueta' }, 'Sociedad (sale de la finca; cámbiela si hace falta)'), soc, dl,
      h('label', { class: 'etiqueta' }, 'Cajuelas'), caj, calc, btn];
  }
  function nuevo() {
    el.append(...formulario({}, 'Guardar recibo', async (d) => {
      const r = await cafeFruta('guardar', { filas: [d] });
      if (!r.ok) return toast(r.message, 5000);
      const f = r.json.filas[0];
      if (f.estado !== 'nueva') return toast(f.mensaje || 'No se guardó.', 5000);
      toast('Recibo guardado.'); await cargar(true); ir('inicio');
    }), boton('Cancelar', () => ir('inicio')));
  }

  // ---------- Pegar y archivo ----------
  function pegar() {
    const area = h('textarea', { class: 'campo', rows: '8', placeholder: 'Pegue aquí las filas copiadas de Excel:\nFecha ⇥ Tipo ⇥ Recibo ⇥ Finca ⇥ Sociedad ⇥ Cajuelas', autocomplete: 'off', spellcheck: 'false' });
    el.append(h('p', { class: 'nota' }, 'Columnas en este orden: Fecha, Tipo, Recibo, Finca, Sociedad, Cajuelas.'), area,
      boton('Ver vista previa', () => { const f = parsearPegado(area.value); if (!f.length) return toast('Pegue primero las filas de Excel.'); revisar(f, '', 'pegar'); }, 'primario'), boton('Cancelar', () => ir('inicio')));
  }
  function archivo() {
    const arch = h('input', { type: 'file', accept: '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true });
    arch.addEventListener('change', async () => {
      const f = arch.files && arch.files[0]; if (!f) return;
      try {
        const filas = filasDeArchivo(await leerArchivoTabla(f, { hoja: /recibos/i, clave: /^recibo$/i }));
        if (!filas.length) return toast('No encontré recibos en el archivo.', 5000);
        await revisar(filas, f.name, 'archivo');
      } catch (e) { toast(e.message || 'No se pudo leer el archivo.', 6000); }
      arch.value = '';
    });
    el.append(h('p', { class: 'nota' }, 'Un recibo por fila: FECHA, TIPO, RECIBO, FINCA, SOCIEDAD y CAJUELAS. Use la plantilla para que quede igual.'), arch,
      boton('📁 Elegir archivo', () => arch.click(), 'primario'),
      boton('⬇ Descargar la plantilla', async () => { try { const r = await fetch('./Plantilla_Cafe_en_Fruta.xlsx', { cache: 'no-store' }); if (!r.ok) throw new Error(); descargar(await r.blob(), 'Plantilla_Cafe_en_Fruta.xlsx'); } catch { toast('No se pudo bajar la plantilla (¿sin internet?).', 5000); } }),
      boton('Cancelar', () => ir('inicio')));
  }
  async function revisar(filas, nombre, origen) {
    if (filas.length > 1500) return toast('Máximo 1500 filas por carga. Divida el archivo.', 6000);
    toast('Revisando…', 1500);
    const r = await cafeFruta('previa', { filas });
    if (!r.ok) return toast(r.message, 6000);
    ir('previa', { filas, j: r.json, nombre, origen });
  }
  function previa() {
    const { filas, j, nombre } = param;
    const nuevas = j.filas.filter((f) => f.estado === 'nueva');
    const caj = nuevas.reduce((t, f) => t + Number(f.cajuelas || 0), 0);
    el.append(h('div', { class: 'tarjeta' }, h('b', null, nombre ? `📁 ${nombre}` : 'Revisión'), h('p', { class: 'nota' }, `${plural(j.nuevas, 'nuevo', 'nuevos')} · ${j.ya} ya ${j.ya === 1 ? 'estaba' : 'estaban'} · ${j.errores} con error`),
      h('p', { class: 'nota' }, `Los nuevos suman ${n2(caj)} cajuelas = ${n2(fan(caj))} fanegas.`)));
    const orden = { error: 0, nueva: 1, ya: 2 };
    [...j.filas].sort((a, b) => orden[a.estado] - orden[b.estado]).slice(0, 300).forEach((f) => {
      const o = filas[f.i - 1] || {};
      const det = f.estado === 'error' ? f.mensaje : f.estado === 'ya' ? f.mensaje : `${dma(f.fecha)} · ${n2(f.cajuelas)} cajuelas · ${n2(fan(f.cajuelas))} fanegas` + (f.fincaNueva ? ` · finca nueva (${f.sociedad || 'sin sociedad'})` : '') + (f.tipoNuevo ? ' · tipo nuevo' : '');
      el.append(h('div', { class: 'fila-aj fila-usuario' }, h('span', { class: 'tx' }, `${f.recibo || o.recibo || '(sin recibo)'}${f.finca ? ' · ' + f.finca : ''}`, h('small', null, f.tipo || o.tipo || ''), h('small', null, det)),
        f.estado === 'error' ? chip('Revisar', 'ambar') : f.estado === 'ya' ? chip('Ya está', 'gris') : chip(f.fincaNueva || f.tipoNuevo ? 'Nueva finca/tipo' : 'Nuevo', 'verde')));
    });
    if (j.filas.length > 300) el.append(h('p', { class: 'nota' }, `Se muestran 300 de ${j.filas.length}; al guardar entran todas las nuevas.`));
    if (j.errores) el.append(h('p', { class: 'nota' }, `Las ${j.errores} con error no se guardan: corríjalas y cárguelas de nuevo.`));
    const btn = h('button', { type: 'button', class: 'btn-texto primario ancho-total', disabled: !j.nuevas, onclick: async () => {
      btn.disabled = true;
      const r = await cafeFruta('guardar', { filas });
      if (!r.ok) { btn.disabled = false; return toast(r.message, 6000); }
      await cargar(true); ir('listo', { j: r.json });
    } }, j.nuevas ? `Guardar ${plural(j.nuevas, 'recibo', 'recibos')}` : 'No hay nada nuevo para guardar');
    el.append(btn, boton('Volver', () => ir(param.origen)));
  }
  function listo() {
    const j = param.j;
    el.append(h('div', { class: 'tarjeta' }, h('b', null, `✓ ${plural(j.nuevas, 'recibo guardado', 'recibos guardados')}`), h('p', { class: 'nota' }, j.ya || j.errores ? `${j.ya} ya estaban y ${j.errores} traían error; esos no se guardaron.` : '')), boton('Listo', () => ir('inicio'), 'primario'));
  }

  // ---------- Un recibo ----------
  function recibo() {
    const r = param.r;
    el.append(h('div', { class: 'tarjeta' }, h('b', null, `${r.finca || 'Sin finca'}${r.sociedad ? ' · ' + corta(r.sociedad) : ''}`), h('p', { class: 'nota' }, `${dma(r.fecha)} · ${r.tipo} · ${n2(r.cajuelas)} cajuelas = ${n2(fan(r.cajuelas))} fanegas`)),
      ...formulario(r, 'Guardar cambios', async (d) => {
        const x = await cafeFruta('editar', { id: r.id, ...d }); toast(x.message, 4000);
        if (x.ok) { await cargar(true); ir('inicio'); }
      }),
      h('button', { type: 'button', class: 'btn-texto peligro ancho-total', onclick: async () => {
        if (!(await confirmar(`Anular el recibo ${r.recibo}`, 'Deja de contar en las fanegas entregadas. Queda guardado en el historial.', { si: 'Anular', peligro: true }))) return;
        const x = await cafeFruta('anular', { id: r.id }); toast(x.message, 4000);
        if (x.ok) { await cargar(true); ir('inicio'); }
      } }, 'Anular recibo'));
  }

  // ---------- Máximo por tipo ----------
  function maximo() {
    el.append(h('p', { class: 'nota' }, 'Fanegas máximas del contrato con Capris para cada tipo. Si lo amplían, cámbielo aquí y «Faltan» se recalcula. Vacío = sin tope.'));
    res.tipos.forEach((t) => {
      const inp = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', value: t.maximo != null ? String(t.maximo) : '', placeholder: 'Sin tope', autocomplete: 'off' });
      el.append(h('div', { class: 'tarjeta' }, h('b', null, t.tipo), inp, h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
        const x = await cafeFruta('maximo', { tipo: t.tipo, maximo: inp.value }); toast(x.message, 4000); if (x.ok) await cargar(true);
      } }, 'Guardar máximo')));
    });
    el.append(boton('Volver', () => ir('inicio')));
  }

  return { cab, el, tarjetaHub, cargar, ocupado: () => cargando, reiniciar() { pantalla = 'inicio'; param = null; pintar(); cargar(false); } };
}
