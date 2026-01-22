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

  // 1. Tenta pegar Título e Corpo de vários lugares possíveis (para não dar erro)
  const notificationTitle = 
      payload.notification?.title || 
      payload.data?.titulo || 
      "Novo Alarme!";

  const notificationOptions = {
    body: 
      payload.notification?.body || 
      payload.data?.mensagem || 
      "Verifique o painel para detalhes.",
      
    // 2. IMPORTANTE: Ícone absoluto ou URL externa para evitar erro 404
    // Se não tiver certeza que o arquivo existe, comente a linha abaixo.
   // icon: '/img/icon-192.png', 
    
    // Mantém os dados extras para quando clicar
    data: payload.data
  };

  // 3. Exibe a notificação explicitamente
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Listener de clique na notificação (Para abrir o app ao clicar)
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notificação clicada.');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({type: 'window'}).then( windowClients => {
      // Tenta focar numa aba já aberta
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf('/') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não, abre a página principal
      if (clients.openWindow) {
        return clients.openWindow('./index.html'); // Ajuste o caminho se necessário
      }
    })
  );
});