// Usuarios y permisos. La lista viene de la hoja «Usuarios» de Google Sheets (con el PIN ya convertido en huella
// por el Web App) y se guarda en el dispositivo para poder entrar sin conexión.
import { h, clear } from './util.js';
import { db, syncCfg, configurado } from './store.js';
import { postJson, rpcSupa } from './sync.js';
import { SUPA } from './config_supa.js';

export const ROLES = {
  'Administrador': ['registro', 'diario', 'boletos', 'anular', 'reimprimir', 'resumenes', 'precios', 'config', 'provisional', 'reportes', 'planillas', 'todos'],
  'Recibidor de Café': ['diario', 'reimprimir', 'resumenes'],
  'Encargado de boletos': ['boletos', 'reimprimir', 'resumenes'],
  'Digitador de registro': ['registro', 'reimprimir', 'resumenes'],
  'Encargado de planillas': ['planillas']
};
const HORAS_SESION = 12;
const oyentes = new Set();
export const alCambiarSesion = (f) => oyentes.add(f);
const avisar = () => oyentes.forEach((f) => { try { f(); } catch { /* nada */ } });

const enc = new TextEncoder();
export async function huella(nombre, pin) {
  const b = await crypto.subtle.digest('SHA-256', enc.encode(`${String(nombre).trim().toLowerCase()}|${String(pin).trim()}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const lista = () => db.get('users_list', null);          // null = nunca se ha recibido
/** Hay control de acceso solo si la hoja tiene al menos un usuario activo. */
export const hayControl = () => { if (SUPA) return true; const l = lista(); return Array.isArray(l) && l.length > 0; };

function entrada(nombre) {
  const l = lista() || [];
  return l.find((u) => u.nombre.toLowerCase() === String(nombre).toLowerCase()) || null;
}
export function sesion() {
  if (!hayControl()) return null;
  const s = db.get('sesion', null);
  if (!s) return null;
  if (Date.now() - s.t > HORAS_SESION * 3600000) { db.del('sesion'); return null; }
  if (SUPA) {
    const p = s.perfil;
    if (!p || !p.nombre) { db.del('sesion'); return null; }
    return { nombre: p.nombre, rol: p.rol || '', permisos: permisosDe(p), barra: p.barra || [], bloquear: !!p.bloquear, hash: '' };
  }
  const u = entrada(s.nombre);
  if (!u || u.hash !== s.hash) { db.del('sesion'); return null; }
  return { nombre: u.nombre, rol: u.rol, permisos: permisosDe(u), barra: u.barra || [], bloquear: !!u.bloquear, hash: u.hash };
}
export function permisosDe(u) {
  const extra = (u.permisos || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  return new Set(extra.length ? extra : (ROLES[u.rol] || []));
}
/** ¿Puede hacer esto? Sin control de acceso (hoja sin usuarios) todo está permitido. */
export function puede(clave) {
  if (!hayControl()) return true;
  const s = sesion();
  return !!s && (s.permisos.has(clave) || s.permisos.has('todo') || s.permisos.has('todos'));
}
export const barraDeUsuario = () => { const s = sesion(); return s ? { barra: s.barra || [], bloquear: !!s.bloquear } : { barra: [], bloquear: false }; };
export const nombreUsuario = () => { const s = sesion(); return s ? s.nombre : ''; };
export const necesitaLogin = () => hayControl() && !sesion();

let bloqueo = 0, fallos = 0;
const llaveVerif = (n) => 'verif_' + String(n).trim().toLowerCase();
async function verificador(nombre, hash) {
  let sal = db.get('device_auto', '');
  if (!sal) { sal = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, '0')).join(''); db.set('device_auto', sal); }
  const b = await crypto.subtle.digest('SHA-256', enc.encode(`v|${sal}|${String(nombre).trim().toLowerCase()}|${hash}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** Cambia el PIN del usuario que tiene la sesión abierta. Devuelve null si salió bien o el texto del error. */
export async function cambiarPin(actual, nuevo) {
  const ses = db.get('sesion', null);
  if (!ses || !ses.nombre) return 'No hay una sesión abierta.';
  if (!/^\d{4,12}$/.test(String(nuevo))) return 'El PIN nuevo debe tener de 4 a 12 números.';
  if (String(nuevo) === String(actual)) return 'El PIN nuevo debe ser distinto al actual.';
  const hA = await huella(ses.nombre, actual), hN = await huella(ses.nombre, nuevo);
  const r = await postJson('', { action: 'cambiarPin', actual: hA, nuevo: hN }, 20000);
  if (!r.ok) return r.message || 'No se pudo cambiar el PIN.';
  db.set(llaveVerif(ses.nombre), { v: await verificador(ses.nombre, hN), perfil: ses.perfil });
  return null;
}
/** Entrada con el servidor nuevo: el PIN se verifica en el servidor. Sin Internet solo entra quien ya entró antes en este teléfono. */
async function entrarSupa(nombre, pin) {
  const nom = String(nombre).trim();
  const h = await huella(nom, pin);
  const r = await rpcSupa('login', { p_nombre: nom, p_hash: h, p_dispositivo: db.get('device_name', '') || db.get('device_auto', '') }, 20000);
  if (r.json && r.json.success === true) {
    const perfil = r.json.usuario;
    db.set('sesion', { nombre: perfil.nombre, token: r.json.token, perfil, t: Date.now() });
    db.set(llaveVerif(nom), { v: await verificador(nom, h), perfil });
    fallos = 0; avisar();
    return { ok: true };
  }
  if (r.json && r.json.espera) return { ok: false, espera: r.json.espera };
  if (r.json && r.json.success === false) return { ok: false };
  // sin conexión: solo con verificador guardado en este teléfono
  const g = db.get(llaveVerif(nom), null);
  if (g && g.v === (await verificador(nom, h))) {
    const previa = db.get('sesion', null);
    db.set('sesion', { nombre: g.perfil.nombre, token: previa && previa.nombre === g.perfil.nombre ? previa.token : '', perfil: g.perfil, t: Date.now() });
    avisar();
    return { ok: true };
  }
  return { ok: false, sinRed: true };
}
export async function entrar(nombre, pin) {
  if (SUPA) return entrarSupa(nombre, pin);
  if (Date.now() < bloqueo) return { ok: false, espera: Math.ceil((bloqueo - Date.now()) / 1000) };
  const u = entrada(nombre);
  const ok = !!u && (await huella(u.nombre, pin)) === u.hash;
  if (!ok) { fallos++; if (fallos >= 5) { fallos = 0; bloqueo = Date.now() + 30000; } return { ok: false }; }
  fallos = 0;
  db.set('sesion', { nombre: u.nombre, hash: u.hash, t: Date.now() });
  avisar();
  return { ok: true };
}
export function salir() { db.del('sesion'); try { sessionStorage.removeItem('cajuelas.conservar'); } catch { /* nada */ } avisar(); location.reload(); }

let ultima = 0;
export async function actualizarUsuarios(forzar = false) {
  if (!configurado()) return { ok: false, message: 'Sin configurar' };
  if (!forzar && Date.now() - ultima < 120000) return { ok: true, saltado: true };
  ultima = Date.now();
  if (SUPA) {
    const r0 = await rpcSupa('lista_usuarios', {}, 20000);
    if (!Array.isArray(r0.json)) return { ok: false, message: 'Sin conexión con el servidor.' };
    const nuevaS = r0.json.filter((u) => u && u.nombre).map((u) => ({ nombre: String(u.nombre).trim() }));
    const antesS = JSON.stringify(lista());
    db.set('users_list', nuevaS);
    if (JSON.stringify(nuevaS) !== antesS) avisar();
    return { ok: true };
  }
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'usuarios', token }, 20000);
  if (!r.ok) return { ok: false, message: r.message };
  if (!Array.isArray(r.json.usuarios)) return { ok: false, message: 'Esta versión del Web App no entrega usuarios. Actualice el Apps Script.' };
  const nueva = r.json.usuarios.filter((u) => u && u.nombre && u.hash).map((u) => ({
    nombre: String(u.nombre).trim(), hash: String(u.hash), rol: String(u.rol || '').trim(), permisos: Array.isArray(u.permisos) ? u.permisos : [],
    barra: Array.isArray(u.barra) ? u.barra.map((x) => String(x).trim()).filter(Boolean) : [], bloquear: u.bloquear === true
  }));
  const antes = JSON.stringify(lista());
  db.set('users_list', nueva);
  if (JSON.stringify(nueva) !== antes) avisar();
  return { ok: true };
}

// ---------- Pantalla de entrada ----------
let velo = null;
export function pantallaLogin() {
  if (velo) return;
  const lblEstado = h('p', { class: 'nota' });
  const selUsuario = h('select', { class: 'campo', 'aria-label': 'Usuario' });
  const pin = h('input', { class: 'campo', type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'PIN', maxlength: '12' });
  const cuerpo = h('div', { class: 'login-caja' });
  velo = h('div', { id: 'login' }, cuerpo);
  document.body.append(velo);
  document.body.classList.add('sin-scroll');
  const pintar = () => {
    clear(cuerpo);
    const l = lista();
    cuerpo.append(h('h1', null, 'Registro de Cajuelas'));
    if (!l || !l.length) {
      cuerpo.append(h('p', { class: 'nota' }, 'Todavía no se ha recibido la lista de usuarios. Conéctese a Internet y toque «Reintentar».'), lblEstado,
        h('button', { type: 'button', class: 'btn-texto primario', onclick: reintentar }, 'Reintentar'));
      return;
    }
    clear(selUsuario);
    selUsuario.append(h('option', { value: '' }, 'Seleccione su usuario'), ...l.map((u) => h('option', { value: u.nombre }, u.nombre)));
    pin.value = '';
    cuerpo.append(h('p', { class: 'nota' }, 'Elija su usuario e ingrese su PIN.'), selUsuario, pin, lblEstado,
      h('button', { type: 'button', class: 'btn-texto primario', onclick: ingresar }, 'Entrar'),
      h('button', { type: 'button', class: 'btn-texto', onclick: reintentar }, 'Actualizar lista de usuarios'));
  };
  async function reintentar() {
    lblEstado.textContent = 'Buscando…';
    const r = await actualizarUsuarios(true);
    lblEstado.textContent = r.ok ? '' : r.message;
    pintar();
    if (!hayControl()) cerrarLogin();
  }
  async function ingresar() {
    if (!selUsuario.value) { lblEstado.textContent = 'Seleccione su usuario.'; return; }
    const r = await entrar(selUsuario.value, pin.value);
    if (r.ok) return;
    lblEstado.textContent = r.espera ? `Demasiados intentos. Espere ${Math.ceil(r.espera / 60)} min.` : (r.sinRed ? 'Sin conexión: solo pueden entrar sin Internet quienes ya entraron antes en este teléfono.' : 'Usuario o PIN incorrecto.');
    pin.value = '';
  }
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') ingresar(); });
  pintar();
  if (SUPA && !(lista() || []).length) reintentar();
}
export function cerrarLogin() {
  if (!velo) return;
  velo.remove(); velo = null;
  document.body.classList.remove('sin-scroll');
}
