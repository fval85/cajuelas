// Usuarios y permisos. La lista viene de la hoja «Usuarios» de Google Sheets (con el PIN ya convertido en huella
// por el Web App) y se guarda en el dispositivo para poder entrar sin conexión.
import { h, clear } from './util.js';
import { db, syncCfg, configurado } from './store.js';
import { postJson } from './sync.js';

export const ROLES = {
  'Administrador': ['registro', 'diario', 'boletos', 'anular', 'reimprimir', 'resumenes', 'precios', 'config', 'todos'],
  'Recibidor de Café': ['diario', 'reimprimir', 'resumenes'],
  'Encargado de boletos': ['boletos', 'reimprimir', 'resumenes'],
  'Digitador de registro': ['registro', 'reimprimir']
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
export const hayControl = () => { const l = lista(); return Array.isArray(l) && l.length > 0; };

function entrada(nombre) {
  const l = lista() || [];
  return l.find((u) => u.nombre.toLowerCase() === String(nombre).toLowerCase()) || null;
}
export function sesion() {
  if (!hayControl()) return null;
  const s = db.get('sesion', null);
  if (!s) return null;
  if (Date.now() - s.t > HORAS_SESION * 3600000) { db.del('sesion'); return null; }
  const u = entrada(s.nombre);
  if (!u || u.hash !== s.hash) { db.del('sesion'); return null; }
  return { nombre: u.nombre, rol: u.rol, permisos: permisosDe(u) };
}
export function permisosDe(u) {
  const extra = (u.permisos || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  return new Set(extra.length ? extra : (ROLES[u.rol] || []));
}
/** ¿Puede hacer esto? Sin control de acceso (hoja sin usuarios) todo está permitido. */
export function puede(clave) {
  if (!hayControl()) return true;
  const s = sesion();
  return !!s && (s.permisos.has(clave) || s.permisos.has('todo'));
}
export const nombreUsuario = () => { const s = sesion(); return s ? s.nombre : ''; };
export const necesitaLogin = () => hayControl() && !sesion();

let bloqueo = 0, fallos = 0;
export async function entrar(nombre, pin) {
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
  const { url, token } = syncCfg();
  const r = await postJson(url, { action: 'usuarios', token }, 20000);
  if (!r.ok) return { ok: false, message: r.message };
  if (!Array.isArray(r.json.usuarios)) return { ok: false, message: 'Esta versión del Web App no entrega usuarios. Actualice el Apps Script.' };
  const nueva = r.json.usuarios.filter((u) => u && u.nombre && u.hash).map((u) => ({
    nombre: String(u.nombre).trim(), hash: String(u.hash), rol: String(u.rol || '').trim(), permisos: Array.isArray(u.permisos) ? u.permisos : []
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
    lblEstado.textContent = r.espera ? `Demasiados intentos. Espere ${r.espera} s.` : 'PIN incorrecto.';
    pin.value = '';
  }
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') ingresar(); });
  pintar();
}
export function cerrarLogin() {
  if (!velo) return;
  velo.remove(); velo = null;
  document.body.classList.remove('sin-scroll');
}
