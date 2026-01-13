const CACHE_NAME = 'templogger-v2'; //

// Lista de arquivos vitais para o App funcionar offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './menu.html',
  './config-devices.html',
  './config-users.html',
  './config-hierarchy.html',
  './login.html',
  './manifest.json',
  './profile.html',
  
  // CSS Essenciais
  '../css/base.css',
  '../css/layout.css',
  '../css/menu.css',
  '../css/buttons.css',
  '../css/dashboard.css',
  '../css/login.css',
  '../css/admin.css',
  '../css/components.css',
  '../css/dashboard.css',
  '../css/config-devices.css',
  '../css/config-users.css',
  '../css/config-hierarchy.css',
  '../css/device-details.css',
  
  './img/icon-192.png',
  './img/icon-512.png'
  
  // para cachear JS crítico explicitamente:
  // './js/core/auth.js',
  // './js/core/state.js'
];

// 1. Instalação: Cache dos arquivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Força o SW a ativar imediatamente
});

// 2. Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removendo cache antigo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. Interceptação (Fetch): Cache First, depois Rede
self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

  if (reqUrl.hostname.includes('firestore.googleapis.com') || 
      reqUrl.hostname.includes('firebase') ||
      reqUrl.hostname.includes('googleapis.com')) {
    return; 
  }

  // Para arquivos locais (CSS, JS, HTML, Imagens)
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retorna do cache se tiver, senão busca na rede
      return response || fetch(event.request).catch(() => {
        // Se estiver offline e pedir por navegação (HTML), pode retornar uma página de erro customizada no futuro
        // if (event.request.mode === 'navigate') return caches.match('./offline.html');
      });
    })
  );
});