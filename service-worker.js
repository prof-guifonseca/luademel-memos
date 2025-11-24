// Atualize o nome do cache para forçar atualização quando novos arquivos forem adicionados.
const CACHE_NAME = 'honeymoon-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  // Inclui o módulo de memórias para funcionamento offline da aba de memórias
  '/memories.js',
  '/manifest.json',
  '/ca-e-gui.webp',
  '/ca-e-gui.jpg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});