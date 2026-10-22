// Almacenamiento local (localStorage) y catálogos. Todo vive en el navegador de este dispositivo.
import { normalizar, soloDigitos, toast } from './util.js';

const P = 'cajuelas.';
export const db = {
  get(k, d) {
    try { const v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(P + k, JSON.stringify(v)); return true; }
    catch { toast('⚠ No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado).', 6000); return false; }
  },
  del(k) { try { localStorage.removeItem(P + k); } catch { /* nada */ } },
  todo() {
    const o = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(P)) o[k.slice(P.length)] = JSON.parse(localStorage.getItem(k)); } } catch { /* nada */ }
    return o;
  },
  reemplazarTodo(o) {
    try {
      const claves = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(P)) claves.push(k); }
      claves.forEach((k) => localStorage.removeItem(k));
      Object.entries(o).forEach(([k, v]) => localStorage.setItem(P + k, JSON.stringify(v)));
      return true;
    } catch { return false; }
  }
};

export async function pedirAlmacenamientoPersistente() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* nada */ }
  return false;
}

// ---------- Ajustes generales ----------
export const TIPO_INTERNO = 'Interno';
export const TIPO_EXTERNO = 'Externo';
export const normalizarTipo = (t) => (normalizar(t).startsWith('ext') ? TIPO_EXTERNO : TIPO_INTERNO);

export function syncCfg() {
  return { url: db.get('sheets_url', ''), token: db.get('sheets_token', ''), device: db.get('device_name', '') };
}
export function guardarSyncCfg(url, token, device) {
  db.set('sheets_url', url.trim()); db.set('sheets_token', token.trim()); db.set('device_name', device.trim());
}
export function configurado() {
  const { url, token } = syncCfg();
  return url.startsWith('https://script.google.com/') && token.trim() !== '';
}
export function deviceName() {
  const n = syncCfg().device;
  if (n) return n;
  let id = db.get('device_auto', '');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(3))).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    db.set('device_auto', id);
  }
  return 'WEB-' + id;
}

// ---------- Catálogo de Registro y Diario ----------
export const cat = { cosechas: [], precios: [], remoto: false, diarioRemoto: false, actualizado: 0 };

function ordenar() {
  const k = (s) => normalizar(s);
  cat.cosechas.sort((a, b) => k(a.nombre).localeCompare(k(b.nombre)));
  cat.cosechas.forEach((c) => {
    c.sociedades.sort((a, b) => k(a.nombre).localeCompare(k(b.nombre)));
    c.diarioSociedades.sort((a, b) => k(a.nombre).localeCompare(k(b.nombre)));
    c.diarioBeneficios.sort((a, b) => k(a).localeCompare(k(b)));
    [...c.sociedades, ...c.diarioSociedades].forEach((s) => {
      s.fincas.sort((a, b) => k(a).localeCompare(k(b)));
      Object.values(s.lotes).forEach((l) => l.sort((a, b) => k(a).localeCompare(k(b))));
      s.personas.sort((a, b) => k(a.nombre).localeCompare(k(b.nombre)));
    });
  });
  cat.precios.sort((a, b) => a - b);
}

export function cargarCatalogo() {
  cat.cosechas = db.get('catalog_cosechas', []);
  cat.precios = db.get('catalog_precios', []);
  cat.remoto = db.get('catalog_remote', false);
  cat.diarioRemoto = db.get('catalog_diario_remote', false);
  cat.actualizado = db.get('catalog_updated', 0);
  cat.cosechas.forEach((c) => {
    c.sociedades = c.sociedades || []; c.diarioSociedades = c.diarioSociedades || []; c.diarioBeneficios = c.diarioBeneficios || [];
    c.diarioReceptora = c.diarioReceptora || '';
  });
  ordenar();
}
export function guardarPrecios() { ordenar(); db.set('catalog_precios', cat.precios); }
function guardarCatalogo() {
  ordenar();
  db.set('catalog_cosechas', cat.cosechas);
  db.set('catalog_remote', cat.remoto);
  db.set('catalog_diario_remote', cat.diarioRemoto);
  db.set('catalog_updated', cat.actualizado);
}

export const findCosecha = (n) => cat.cosechas.find((c) => normalizar(c.nombre) === normalizar(n)) || null;
export const findSociedad = (co, n) => (co ? co.sociedades.find((s) => normalizar(s.nombre) === normalizar(n)) || null : null);
export const findDiarioSociedad = (co, n) => (co ? co.diarioSociedades.find((s) => normalizar(s.nombre) === normalizar(n)) || null : null);
export const findPersona = (s, n) => (s ? s.personas.find((p) => normalizar(p.nombre) === normalizar(n)) || null : null);
export const cosechaDeSociedad = (soc) => {
  const c = cat.cosechas.find((x) => findSociedad(x, soc));
  return c ? c.nombre : '';
};

/** Reemplaza el catálogo con lo recibido de la hoja (misma lógica de la app Android). */
export function reemplazarDesdeHoja(estructura, personas, beneficios = [], diario = []) {
  const c = (r, i) => String(r[i] ?? '').replace(/\s+/g, ' ').trim();
  const nuevas = [];
  const cosechaDe = (n) => {
    let x = nuevas.find((k) => normalizar(k.nombre) === normalizar(n));
    if (!x) { x = { nombre: n, sociedades: [], diarioReceptora: '', diarioSociedades: [], diarioBeneficios: [] }; nuevas.push(x); }
    return x;
  };
  const nuevaSoc = (n) => ({ nombre: n, tipo: TIPO_INTERNO, fincas: [], lotes: {}, personas: [] });
  const sociedadDe = (co, n) => {
    let s = findSociedad(co, n);
    if (!s) { s = nuevaSoc(n); co.sociedades.push(s); }
    return s;
  };
  const fincaDe = (s, f) => {
    let x = s.fincas.find((k) => normalizar(k) === normalizar(f));
    if (!x) { x = f; s.fincas.push(f); }
    return x;
  };
  const lotesDe = (s, f) => (s.lotes[f] = s.lotes[f] || []);
  let omitidas = 0;
  for (const r of estructura) {
    const co = c(r, 0), so = c(r, 1), fi = c(r, 2), lo = c(r, 3);
    if (!co || !so) { if ([co, so, fi, lo].some(Boolean)) omitidas++; continue; }
    const s = sociedadDe(cosechaDe(co), so);
    if (!fi) { if (lo) omitidas++; continue; }
    const finca = fincaDe(s, fi);
    if (lo) { const l = lotesDe(s, finca); if (!l.some((x) => normalizar(x) === normalizar(lo))) l.push(lo); }
  }
  let repetidas = 0, tarjetaRara = 0, codigoRepetido = 0;
  for (const r of personas) {
    const co = c(r, 0), so = c(r, 1), nombre = c(r, 2);
    if (!co || !so || !nombre) { if ([co, so, nombre, c(r, 3), c(r, 4), c(r, 5)].some(Boolean)) omitidas++; continue; }
    const s = sociedadDe(cosechaDe(co), so);
    if (findPersona(s, nombre)) { repetidas++; continue; }
    let codigo = c(r, 3);
    if (codigo && s.personas.some((p) => normalizar(p.codigo) === normalizar(codigo))) { codigo = ''; codigoRepetido++; }
    const tarjeta = soloDigitos(c(r, 4));
    if (tarjeta && (tarjeta.length < 13 || tarjeta.length > 19)) tarjetaRara++;
    const ded = Number(c(r, 5).replace('₡', '').replace(/ /g, '').replace(',', '.'));
    s.personas.push({ nombre, codigo, tarjeta, deduccion: Number.isFinite(ded) && ded > 0 ? ded : 0 });
  }
  if (!estructura.length && !personas.length) {
    for (const v of cat.cosechas) { const n = cosechaDe(v.nombre); n.sociedades = v.sociedades; }
  }
  const diarioDeLaHoja = beneficios.length > 0 || diario.length > 0;
  if (diarioDeLaHoja) {
    for (const r of beneficios) {
      const co = c(r, 0), ben = c(r, 1), rec = c(r, 2);
      if (!co) continue;
      const cos = cosechaDe(co);
      if (ben && !cos.diarioBeneficios.some((x) => normalizar(x) === normalizar(ben))) cos.diarioBeneficios.push(ben);
      if (rec && !cos.diarioReceptora) cos.diarioReceptora = rec;
    }
    for (const r of diario) {
      const co = c(r, 0), so = c(r, 1), tipo = c(r, 2), fi = c(r, 3), lo = c(r, 4);
      if (!co || !so) { if ([co, so, tipo, fi, lo].some(Boolean)) omitidas++; continue; }
      const cos = cosechaDe(co);
      let s = findDiarioSociedad(cos, so);
      if (!s) { s = nuevaSoc(so); s.tipo = normalizarTipo(tipo); cos.diarioSociedades.push(s); }
      if (!fi) continue;
      const finca = fincaDe(s, fi);
      if (lo) { const l = lotesDe(s, finca); if (!l.some((x) => normalizar(x) === normalizar(lo))) l.push(lo); }
    }
  } else {
    for (const n of nuevas) {
      const vieja = findCosecha(n.nombre);
      if (vieja) { n.diarioReceptora = vieja.diarioReceptora; n.diarioSociedades = vieja.diarioSociedades; n.diarioBeneficios = vieja.diarioBeneficios; }
    }
  }
  const antes = JSON.stringify(cat.cosechas);
  cat.cosechas = nuevas;
  ordenar();
  const cambio = antes !== JSON.stringify(cat.cosechas);
  cat.actualizado = Date.now();
  cat.remoto = true;
  if (diarioDeLaHoja) cat.diarioRemoto = true;
  guardarCatalogo();
  const socs = cat.cosechas.flatMap((x) => x.sociedades);
  const suma = (a, f) => a.reduce((t, x) => t + f(x), 0);
  let texto = `Cosechas: ${cat.cosechas.length}\nSociedades: ${socs.length}\nFincas: ${suma(socs, (s) => s.fincas.length)}\n`;
  texto += `Lotes: ${suma(socs, (s) => suma(Object.values(s.lotes), (l) => l.length))}\nPersonas: ${suma(socs, (s) => s.personas.length)}`;
  if (diarioDeLaHoja) {
    const ds = cat.cosechas.flatMap((x) => x.diarioSociedades);
    texto += `\n\nDiario: ${suma(cat.cosechas, (x) => x.diarioBeneficios.length)} beneficios · ${ds.length} sociedades de recibos · ${suma(ds, (s) => s.fincas.length)} fincas · ${suma(ds, (s) => suma(Object.values(s.lotes), (l) => l.length))} cortes/lotes`;
  }
  if (repetidas) texto += `\n\nPersonas repetidas omitidas: ${repetidas}`;
  if (codigoRepetido) texto += `\nCódigos repetidos dejados en blanco: ${codigoRepetido}`;
  if (tarjetaRara) texto += `\nTarjetas con una cantidad de dígitos poco común: ${tarjetaRara}`;
  if (omitidas) texto += `\nFilas incompletas omitidas: ${omitidas}`;
  return { cambio, texto };
}

// ---------- Catálogo de Boletos ----------
export const MED_CAJ = 'CAJ', MED_MEDIA = '1/2', MED_CUARTO = '1/4';
export function normalizarMedida(texto) {
  const t = normalizar(texto).replace(/ /g, '');
  if (t.includes('½') || t.includes('1/2') || t === '0.5' || t === '0,5' || t.startsWith('med')) return MED_MEDIA;
  if (t.includes('¼') || t.includes('1/4') || t === '0.25' || t === '0,25' || t.startsWith('cuart')) return MED_CUARTO;
  return MED_CAJ;
}
export const valorCajuelas = (m) => (m === MED_MEDIA ? 0.5 : m === MED_CUARTO ? 0.25 : 1);
export const fichaKey = (color, medida) => normalizar(color).replace(/\s+/g, ' ') + '|' + medida;

export const bol = { cosechas: [], remoto: false };
export function cargarBoletosCat() { bol.cosechas = db.get('catalog_boletos', []); bol.remoto = db.get('boletos_remote', false); }
export function bolCosecha(nombre, crear = false) {
  if (!nombre || !nombre.trim()) return null;
  let c = bol.cosechas.find((x) => normalizar(x.nombre) === normalizar(nombre));
  if (!c && crear) { c = { nombre, oficinas: [], sociedades: [] }; bol.cosechas.push(c); }
  return c || null;
}
export const bolSociedad = (c, n) => (c ? c.sociedades.find((s) => normalizar(s.nombre) === normalizar(n)) || null : null);

export function reemplazarBoletosDesdeHoja(fichas, oficinas) {
  const c = (r, i) => String(r[i] ?? '').trim();
  bol.cosechas = [];
  let omitidas = 0;
  for (const r of fichas) {
    const co = c(r, 0), so = c(r, 1), color = c(r, 2);
    if (!co || !so || !color) { if (r.some((x) => String(x ?? '').trim())) omitidas++; continue; }
    const cos = bolCosecha(co, true);
    let soc = bolSociedad(cos, so);
    if (!soc) { soc = { nombre: so, fichas: [] }; cos.sociedades.push(soc); }
    const medida = normalizarMedida(c(r, 3));
    if (soc.fichas.some((f) => fichaKey(f.color, f.medida) === fichaKey(color, medida))) { omitidas++; continue; }
    const inv = parseInt(c(r, 4).replace(/[.,]/g, ''), 10);
    soc.fichas.push({ color, medida, inventario: Number.isFinite(inv) ? inv : 0 });
  }
  for (const r of oficinas) {
    const co = c(r, 0), of = c(r, 1);
    if (!co || !of) { if (r.some((x) => String(x ?? '').trim())) omitidas++; continue; }
    const cos = bolCosecha(co, true);
    if (!cos.oficinas.some((x) => normalizar(x) === normalizar(of))) cos.oficinas.push(of);
  }
  bol.cosechas.forEach((cs) => {
    cs.oficinas.sort((a, b) => normalizar(a).localeCompare(normalizar(b)));
    cs.sociedades.sort((a, b) => normalizar(a.nombre).localeCompare(normalizar(b.nombre)));
  });
  bol.remoto = true;
  db.set('catalog_boletos', bol.cosechas); db.set('boletos_remote', true);
  const suma = (a, f) => a.reduce((t, x) => t + f(x), 0);
  let t = `Boletos: ${suma(bol.cosechas, (x) => x.sociedades.length)} sociedades · ${suma(bol.cosechas, (x) => suma(x.sociedades, (s) => s.fichas.length))} fichas · ${suma(bol.cosechas, (x) => x.oficinas.length)} oficinas`;
  if (omitidas) t += `\nFilas de Boletos omitidas (incompletas o repetidas): ${omitidas}`;
  return t;
}

// ---------- Cosecha activa (la usan Registro, Diario y Boletos) ----------
export function todasLasCosechas() {
  const nombres = [];
  const add = (n) => { if (n && !nombres.some((x) => normalizar(x) === normalizar(n))) nombres.push(n); };
  cat.cosechas.forEach((c) => add(c.nombre));
  bol.cosechas.forEach((c) => add(c.nombre));
  return nombres.sort((a, b) => normalizar(a).localeCompare(normalizar(b)));
}
export function cosechaActiva() {
  const todas = todasLasCosechas();
  let n = db.get('sel_cosecha', '');
  const ok = todas.find((x) => normalizar(x) === normalizar(n));
  if (ok) return ok;
  return todas.length === 1 ? todas[0] : '';
}
export function setCosechaActiva(n) { db.set('sel_cosecha', n); }

// ---------- Contadores ----------
export function siguienteNumero(clave, prefijo) {
  return prefijo + String(db.get(clave, 1)).padStart(4, '0');
}
export function confirmarNumero(clave) { db.set(clave, db.get(clave, 1) + 1); }
