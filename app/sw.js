// Guarda la app en el teléfono para que abra sin señal (sala de calderas, subterráneo).
// Primero lo guardado, y por detrás se trae la versión nueva: los cambios se ven al abrir
// la siguiente vez. Las llamadas al servicio (/api) nunca pasan por aquí.

const VERSION = 'terreno-fase0-1';
const ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './cola.js',
  './util.js',
  './config.js',
  './manifest.webmanifest',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardada = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request)
        .then((r) => {
          if (r.ok) cache.put(e.request, r.clone());
          return r;
        })
        .catch(() => guardada);
      if (guardada) {
        e.waitUntil(red);
        return guardada;
      }
      return red;
    }),
  );
});
