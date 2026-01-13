// js/core/auth.js

import { auth } from "../services/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { loadUserProfile } from "../services/users.service.js";
import { resetState, getUser } from "./state.js";

// Evita múltiplas inicializações
let isInitialized = false;

// Evento global disparado quando o usuário está 100% pronto (perfil carregado)
export const userReadyEvent = new Event("userReady");

export function initAuthGuard() {
  if (isInitialized) {
    console.log("[AuthGuard] Já inicializado — ignorando chamada duplicada");
    return;
  }
  isInitialized = true;

  console.log("[AuthGuard] Inicializando monitoramento de autenticação...");

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      console.log("[AuthGuard] Usuário não autenticado → redirecionando para login");
      resetState();
      redirectToLogin();
      return;
    }

    console.log("[AuthGuard] Usuário autenticado no Firebase:", firebaseUser.uid);

    try {
      await loadUserProfile(firebaseUser.uid);
      console.log("[AuthGuard] Perfil carregado com sucesso:", getUser());

      // Dispara evento global — outras páginas (como dashboard) podem escutar
      window.dispatchEvent(userReadyEvent);

      // Se estiver na página de login após sucesso, vai para o dashboard
      if (location.pathname.endsWith("login.html") || location.pathname.endsWith("/login")) {
        console.log("[AuthGuard] Login bem-sucedido → redirecionando para index.html");
        window.location.replace("./index.html"); 
      }

    } catch (error) {
      console.error("[AuthGuard] Falha ao carregar perfil do usuário:", error);
      await signOut(auth);
      resetState();
      redirectToLogin();
    }
  });
}

function redirectToLogin() {
  const currentPath = location.pathname;
  if (!currentPath.endsWith("login.html") && !currentPath.endsWith("/login")) {
    console.log("[AuthGuard] Redirecionando para login.html");
    window.location.replace("./login.html"); // caminho relativo seguro
  }
}

// Inicializa automaticamente ao importar o módulo
initAuthGuard();
