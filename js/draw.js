// Dibujo de comprobantes y reportes en canvas (se convierten luego a PDF). Réplica de los PDF de la app Android.
import { fmtNum, fmtCant, fmtPct, fmtQty, fmtMoney, fmtMoney2, parseQty, diaLegible, ahoraTxt, tarjetaEnmascarada, esEntero } from './util.js';
import { rc, totalesRecibos, montoLinea, tipoBoletoEtiqueta, totalFichas, totalCajuelasMov } from './data.js';
import { normalizar } from './util.js';
import { modoPruebas } from './store.js';
import { celdaTxt, miles, cajF, pctSigno } from './rep_calc.js';

const MONO = '"DejaVu Sans Mono", monospace';
const SANS = '"DejaVu Sans", sans-serif';
const mctx = document.createElement('canvas').getContext('2d');

export async function cargarFuentes() {
  const caras = ['9px "DejaVu Sans Mono"', 'bold 9px "DejaVu Sans Mono"', '9px "DejaVu Sans"', 'bold 9px "DejaVu Sans"'];
  try { await Promise.all(caras.map((f) => document.fonts.load(f, '₡Aa0'))); await document.fonts.ready; } catch { /* se usa la fuente del sistema */ }
}

const P = (size, bold = false, mono = true, color = '#000') => ({ size, bold, mono, color, font: `${bold ? 'bold ' : ''}${size}px ${mono ? MONO : SANS}` });
const conColor = (p, color, bold = p.bold) => ({ ...P(p.size, bold, p.mono, color) });
function medir(p, t) { mctx.font = p.font; return mctx.measureText(t).width; }
function txt(c, t, x, y, p) { if (!c) return; c.font = p.font; c.fillStyle = p.color; c.fillText(t, x, y); }
function linea(c, x1, y1, x2, y2, ancho = 1, color = '#000') {
  if (!c) return; c.strokeStyle = color; c.lineWidth = ancho; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function rectLleno(c, x, y, w, h, color) { if (!c) return; c.fillStyle = color; c.fillRect(x, y, w, h); }
function rectRedondo(c, x, y, w, h, r, ancho) {
  if (!c) return;
  c.strokeStyle = '#000'; c.lineWidth = ancho; c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath(); c.stroke();
}

export function crearPagina(ancho, alto, escala) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(ancho * escala); canvas.height = Math.ceil(alto * escala);
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.scale(canvas.width / ancho, canvas.height / alto);
  c.textBaseline = 'alphabetic';
  return { canvas, c, ancho, alto };
}
const ESC_TIQ = 3.2;

function envolver(texto, p, maxW) {
  const out = [];
  let cur = '';
  for (const word of texto.split(' ').filter(Boolean)) {
    let w = word;
    while (medir(p, w) > maxW && w.length > 1) {
      let n = w.length - 1;
      while (n > 1 && medir(p, w.slice(0, n)) > maxW) n--;
      if (cur) { out.push(cur); cur = ''; }
      out.push(w.slice(0, n)); w = w.slice(n);
    }
    const cand = cur ? cur + ' ' + w : w;
    if (!cur || medir(p, cand) <= maxW) cur = cand; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function recortar(t, p, w) {
  if (medir(p, t) <= w) return t;
  let n = t.length;
  while (n > 1 && medir(p, t.slice(0, n) + '…') > w) n--;
  return t.slice(0, n) + '…';
}
function ajustarNegrita(texto, maxW, max, min) {
  let s = max, p = P(s, true);
  while (s > min && medir(p, texto) > maxW) { s -= 0.5; p = P(s, true); }
  return p;
}
function ajustarCelda(texto, maxW, max, min, bold) {
  let s = max, p = P(s, bold);
  while (s > min && medir(p, texto) > maxW) { s -= 0.25; p = P(s, bold); }
  return p;
}

export const MODO = { NORMAL: 'normal', REIMPRESION: 'reimpresion', ANULACION: 'anulacion' };
const ANCHO_TIQ = 227, MARG = 10;

// ====================== Recibo de café (80 mm) ======================
function dibujarRecibo(c, r, modo) {
  const k = rc(r);
  const cw = ANCHO_TIQ - 2 * MARG;
  const normal = P(9), bold = P(9, true), small = P(7.5);
  let y = MARG;
  const xPara = (t, p, al) => (al === 1 ? (ANCHO_TIQ - medir(p, t)) / 2 : al === 2 ? ANCHO_TIQ - MARG - medir(p, t) : MARG);
  const ln = (t, p, al = 0) => { const h = p.size * 1.4; y += h; txt(c, t, xPara(t, p, al), y - h * 0.25, p); };
  const blank = () => { y += normal.size * 1.4; };

  ln(`N° ${r.numero}`, bold, 2);
  if (modoPruebas) ln('*** PRUEBA ***', bold, 1);
  blank();
  const titulo = (r.receptora || '').toLocaleUpperCase('es-CR');
  const tp = ajustarNegrita(titulo, cw, 12, 8.5);
  envolver(titulo, tp, cw).forEach((t) => ln(t, tp, 1));
  ln('COMPROBANTE DE RECIBO DE CAFÉ', bold, 1);
  if (modo === MODO.ANULACION) ln('*** ANULACIÓN ***', bold, 1);
  else if (modo === MODO.REIMPRESION) { ln('*** REIMPRESIÓN ***', bold, 1); ln(ahoraTxt(), small, 1); }
  else if (r.anulado) ln('*** ANULADO ***', bold, 1);
  blank();
  envolver(`Cosecha: ${r.cosecha}`, bold, cw).forEach((t) => ln(t, bold, 1));
  blank();
  const partes = (r.emitido || '').split(' ');
  const fecha = partes[0] || diaLegible(r.dia), hora = partes[1] || '';
  const fh = hora ? `Fecha: ${fecha}  Hora: ${hora}` : `Fecha: ${fecha}`;
  if (medir(normal, fh) <= cw) ln(fh, normal); else { ln(`Fecha: ${fecha}`, normal); if (hora) ln(`Hora: ${hora}`, normal); }
  blank();
  envolver(`Sociedad: ${r.sociedad}`, normal, cw).forEach((t) => ln(t, normal));
  blank();
  const finca = `Finca: ${r.finca}`, lote = r.lote ? `Corte/Lote: ${r.lote}` : '';
  const juntos = lote ? `${finca}   ${lote}` : finca;
  if (medir(normal, juntos) <= cw) ln(juntos, normal);
  else { envolver(finca, normal, cw).forEach((t) => ln(t, normal)); if (lote) envolver(lote, normal, cw).forEach((t) => ln(t, normal)); }
  blank();

  const cuadro = (x0, w, grupos, titulos, valores) => {
    const gH = grupos ? 15 : 0, hH = 16, vH = 26, total = gH + hH + vH, n = titulos.length, colW = w / n;
    if (c) {
      rectRedondo(c, x0, y, w, total, 10, 1.8);
      if (grupos) linea(c, x0, y + gH, x0 + w, y + gH, 1.8);
      linea(c, x0, y + gH + hH, x0 + w, y + gH + hH, 1.8);
      if (grupos) linea(c, x0 + 2 * colW, y, x0 + 2 * colW, y + gH, 1.8);
      for (let i = 1; i < n; i++) linea(c, x0 + i * colW, y + gH, x0 + i * colW, y + total, 1.8);
      if (grupos) {
        const gp = P(7.5, true);
        txt(c, 'MUESTRA', x0 + 5, y + gH - 3.5, gp);
        txt(c, 'FLOTES', x0 + 2 * colW + (3 * colW - medir(gp, 'FLOTES')) / 2, y + gH - 3.5, gp);
      }
      for (let i = 0; i < n; i++) {
        const hp = ajustarCelda(titulos[i], colW - 4, 6.5, 4.5, true);
        txt(c, titulos[i], x0 + i * colW + (colW - medir(hp, titulos[i])) / 2, y + gH + hH - 4, hp);
        const vp = ajustarCelda(valores[i], colW - 4, 13, 6, true);
        txt(c, valores[i], x0 + i * colW + (colW - medir(vp, valores[i])) / 2, y + gH + hH + vH - 8, vp);
      }
    }
    y += total;
  };
  cuadro(MARG, cw, true, ['TOTAL', 'VERDES', 'MADUROS', 'SECOS', 'BROCA'],
    [fmtCant(r.muestraTotal), fmtCant(r.verdes), fmtCant(r.maduros), fmtCant(r.secos), fmtCant(r.broca)]);
  y += 6;
  ln('CANTIDAD', P(8, true), 1);
  y += 2;
  cuadro(MARG + cw * 0.1, cw * 0.8, false, ['MEDIDAS', 'CAJUELAS', 'CUARTILLOS'], [fmtCant(r.medidas), fmtCant(r.cajuelas), fmtCant(r.cuartillos)]);
  blank();
  ln('TOTAL RECIBIDO', P(9, true), 1);
  const totalTxt = `${fmtNum(k.recibidoCajuelas, 2)} cajuelas`;
  ln(totalTxt, ajustarNegrita(totalTxt, cw, 13, 9), 1);
  ln(`Fanegas: ${fmtNum(k.fanegas, 2)}`, normal, 1);
  if (modo === MODO.ANULACION || r.anulado) {
    blank();
    if (r.anuladoFecha) envolver(`Anulado: ${r.anuladoFecha}`, bold, cw).forEach((t) => ln(t, bold));
    if (r.motivo) envolver(`Motivo: ${r.motivo}`, normal, cw).forEach((t) => ln(t, normal));
  }
  blank();
  if (r.usuario) envolver(`Usuario: ${r.usuario}`, small, cw).forEach((t) => ln(t, small));
  if (modo === MODO.ANULACION && r.anuladoPor) envolver(`Anuló: ${r.anuladoPor}`, small, cw).forEach((t) => ln(t, small));
  envolver(`Dispositivo: ${r.dispositivo}`, small, cw).forEach((t) => ln(t, small));
  y += MARG;
  return Math.ceil(y);
}

// ====================== Movimiento de boletos (80 mm) ======================
function dibujarBoleto(c, m, modo) {
  const cw = ANCHO_TIQ - 2 * MARG;
  const normal = P(9), bold = P(9, true), small = P(7.5);
  let y = MARG;
  const xPara = (t, p, al) => (al === 1 ? (ANCHO_TIQ - medir(p, t)) / 2 : al === 2 ? ANCHO_TIQ - MARG - medir(p, t) : MARG);
  const ln = (t, p, al = 0) => { const h = p.size * 1.4; y += h; txt(c, t, xPara(t, p, al), y - h * 0.25, p); };
  const blank = () => { y += normal.size * 1.4; };
  ln(`N° ${m.numero}`, bold, 2);
  if (modoPruebas) ln('*** PRUEBA ***', bold, 1);
  blank();
  ln('COMPROBANTE DE BOLETOS', P(11, true), 1);
  envolver(tipoBoletoEtiqueta(m.tipo), bold, cw).forEach((t) => ln(t, bold, 1));
  if (modo === MODO.ANULACION) ln('*** ANULACIÓN ***', bold, 1);
  else if (modo === MODO.REIMPRESION) { ln('*** REIMPRESIÓN ***', bold, 1); ln(ahoraTxt(), small, 1); }
  else if (m.anulado) ln('*** ANULADO ***', bold, 1);
  blank();
  envolver(`Cosecha: ${m.cosecha}`, bold, cw).forEach((t) => ln(t, bold, 1));
  blank();
  const hora = (m.emitido || '').split(' ')[1] || '';
  const fecha = diaLegible(m.dia);
  const fh = hora ? `Fecha: ${fecha}  Hora: ${hora}` : `Fecha: ${fecha}`;
  if (medir(normal, fh) <= cw) ln(fh, normal); else { ln(`Fecha: ${fecha}`, normal); if (hora) ln(`Hora: ${hora}`, normal); }
  blank();
  envolver(`Sociedad: ${m.sociedad}`, normal, cw).forEach((t) => ln(t, normal));
  envolver(`Oficina: ${m.oficina}`, normal, cw).forEach((t) => ln(t, normal));
  blank();
  const xCant = ANCHO_TIQ - MARG, xMed = xCant - 52;
  const fila = (a, b, cc, p) => {
    const h = p.size * 1.45; y += h;
    if (c) {
      let t = a;
      while (t.length > 1 && medir(p, t) > xMed - MARG - 6) t = t.slice(0, -1);
      txt(c, t, MARG, y - h * 0.25, p);
      txt(c, b, xMed - medir(p, b) - 4, y - h * 0.25, p);
      txt(c, cc, xCant - medir(p, cc), y - h * 0.25, p);
    }
  };
  linea(c, MARG, y + 2, ANCHO_TIQ - MARG, y + 2); y += 2;
  fila('FICHA', 'MEDIDA', 'CANT.', bold);
  linea(c, MARG, y + 2, ANCHO_TIQ - MARG, y + 2); y += 2;
  m.lineas.forEach((l) => fila(l.color, l.medida, String(l.cantidad), normal));
  linea(c, MARG, y + 3, ANCHO_TIQ - MARG, y + 3); y += 3;
  fila('TOTAL FICHAS', '', String(totalFichas(m)), bold);
  envolver(`Equivale a ${fmtNum(totalCajuelasMov(m), 2)} cajuelas`, normal, cw).forEach((t) => ln(t, normal, 1));
  if (m.nota) { blank(); envolver(`Motivo: ${m.nota}`, normal, cw).forEach((t) => ln(t, normal)); }
  if (modo === MODO.ANULACION || m.anulado) {
    blank();
    if (m.anuladoFecha) envolver(`Anulado: ${m.anuladoFecha}`, bold, cw).forEach((t) => ln(t, bold));
    if (m.motivoAnul) envolver(`Motivo anulación: ${m.motivoAnul}`, normal, cw).forEach((t) => ln(t, normal));
  }
  blank();
  if (m.usuario) envolver(`Usuario: ${m.usuario}`, small, cw).forEach((t) => ln(t, small));
  if (modo === MODO.ANULACION && m.anuladoPor) envolver(`Anuló: ${m.anuladoPor}`, small, cw).forEach((t) => ln(t, small));
  if (m.para && m.para !== m.dispositivo) envolver(`${m.tipo === 'DEVOLUCIÓN' ? 'Recibido de' : 'Entregado a'}: ${m.para}`, bold, cw).forEach((t) => ln(t, bold));
  envolver(`Dispositivo: ${m.dispositivo}`, small, cw).forEach((t) => ln(t, small));
  y += MARG;
  return Math.ceil(y);
}

/** Genera una página por elemento. fn(c, item) dibuja y devuelve el alto; con c = null solo mide. */
function paginasTiquete(items, fn) {
  const alturas = items.map((it) => fn(null, it));
  return items.map((it, i) => {
    const pg = crearPagina(ANCHO_TIQ, alturas[i], ESC_TIQ);
    fn(pg.c, it);
    return pg;
  });
}
export const paginasRecibos = (items) => paginasTiquete(items, (c, it) => dibujarRecibo(c, it.r, it.modo));
export const paginasBoletos = (items) => paginasTiquete(items, (c, it) => dibujarBoleto(c, it.m, it.modo));

// ====================== Comprobante de Registro (texto en columnas) ======================
const COLS = () => Math.floor((ANCHO_TIQ - 2 * MARG) / medir(P(9), '0'));
const TL = (text, bold = false, big = false, scale = big ? 1.3 : 1) => ({ text, bold, big, scale });

function envolverCols(texto, ancho) {
  const out = [];
  let cur = '';
  for (const word of texto.split(' ').filter(Boolean)) {
    let w = word;
    while (w.length > ancho) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, ancho)); w = w.slice(ancho); }
    if (!cur) cur = w; else if (cur.length + 1 + w.length <= ancho) cur += ' ' + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
function centrar(out, texto, cols, bold = false, big = false, scale = big ? 1.3 : 1) {
  const width = Math.floor(cols / scale);
  envolverCols(texto, width).forEach((t) => out.push(TL(' '.repeat(Math.max(Math.floor((width - t.length) / 2), 0)) + t, bold || big, big, scale)));
}
function titulo(out, texto, cols) { centrar(out, texto, cols, true, false, Math.min(1.3, (cols - 1) / texto.length)); }
function campo(out, etiqueta, valor, cols, bold = false) { envolverCols(`${etiqueta}: ${valor}`, cols).forEach((t) => out.push(TL(t, bold))); }
function campoAjustado(out, etiqueta, valor, cols, bold = false) {
  const t = `${etiqueta}: ${valor}`;
  const scale = t.length <= cols ? 1 : Math.max((cols - 0.5) / t.length, 0.7);
  envolverCols(t, Math.floor(cols / scale)).forEach((x) => out.push(TL(x, bold, false, scale)));
}
function par(out, etiqueta, valor, cols, bold = false) {
  const gap = cols - etiqueta.length - valor.length;
  out.push(TL(gap >= 1 ? etiqueta + ' '.repeat(gap) + valor : `${etiqueta} ${valor}`, bold));
}
function tabla(out, g, cols) {
  const wQ = Math.max(Math.floor(cols * 0.25), 7), wP = Math.floor(cols * 0.34), wM = cols - wQ - wP;
  out.push(TL('Cant'.padEnd(wQ) + 'Precio'.padStart(wP) + 'Monto'.padStart(wM), true));
  g.lines.forEach((l) => out.push(TL(fmtQty(parseQty(l.quantity)).padEnd(wQ) + fmtMoney2(l.price).padStart(wP) + fmtMoney2(montoLinea(l)).padStart(wM))));
}
function deducciones(out, g, cols) {
  if (g.deduccion > 0) { par(out, 'Subtotal ₡', fmtMoney2(g.total), cols); par(out, '(-) Deducción ₡', fmtMoney2(g.deduccion), cols); }
}
function totalGrande(out, monto, cols, etiqueta) {
  const bigCols = Math.floor(cols / 1.3);
  out.push(TL(''));
  const m = fmtMoney2(monto);
  if (etiqueta.length + 1 + m.length <= bigCols) out.push(TL(etiqueta + m.padStart(bigCols - etiqueta.length), true, true));
  else { out.push(TL(etiqueta, true, true)); out.push(TL(m.padStart(bigCols), true, true)); }
  out.push(TL(''));
}
export function lineasComprobante(g, reimpresion) {
  const cols = COLS(), out = [], regla = '-'.repeat(cols);
  titulo(out, 'COMPROBANTE DE CAMBIO DE FICHAS', cols);
  if (modoPruebas) centrar(out, '*** PRUEBA ***', cols, true);
  if (reimpresion) { centrar(out, '*** REIMPRESIÓN ***', cols); centrar(out, ahoraTxt(), cols); }
  if (g.provisional) centrar(out, '*** PROVISIONAL ***', cols, true);
  if (g.anulado) centrar(out, '*** ANULADO ***', cols, true);
  out.push(TL(regla));
  campo(out, 'Comprobante', g.numero, cols, true);
  campo(out, 'Fecha', g.emitido || diaLegible(g.date), cols);
  campo(out, 'Sociedad', g.sociedad, cols);
  campo(out, 'Finca', g.finca, cols);
  campoAjustado(out, 'Nombre', g.persona, cols);
  if (g.tarjeta) campo(out, 'Tarjeta', tarjetaEnmascarada(g.tarjeta), cols);
  else if (g.provisional) campo(out, 'Tarjeta', 'PROVISIONAL (sin tarjeta)', cols, true);
  if (g.usuario) campoAjustado(out, 'Usuario', g.usuario, cols);
  out.push(TL(regla));
  tabla(out, g, cols);
  out.push(TL(regla));
  out.push(TL(`Líneas: ${g.lines.length}`));
  out.push(TL(`Cantidad total: ${fmtQty(g.lines.reduce((t, l) => t + parseQty(l.quantity), 0))}`));
  deducciones(out, g, cols);
  totalGrande(out, g.neto, cols, 'TOTAL A PAGAR ₡');
  out.push(TL(regla));
  if (g.anulado) { campo(out, 'Anulado', g.anuladoFecha, cols, true); campo(out, 'Motivo', g.motivo, cols); out.push(TL(regla)); }
  if (g.provisional) { out.push(TL('')); centrar(out, 'Persona no registrada en la base. Tiquete provisional pendiente de verificar.', cols); }
  if (g.cosecha) { out.push(TL('')); centrar(out, `Cosecha: ${g.cosecha}`, cols, true); }
  out.push(TL(''));
  return out;
}
export function lineasAnulacion(g) {
  const cols = COLS(), out = [], regla = '-'.repeat(cols);
  titulo(out, 'COMPROBANTE DE CAMBIO DE FICHAS', cols);
  if (modoPruebas) centrar(out, '*** PRUEBA ***', cols, true);
  centrar(out, '*** ANULACIÓN ***', cols, true);
  if (g.provisional) centrar(out, '(tiquete provisional)', cols);
  out.push(TL(regla));
  campo(out, 'Anula comprobante', g.numero, cols, true);
  campo(out, 'Fecha original', g.emitido || diaLegible(g.date), cols);
  campo(out, 'Anulado', g.anuladoFecha, cols);
  if (g.anuladoPor) campoAjustado(out, 'Anuló', g.anuladoPor, cols);
  campo(out, 'Sociedad', g.sociedad, cols);
  campo(out, 'Finca', g.finca, cols);
  campoAjustado(out, 'Nombre', g.persona, cols);
  if (g.tarjeta) campo(out, 'Tarjeta', tarjetaEnmascarada(g.tarjeta), cols);
  out.push(TL(regla));
  tabla(out, g, cols);
  out.push(TL(regla));
  deducciones(out, g, cols);
  totalGrande(out, g.neto, cols, 'ANULADO ₡');
  out.push(TL(regla));
  campo(out, 'Motivo', g.motivo, cols);
  out.push(TL(regla));
  centrar(out, 'Este documento deja sin efecto el comprobante indicado.', cols);
  if (g.cosecha) { out.push(TL('')); centrar(out, `Cosecha: ${g.cosecha}`, cols, true); }
  out.push(TL(''));
  return out;
}
/** lineasPorDoc: array de arrays de líneas (un tiquete por página). */
export function paginasTexto(lineasPorDoc) {
  const size = 9, lineH = size * 1.4;
  const alto = (ls) => Math.ceil(MARG + ls.reduce((t, l) => t + lineH * Math.max(l.scale, 1), 0) + 30);
  return lineasPorDoc.map((ls) => {
    const pg = crearPagina(ANCHO_TIQ, alto(ls), ESC_TIQ);
    let y = MARG;
    ls.forEach((l) => {
      const h = lineH * Math.max(l.scale, 1);
      y += h;
      txt(pg.c, l.text, MARG, y - h * 0.25, P(size * l.scale, l.bold || l.big));
    });
    return pg;
  });
}

// ====================== Resumen general de Registro (apaisado) ======================
export function paginasResumenRegistro(d) {
  // d: {fecha, cosecha, sociedad, fincaTitulo, fincasTxt, precios[], personas[], lineasOriginales, cantidadPorPrecio{}, totalBruto, totalDed, total, anulados[]}
  const margin = 24, pageH = 595;
  const codeW = 38, cardW = 108, nameW = 130, dedW = 66, totalW = 84;
  const nPre = Math.max(d.precios.length, 1);
  const priceW = 58;
  const pageW = Math.max(842, Math.ceil(margin * 2 + codeW + cardW + nameW + dedW + totalW + nPre * 2 * priceW));
  const priceWidth = (pageW - margin * 2 - codeW - cardW - nameW - dedW - totalW) / (nPre * 2);
  const normal = P(8, false, false), bold = P(8, true, false), tit = P(16, true, false);
  const xCard = margin + codeW, xName = xCard + cardW, xPrices = xName + nameW, xDed = pageW - margin - totalW - dedW, xTotal = pageW - margin - totalW;
  const paginas = [];
  let pg, c, y;
  const nueva = (cont) => {
    pg = crearPagina(pageW, pageH, Math.min(2.4, 4200 / pageW)); c = pg.c; paginas.push(pg); y = 28;
    if (cont) { txt(c, 'Resumen General de Cajuelas (continuación)', margin, y, tit); y += 24; cabecera(); }
  };
  const cabecera = () => {
    txt(c, 'Código', margin, y, bold); txt(c, 'Tarjeta', xCard, y, bold); txt(c, 'Nombre del cogedor', xName, y, bold);
    let x = xPrices;
    d.precios.forEach((p) => { txt(c, `Cant. ${fmtNumPlano(p)}`, x, y, bold); x += priceWidth; txt(c, `Monto ${fmtNumPlano(p)}`, x, y, bold); x += priceWidth; });
    txt(c, 'Deducción', xDed, y, bold); txt(c, 'Total a pagar', xTotal, y, bold);
    linea(c, margin, y + 5, pageW - margin, y + 5, 0.8);
    y += 18;
  };
  nueva(false);
  txt(c, 'Resumen General de Cajuelas', margin, y, tit); y += 22;
  txt(c, `Fecha: ${d.fecha}`, margin, y, normal); y += 13;
  txt(c, `Cosecha: ${d.cosecha}`, margin, y, normal); y += 13;
  txt(c, `Sociedad: ${d.sociedad}`, margin, y, normal); y += 13;
  txt(c, `${d.fincaTitulo}: ${d.fincasTxt}`, margin, y, normal); y += 18;
  cabecera();
  d.personas.forEach((p) => {
    if (y > pageH - 65) nueva(true);
    txt(c, p.codigo.length > 7 ? p.codigo.slice(0, 7) : p.codigo, margin, y, normal);
    txt(c, p.tarjeta ? tarjetaEnmascarada(p.tarjeta) : (p.provisional ? 'PROVISIONAL' : ''), xCard, y, normal);
    txt(c, recortar(p.name, normal, nameW - 6), xName, y, normal);
    let x = xPrices;
    d.precios.forEach((pr) => {
      txt(c, fmtQty(p.cant[pr] || 0), x, y, normal); x += priceWidth;
      txt(c, fmtMoney((p.cant[pr] || 0) * pr), x, y, normal); x += priceWidth;
    });
    txt(c, p.deduccion > 0 ? fmtMoney(p.deduccion) : '-', xDed, y, normal);
    txt(c, fmtMoney(p.neto), xTotal, y, bold);
    y += 15;
  });
  if (y > pageH - 75) nueva(true);
  y += 5; linea(c, margin, y, pageW - margin, y, 0.8); y += 17;
  txt(c, `Personas: ${d.personas.length}    Líneas originales: ${d.lineasOriginales}`, margin, y, bold); y += 16;
  d.precios.forEach((pr) => { txt(c, `Total cantidad a ${fmtMoney(pr)}: ${fmtQty(d.cantidadPorPrecio[pr] || 0)}`, margin, y, bold); y += 16; });
  if (d.totalDed > 0) {
    txt(c, `Total bruto: ${fmtMoney(d.totalBruto)}`, margin, y, bold); y += 16;
    txt(c, `Total deducciones: ${fmtMoney(d.totalDed)}`, margin, y, bold); y += 16;
  }
  y += 6;
  txt(c, `TOTAL GENERAL A PAGAR: ${fmtMoney(d.total)}`, margin, y, tit);
  if (d.porDia && d.porDia.length) {
    y += 20; txt(c, 'Total a pagar por día:', margin, y, bold);
    d.porDia.forEach((x) => { if (y > pageH - 40) { nueva(true); } y += 14; txt(c, `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}/${x.dia.slice(0, 4)}   ${fmtMoney(x.total)}`, margin + 12, y, normal); });
  }
  if (d.personas.some((p) => p.provisional)) { y += 18; txt(c, 'PROVISIONAL = persona que no está en la base al emitir el tiquete (pendiente de verificar).', margin, y, normal); }
  if (d.anulados.length) {
    y += 28;
    const sala = () => { if (y > pageH - 40) nueva(true); };
    sala();
    txt(c, 'COMPROBANTES ANULADOS (no incluidos en los totales)', margin, y, bold); y += 6;
    linea(c, margin, y, pageW - margin, y, 0.8); y += 13;
    d.anulados.forEach((a) => {
      sala();
      const nombre = a.nombre.length > 30 ? a.nombre.slice(0, 27) + '...' : a.nombre;
      const motivo = a.motivo.length > 70 ? a.motivo.slice(0, 67) + '...' : a.motivo;
      txt(c, `${a.numero}   ${nombre}   ${fmtMoney(a.monto)}   Anulado: ${a.fecha}   Motivo: ${motivo}`, margin, y, normal);
      y += 13;
    });
  }
  return paginas.map((p) => ({ ...p, ancho: pageW, alto: pageH }));
}
function fmtNumPlano(v) { return new Intl.NumberFormat('es-CR', { maximumFractionDigits: 4, useGrouping: false }).format(v); }

// ====================== Resumen del día (Diario) ======================
const HEAD_R = ['Cosecha', 'Fecha', 'Beneficio', 'Compra', 'Sociedad', 'Finca', 'Corte/Lote', 'Recibido (Cajuelas)', 'Recibido (Fanegas)', 'Muestra Total', 'Muestra Verdes', 'Flotes Maduros', 'Flotes Secos', 'Broca', 'Total Flotes', '% Verdes', '% Flotes', '% Flotes Secos', '% Flotes Mad', '% Broca', 'Equiv. Maduras', 'Equiv. Verdes', 'Equiv. Flotes', 'Equiv. Broca'];
const ANCH_R = [58, 56, 74, 48, 136, 88, 76, 54, 50, 44, 48, 50, 44, 40, 44, 48, 44, 50, 50, 44, 52, 50, 50, 50];
const c2 = (v) => fmtNum(v || 0, 2);
const p2 = (v) => fmtNum((v || 0) * 100, 2) + '%';
function celdasRecibo(r) {
  const k = rc(r);
  return [r.cosecha, diaLegible(r.dia), r.beneficio, r.compra, r.sociedad, r.finca, r.lote, fmtNum(k.recibidoCajuelas, 2), fmtNum(k.fanegas, 2),
    c2(r.muestraTotal), c2(r.verdes), c2(r.maduros), c2(r.secos), c2(r.broca), c2(k.totalFlotes),
    p2(k.pVerdes), p2(k.pFlotes), p2(k.pSecos), p2(k.pMaduros), p2(k.pBroca),
    fmtNum(k.eqMaduras, 2), fmtNum(k.eqVerdes, 2), fmtNum(k.eqFlotes, 2), fmtNum(k.eqBroca, 2)];
}
function celdasTotal(etq, t) {
  return [etq, '', '', '', '', '', '', fmtNum(t.cajuelas, 2), fmtNum(t.fanegas, 2), c2(t.muestra), c2(t.verdes), c2(t.maduros), c2(t.secos),
    c2(t.broca), c2(t.flotes), p2(t.pVerdes), p2(t.pFlotes), p2(t.pSecos), p2(t.pMaduros), p2(t.pBroca),
    fmtNum(t.eqMaduras, 2), fmtNum(t.eqVerdes, 2), fmtNum(t.eqFlotes, 2), fmtNum(t.eqBroca, 2)];
}
export function paginasResumenDiario(recibos, dia, hasta = dia) {
  const rango = hasta && hasta !== dia;
  const etqPeriodo = rango ? `DEL ${diaLegible(dia)} AL ${diaLegible(hasta)}` : diaLegible(dia);
  const MG = 24, PH = 595, RH = 15, HH = 30, ROJO = '#C00000';
  const pageW = Math.ceil(ANCH_R.reduce((t, w) => t + w, 0) + 2 * MG);
  const x = [MG]; ANCH_R.forEach((w, i) => x.push(x[i] + w));
  const receptora = ((recibos[0] || {}).receptora || '').toLocaleUpperCase('es-CR');
  const interno = recibos.filter((r) => r.compra === 'Interno'), externo = recibos.filter((r) => r.compra === 'Externo');
  const text = P(7.2, false, false), bold = P(7.2, true, false), head = P(6.4, true, false, '#fff');
  const paginas = []; let pg, c, y;
  const cabecera = () => {
    rectLleno(c, x[9], y, x[20] - x[9], 13, '#D7E6DB'); rectLleno(c, x[20], y, x[24] - x[20], 13, '#E8DCC4');
    const g = P(8, true, false, '#14532D');
    txt(c, 'Muestra', x[9] + (x[20] - x[9] - medir(g, 'Muestra')) / 2, y + 10, g);
    txt(c, 'Equivalentes', x[20] + (x[24] - x[20] - medir(g, 'Equivalentes')) / 2, y + 10, g);
    y += 13;
    rectLleno(c, MG, y, x[24] - MG, HH, '#14532D');
    HEAD_R.forEach((h, i) => {
      const w = ANCH_R[i] - 4, ls = [];
      let cur = '';
      for (const word of h.split(' ')) { const cand = cur ? cur + ' ' + word : word; if (!cur || medir(head, cand) <= w) cur = cand; else { ls.push(cur); cur = word; } }
      ls.push(cur);
      const top = y + (HH - ls.length * 8) / 2 + 6.2;
      ls.slice(0, 3).forEach((l, k) => txt(c, recortar(l, head, w), x[i] + (ANCH_R[i] - Math.min(medir(head, l), w)) / 2, top + k * 8, head));
    });
    y += HH;
  };
  const nueva = (primera) => {
    pg = crearPagina(pageW, PH, Math.min(2.2, 4200 / pageW)); c = pg.c; paginas.push(pg); y = MG;
    const tablaW = x[24] - MG;
    if (primera) {
      const t = P(16, true, false); txt(c, receptora, MG + (tablaW - medir(t, receptora)) / 2, y + 14, t); y += 22;
      const s = P(11, true, false), sub = 'REPORTE DIARIO DE CAFÉ RECIBIDO EN BENEFICIO (DETALLADO)';
      txt(c, sub, MG + (tablaW - medir(s, sub)) / 2, y + 11, s); y += 20;
      txt(c, `${rango ? 'PERÍODO' : 'FECHA'}: ${etqPeriodo}`, MG, y + 9, bold); y += 18;
    } else { txt(c, `${receptora} · ${rango ? 'PERÍODO' : 'FECHA'}: ${etqPeriodo} (continuación)`, MG, y + 9, bold); y += 16; }
    cabecera();
  };
  const fila = (vals, esNeg, fondo, rojoIdx, soloEtiqueta) => {
    if (y + RH > PH - MG) nueva(false);
    if (fondo) rectLleno(c, MG, y, x[24] - MG, RH, fondo);
    linea(c, MG, y + RH, x[24], y + RH, 0.5, '#B8C7BD');
    vals.forEach((v, i) => {
      if (!v) return;
      const base = esNeg ? bold : text;
      const p = rojoIdx === i ? conColor(base, ROJO, true) : base;
      const disp = soloEtiqueta && i === 0 ? x[7] - MG - 4 : ANCH_R[i] - 4;
      const t = recortar(v, p, disp);
      const tx = soloEtiqueta && i === 0 ? x[0] + (x[7] - x[0] - medir(p, t)) / 2 : x[i] + (ANCH_R[i] - medir(p, t)) / 2;
      txt(c, t, tx, y + RH - 4.5, p);
    });
    y += RH;
  };
  nueva(true);
  recibos.forEach((r, i) => fila(celdasRecibo(r), false, i % 2 ? '#F4F8F5' : null, rc(r).pVerdes > 0.02 ? 15 : null, false));
  // Un renglón de espacio antes de los subtotales, entre ellos y antes del total, para que no se vea todo pegado.
  const espacio = () => { y += RH; if (y + RH > PH - MG) nueva(false); };
  espacio();
  if (interno.length && externo.length) {
    [['SUBTOTAL INTERNO', interno], ['SUBTOTAL EXTERNO', externo]].forEach(([e, l], k) => { if (k) espacio(); const t = totalesRecibos(l); fila(celdasTotal(e, t), true, '#EAF1EC', t.pVerdes > 0.02 ? 15 : null, true); });
    espacio();
  }
  const tt = totalesRecibos(recibos);
  fila(celdasTotal(rango ? 'TOTAL DEL PERÍODO' : 'TOTAL DEL DÍA', tt), true, '#D7E6DB', tt.pVerdes > 0.02 ? 15 : null, true);
  y += 8;
  txt(c, `Recibos incluidos: ${recibos.length} · No incluye recibos anulados · % Verdes en rojo si pasa de 2 %.`, MG, Math.min(y + 8, PH - 8), P(7, false, false, '#6B7280'));
  return paginas.map((p) => ({ ...p, ancho: pageW, alto: PH }));
}

/** Reporte simple del Diario: mismo estilo que el detallado (franja verde, filas alternas) con una fila por recibo y el total general de cajuelas y fanegas. */
export function paginasResumenSimple(recibos, dia, hasta = dia) {
  const rango = hasta && hasta !== dia;
  const COLS = [['Fecha', 64, 'c'], ['Sociedad', 218, 'i'], ['Finca', 112, 'i'], ['Corte/Lote', 72, 'i'], ['Muestra', 58, 'd'], ['Verde', 48, 'd'], ['Flotes', 50, 'd'], ['Seco', 48, 'd'], ['Broca', 48, 'd'], ['Cantidad', 68, 'd']];
  const MG = 25, PW = 842, PH = 595, RH = 17, HH = 24;
  const x = [MG]; COLS.forEach((c, i) => x.push(x[i] + c[1]));
  const W = x[COLS.length] - MG;
  const receptora = ((recibos[0] || {}).receptora || '').toLocaleUpperCase('es-CR');
  const text = P(8.2, false, false), bold = P(8.2, true, false), head = P(7.6, true, false, '#fff');
  const filas = recibos.map((r) => {
    const k = rc(r);
    return [diaLegible(r.dia), r.sociedad, r.finca, r.lote, fmtNum(r.muestraTotal, 2), fmtNum(r.verdes, 2), fmtNum(k.totalFlotes, 2), fmtNum(r.secos, 2), fmtNum(r.broca, 2), fmtNum(k.recibidoCajuelas, 2)];
  });
  const total = totalesRecibos(recibos);
  const paginas = []; let pg, c, y;
  const celdas = (vals, p, yy) => vals.forEach((v, k) => {
    if (!v) return;
    const col = COLS[k], t = recortar(v, p, col[1] - 8);
    const tx = x[k] + (col[1] - medir(p, t)) / 2;
    txt(c, t, tx, yy + RH - 5, p);
  });
  const nueva = (primera) => {
    pg = crearPagina(PW, PH, 2.2); c = pg.c; paginas.push(pg); y = MG;
    if (primera) {
      const t = P(16, true, false); txt(c, receptora, MG + (W - medir(t, receptora)) / 2, y + 14, t); y += 22;
      const s = P(11, true, false), sub = 'REPORTE DIARIO DE CAFÉ RECIBIDO EN BENEFICIO';
      txt(c, sub, MG + (W - medir(s, sub)) / 2, y + 11, s); y += 20;
      txt(c, `${rango ? 'PERÍODO' : 'FECHA'}: ${rango ? `DEL ${diaLegible(dia)} AL ${diaLegible(hasta)}` : diaLegible(dia)}`, MG, y + 9, bold); y += 18;
    } else { txt(c, `${receptora} · ${rango ? 'PERÍODO' : 'FECHA'}: ${rango ? `DEL ${diaLegible(dia)} AL ${diaLegible(hasta)}` : diaLegible(dia)} (continuación)`, MG, y + 9, bold); y += 16; }
    rectLleno(c, MG, y, W, HH, '#14532D');
    COLS.forEach((col, i) => txt(c, col[0], x[i] + (col[1] - medir(head, col[0])) / 2, y + HH / 2 + 3, head));
    y += HH;
  };
  nueva(true);
  filas.forEach((f, i) => {
    if (y + RH > PH - MG - 120 && i < filas.length) { if (y + RH > PH - MG) nueva(false); }
    if (y + RH > PH - MG) nueva(false);
    if (i % 2) rectLleno(c, MG, y, W, RH, '#F4F8F5');
    linea(c, MG, y + RH, MG + W, y + RH, 0.5, '#B8C7BD');
    celdas(f, text, y);
    y += RH;
  });
  if (y + RH * 5 > PH - MG) nueva(false);
  rectLleno(c, MG, y + 4, W, RH, '#D7E6DB');
  { const et = rango ? 'TOTAL DEL PERÍODO' : 'TOTAL DEL DÍA'; txt(c, et, x[0] + (x[4] - x[0] - medir(bold, et)) / 2, y + 4 + RH - 5, bold); }
  celdas(['', '', '', '', fmtNum(total.muestra, 2), fmtNum(total.verdes, 2), fmtNum(total.flotes, 2), fmtNum(total.secos, 2), fmtNum(total.broca, 2), fmtNum(total.cajuelas, 2)], bold, y + 4);
  y += 4 + RH + 26;
  const g = P(12, true, false);
  [['Total Cajuelas =', total.cajuelas], ['Total Fanegas =', total.fanegas]].forEach(([e, v]) => {
    const t = e + ' ' + fmtNum(v, 2);
    txt(c, t, MG + (W - medir(g, t)) / 2, y, g); y += 24;
  });
  txt(c, `Recibos incluidos: ${recibos.length} · No incluye recibos anulados.`, MG, PH - 14, P(7, false, false, '#6B7280'));
  return paginas.map((p) => ({ ...p, ancho: PW, alto: PH }));
}

// ====================== Tablas (Boletos) ======================
export function paginasTablas(tablas, pageW, pageH) {
  const MG = 24, RH = 16, HH = 28, VERDE = '#14532D';
  const text = P(8.2, false, false), bold = P(8.2, true, false), head = P(7.2, true, false, '#fff');
  const paginas = []; let pg, c, y;
  for (const t of tablas) {
    const xs = [MG]; t.columnas.forEach((col, i) => xs.push(xs[i] + col.ancho));
    const der = xs[xs.length - 1];
    const encabezado = () => {
      rectLleno(c, MG, y, der - MG, HH, VERDE);
      t.columnas.forEach((col, i) => {
        const w = col.ancho - 4, ls = [];
        let cur = '';
        for (const word of col.titulo.split(' ')) { const cand = cur ? cur + ' ' + word : word; if (!cur || medir(head, cand) <= w) cur = cand; else { ls.push(cur); cur = word; } }
        ls.push(cur);
        const top = y + (HH - ls.length * 9) / 2 + 7;
        ls.slice(0, 3).forEach((l, k) => { const tl = recortar(l, head, w); txt(c, tl, xs[i] + (col.ancho - medir(head, tl)) / 2, top + k * 9, head); });
      });
      y += HH;
    };
    const nueva = (primera) => {
      pg = crearPagina(pageW, pageH, Math.min(2.2, 4200 / pageW)); c = pg.c; paginas.push({ ...pg, ancho: pageW, alto: pageH }); y = MG;
      if (primera) { t.titulos.forEach(([tx, size]) => { const pt = P(size, true, false); txt(c, tx, t.centrado ? (pageW - medir(pt, tx)) / 2 : MG, y + size, pt); y += size + 5; }); y += 6; }
      else { txt(c, ((t.titulos[0] || [''])[0]) + ' (continuación)', MG, y + 9, bold); y += 16; }
      encabezado();
    };
    nueva(true);
    t.filas.forEach((f, idx) => {
      if (y + RH > pageH - MG - 14) nueva(false);
      const bg = f.fondo || (idx % 2 ? '#F4F8F5' : null);
      if (bg) rectLleno(c, MG, y, der - MG, RH, bg);
      linea(c, MG, y + RH, der, y + RH, t.bordes ? 0.9 : 0.6, t.bordes ? '#000' : '#9DB8A6');
      if (t.bordes) xs.forEach((xx) => linea(c, xx, y, xx, y + RH, 0.9));
      f.celdas.forEach((v, i) => {
        if (!v) return;
        const p = (f.rojas || []).includes(i) ? conColor(f.negrita ? bold : text, '#C00000', true) : (f.negrita ? bold : text);
        const col = t.columnas[i];
        const tx = recortar(v, p, col.ancho - 6);
        const px = (t.bordes || col.centro) ? xs[i] + (col.ancho - medir(p, tx)) / 2 : col.derecha ? xs[i] + col.ancho - 3 - medir(p, tx) : xs[i] + 3;
        txt(c, tx, px, y + RH - 4.5, p);
      });
      y += RH;
    });
    if (t.nota) {
      const np = P(7.5, false, false, '#6B7280');
      const ls = envolver(t.nota, np, der - MG);
      if (y + 12 * ls.length + 8 > pageH - MG) nueva(false);
      y += 8;
      ls.forEach((l) => { txt(c, l, MG, y + 8, np); y += 11; });
    }
  }
  return paginas;
}


// ====================== Gráficos y reportes (pestaña Reportes) ======================
const SERIE_COLORES = ['#14532D', '#2563EB', '#D97706', '#7C3AED'];
export const colorSerie = (i) => SERIE_COLORES[i % SERIE_COLORES.length];
function escalaBonita(max) {
  if (!(max > 0)) return { max: 4, paso: 1 };
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
  const paso = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  return { paso, max: Math.ceil(max / paso - 1e-9) * paso };
}
const GRIS = '#E5E7EB';
function leyenda(c, x, y, g) {
  const peq = P(7.5, false, false, '#374151');
  let lx = x;
  g.series.forEach((s, i) => { rectLleno(c, lx, y, 8, 8, s.color || colorSerie(i)); txt(c, s.nombre, lx + 11, y + 7.5, peq); lx += 11 + medir(peq, s.nombre) + 14; });
}
function barrasV(c, x, y, w, h, g) {
  const peq = P(7.5, false, false, '#374151'), val = P(7, true, false, '#111827');
  const L = 44, B = 16, T = 10;
  const px = x + L, pw = w - L - 4, py = y + T, ph = h - T - B;
  const max = Math.max(...g.series.flatMap((s) => s.valores), 0);
  const esc = escalaBonita(max);
  for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
    const yy = py + ph - (v / esc.max) * ph;
    linea(c, px, yy, px + pw, yy, 0.5, GRIS);
    const t = miles(v); txt(c, t, px - 4 - medir(peq, t), yy + 2.5, peq);
  }
  const n = g.cats.length, slot = pw / n, grupo = slot * 0.72, bw = grupo / g.series.length;
  const maxEt = Math.max(1, Math.floor(pw / 40));
  const salto = Math.ceil(n / maxEt);
  g.cats.forEach((cat, i) => {
    const gx = px + i * slot + (slot - grupo) / 2;
    g.series.forEach((s, k) => {
      const bh = (s.valores[i] / esc.max) * ph;
      const col = (g.colores && g.series.length === 1 && g.colores[i]) || s.color || colorSerie(k);
      rectLleno(c, gx + k * bw, py + ph - bh, Math.max(bw - 1, 1), bh, col);
      if (n <= 14 && g.series.length <= 2 && s.valores[i] > 0) {
        const t = g.dec ? cajF(s.valores[i]) : miles(s.valores[i]); if (medir(val, t) <= slot * 1.05) txt(c, t, gx + k * bw + bw / 2 - medir(val, t) / 2, py + ph - bh - 2.5, val);
      }
    });
    if (i % salto === 0) { const t = recortar(String(cat), peq, slot * salto - 2); txt(c, t, px + i * slot + slot / 2 - medir(peq, t) / 2, py + ph + 11, peq); }
  });
  linea(c, px, py + ph, px + pw, py + ph, 0.8, '#6B7280');
}
function barrasH(c, x, y, w, h, g) {
  const peq = P(7.5, false, false, '#374151'), val = P(7, true, false, '#111827');
  const n = g.cats.length, ns = g.series.length;
  const lw = Math.min(w * 0.36, Math.max(...g.cats.map((t) => medir(peq, String(t)))) + 4);
  const maxLab = Math.max(0, ...g.series.flatMap((s) => s.valores.map((v) => medir(val, g.dec ? cajF(v) : miles(v)))));
  const px = x + lw + 4, pw = w - lw - 4 - Math.max(34, Math.ceil(maxLab) + 8);
  const max = Math.max(...g.series.flatMap((s) => s.valores), 0);
  const esc = escalaBonita(max);
  const slot = h / n, grupo = Math.min(slot * 0.8, ns * 16), bh = grupo / ns;
  for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) linea(c, px + (v / esc.max) * pw, y, px + (v / esc.max) * pw, y + h, 0.5, GRIS);
  g.cats.forEach((cat, i) => {
    const gy = y + i * slot + (slot - grupo) / 2;
    const t = recortar(String(cat), peq, lw); txt(c, t, px - 4 - medir(peq, t), gy + grupo / 2 + 2.5, peq);
    g.series.forEach((s, k) => {
      const bw = (s.valores[i] / esc.max) * pw;
      rectLleno(c, px, gy + k * bh, Math.max(bw, 0), Math.max(bh - 1, 1), s.color || colorSerie(k));
      if (bh >= 7 && s.valores[i] > 0) txt(c, g.dec ? cajF(s.valores[i]) : miles(s.valores[i]), px + bw + 3, gy + k * bh + bh / 2 + 2.5, val);
    });
  });
  linea(c, px, y, px, y + h, 0.8, '#6B7280');
}
function lineasG(c, x, y, w, h, g) {
  const peq = P(7.5, false, false, '#374151');
  const L = 44, B = 16, T = 8;
  const px = x + L, pw = w - L - 10, py = y + T, ph = h - T - B;
  const max = Math.max(...g.series.flatMap((s) => s.pts.map((p) => p[1])), 0);
  const esc = escalaBonita(max);
  for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
    const yy = py + ph - (v / esc.max) * ph;
    linea(c, px, yy, px + pw, yy, 0.5, GRIS);
    const t = miles(v); txt(c, t, px - 4 - medir(peq, t), yy + 2.5, peq);
  }
  const X = (v) => px + (v / Math.max(g.xmax, 1)) * pw, Yv = (v) => py + ph - (v / esc.max) * ph;
  (g.xticks || []).forEach((t) => { const xx = X(t.x); linea(c, xx, py + ph, xx, py + ph + 3, 0.8, '#6B7280'); const tx = recortar(t.label, peq, 60); txt(c, tx, Math.min(xx - medir(peq, tx) / 2, px + pw - medir(peq, tx) + 6), py + ph + 12, peq); });
  linea(c, px, py + ph, px + pw, py + ph, 0.8, '#6B7280');
  // La cosecha elegida se dibuja al final para quedar encima.
  [...g.series.keys()].reverse().forEach((i) => {
    const s = g.series[i], col = s.color || colorSerie(i);
    c.strokeStyle = col; c.lineWidth = i === 0 ? 2.2 : 1.5; c.lineJoin = 'round'; c.beginPath();
    s.pts.forEach((p, k) => { if (k) c.lineTo(X(p[0]), Yv(p[1])); else c.moveTo(X(p[0]), Yv(p[1])); });
    c.stroke();
    const u = s.pts[s.pts.length - 1];
    if (u) { c.fillStyle = col; c.beginPath(); c.arc(X(u[0]), Yv(u[1]), i === 0 ? 3 : 2.2, 0, Math.PI * 2); c.fill(); }
  });
}
/** Dibuja un gráfico {tipo:'barras'|'barrasH'|'lineas', titulo, cats, series[{nombre, valores|pts, color}]} dentro del rectángulo dado. */
export function dibujarGrafico(c, x, y, w, h, g) {
  txt(c, g.titulo, x, y + 10, P(10, true, false));
  let top = y + 18;
  if (g.series.length > 1) { leyenda(c, x, top, g); top += 14; }
  const alto = h - (top - y) - 2;
  if (g.tipo === 'barrasH') barrasH(c, x, top, w, alto, g);
  else if (g.tipo === 'lineas') lineasG(c, x, top, w, alto, g);
  else barrasV(c, x, top, w, alto, g);
}
/** Gráfico suelto como lienzo, para mostrarlo en pantalla. */
export function lienzoGrafico(g, ancho = 640, alto = 300) {
  const pg = crearPagina(ancho, alto, 3);
  dibujarGrafico(pg.c, 6, 4, ancho - 12, alto - 8, g);
  return pg.canvas;
}
const COLORES_PDF_KPI = { pos: '#166534', neg: '#B91C1C' };
/** Reporte completo para PDF: primera hoja con resumen y gráficos, luego la tabla. Apaisado. */
export function paginasReporte(rep, pie = '') {
  const MG = 24;
  // 1) Ancho natural de cada columna según su contenido (nombres completos, APC angosto...).
  const tTxt = P(8.2, false, false), tNeg = P(8.2, true, false), tCab = P(7.2, true, false, '#fff');
  const celdasTxt = (rep.filas || []).map((f) => ({ f, c: rep.cols.map((k, i) => celdaTxt(k, f.v[i])) }));
  const natural = rep.cols.map((k, i) => {
    let w = 0;
    celdasTxt.forEach(({ f, c }) => { if (c[i]) w = Math.max(w, medir(f.negrita ? tNeg : tTxt, c[i])); });
    const wc = Math.max(0, ...String(k.t).split(' ').map((p) => medir(tCab, p)));
    return Math.ceil(Math.max(w, wc, 26) + 12);
  });
  const sumNat = natural.reduce((t, x) => t + x, 0);
  // Poca información (pocas columnas y filas) → hoja vertical; si hay más → horizontal, y más ancha si hace falta.
  const nCols = (rep.cols || []).length, nFilas = (rep.filas || []).length;
  const cabeVertical = sumNat <= 595 - 2 * MG;
  const vertical = rep.vertical !== undefined ? rep.vertical : (nCols > 0 && nCols <= 4 && nFilas <= 26 && cabeVertical);
  const W = vertical ? 595 : 842, H = vertical ? 842 : 595;
  const pg = crearPagina(W, H, 2.2), c = pg.c;
  let y = MG;
  const cx = (t, p) => (rep.centrado ? (W - medir(p, t)) / 2 : MG);
  { const pt = P(16, true, false); let tt = rep.titulo; let ps = pt; if (rep.centrado) { let sz = 16; while (sz > 9 && medir(P(sz, true, false), tt) > W - 2 * MG) sz -= 0.5; ps = P(sz, true, false); } txt(c, tt, cx(tt, ps), y + 14, ps); y += 24; }
  rep.subtitulos.forEach((t) => { envolver(t, P(9, false, false), W - 2 * MG).forEach((l) => { const pp = P(9, false, false, '#374151'); txt(c, l, cx(l, pp), y + 9, pp); y += 12; }); });
  y += 8;
  if (rep.kpis && rep.kpis.length) {
    const n = rep.kpis.length, gap = 8, bw = (W - 2 * MG - gap * (n - 1)) / n, bh = 52;
    rep.kpis.forEach((k, i) => {
      const bx = MG + i * (bw + gap);
      rectLleno(c, bx, y, bw, bh, '#E8F1EB');
      const kc = (t, p) => (rep.centrado ? bx + (bw - medir(p, t)) / 2 : bx + 8);
      { const pk = P(8, false, false, '#374151'); const tk = recortar(k.t, pk, bw - 8); txt(c, tk, kc(tk, pk), y + 14, pk); }
      { let sz = 14; while (sz > 7 && medir(P(sz, true, false), k.v) > bw - 16) sz -= 0.5; const pv = P(sz, true, false); txt(c, k.v, kc(k.v, pv), y + 32, pv); }
      if (k.d != null) { const tdl = recortar(`${pctSigno(k.d)} ${k.ref}`, P(8, true, false), bw - 12); txt(c, tdl, bx + 8, y + 46, P(8, true, false, k.d < 0 ? COLORES_PDF_KPI.neg : COLORES_PDF_KPI.pos)); }
    });
    y += bh + 12;
  }
  if (rep.datos && rep.datos.length) {
    const pd = P(8.6, false, false, '#1F2937');
    txt(c, 'Datos de interés', MG, y + 9, P(9, true, false, '#14532D')); y += 14;
    rep.datos.forEach((t) => envolver('•  ' + t, pd, W - 2 * MG).forEach((l, i) => { txt(c, i ? '    ' + l : l, MG, y + 8, pd); y += 11.5; }));
    y += 8;
  }
  const gs = (rep.graficos || []).slice(0, 3);
  if (gs.length) {
    if (vertical) {
      const gh = (H - y - MG - 12 - 14 * (gs.length - 1)) / gs.length;
      gs.forEach((g, i) => dibujarGrafico(c, MG, y + i * (gh + 14), W - 2 * MG, gh, g));
    } else {
      const cols = gs.length, gw = (W - 2 * MG - 16 * (cols - 1)) / cols;
      gs.forEach((g, i) => dibujarGrafico(c, MG + i * (gw + 16), y, gw, H - y - MG - 12, g));
    }
  }
  // Una sola hoja: si el reporte no tiene gráficos y la tabla cabe debajo, se dibuja en la misma página.
  let enHoja = false;
  if (rep.unaHoja && !gs.length && rep.filas && rep.filas.length && sumNat <= W - 2 * MG && y + 28 + 16 * rep.filas.length + 14 <= H - MG - 14) {
    enHoja = true;
    const avail = W - 2 * MG, reparto = Math.max(0, avail - sumNat);
    const peso = rep.cols.map((k, i) => (k.tipo !== 'txt' ? 1 : natural[i] >= 110 ? 1 : 0.05));
    const sp = peso.reduce((t, x) => t + x, 0);
    const anchos = rep.cols.map((k, i) => natural[i] + reparto * peso[i] / sp);
    const xs = [MG]; anchos.forEach((a, i) => xs.push(xs[i] + a));
    const der = xs[xs.length - 1], HH = 28, RH = 16;
    const text = P(8.2, false, false), bold = P(8.2, true, false), head = P(7.2, true, false, '#fff');
    y += 4;
    rectLleno(c, MG, y, der - MG, HH, '#14532D');
    rep.cols.forEach((col, i) => {
      const w = anchos[i] - 4, ls = []; let cur = '';
      for (const word of col.t.split(' ')) { const cand = cur ? cur + ' ' + word : word; if (!cur || medir(head, cand) <= w) cur = cand; else { ls.push(cur); cur = word; } }
      ls.push(cur);
      const top = y + (HH - ls.length * 9) / 2 + 7;
      ls.slice(0, 3).forEach((l, k) => { const tl = recortar(l, head, w); txt(c, tl, xs[i] + (anchos[i] - medir(head, tl)) / 2, top + k * 9, head); });
    });
    y += HH;
    rep.filas.forEach((f, idx) => {
      const bg = f.fondo || (idx % 2 ? '#F4F8F5' : null);
      if (bg) rectLleno(c, MG, y, der - MG, RH, bg);
      linea(c, MG, y + RH, der, y + RH, 0.6, '#9DB8A6');
      rep.cols.forEach((k, i) => {
        const v = celdaTxt(k, f.v[i]); if (!v) return;
        const rojo = (k.tipo === 'pct' || k.neg) && typeof f.v[i] === 'number' && f.v[i] < -0.0005;
        const p = rojo ? conColor(f.negrita ? bold : text, '#C00000', true) : (f.negrita ? bold : text);
        const tx = recortar(v, p, anchos[i] - 6);
        txt(c, tx, xs[i] + (anchos[i] - medir(p, tx)) / 2, y + RH - 4.5, p);
      });
      y += RH;
    });
    if (rep.nota) { const np = P(7.5, false, false, '#6B7280'); y += 6; envolver(rep.nota, np, der - MG).forEach((l) => { if (y + 12 < H - MG - 14) { txt(c, l, MG, y + 8, np); y += 11; } }); }
  }
  txt(c, pie, MG, H - 10, P(7, false, false, '#6B7280'));
  const paginas = [{ ...pg, ancho: W, alto: H }];
  if (rep.filas && rep.filas.length && !enHoja) {
    // 2) La tabla ocupa el ancho que necesita (más ancha que la hoja si hay muchas columnas) y reparte lo que sobre.
    const avail = W - 2 * MG;
    const TW = sumNat <= avail ? W : Math.ceil(sumNat + 2 * MG);
    const reparto = Math.max(0, (TW - 2 * MG) - sumNat);
    const peso = rep.cols.map((k, i) => (k.tipo !== 'txt' ? 1 : natural[i] >= 110 ? 1 : 0.05));
    const sp = peso.reduce((t, x) => t + x, 0);
    const columnas = rep.cols.map((k, i) => ({ titulo: k.t, ancho: natural[i] + reparto * peso[i] / sp, derecha: k.tipo !== 'txt', centro: k.tipo !== 'txt' || !!k.centro }));
    const filas = rep.filas.map((f) => ({
      celdas: rep.cols.map((k, i) => celdaTxt(k, f.v[i])), negrita: f.negrita, fondo: f.fondo,
      rojas: rep.cols.map((k, i) => ((k.tipo === 'pct' || k.neg) && typeof f.v[i] === 'number' && f.v[i] < -0.0005 ? i : -1)).filter((i) => i >= 0)
    }));
    paginasTablas([{ titulos: [[rep.titulo, 12]], centrado: !!rep.centrado, columnas, filas, nota: (rep.nota || '') + (pie ? '  ' + pie : '') }], TW, H).forEach((p) => paginas.push(p));
  }
  return paginas;
}
