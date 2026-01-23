// ===============================
// MENU.JS — Versão corrigida e completa
// ===============================

import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import { getUser, getActiveInstitution } from "../core/state.js";
import { auth } from "../services/firebase.js"; // Importar auth do Firebase
import { showNotification, showConfirmation } from "../ui/notifications.js"; // Importar notificações
import { permissions } from '../core/permissions.js';
// ===============================
// 1. INJETAR MENU
// ===============================
async function loadMenu() {
  const container = document.getElementById("menu-container");
  if (!container) return;

  try {
    const response = await fetch("./components/menu.html");
    if (!response.ok) throw new Error("Menu HTML não encontrado");

    const html = await response.text();
    container.innerHTML = html;

    // Após injetar o HTML
    renderUserInfo();
    renderInstitution();
    applyPermissions();
    setActiveMenu();
    bindMenuActions();

  } catch (err) {
    console.error("Erro ao carregar menu:", err);
  }
}

// ===============================
// RENDERIZAR NOME DO USUÁRIO
// ===============================
function renderUserInfo() {
  const user = getUser();
  const userNameEl = document.getElementById("user-name");

  if (userNameEl) {
    userNameEl.textContent = user?.nome || "Usuário";
  }
}

// ===============================
// RENDERIZAR INSTITUIÇÃO ATIVA
// ===============================
function renderInstitution() {
  const instEl = document.querySelector(".institution-name");
  if (!instEl) return;

  const institution = getActiveInstitution();

  if (institution && institution.nome) {
    instEl.textContent = institution.nome;
  } else {
    instEl.textContent = "Selecionar instituição";
  }
}


// ===============================
// APLICAR PERMISSÕES
// ===============================
function applyPermissions() {
  const user = getUser();
  // Se o usuário ainda não carregou, aguarda ou oculta tudo sensível
  if (!user) return; 

  const isSuperAdmin = user.nivel === "superAdmin";
  const isAdmin = user.nivel === "admin";
  const isAdminOrHigher = isAdmin || isSuperAdmin;

  // Seleciona todos os elementos que têm restrição de acesso
  document.querySelectorAll("[data-role]").forEach(el => {
    const requiredRole = el.dataset.role; 

    let shouldShow = false;

    switch (requiredRole) {
      case "superAdmin":
        // Apenas SuperAdmin vê
        shouldShow = isSuperAdmin;
        break;
      
      case "admin":
        // Admin e SuperAdmin veem
        shouldShow = isAdminOrHigher;
        break;
      
      case "operador":
        // Todo mundo vê 
        shouldShow = true; 
        break;

      default:
        shouldShow = true;
    }

    // Aplica a visibilidade
    el.style.display = shouldShow ? "" : "none";
  });
}

// ===============================
// MENU ATIVO (baseado no caminho)
// ===============================
function setActiveMenu() {
  const currentPath = window.location.pathname
    .toLowerCase()
    .split("/")
    .pop(); 

  // Remove active de todos
  document.querySelectorAll(".menu-item.active").forEach(item => {
    item.classList.remove("active");
  });

  // Marca ativos pelo nome do arquivo
  document.querySelectorAll(".menu-item a[href]").forEach(link => {
    const linkPath = link
      .getAttribute("href")
      .toLowerCase()
      .split("/")
      .pop();

    if (linkPath === currentPath) {
      link.closest(".menu-item")?.classList.add("active");
    }
  });
}



// ===============================
// FUNÇÃO DE LOGOUT
// ===============================

    
async function logout() {
  try {
    const confirmed = await showConfirmation(
      "Tem certeza que deseja desconectar da sua conta?", 
      "Sair do Sistema" 
    );
    if (!confirmed) 
      return;

    await signOut(auth);
    localStorage.removeItem("user");
    localStorage.removeItem("activeInstitutionId");
    
    showNotification("Logout realizado com sucesso!", "success");
    
    // Redireciona para login
    setTimeout(() => {
      window.location.replace("./login.html");
    }, 500);
    
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
    showNotification("Erro ao fazer logout. Tente novamente.", "error");
  }
}
// ===============================
// AÇÕES DO MENU (Listeners)
// ===============================
function bindMenuActions() {
  // 1. Botão de Logout (Ícone de Sair)
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // 2. Botão de Trocar Instituição (Topo central)
  const switchInstBtn = document.getElementById("btn-switch-institution");
  if (switchInstBtn) {
    switchInstBtn.addEventListener("click", logout);
}
}
// ===============================
// INICIALIZAÇÃO
// ===============================
loadMenu();
