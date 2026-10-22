// Sincronización con el Web App de Google Apps Script (misma hoja que usa la app Android).
import { db, syncCfg, configurado } from './store.js';

let enVuelo = false;
const oyentes = new Set();
export const alCambiarPendientes = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
const avisar = () => oyentes.forEach((f) => { try { f(); } catch { /* nada */ } });

export const pendientes = () => db.get('pending_sends', []);
export const cuantosPendientes = () => pendientes().length;
export function encolar(payload) {
  const q = pendientes(); q.push(payload); db.set('pending_sends', q); avisar();
  enviarPendientes();
}
export function descartarPendientes() { db.set('pending_sends', []); avisar(); }

/** POST al Web App. Se manda como text/plain para evitar la consulta previa (CORS) que Apps Script no responde. */
export async function postJson(url, payload, ms = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const resp = await fetch(url, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const texto = await resp.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* no era JSON */ }
    if (resp.ok && json && json.success === true) return { ok: true, message: json.message || 'OK', json };
    return { ok: false, message: (json && json.message) || `Respuesta inesperada (HTTP ${resp.status}). Revise la URL del Web App y que esté publicada para «Cualquier persona».`, json };
  } catch (e) {
    const m = e && e.name === 'AbortError' ? 'La hoja tardó demasiado en responder.' : 'Sin conexión con Google (o la URL del Web App no es correcta).';
    return { ok: false, message: m, json: null, sinRed: true };
  } finally { clearTimeout(t); }
}

export async function probar() {
  const { url, token } = syncCfg();
  if (!url.startsWith('https://script.google.com/')) return 'La URL debe empezar con https://script.google.com/ y terminar en /exec.';
  if (!token.trim()) return 'Escriba el token secreto.';
  const r = await postJson(url, { action: 'ping', token });
  return r.ok ? 'Conexión correcta: ' + r.message : 'No se pudo conectar: ' + r.message;
}

/** Envía en orden los pendientes. Se detiene en el primer fallo y conserva lo que no se envió. */
export async function enviarPendientes() {
  if (!configurado() || enVuelo || !navigator.onLine) return { enviados: 0, error: null, restantes: cuantosPendientes(), ocupado: enVuelo };
  enVuelo = true;
  const { url, token } = syncCfg();
  let enviados = 0, error = null;
  try {
    for (;;) {
      const q = pendientes();
      if (!q.length) break;
      const r = await postJson(url, { ...q[0], token });
      if (!r.ok) { error = r.message; break; }
      const q2 = pendientes(); q2.shift(); db.set('pending_sends', q2);
      enviados++; avisar();
    }
  } finally { enVuelo = false; avisar(); }
  return { enviados, error, restantes: cuantosPendientes() };
}

export async function descargarCatalogo(device) {
  if (!configurado()) return { ok: false, message: 'Falta configurar la URL y el token en Ajustes > Sincronización.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'catalogo', token, dispositivo: device });
  if (!r.ok) return { ok: false, message: r.message };
  const f = (k) => (Array.isArray(r.json[k]) ? r.json[k].map((x) => (Array.isArray(x) ? x.map((y) => (y == null ? '' : String(y))) : [])) : []);
  return {
    ok: true, message: r.message, estructura: f('estructura'), personas: f('personas'), beneficios: f('beneficios'),
    diario: f('diario'), bolFichas: f('boletosFichas'), bolOficinas: f('boletosOficinas')
  };
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v) => (v == null ? '' : String(v));

export async function recibosDelDia(dia) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Sincronización.', lista: [] };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'recibosDia', token, dia });
  if (!r.ok) return { error: r.message, lista: [] };
  const lista = (r.json.recibos || []).map((o) => ({
    id: s(o.comprobante) + '|' + s(o.dispositivo), numero: s(o.comprobante), dia, emitido: s(o.fechaHora), cosecha: s(o.cosecha),
    beneficio: s(o.beneficio), receptora: s(o.receptora), sociedad: s(o.sociedad), compra: o.compra ? s(o.compra) : 'Interno',
    finca: s(o.finca), lote: s(o.lote), muestraTotal: n(o.muestraTotal), verdes: n(o.verdes), maduros: n(o.maduros), secos: n(o.secos),
    broca: n(o.broca), medidas: n(o.medidas), cajuelas: n(o.cajuelas), cuartillos: n(o.cuartillos), dispositivo: s(o.dispositivo), usuario: s(o.usuario),
    anulado: false, motivo: '', anuladoFecha: ''
  }));
  return { error: null, lista };
}

export async function movimientosBoletos(cosecha, hasta, normMedida) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Sincronización.', lista: [] };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'boletosMovs', token, cosecha, hasta });
  if (!r.ok) return { error: r.message, lista: [] };
  const lista = (r.json.movimientos || []).map((o) => ({
    id: s(o.comprobante) + '|' + s(o.dispositivo) + '|' + s(o.dia), numero: s(o.comprobante), dia: s(o.dia), emitido: s(o.fechaHora),
    cosecha: s(o.cosecha), sociedad: s(o.sociedad), oficina: s(o.oficina), dispositivo: s(o.dispositivo), usuario: s(o.usuario), tipo: s(o.tipo),
    lineas: (o.lineas || []).map((l) => ({ color: s(l.ficha), medida: normMedida(s(l.medida)), cantidad: parseInt(l.cantidad, 10) || 0 })),
    nota: s(o.motivo), anulado: false, motivoAnul: '', anuladoFecha: ''
  }));
  return { error: null, lista };
}

// Reintentos: al abrir, al volver a la app, al recuperar la conexión y cada 30 segundos con la app abierta.
export function iniciarReintentos() {
  const intentar = () => { if (cuantosPendientes()) enviarPendientes(); };
  window.addEventListener('online', intentar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') intentar(); });
  setInterval(intentar, 30000);
  intentar();
}
