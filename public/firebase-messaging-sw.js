// firebase-messaging-sw.js
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

// 1. HANDLER DE MENSAGENS EM SEGUNDO PLANO
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Recebeu payload:', payload);

  // Define Título e Texto (Prioriza o Console do Firebase, depois tenta Data)
  const notificationTitle = payload.notification?.title || payload.data?.titulo || "Novo Alarme!";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.mensagem || "Verifique o painel.",
    
    icon: './img/icon-192.png', 
    
    // Mantém os dados para o clique
    data: payload.data || {} 
  };

  // FORÇA a exibição da notificação
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. HANDLER DE CLIQUE (Redirecionamento Inteligente)
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notificação clicada.');
  event.notification.close();

  // URL Base onde o SW está instalado (ex: .../templogger/)
  // Isso resolve o problema do erro 404 no GitHub Pages automaticamente
  const baseUrl = self.registration.scope;

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then( windowClients => {
      // Procura se o app já está aberto
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        // Se encontrar uma aba que comece com a mesma URL base, foca nela
        if (client.url.startsWith(baseUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não tiver aberto, abre a URL base (Home do PWA)
      if (clients.openWindow) {
        return clients.openWindow(baseUrl);
      }
    })
  );
});