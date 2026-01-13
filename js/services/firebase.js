// ==========================================================================
// js/services/firebase.js — Configuração e Inicialização do Firebase
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAawMA2HjEgBZ5gYIawMYECTp0oN4hj6YE",
  authDomain: "temptracker-eb582.firebaseapp.com",
  projectId: "temptracker-eb582",
  storageBucket: "temptracker-eb582.firebasestorage.app",
  messagingSenderId: "1079337208340",
  appId: "1:1079337208340:web:0b86faa43e141f0ff1b501",
};

// Inicializa o app
const app = initializeApp(firebaseConfig);

// Inicializa os serviços
export const auth = getAuth(app);
export const db = getFirestore(app);

// Opcional: exporta o app também
export default app;