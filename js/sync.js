// Sincronización con el Web App de Google Apps Script (misma hoja que usa la app Android).
import { db, syncCfg, configurado } from './store.js';
import { SUPA } from './config_supa.js';

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

const URL_VALIDA = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
/** Si el Web App avisa una dirección nueva (propiedad NUEVA_URL), este teléfono se pasa solo, una vez. */
function adoptarNuevaUrl(urlUsada, nueva) {
  try {
    if (typeof nueva !== 'string') return;
    nueva = nueva.trim();
    const actual = (db.get('sheets_url', '') || '').trim();
    if (!URL_VALIDA.test(nueva) || nueva === actual || urlUsada !== actual) return;
    db.set('sheets_url', nueva);
    db.set('sheets_url_anterior', actual);
    window.dispatchEvent(new CustomEvent('cajuelas-url', { detail: { de: actual, a: nueva } }));
  } catch { /* nada */ }
}

/** POST al Web App. Se manda como text/plain para evitar la consulta previa (CORS) que Apps Script no responde. */
/** Servidor nuevo (Supabase): una sola función «api» recibe la misma petición que antes recibía el Apps Script. */
export async function rpcSupa(fn, args, ms = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const resp = await fetch(`${SUPA.url}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPA.key },
      body: JSON.stringify(args)
    });
    const texto = await resp.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* no era JSON */ }
    return { http: resp.status, json };
  } catch (e) {
    return { http: 0, json: null, abort: e && e.name === 'AbortError' };
  } finally { clearTimeout(t); }
}
async function postSupa(payload, ms) {
  const ses = db.get('sesion', null) || {};
  const resto = { ...payload }; delete resto.token; delete resto.hash;
  const r = await rpcSupa('api', { p_token: ses.token || '', p: resto }, ms);
  if (!r.json) return { ok: false, sinRed: r.http === 0, json: null, message: r.http === 0 ? (r.abort ? 'El servidor tardó demasiado en responder.' : 'Sin conexión con el servidor.') : `Respuesta inesperada del servidor (HTTP ${r.http}).` };
  const j = r.json;
  if (j.sesionInvalida && ses.token) { try { db.del('sesion'); } catch { /* nada */ } window.dispatchEvent(new CustomEvent('cajuelas-sesion-invalida')); }
  if (j.success === true) return { ok: true, message: j.message || 'OK', json: j };
  return { ok: false, message: j.message || 'El servidor rechazó la petición.', json: j };
}

export async function postJson(url, payload, ms = 30000) {
  if (SUPA) return postSupa(payload, ms);
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
    if (json) adoptarNuevaUrl(url, json.nuevaUrl);
    if (resp.ok && json && json.success === true) return { ok: true, message: json.message || 'OK', json };
    return { ok: false, message: (json && json.message) || `Respuesta inesperada (HTTP ${resp.status}). Revise la URL del Web App y que esté publicada para «Cualquier persona».`, json };
  } catch (e) {
    const m = e && e.name === 'AbortError' ? 'La hoja tardó demasiado en responder.' : 'Sin conexión con Google (o la URL del Web App no es correcta).';
    return { ok: false, message: m, json: null, sinRed: true };
  } finally { clearTimeout(t); }
}

export async function probar() {
  const { url, token } = syncCfg();
  if (SUPA) { const r = await postJson(url, { action: 'ping' }); return r.ok ? 'Conexión correcta: ' + r.message : 'No se pudo conectar: ' + r.message; }
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
      if (!r.ok) { error = r.message; try { db.set('ultimo_error', { t: Date.now(), m: r.message }); } catch { /* nada */ } break; }
      const q2 = pendientes(); q2.shift(); db.set('pending_sends', q2);
      enviados++; avisar();
    }
  } finally { enVuelo = false; avisar(); }
  return { enviados, error, restantes: cuantosPendientes() };
}

export async function descargarCatalogo(device) {
  if (!configurado()) return { ok: false, message: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'catalogo', token, dispositivo: device });
  if (!r.ok) return { ok: false, message: r.message };
  const f = (k) => (Array.isArray(r.json[k]) ? r.json[k].map((x) => (Array.isArray(x) ? x.map((y) => (y == null ? '' : String(y))) : [])) : []);
  return {
    ok: true, message: r.message, estructura: f('estructura'), personas: f('personas'), beneficios: f('beneficios'),
    diario: f('diario'), bolFichas: f('boletosFichas'), bolOficinas: f('boletosOficinas'), bolDisp: f('boletosDispositivos'), config: r.json.config || null
  };
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v) => (v == null ? '' : String(v));

function mapRecibo(o, dia) {
  return {
    id: s(o.comprobante) + '|' + s(o.dispositivo) + '|' + dia, numero: s(o.comprobante), dia, emitido: s(o.fechaHora), cosecha: s(o.cosecha),
    beneficio: s(o.beneficio), receptora: s(o.receptora), sociedad: s(o.sociedad), compra: o.compra ? s(o.compra) : 'Interno',
    finca: s(o.finca), lote: s(o.lote), muestraTotal: n(o.muestraTotal), verdes: n(o.verdes), maduros: n(o.maduros), secos: n(o.secos),
    broca: n(o.broca), medidas: n(o.medidas), cajuelas: n(o.cajuelas), cuartillos: n(o.cuartillos), dispositivo: s(o.dispositivo), usuario: s(o.usuario),
    anulado: false, motivo: '', anuladoFecha: ''
  };
}
export async function recibosDelRango(desde, hasta) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.', lista: [] };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'recibosRango', token, desde, hasta });
  if (!r.ok) return { error: r.message, lista: [] };
  if (!Array.isArray(r.json.recibos)) return { error: 'El Apps Script no está actualizado (falta la acción recibosRango).', lista: [] };
  return { error: null, lista: r.json.recibos.map((o) => mapRecibo(o, s(o.dia))) };
}
export async function recibosDelDia(dia) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.', lista: [] };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'recibosDia', token, dia });
  if (!r.ok) return { error: r.message, lista: [] };
  const lista = (r.json.recibos || []).map((o) => mapRecibo(o, dia));
  return { error: null, lista };
}

/** Comprobantes de Registro de un día, de todos los dispositivos (líneas con el mismo formato que las locales). */
export async function registroDelDia(dia) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.', lista: [] };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'registroDia', token, dia });
  if (!r.ok) return { error: r.message, lista: [] };
  if (!Array.isArray(r.json.lineas)) return { error: 'El Apps Script no está actualizado (falta la acción registroDia).', lista: [] };
  const lista = r.json.lineas.map((o) => ({
    date: dia, comprobante: s(o.comprobante), dispositivo: s(o.dispositivo), emitido: s(o.fechaHora), cosecha: s(o.cosecha), sociedad: s(o.sociedad),
    finca: s(o.finca), personName: s(o.nombre), quantity: s(o.cantidad), price: n(o.precio), deduccion: n(o.deduccion), codigo: s(o.codigo),
    tarjeta: s(o.tarjeta), usuario: s(o.usuario), provisional: !!o.provisional, anulado: !!o.anulado, motivo: s(o.motivo), anuladoFecha: s(o.anuladoFecha)
  }));
  return { error: null, lista };
}

/** Filas de la hoja GENERAL del Google Sheet «Históricos» (últimas cosechas), para la pestaña Reportes. */
export async function historicos() {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'historicos', token, cuantas: 4 }, 60000);
  if (!r.ok) return { error: /inv[aá]lida|desconocid/i.test(r.message) ? r.message : r.message };
  if (!Array.isArray(r.json.filas)) return { error: 'El Apps Script no está actualizado (falta la acción historicos).' };
  return { error: null, filas: r.json.filas, cosechas: r.json.cosechas || [], usadas: r.json.usadas || [], actualizado: s(r.json.actualizado) };
}

/** Administración (solo administradores; el servidor lo valida): Exportaciones y Usuarios. Devuelve {ok, message, json}. */
export async function expAdmin(op, datos, extra = {}) { return postJson('', { action: 'expAdmin', op, datos, ...extra }, 30000); }
export async function usuariosAdmin(op, datos) { return postJson('', { action: 'usuariosAdmin', op, datos }, 30000); }
export async function personasAdmin(op, datos) { return postJson('', { action: 'personasAdmin', op, datos }, 60000); }
export async function cafeFruta(op, datos) { return postJson('', { action: 'cafeFruta', op, datos }, 60000); }
export async function preciosAdmin(op, datos) { return postJson('', { action: 'preciosAdmin', op, datos }, 30000); }

/** Hojas Resumen, Contratos, Entregas y Pagos del Google Sheet «Exportaciones» (ventas de exportación y consumo nacional). */
export async function exportaciones() {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'exportaciones', token }, 60000);
  if (!r.ok) return { error: r.message };
  if (!r.json.resumen || !Array.isArray(r.json.resumen.filas)) return { error: 'El Apps Script no está actualizado (falta la acción exportaciones).' };
  return { error: null, resumen: r.json.resumen, contratos: r.json.contratos, entregas: r.json.entregas, pagos: r.json.pagos, actualizado: s(r.json.actualizado), listas: r.json.listas || {}, diasAlertaGuia: Number.isFinite(Number(r.json.diasAlertaGuia)) ? Number(r.json.diasAlertaGuia) : 3 };
}

/** Pasa a Históricos el total de un día de Diario (una línea por sociedad + finca). Solo administradores (lo valida el servidor). */
export async function pasarAHistoricos({ fecha, soloVer = false, forzar = false }) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'pasarHistoricos', token, fecha, soloVer, forzar, usuario: (db.get('sesion', null) || {}).nombre || '', hash: (db.get('sesion', null) || {}).hash || '' }, 90000);
  if (!r.json && !r.ok) return { error: r.message };
  if (r.json && r.json.success === false) return { error: r.json.message || r.message };
  if (!r.json || typeof r.json.lineas !== 'number') return { error: 'El Apps Script no está actualizado (falta la acción pasarHistoricos).' };
  return { error: null, ...r.json };
}

/** Corrige el día de un comprobante emitido con fecha equivocada (solo administradores; lo valida y audita el servidor). */
export async function corregirFecha({ tipo, comprobante, dispositivo, diaActual, diaNuevo }) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const ses = db.get('sesion', null) || {};
  const r = await postJson(url, { action: 'corregirFecha', token, tipo, comprobante, dispositivo, diaActual, diaNuevo, usuario: ses.nombre || '', hash: ses.hash || '' }, 60000);
  if (r.ok) return { error: null };
  if (r.json && r.json.message) return { error: r.json.message };
  return { error: /desconocid|inv[aá]lid/i.test(r.message) ? r.message : 'El Apps Script no está actualizado (falta la acción corregirFecha). ' + r.message };
}

export async function movimientosBoletos(cosecha, hasta, normMedida) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.', lista: [] };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'boletosMovs', token, cosecha, hasta });
  if (!r.ok) return { error: r.message, lista: [] };
  const lista = (r.json.movimientos || []).map((o) => ({
    id: s(o.comprobante) + '|' + s(o.dispositivo) + '|' + s(o.dia), numero: s(o.comprobante), dia: s(o.dia), emitido: s(o.fechaHora),
    cosecha: s(o.cosecha), sociedad: s(o.sociedad), oficina: s(o.oficina), dispositivo: s(o.dispositivo), para: s(o.destino), usuario: s(o.usuario), tipo: s(o.tipo),
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

// ---------- Planillas ----------
const sesionActual = () => db.get('sesion', null) || {};
const credenciales = () => { const s = sesionActual(); return { usuario: s.nombre || '', hash: s.hash || '' }; };
/** Empleados del usuario (sin salarios), tareas por finca y lo registrado entre dos fechas. */
export async function planillaDatos(desde, hasta) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'planillaDatos', token, desde, hasta, ...credenciales() }, 45000);
  if (!r.ok) return { error: /desconocid/i.test(r.message) ? 'El Apps Script no está actualizado (falta la acción planillaDatos).' : r.message };
  return { error: null, ...r.json };
}
export async function planillaAnular({ dia, sociedad, finca, motivo }) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'planillaAnular', token, dia, sociedad, finca, motivo, ...credenciales() }, 45000);
  return r.ok ? { error: null } : { error: (r.json && r.json.message) || r.message };
}
export async function planillaMontos(desde, hasta) {
  if (!configurado()) return { error: 'Falta configurar la URL y el token en Ajustes > Administración.' };
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'planillaMontos', token, desde, hasta, ...credenciales() }, 60000);
  return r.ok ? { error: null, filas: r.json.filas || [] } : { error: (r.json && r.json.message) || r.message };
}
/** Arma el envío de un día de planilla para la cola de pendientes. */
export function payloadPlanilla({ reportId, dia, sociedad, finca, empleados }) {
  return { formato: 'planilla', reportId, dia, sociedad, finca, empleados, ...credenciales() };
}
