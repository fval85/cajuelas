// Impresión de tiquetes en una impresora térmica de 80 mm desde una computadora (Xprinter XP-N160II u otra).
import { db } from './store.js';

/** Computadora de escritorio o portátil: puntero fino y sin navegador móvil. */
export function esComputadora() {
  const movil = /android|iphone|ipad|ipod|mobile|silk/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let fino = true;
  try { fino = matchMedia('(pointer: fine)').matches; } catch { /* nada */ }
  return !movil && fino;
}
export const anchoMm = () => { const v = Number(db.get('print_mm', 80)); return v >= 50 && v <= 82 ? v : 80; };
export const setAnchoMm = (v) => db.set('print_mm', Number(v));

/** Imprime cada página (canvas) como un tiquete continuo del ancho del rollo. */
export function imprimirTiquetes(paginas) {
  const mm = anchoMm();
  const imgs = paginas.map((p) => `<img src="${p.canvas.toDataURL('image/png')}" alt="">`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tiquete</title><style>
@page { size: 80mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: ${mm}mm; height: auto; page-break-after: always; break-after: page; }
img:last-child { page-break-after: auto; break-after: auto; }
</style></head><body>${imgs}</body></html>`;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
  document.body.append(f);
  const quitar = () => setTimeout(() => f.remove(), 2000);
  f.onload = () => {
    const w = f.contentWindow;
    const imagenes = [...w.document.images];
    Promise.all(imagenes.map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => {
      w.addEventListener('afterprint', quitar);
      w.focus(); w.print();
      setTimeout(quitar, 60000);
    });
  };
  f.srcdoc = html;
}
