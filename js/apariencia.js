// Apariencia: tema (automático/claro/oscuro), tamaño de texto, pestaña de inicio y sociedad por defecto.
import { db } from './store.js';

export const TEMAS = [['auto', 'Automático (igual que el teléfono)'], ['claro', 'Claro'], ['oscuro', 'Oscuro']];
export const TEXTOS = [['normal', 'Normal', 1], ['grande', 'Grande', 1.12], ['muygrande', 'Muy grande', 1.25]];
export const TABS = [['ultima', 'La primera pestaña que pueda usar', -1], ['registro', 'Registro', 0], ['diario', 'Diario', 1], ['boletos', 'Boletos', 2], ['reportes', 'Reportes', 3]];

export const ajuste = (k, def) => db.get('ap_' + k, def);
export const guardarAjuste = (k, v) => db.set('ap_' + k, v);

const originales = new WeakMap();
/** El modo oscuro del CSS depende de «prefers-color-scheme»: para forzarlo se cambia la condición de esas reglas. */
function reglasOscuras(fn) {
  [...document.styleSheets].forEach((hoja) => {
    let reglas; try { reglas = hoja.cssRules; } catch { return; }
    [...reglas].forEach((r) => { if (r.type === CSSRule.MEDIA_RULE && (originales.has(r) || /prefers-color-scheme:\s*dark/.test(r.media.mediaText))) fn(r); });
  });
}
export function aplicarApariencia() {
  const tema = ajuste('tema', 'auto');
  const root = document.documentElement;
  reglasOscuras((r) => {
    if (!originales.has(r)) originales.set(r, r.media.mediaText);
    const orig = originales.get(r);
    try { r.media.mediaText = tema === 'oscuro' ? 'all' : tema === 'claro' ? 'not all' : orig; } catch { /* nada */ }
  });
  root.style.colorScheme = tema === 'oscuro' ? 'dark' : tema === 'claro' ? 'light' : 'light dark';
  root.dataset.tema = tema;
  const t = TEXTOS.find((x) => x[0] === ajuste('texto', 'normal')) || TEXTOS[0];
  document.body.style.zoom = t[2] === 1 ? '' : String(t[2]);
}
export function tabInicio() { const t = TABS.find((x) => x[0] === ajuste('tab_inicio', 'ultima')); return t ? t[2] : -1; }
