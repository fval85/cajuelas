// Utilidades comunes: DOM, formatos, fechas, diálogos.
export const VERSION = '2.7.1';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------- Texto y números ----------
export function normalizar(t) {
  return String(t ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export function soloDigitos(t) { return String(t ?? '').replace(/\D/g, ''); }
export function tarjetaEnmascarada(t) {
  const d = soloDigitos(t);
  if (!d) return '';
  const m = d.length > 12 ? d.slice(0, 8) + 'X'.repeat(d.length - 12) + d.slice(-4)
    : 'X'.repeat(Math.max(d.length - 4, 0)) + d.slice(-4);
  return m.match(/.{1,4}/g).join('-');
}
export function parseQty(t) {
  const n = Number(String(t ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
export function canonQty(t) {
  const s = String(t ?? '').trim().replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || s === '') return s;
  return n === 0 ? '0' : String(n);
}
const nfCache = {};
export function fmtNum(v, dec) {
  const k = dec;
  nfCache[k] = nfCache[k] || new Intl.NumberFormat('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false });
  let t = nfCache[k].format(v);
  if (/^-0([.,]0+)?$/.test(t)) t = t.slice(1);
  return t;
}
export function esEntero(v) { return Math.abs(v - Math.round(v)) < 1e-9; }
// Cantidad: enteros sin decimales; con decimales, al menos 2 (3,50) y máximo 4.
export function fmtQty(v) {
  if (esEntero(v)) return fmtNum(v, 0);
  const nf = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });
  return nf.format(v);
}
export function fmtCant(v) { return esEntero(v) ? fmtNum(v, 0) : fmtNum(v, 2); }
export function fmtPct(v) { return fmtNum(v * 100, 1) + '%'; }
const nfMoney = new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtMoney(v) { return '₡' + nfMoney.format(v).replace(/[\u00a0\u202f]/g, ' '); }
export function fmtMoney2(v) { return nfMoney.format(v).replace(/[\u00a0\u202f]/g, ' '); }
export function plainNumber(v) { return v % 1 === 0 ? String(Math.trunc(v)) : String(v); }

// ---------- Fechas ----------
const p2 = (n) => String(n).padStart(2, '0');
export function diaHoy(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export function ahoraTxt(d = new Date()) {
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function diaLegible(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (dia || '');
}
export function stampCorto(d = new Date()) {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLarga(d = new Date()) { return `${p2(d.getDate())} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Mensajes ----------
let toastTimer;
export function toast(texto, ms = 3500) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = texto;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- Diálogos ----------
export function dialogo({ titulo, cuerpo, botones }) {
  const velo = h('div', { class: 'velo' });
  const caja = h('div', { class: 'dialogo', role: 'dialog', 'aria-modal': 'true' });
  if (titulo) caja.append(h('h2', null, titulo));
  const cont = h('div', { class: 'dialogo-cuerpo' });
  if (cuerpo) cont.append(...[].concat(cuerpo).filter((x) => x !== null && x !== undefined && x !== false));
  caja.append(cont);
  const barra = h('div', { class: 'dialogo-botones' });
  const api = { cerrar() { velo.remove(); document.body.classList.remove('sin-scroll'); if (api.alCerrar) api.alCerrar(); }, caja, cont };
  (botones || [{ texto: 'Cerrar' }]).forEach((b) => {
    barra.append(h('button', {
      class: 'btn-texto ' + (b.clase || ''),
      type: 'button',
      onclick: async () => {
        if (b.onclick) {
          const r = await b.onclick(api);
          if (r === false) return;
        }
        api.cerrar();
      }
    }, b.texto));
  });
  caja.append(barra);
  velo.append(caja);
  velo.addEventListener('click', (e) => { if (e.target === velo && !arguments[0]?.fijo) api.cerrar(); });
  document.body.append(velo);
  document.body.classList.add('sin-scroll');
  return api;
}

export function aviso(titulo, texto) {
  return dialogo({ titulo, cuerpo: h('p', { class: 'pre' }, texto), botones: [{ texto: 'Aceptar' }] });
}

export function confirmar(titulo, texto, { si = 'Aceptar', no = 'Cancelar', peligro = false } = {}) {
  return new Promise((res) => {
    let hecho = false;
    const d = dialogo({
      titulo,
      cuerpo: h('p', { class: 'pre' }, texto),
      botones: [
        { texto: no, onclick: () => { hecho = true; res(false); } },
        { texto: si, clase: peligro ? 'peligro' : 'primario', onclick: () => { hecho = true; res(true); } }
      ]
    });
    d.alCerrar = () => { if (!hecho) res(false); };
  });
}

// Lista para elegir una opción (con buscador si hay muchas).
export function elegir(titulo, opciones, { vacio = 'No hay opciones.', buscar = true, accionVacio = null } = {}) {
  return new Promise((res) => {
    let hecho = false;
    const lista = h('div', { class: 'lista' });
    const q = h('input', { type: 'search', class: 'campo', placeholder: 'Buscar…', autocomplete: 'off' });
    const pintar = () => {
      clear(lista);
      const toks = normalizar(q.value).split(' ').filter(Boolean);
      const ok = opciones.filter((o) => { const t = normalizar(o.etiqueta ?? o); return toks.every((k) => t.includes(k)); });
      if (!ok.length) lista.append(h('p', { class: 'vacio' }, opciones.length ? 'Sin coincidencias.' : vacio));
      ok.slice(0, 200).forEach((o) => {
        lista.append(h('button', {
          type: 'button', class: 'item',
          onclick: () => { hecho = true; d.cerrar(); res(o.valor !== undefined ? o.valor : o); }
        }, h('span', null, o.etiqueta ?? o), o.detalle ? h('small', null, o.detalle) : null));
      });
    };
    q.addEventListener('input', pintar);
    const botones = [{ texto: 'Cancelar' }];
    if (accionVacio && !opciones.length) botones.unshift({ texto: accionVacio.texto, clase: 'primario', onclick: () => { hecho = true; res(undefined); accionVacio.onclick(); } });
    const d = dialogo({ titulo, cuerpo: [buscar && opciones.length > 8 ? q : null, lista], botones });
    d.alCerrar = () => { if (!hecho) res(undefined); };
    pintar();
  });
}

// Formulario sencillo: campos [{etiqueta, valor, tipo, placeholder, opciones}], devuelve valores o null.
export function formulario(titulo, campos, { ok = 'Guardar', validar = null, detalle = '' } = {}) {
  return new Promise((res) => {
    let hecho = false;
    const inputs = campos.map((c) => {
      if (c.radios) {
        const grupo = h('div', { class: 'radios' });
        c.radios.forEach((r) => {
          const id = 'r' + Math.random().toString(36).slice(2);
          grupo.append(h('label', { class: 'radio', for: id },
            h('input', { type: 'radio', name: 'g' + titulo, id, value: r.valor, checked: r.valor === c.valor }), ' ', r.texto));
        });
        return { c, el: grupo, leer: () => (grupo.querySelector('input:checked') || {}).value };
      }
      const el = h('input', {
        class: 'campo', type: c.tipo || 'text', value: c.valor ?? '', placeholder: c.placeholder || '',
        inputmode: c.inputmode, autocomplete: 'off', autocapitalize: c.mayus ? 'words' : 'none'
      });
      return { c, el, leer: () => el.value.trim() };
    });
    const cuerpo = [detalle ? h('p', { class: 'pre' }, detalle) : null, ...inputs.flatMap(({ c, el }) => [h('label', { class: 'etiqueta' }, c.etiqueta), el])];
    const d = dialogo({
      titulo, cuerpo,
      botones: [
        { texto: 'Cancelar' },
        {
          texto: ok, clase: 'primario',
          onclick: async () => {
            const vals = inputs.map((i) => i.leer());
            const err = validar ? await validar(vals) : null;
            if (err) { toast(err); return false; }
            hecho = true; res(vals);
          }
        }
      ]
    });
    d.alCerrar = () => { if (!hecho) res(null); };
    setTimeout(() => { const f = d.caja.querySelector('input.campo'); if (f) f.focus(); }, 50);
  });
}
