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

// Handler de mensagens em Segundo Plano
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Recebeu payload:', payload);

  // 1. PREVENÇÃO DE DUPLICIDADE
  // Se a mensagem enviada pelo Backend (ou Console) já tem o campo "notification",
  // o navegador exibe automaticamente. Não precisamos fazer nada.
  if (payload.notification) {
    return; 
  }

  // 2. CASO SEJA APENAS DADOS (Data Message)
  // Aqui montamos a notificação manualmente (cenário ideal para produção)
  const notificationTitle = payload.data?.titulo || "Novo Alarme!";
  const notificationOptions = {
    body: payload.data?.mensagem || "Verifique o painel.",
    icon: '/templogger/public/img/icon-192.png', // Caminho absoluto seguro para GitHub Pages
    data: payload.data
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Listener de clique na notificação
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notificação clicada.');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then( windowClients => {
      
      // 3. CORREÇÃO DO LINK 404
      // Usa o escopo de registro do SW para saber a URL base correta (/templogger/)
      const urlToOpen = self.registration.scope; 

      // Se já tiver uma aba aberta, foca nela
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.startsWith(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Se não, abre a página principal correta
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});