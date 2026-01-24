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

// --- FUNÇÃO AUXILIAR PARA CAMINHOS ---
function getAbsoluteIconPath() {
    return self.location.origin + '/templogger/img/icon-192.png';
}

// --- HANDLER DE BACKGROUND ---
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Received background message:', payload);

  // CASO 1: Mensagem com .notification (Firebase Console)
  if (payload.notification) {
    console.log('[SW] Notificação do Firebase Console detectada');
    
    // Mostra notificação personalizada mesmo tendo .notification
    const notificationTitle = payload.notification.title || payload.data?.titulo || 'Alarme TempTracker';
    const notificationOptions = {
      body: payload.notification.body || payload.data?.mensagem || 'Verifique o painel agora.',
      icon: getAbsoluteIconPath(),
      badge: getAbsoluteIconPath(),
      vibrate: [200, 100, 200],
      tag: 'alarme',
      data: payload.data || {},
      actions: [
        {
          action: 'view',
          title: 'Ver Detalhes'
        }
      ]
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
  }

  // CASO 2: Mensagem só com data (backend customizado)
  const notificationTitle = payload.data?.titulo || payload.data?.title || 'Alarme TempTracker';
  const notificationOptions = {
    body: payload.data?.mensagem || payload.data?.body || 'Verifique o painel agora.',
    icon: getAbsoluteIconPath(),
    badge: getAbsoluteIconPath(),
    vibrate: [200, 100, 200],
    tag: 'alarme',
    data: payload.data || {},
    actions: [
      {
        action: 'view',
        title: 'Ver Detalhes'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- CACHE PWA (OFFLINE) ---
const CACHE_NAME = 'temptracker-v1';
const urlsToCache = [
  '/templogger/',
  '/templogger/index.html',
  '/templogger/login.html',
  '/templogger/manifest.json',
  '/templogger/img/favicon.png',
  '/templogger/img/icon-192.png',
  '/templogger/img/icon-512.png',
  '/templogger/css/base.css',
  '/templogger/css/menu.css',
  '/templogger/css/dashboard.css',
  '/templogger/js/core/auth.js',
  '/templogger/js/ui/menu.js',
  '/templogger/js/pages/dashboard.js'
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

// --- HANDLER DE CLICK NA NOTIFICAÇÃO ---
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notificação clicada:', event.notification);
  
  event.notification.close();
  
  // URL absoluta do seu app
  const appUrl = self.location.origin + '/templogger/index.html';
  
  // Verifica se clicou em alguma ação
  const action = event.action;
  if (action === 'dismiss') {
    console.log('[SW] Usuário escolheu ignorar');
    return;
  }
  
  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(windowClients => {
      console.log(`[SW] Janelas encontradas: ${windowClients.length}`);
      
      // Log para debug
      windowClients.forEach(client => {
        console.log(`[SW] Janela: ${client.url}`);
      });
      
      // Procura uma janela do seu app
      for (const client of windowClients) {
        // Verifica se a URL contém o caminho do seu app
        if (client.url.includes('/templogger/')) {
          console.log('[SW] Janela do app encontrada, focando...');
          return client.focus().then(() => {
            // Envia mensagem para a página
            if (client.postMessage) {
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: event.notification.data || {}
              });
            }
          });
        }
      }
      
      // Se não encontrou, abre nova janela
      console.log('[SW] Nenhuma janela encontrada, abrindo nova...');
      return clients.openWindow(appUrl);
    })
  );
});

// --- HANDLER DE AÇÕES DA NOTIFICAÇÃO ---
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notificação fechada:', event.notification);
});