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
  ,
  // Novos endpoints de API para diário público e progresso devem ser
  // armazenados em cache para suportar visualização offline. Ao incluir
  // estas URLs estáticas, o service worker irá servir respostas em cache
  // quando a rede estiver indisponível. Note que estes dados podem ficar
  // desatualizados até que o usuário se reconecte.
  '/public-memories',
  '/progress'
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
