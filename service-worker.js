// service-worker.js

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAawMA2HjEgBZ5gYIawMYECTp0oN4hj6YE",
  authDomain: "temptracker-eb582.firebaseapp.com",
  projectId: "temptracker-eb582",
  storageBucket: "temptracker-eb582.firebasestorage.app",
  messagingSenderId: "1079337208340",
  appId: "1:1079337208340:web:0b86faa43e141f0ff1b501",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// --- HANDLER DE BACKGROUND ---
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // ────────────────────────────────────────────────
  // CASO 1: Mensagem do Firebase Console (tem .notification)
  // ────────────────────────────────────────────────
  // O SDK já exibiu a notificação automaticamente → NÃO crie outra
  if (payload.notification) {
    console.log('[SW] Ignorando → notificação automática do FCM já foi exibida');
    return;
  }

  // ────────────────────────────────────────────────
  // CASO 2: Mensagem só com data 
  // ────────────────────────────────────────────────
  const notificationTitle = payload.data?.titulo || payload.data?.title || 'Alarme TempTracker';
  const notificationOptions = {
    body: payload.data?.mensagem || payload.data?.body || 'Verifique o painel agora.',
    icon: './img/icon-192.png',           
    data: payload.data || {},
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});


// --- 2. CACHE PWA (OFFLINE) ---
const CACHE_NAME = 'temptracker-v1';
const urlsToCache = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './img/favicon.png',
  './img/icon-192.png',
  './css/base.css',
  './css/menu.css',
  './css/dashboard.css',
  './js/core/auth.js',
  './js/ui/menu.js',
  './js/pages/dashboard.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const urlToOpen = 'https://cloudtempmonitor.github.io/templogger/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientsArr => {
        // Tenta focar janela já aberta no mesmo domínio
        for (const client of clientsArr) {
          if (client.url.startsWith('https://cloudtempmonitor.github.io/')) {
            // Tenta focar
            if ('focus' in client) {
              return client.focus().then(focusedClient => {
                // Se quiser forçar navegação mesmo assim (opcional)
                if (focusedClient.url !== urlToOpen && 'navigate' in focusedClient) {
                  return focusedClient.navigate(urlToOpen);
                }
              });
            }
            return client.focus();
          }
        }

        // Não achou → abre nova janela com URL completa
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
      .catch(err => {
        console.error('Erro no notificationclick:', err);
        // Fallback: tenta abrir mesmo assim
        if (clients.openWindow) {
          clients.openWindow(urlToOpen);
        }
      })
  );
});