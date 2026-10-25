// Service worker: guarda la aplicación para que abra sin conexión y avisa cuando hay una versión nueva.
const VERSION = '2.4.5';
const CACHE = 'cajuelas-' + VERSION;
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/util.js', './js/store.js', './js/sync.js', './js/data.js', './js/files.js', './js/draw.js', './js/ui.js',
  './js/ui_registro.js', './js/ui_reportes.js', './js/rep_calc.js', './js/ui_diario.js', './js/ui_boletos.js', './js/ui_ajustes.js', './js/users.js', './js/imprimir.js',
  './fonts/DejaVuSans.woff', './fonts/DejaVuSans-Bold.woff', './fonts/DejaVuSansMono.woff', './fonts/DejaVuSansMono-Bold.woff',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    const hayAnterior = claves.some((k) => k.startsWith('cajuelas-') && k !== CACHE);
    await Promise.all(claves.filter((k) => k.startsWith('cajuelas-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (hayAnterior) (await self.clients.matchAll({ type: 'window' })).forEach((c) => c.postMessage({ tipo: 'actualizada', version: VERSION }));
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google Apps Script y demás: directo a la red
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await c.match('./index.html'); if (idx) return idx; }
      throw err;
    }
  })());
});
