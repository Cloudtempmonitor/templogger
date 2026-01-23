// public/service-worker.js

// --------------------------------------------------------
// 1. CONFIGURAÇÃO DO FIREBASE 
// --------------------------------------------------------
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

// Handler de Mensagens em Segundo Plano (Background)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Recebeu payload em background:', payload);

  
  // Se o seu backend envia { notification: ... }, COMENTE o bloco abaixo para evitar duplicidade.
  // Se o seu backend envia apenas { data: ... }, mantenha o bloco abaixo.
  
  const notificationTitle = payload.notification?.title || payload.data?.titulo || "Novo Alarme!";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.mensagem || "Verifique o painel.",
    icon: './img/icon-192.png',
    data: payload.data || {}
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});


// --------------------------------------------------------
// 2. LÓGICA DE CACHE (PWA)
// --------------------------------------------------------
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

self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Ignora requisições do Firebase/Google e API externa
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('gstatic') ||
      event.request.url.includes('googleapis')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// --------------------------------------------------------
// 3. HANDLER DE CLIQUE NA NOTIFICAÇÃO
// --------------------------------------------------------
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notificação clicada.');
  event.notification.close();
  const baseUrl = self.registration.scope; // Geralmente a pasta onde está o SW

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then( windowClients => {
      // Tenta focar numa aba já aberta
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não, abre nova janela
      if (clients.openWindow) {
        return clients.openWindow(baseUrl);
      }
    })
  );
});