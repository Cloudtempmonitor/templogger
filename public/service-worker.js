// public/service-worker.js
const CACHE_NAME = 'temptracker-v1';
const urlsToCache = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './img/favicon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  '../css/base.css',
  '../css/menu.css',
  '../css/dashboard.css',
  '../js/core/auth.js',
  '../js/ui/menu.js',
  '../js/pages/dashboard.js'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Todos os recursos cacheados');
        return self.skipWaiting();
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Ativação completa');
      return self.clients.claim();
    })
  );
});

// Intercepta requisições
self.addEventListener('fetch', event => {
  // Ignora requisições do Firebase
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('gstatic')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna do cache se encontrado
        if (response) {
          return response;
        }
        
        // Se não estiver no cache, busca na rede
        return fetch(event.request)
          .then(response => {
            // Não cacheamos se a resposta não for válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clona a resposta para cachear
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          });
      })
  );
});