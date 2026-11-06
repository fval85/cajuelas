// Exportaciones · registro de contratos, salidas, guías y pagos (solo administradores; el servidor lo valida otra vez).
import { h, toast, dialogo, formulario, confirmar, diaHoy } from './util.js';
import { expAdmin } from './sync.js';
import { puede } from './users.js';

export const puedeEditarExp = () => puede('exportaciones_editar');
const KG_SACO = 69, QQ_SACO = 1.5;
const num = (v) => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
const miles = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('es-CR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const dinero = (n) => (Number.isFinite(n) ? '$' + miles(n, 2) : '—');
const fechaCorta = (x) => (x ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : '');

/** Campo con etiqueta. tipo: texto | num | fecha | lista. */
function campo(c, listas, estado) {
  const etiqueta = h('label', { class: 'etiqueta' }, c.etiqueta);
  let el;
  if (c.tipo === 'lista') {
    el = h('select', { class: 'campo selec' });
    const pintarOpciones = (sel) => {
      el.replaceChildren();
      if (!c.obligatorio) el.append(h('option', { value: '' }, '—'));
      const ops = (listas[c.lista] || []).filter((o) => !/^[-–—\s]*$/.test(String(o)));
      const s0 = sel || '';
      if (s0 && !ops.includes(s0)) ops.push(s0);
      ops.forEach((o) => el.append(h('option', { value: o }, o)));
      if (c.puedeAgregar) el.append(h('option', { value: '__nuevo' }, '＋ Agregar opción nueva…'));
      el.value = s0 || (c.obligatorio ? (ops[0] || '') : '');
    };
    pintarOpciones(c.valor);
    let previo = el.value;
    el.addEventListener('change', async () => {
      if (el.value !== '__nuevo') { previo = el.value; return; }
      el.value = previo;
      const r = await formulario(`Nueva opción · ${c.etiqueta}`, [{ etiqueta: 'Nombre', placeholder: 'Escriba la opción nueva' }], { ok: 'Agregar', detalle: 'Queda guardada en la lista y aparece en todos los contratos nuevos.',
        validar: async (v) => { if (!v[0]) return 'Escriba el nombre.'; const x = await expAdmin('lista', { lista: c.lista, valor: v[0] }); return x.ok ? null : x.message; } });
      if (r) { (listas[c.lista] = listas[c.lista] || []).push(r[0]); pintarOpciones(r[0]); previo = r[0]; el.dispatchEvent(new Event('input')); }
    });
  } else if (c.tipo === 'fecha') {
    el = h('input', { class: 'campo', type: 'date', value: c.valor || '' });
  } else if (c.tipo === 'mes') {
    el = h('input', { class: 'campo', type: 'month', value: (c.valor || '').slice(0, 7) });
  } else {
    el = h('input', { class: 'campo' + (c.tipo === 'num' ? '' : ''), type: 'text', value: c.valor ?? '', placeholder: c.placeholder || '', inputmode: c.tipo === 'num' ? 'decimal' : undefined, autocomplete: 'off', autocapitalize: 'none' });
  }
  if (c.deshabilitado) el.disabled = true;
  const caja = h('div', { class: 'campo-caja' }, etiqueta, el);
  return { c, el, caja, leer: () => (c.tipo === 'mes' ? (el.value ? el.value + '-01' : '') : el.value.trim()) };
}

/**
 * Formulario en hoja. campos: [{k, etiqueta, tipo, valor, lista, obligatorio, mitad}], extras: nodos, nota(vals) → texto calculado.
 * guardar(vals) → {ok, message, json}. Devuelve true si se guardó.
 */
function hoja({ titulo, campos, listas = {}, guardar, ok = 'Guardar', nota = null, masDatos = [], botonesExtra = [], intro = null }) {
  return new Promise((res) => {
    let hecho = false;
    const todos = [...campos, ...masDatos];
    const cs = todos.map((c) => campo(c, listas));
    const por = Object.fromEntries(cs.map((x) => [x.c.k, x]));
    const vals = () => Object.fromEntries(cs.map((x) => [x.c.k, x.leer()]));
    const cajaNota = nota ? h('p', { class: 'calc-nota' }) : null;
    const act = () => {
      const vv = vals();
      cs.forEach((x) => { if (x.c.visibleSi) x.caja.hidden = !x.c.visibleSi(vv); });
      if (cajaNota) { const t = nota(vv); cajaNota.textContent = t || ''; cajaNota.hidden = !t; }
    };
    const filas = [];
    let par = [];
    campos.forEach((c, i) => {
      const x = cs[i];
      if (c.mitad) { par.push(x.caja); if (par.length === 2) { filas.push(h('div', { class: 'dos-col' }, ...par)); par = []; } } else { if (par.length) { filas.push(h('div', { class: 'dos-col' }, ...par)); par = []; } filas.push(x.caja); }
    });
    if (par.length) filas.push(h('div', { class: 'dos-col' }, ...par));
    if (cajaNota) filas.push(cajaNota);
    let det = null;
    if (masDatos.length) {
      const resto = cs.slice(campos.length); const parejas = [];
      let p2 = []; masDatos.forEach((c, i) => { const x = resto[i]; if (c.mitad) { p2.push(x.caja); if (p2.length === 2) { parejas.push(h('div', { class: 'dos-col' }, ...p2)); p2 = []; } } else { if (p2.length) { parejas.push(h('div', { class: 'dos-col' }, ...p2)); p2 = []; } parejas.push(x.caja); } });
      if (p2.length) parejas.push(h('div', { class: 'dos-col' }, ...p2));
      det = h('details', { class: 'mas-datos' }, h('summary', null, 'Más datos (estado, calidad, preparación…)'), ...parejas);
      filas.push(det);
    }
    cs.forEach((x) => { x.el.addEventListener('input', act); x.el.addEventListener('change', act); });
    act();
    const d = dialogo({
      titulo, cuerpo: [intro ? h('p', { class: 'pre' }, intro) : null, ...filas],
      botones: [{ texto: 'Cancelar' }, ...botonesExtra.map((b) => ({ texto: b.texto, clase: b.clase, onclick: async (api) => { const r = await b.onclick(vals(), api); if (r === true) { hecho = true; res(true); } return r === true ? true : false; } })),
        { texto: ok, clase: 'primario', onclick: async () => {
          const v = vals();
          let r = await guardar(v, false);
          if (!r.ok && r.json && r.json.confirmar) {
            if (!(await confirmar('Confirmar', r.message, { si: 'Registrar de todos modos' }))) return false;
            r = await guardar(v, true);
          }
          if (!r.ok) { toast(r.message || 'No se pudo guardar.', 5000); return false; }
          toast(r.message || 'Guardado.');
          hecho = true; res(true);
        } }]
    });
    d.alCerrar = () => { if (!hecho) res(false); };
  });
}

const opcionesContrato = (datos) => datos.contratos.filter((c) => (c.est || '').toLowerCase() !== 'anulado');

export function nuevoContrato(datos, c = null) {
  const L = datos.listas || {};
  const ultimo = datos.contratos[datos.contratos.length - 1] || {};
  const v = (k, d = '') => (c ? c[k] ?? d : d);
  return hoja({
    titulo: c ? `Editar contrato ${c.id}` : 'Nuevo contrato', listas: L,
    campos: [
      { k: 'comprador', etiqueta: 'Comprador', tipo: 'lista', lista: 'comprador', obligatorio: true, valor: c ? c.comp : '', puedeAgregar: puede('todos') },
      { k: 'contrato', etiqueta: 'No. contrato', tipo: 'texto', valor: c ? c.id : '', placeholder: 'Ej. P025.179A' },
      { k: 'cosecha', etiqueta: 'Cosecha', tipo: 'texto', valor: c ? c.cos : (ultimo.cos || ''), mitad: true },
      { k: 'tipo', etiqueta: 'Tipo', tipo: 'lista', lista: 'tipo', valor: c ? c.tipo : 'EXP', obligatorio: true, mitad: true, puedeAgregar: puede('todos') },
      { k: 'precio', etiqueta: 'Precio rieles $', tipo: 'num', valor: c && c.precio != null ? String(c.precio).replace('.', ',') : '', mitad: true },
      { k: 'sacos', etiqueta: 'Sacos', tipo: 'num', valor: c ? String(c.sacC) : '', mitad: true },
      { k: 'fecha_entrega', etiqueta: 'Mes de entrega previsto', tipo: 'mes', valor: c ? c.fent : '' }
    ],
    nota: (x) => {
      const s = num(x.sacos), p = num(x.precio);
      if (!Number.isFinite(s)) return '';
      const total = Number.isFinite(p) ? p * s * QQ_SACO : NaN;
      let t = `= ${miles(s * QQ_SACO, 1)} qq · ${miles(s * KG_SACO)} kg${Number.isFinite(total) ? ' · ' + dinero(total) : ''}`;
      const pc = num(x.pct_nuestro);
      if (x.financiamiento === 'SI' && Number.isFinite(total) && Number.isFinite(pc)) t += `\nFinanciado: nos tocan ${dinero(total * pc / 100)} (${miles(pc, 1)} %) · del banco ${dinero(total * (100 - pc) / 100)}`;
      return t;
    },
    masDatos: [
      { k: 'estado', etiqueta: 'Estado del contrato', tipo: 'lista', lista: 'estado', valor: c ? c.est : 'Inscrito', obligatorio: true, puedeAgregar: puede('todos') },
      { k: 'financiamiento', etiqueta: 'Financiamiento', tipo: 'lista', lista: 'financiamiento', valor: v('fin'), mitad: true },
      { k: 'certificacion', etiqueta: 'Certificación', tipo: 'lista', lista: 'certificacion', valor: v('cert'), mitad: true, puedeAgregar: puede('todos') },
      { k: 'pct_nuestro', etiqueta: 'Porcentaje que nos devuelve el banco %', tipo: 'num', valor: c && c.pctC != null ? String(c.pctC).replace('.', ',') : '30', visibleSi: (x) => x.financiamiento === 'SI' },
      { k: 'icafe', etiqueta: 'No. Icafe', tipo: 'texto', valor: v('ica') },
      { k: 'calidad', etiqueta: 'Calidad', tipo: 'lista', lista: 'calidad', valor: v('cal'), mitad: true, puedeAgregar: puede('todos') },
      { k: 'preparacion', etiqueta: 'Preparación', tipo: 'lista', lista: 'preparacion', valor: v('prep'), mitad: true, puedeAgregar: puede('todos') },
      { k: 'tipo_cafe', etiqueta: 'Tipo café', tipo: 'lista', lista: 'tipo_cafe', valor: v('tcafe'), mitad: true, puedeAgregar: puede('todos') },
      { k: 'categoria', etiqueta: 'Categoría', tipo: 'lista', lista: 'categoria', valor: v('cat'), mitad: true, puedeAgregar: puede('todos') },
      { k: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto', valor: v('obs') }
    ],
    ok: c ? 'Guardar cambios' : 'Guardar contrato',
    guardar: (x) => expAdmin('contrato', { ...x, id: c ? c.dbId : null })
  });
}

function infoContrato(datos, id) {
  const c = datos.contratos.find((x) => x.id === id);
  if (!c) return '';
  return `${miles(c.sacC)} sacos · entregados ${miles(c.sacE)} · quedan ${miles(Math.max(c.sacC - c.sacE, 0))}`;
}

export function nuevaSalida(datos, contratoId = '', e = null) {
  const L = datos.listas || {};
  const ops = opcionesContrato(datos);
  const campos = [
    { k: 'contrato', etiqueta: 'Contrato', tipo: 'lista', lista: '__c', obligatorio: true, valor: e ? e.id : contratoId || (ops[0] || {}).id || '' },
    { k: 'confirmacion', etiqueta: 'Estado de la salida', tipo: 'lista', lista: 'confirmacion', obligatorio: true, valor: e ? (e.est || 'Entregado') : 'Entregado' },
    { k: 'fecha_salida', etiqueta: 'Fecha de salida', tipo: 'fecha', valor: e ? e.fecha.slice(0, 10) : diaHoy() },
    { k: 'sacos', etiqueta: 'Sacos', tipo: 'num', valor: e ? String(e.sacos) : '', mitad: true },
    { k: 'boleta', etiqueta: 'Boleta nuestra', tipo: 'texto', valor: e ? (e.boletaN || '') : '', mitad: true, placeholder: 'Ej. 9991' },
    { k: 'romana', etiqueta: 'Kilos en romana de origen', tipo: 'num', valor: e && e.romana != null ? String(e.romana).replace('.', ',') : '' }
  ];
  return hoja({
    titulo: e ? 'Editar salida' : 'Registrar salida', listas: { ...L, __c: ops.map((c) => c.id) }, campos,
    intro: e ? null : 'La guía del comprador y los kilos neto se anotan después, cuando llegue la boleta.',
    nota: (x) => infoContrato(datos, x.contrato),
    ok: e ? 'Guardar cambios' : 'Registrar salida',
    guardar: (x, confirmarSi) => expAdmin('salida', { ...x, id: e ? e.dbId : null }, confirmarSi ? { confirmar: true } : {})
  });
}

export function anotarGuia(datos, e) {
  const dif = (x) => { const n = num(x.neto); const base = e.romana != null ? e.romana : e.kg; return Number.isFinite(n) && base != null ? `Diferencia contra ${e.romana != null ? 'romana' : 'lo enviado'}: ${n - base >= 0 ? '+' : ''}${miles(n - base, 1)} kg · pasa a «Con guía»` : ''; };
  return hoja({
    titulo: 'Guía del comprador', intro: `Salida del ${fechaCorta((e.fecha || '').slice(0, 10))} · ${miles(e.sacos)} sacos${e.boletaN ? ' · boleta ' + e.boletaN : ''}`,
    campos: [
      { k: 'guia', etiqueta: 'Guía / boleta del comprador', tipo: 'texto', valor: e.guiaC || '' },
      { k: 'neto', etiqueta: 'Kilos neto recibidos por el comprador', tipo: 'num', valor: e.neto != null ? String(e.neto).replace('.', ',') : '' }
    ],
    nota: dif, ok: 'Guardar guía',
    guardar: (x) => expAdmin('guia', { ...x, id: e.dbId }),
    botonesExtra: [{ texto: 'Anular salida', clase: 'peligro', onclick: async () => {
      if (!(await confirmar('Anular salida', `Se anula la salida del ${fechaCorta((e.fecha || '').slice(0, 10))} (${miles(e.sacos)} sacos). Deja de contar en los totales y queda en la auditoría.`, { si: 'Anular', peligro: true }))) return false;
      const r = await expAdmin('anularSalida', { id: e.dbId, motivo: 'Anulada desde la app' });
      toast(r.message || (r.ok ? 'Anulada.' : 'No se pudo anular.'), 4000);
      return r.ok;
    } }]
  });
}

export function nuevoPago(datos, contratoId = '', p = null) {
  const ops = opcionesContrato(datos);
  const resumen = (id) => { const c = datos.contratos.find((x) => x.id === id); return c ? `Entregado ${dinero(c.monE)} · pagado ${dinero(c.pag)} · por cobrar ${dinero(c.cobrar)}` : ''; };
  return hoja({
    titulo: p ? 'Editar pago' : 'Registrar pago', listas: { __c: ops.map((c) => c.id) },
    campos: [
      { k: 'contrato', etiqueta: 'Contrato', tipo: 'lista', lista: '__c', obligatorio: true, valor: p ? p.id : contratoId || (ops[0] || {}).id || '' },
      { k: 'fecha', etiqueta: 'Fecha del pago', tipo: 'fecha', valor: p ? p.fecha.slice(0, 10) : diaHoy() },
      { k: 'monto', etiqueta: 'Monto pagado $', tipo: 'num', valor: p ? String(p.monto).replace('.', ',') : '' },
      { k: 'referencia', etiqueta: 'Referencia / nota', tipo: 'texto', valor: p ? p.nota : '' }
    ],
    nota: (x) => resumen(x.contrato), ok: p ? 'Guardar cambios' : 'Registrar pago',
    guardar: (x) => expAdmin('pago', { ...x, id: p ? p.dbId : null }),
    botonesExtra: p ? [{ texto: 'Anular pago', clase: 'peligro', onclick: async () => {
      if (!(await confirmar('Anular pago', `Se anula el pago de ${dinero(p.monto)} del ${fechaCorta((p.fecha || '').slice(0, 10))}. Queda en la auditoría.`, { si: 'Anular', peligro: true }))) return false;
      const r = await expAdmin('anularPago', { id: p.dbId, motivo: 'Anulado desde la app' });
      toast(r.message || (r.ok ? 'Anulado.' : 'No se pudo anular.'), 4000);
      return r.ok;
    } }] : []
  });
}

/** Días para la alerta de «salida sin guía». */
export async function configurarAlertaGuia(actual) {
  const r = await formulario('Alerta de guía', [{ etiqueta: 'Días sin guía del comprador para avisar', valor: String(actual ?? 3), inputmode: 'numeric' }],
    { ok: 'Guardar', detalle: 'Cuando una salida lleva este número de días sin guía del comprador, aparece como alerta en Reportes.',
      validar: async (v) => { const n = Number(v[0]); if (!Number.isInteger(n) || n < 0 || n > 365) return 'Escriba un número entero de 0 a 365.'; const x = await expAdmin('param', { clave: 'Dias Alerta Guia', valor: n }); return x.ok ? null : x.message; } });
  return !!r;
}
