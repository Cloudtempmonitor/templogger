// public/service-worker.js

// --- 1. CONFIGURAÇÃO DO FIREBASE ---
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
  console.log('[SW] Payload recebido:', payload);

  // [CORREÇÃO DA DUPLICIDADE]
  // Se o payload tem a propriedade 'notification', o SDK do Firebase já exibiu 
  // a notificação automaticamente. Paramos aqui para não duplicar.
  if (payload.notification) {
    console.log('[SW] Notificação automática do Console/SDK detectada. Ignorando criação manual.');
    return; 
  }

  // Se chegou aqui, é uma mensagem silenciosa (Data Message) vinda do seu futuro Backend via API.
  // Então criamos a notificação manualmente.
  const notificationTitle = payload.data?.titulo || "Novo Alarme";
  const notificationOptions = {
    body: payload.data?.mensagem || "Verifique o painel.",
    icon: './img/icon-192.png',
    data: payload.data || {}
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
  '../css/base.css',
  '../css/menu.css',
  '../css/dashboard.css',
  '../js/core/auth.js',
  '../js/ui/menu.js',
  '../js/pages/dashboard.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Força a atualização imediata do SW
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
    }).then(() => self.clients.claim()) // Assume o controle da página imediatamente
  );
});

self.addEventListener('fetch', event => {
  // Ignora requisições externas (Firebase, Google Fonts, etc)
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});


// --- 3. CLIQUE NA NOTIFICAÇÃO ---
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const baseUrl = self.registration.scope;

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(baseUrl);
    })
  );
});