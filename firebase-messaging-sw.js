// firebase-messaging-sw.js
// Este arquivo roda em segundo plano para escutar notificações

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuração do Firebase (A mesma do seu firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyAawMA2HjEgBZ5gYIawMYECTp0oN4hj6YE",
  authDomain: "temptracker-eb582.firebaseapp.com",
  projectId: "temptracker-eb582",
  storageBucket: "temptracker-eb582.firebasestorage.app",
  messagingSenderId: "1079337208340",
  appId: "1:1079337208340:web:0b86faa43e141f0ff1b501",
};

// Inicializa o Firebase no Service Worker
firebase.initializeApp(firebaseConfig);

// Recupera a instância de mensagens
const messaging = firebase.messaging();

// (Opcional) Configura o comportamento quando receber mensagem em Background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em background:', payload);

  // Customiza a notificação visual
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: './img/favicon.png', // Certifique-se que essa imagem existe ou remova essa linha
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});