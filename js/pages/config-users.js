//   ../pages/config-users.js

import { auth, db } from "../services/firebase.js"; // Singleton do Firebase
import {
  getUser,
  getActiveInstitution,
  setActiveInstitution,
  clearActiveInstitution,
} from "../core/state.js"; // Estado do usuário
import {
  loadHierarchyCache,
  getCachedHierarchy,
} from "../services/hierarchy.service.js"; // Serviço de cache
import { showNotification, showConfirmation } from "../ui/notifications.js"; // UI
import { initSearchBar } from "../ui/search-bar.js";
import { permissions, hasRole, ROLES } from "../core/permissions.js";
// Imports do Firestore/Auth via CDN (mesma versão do seu firebase.js)
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// ==========================================================================
// 1. VARIÁVEIS GLOBAIS DA PÁGINA
// ==========================================================================
let hierarchyCache = {}; // Será preenchido pelo service
let currentUser = null;
const contentArea = document.getElementById("admin-content-area");

// Variáveis de estado para a árvore de acesso (Mantidas do original)
let selectedInst = new Set();
let selectedUnit = new Set();
let selectedSetor = new Set();
let selectedDispositivo = new Set();
let userManagementFilter = null;
// ==========================================================================
// 2. INICIALIZAÇÃO (Substitui o initUsersModule)
// ==========================================================================

// Função de inicialização segura
async function initPage() {
  currentUser = getUser(); // Pega do state.js corrigido

  // Se o usuário ainda não carregou (ex: refresh na página), aguarda o evento
  if (!currentUser) {
    console.log("Aguardando carregamento do usuário...");
    window.addEventListener(
      "userReady",
      () => {
        currentUser = getUser();
        showUsuariosView();
      },
      { once: true }
    ); // Executa apenas uma vez
  } else {
    // Usuário já está na memória, carrega direto
    showUsuariosView();
  }
}
initPage();
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Aguarda Auth e User State
  const checkUser = async () => {
    currentUser = getUser();
    if (!currentUser) return; // Aguarda o listener do auth.js se necessário

    // Verifica Permissão
    if (currentUser.nivel !== "admin" && currentUser.nivel !== "superAdmin") {
      document.body.innerHTML = "<h1>Acesso Negado</h1>";
      setTimeout(() => (window.location.href = "index.html"), 2000);
      return;
    }

    try {
      // 2. Carrega Hierarquia
      await loadHierarchyCache();
      hierarchyCache = getCachedHierarchy(); // Atualiza variável local

      // 3. Renderiza Tabela
      await showUsuariosView();
    } catch (error) {
      console.error(error);
      showNotification("Erro ao carregar sistema", "error");
    }
  };

  // Tenta carregar imediatamente ou aguarda evento userReady
  if (getUser()) {
    checkUser();
  } else {
    window.addEventListener("userReady", checkUser);
  }
});

// ==========================================================================
// 3. FUNÇÕES AUXILIARES PARA INSTITUIÇÃO ATIVA (ADICIONE AQUI)
// ==========================================================================

async function determineActiveInstitution() {
  const currentUser = getUser();
  if (!currentUser) return;

  // Para SuperAdmin:
  if (hasRole(ROLES.SUPER_ADMIN)) {
    if (!userManagementFilter) {
      // AJUSTE AQUI: Tenta pegar a instituição ativa global primeiro
      const activeGlobal = getActiveInstitution();
      
      // Se tiver uma ativa no header, usa ela. Senão, usa "Todas".
      userManagementFilter = activeGlobal || { id: "all", nome: "Todas as instituições" };
    }
    return;
  }

  // Para Admin: (Mantém a lógica original de segurança)
  else if (hasRole(ROLES.ADMIN)) {
    const userInsts = currentUser.acessoInstituicoes || [];
    const activeInst = getActiveInstitution();

    if (activeInst && !userInsts.includes(activeInst.id)) {
      clearActiveInstitution();
    }

    if (!getActiveInstitution() && userInsts.length === 1) {
      const instId = userInsts[0];
      const inst = hierarchyCache.instituicoes?.find((i) => i.id === instId);
      if (inst) {
        setActiveInstitution(inst);
      }
    }

    // Admin sempre filtra pela instituição ativa real
    userManagementFilter = getActiveInstitution();
  }
}

// ==========================================================================
// 4. VIEW PRINCIPAL
// ==========================================================================
export async function showUsuariosView() {
  const titleEl = document.getElementById("admin-title");
  if (titleEl) titleEl.textContent = "Gerenciar Usuários";

  const currentUser = getUser();
  if (!currentUser) return;

  await determineActiveInstitution();

  const filterForDisplay = hasRole(ROLES.SUPER_ADMIN)
    ? userManagementFilter
    : getActiveInstitution();

  if (hasRole(ROLES.ADMIN) && !filterForDisplay) {
    contentArea.innerHTML = `<div class="error-message">Instituição não configurada.</div>`;
    return;
  }

  // Busca de dados
  let allUsers = [];
  try {
    if (hasRole(ROLES.SUPER_ADMIN)) {
      const snapshot = await getDocs(collection(db, "usuarios"));
      allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (filterForDisplay?.id && filterForDisplay.id !== "all") {
        allUsers = allUsers.filter((u) =>
          u.acessoInstituicoes?.includes(filterForDisplay.id)
        );
      }
    } else {
      const q = query(
        collection(db, "usuarios"),
        where("acessoInstituicoes", "array-contains", filterForDisplay.id)
      );
      const snap = await getDocs(q);
      allUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    console.error(e);
  }

  // --- HTML TEMPLATE ---

  // 1. Topo (Filtro + Botão)
  const currentLabel =
    filterForDisplay?.id === "all"
      ? "Todas as Unidades"
      : filterForDisplay?.nome || "Selecione";

  // Filtro ou Badge
  const filterHTML =
    hasRole(ROLES.SUPER_ADMIN) && hierarchyCache.instituicoes?.length > 0
      ? `
        <div class="filter-wrapper">
            <i class="fas fa-filter" style="color:#64748b;"></i>
            <div class="custom-select-container">
                <span>${currentLabel}</span>
                <i class="fas fa-chevron-down" style="font-size:0.7em; margin-left:5px;"></i>
                <select id="inst-filter" class="native-select-overlay">
                    <option value="all">Todas as Unidades</option>
                    ${hierarchyCache.instituicoes
                      .map(
                        (inst) =>
                          `<option value="${inst.id}" ${
                            filterForDisplay?.id === inst.id ? "selected" : ""
                          }>${inst.nome}</option>`
                      )
                      .join("")}
                </select>
            </div>
        </div>`
      : `<div class="badge-inst-active"><i class="fas fa-hospital"></i> ${filterForDisplay.nome}</div>`;

  // Renderização Principal
  contentArea.innerHTML = `
    <div class="top-filter-bar">
        ${filterHTML}
        <button id="btn-add-user-top" class="btn-primary">
            <i class="fas fa-plus"></i> Novo Usuário
        </button>
    </div>

    <div id="users-list-wrapper">
        ${renderUsersTable(allUsers)}
    </div>

  `;

  setupViewEvents(allUsers, currentUser);

  if (window.innerWidth >= 769) {
    const topBar = document.querySelector(".top-filter-bar");
    const searchWrapper = document.querySelector(".search-component-wrapper");
    const btnAdd = document.getElementById("btn-add-user-top");

    if (topBar && searchWrapper && btnAdd) {
        // Remove a busca de onde ela estiver primeiro
        searchWrapper.remove();
        
        // Insere ESTRITAMENTE antes do botão (Filtro já está lá, então fica no meio)
        topBar.insertBefore(searchWrapper, btnAdd);

        // Força limpeza de estilos inline que o mobile pode ter colocado
        searchWrapper.style.display = 'flex';
        
        // Garante visibilidade dos filhos
        const bottomBar = searchWrapper.querySelector('.bottom-dark-bar');
        if (bottomBar) {
            bottomBar.style.visibility = 'visible';
            bottomBar.style.transform = 'none';
            bottomBar.style.position = 'static';
        }
    }
  }
  setupSearchClear();

}

function setupSearchClear() {
  const input = document.querySelector(".global-search-input");
  const clearBtn = document.querySelector(".internal-clear-btn");

  if (!input || !clearBtn) return;

  // Mostrar / ocultar botão
  input.addEventListener("input", () => {
    if (input.value.trim().length > 0) {
      clearBtn.classList.add("visible");
    } else {
      clearBtn.classList.remove("visible");
    }
  });

  // Limpar campo
  clearBtn.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
    input.focus();
  });
}

// ==========================================================================
// RENDERIZAR TABELA COM MENU 3 PONTOS
// ==========================================================================
function renderUsersTable(users) {
  if (users.length === 0)
    return `<div class="no-results" style="text-align:center; padding:20px; color:#666;">Nenhum usuário encontrado</div>`;

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Nome</th>
          <th class="desktop-only">Email</th>
          <th class="desktop-only">Nível</th>
          <th class="desktop-only">Status</th>
          <th></th> </tr>
      </thead>
      <tbody>
        ${users
          .map((user) => {
            const isInactive = user.ativo === false;
            return `
            <tr class="user-row ${isInactive ? "inactive" : ""}">
              <td>
                <div class="user-info-cell">
                    <strong>${user.nome || "Sem nome"}</strong>
                    <span class="${
                      isInactive ? "dot-inactive" : "dot-active"
                    }"></span>
                </div>
              </td>
              <td class="desktop-only">${user.email || "-"}</td>
              <td class="desktop-only">${user.nivel}</td>
              <td class="desktop-only">${isInactive ? "Inativo" : "Ativo"}</td>
              
              <td style="text-align: right;">
                 <div class="action-menu">
                    <button class="btn-meatball js-action-edit" data-id="${
                      user.id
                    }">
                        <i class="fas fa-ellipsis-v"></i>
                    </div>
                </div>
              </td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
// ==========================================================================
// LISTENERS E UTILITÁRIOS
// ==========================================================================
window.openUserModal = openUserModal;
window.toggleUserActive = toggleUserActive;
// Função global para abrir/fechar menu (necessário para o onclick inline funcionar bem)
window.toggleMenu = function (event, userId) {
  event.stopPropagation();
  // Fecha todos os outros primeiro
  document.querySelectorAll(".action-dropdown").forEach((el) => {
    if (el.id !== `menu-${userId}`) el.classList.remove("show");
  });

  const menu = document.getElementById(`menu-${userId}`);
  if (menu) menu.classList.toggle("show");
};

// Fecha menus ao clicar fora
document.addEventListener("click", () => {
  document
    .querySelectorAll(".action-dropdown.show")
    .forEach((el) => el.classList.remove("show"));
});

function setupTableListeners() {
  // Listener do botão Novo (Desktop e Mobile)
  const btnDesk = document.getElementById("add-new-user-desktop");
  const btnMob = document.getElementById("add-new-user-mobile");

  if (btnDesk) btnDesk.onclick = () => openUserModal(null);
  if (btnMob) btnMob.onclick = () => openUserModal(null);
}

function setupViewEvents(allUsers, currentUser) {
    
    // =================================================================
    // 1. BARRA DE BUSCA (IMPLEMENTAÇÃO CORRETA)
    // =================================================================
    // Esta função cria a barra HTML e configura o listener automaticamente
    initSearchBar((searchTerm) => {
        const term = searchTerm.toLowerCase().trim();
        
        // Filtra os usuários (Nome OU Email)
        const filtered = allUsers.filter(u => 
            (u.nome && u.nome.toLowerCase().includes(term)) || 
            (u.email && u.email.toLowerCase().includes(term))
        );
        
        // Atualiza a tabela
        const wrapper = document.getElementById("users-list-wrapper");
        if(wrapper) {
            wrapper.innerHTML = renderUsersTable(filtered);
        }
    }, "Buscar por nome ou e-mail...");


    // =================================================================
    // 2. FILTRO DE INSTITUIÇÃO
    // =================================================================
    const instFilter = document.getElementById("inst-filter");
    if (instFilter) {
        instFilter.addEventListener("change", async (e) => {
            const val = e.target.value;
            if (val === "all") {
                userManagementFilter = { id: "all" };
            } else {
                const i = hierarchyCache.instituicoes.find((x) => x.id === val);
                if (i) userManagementFilter = i;
            }
            await showUsuariosView();
        });
    }

    // =================================================================
    // 3. BOTÃO NOVO USUÁRIO
    // =================================================================
    const btnAdd = document.getElementById("btn-add-user-top");
    if (btnAdd) btnAdd.addEventListener("click", () => openUserModal(null));

    // =================================================================
    // 4. DELEGAÇÃO DE EVENTOS (MENU E AÇÕES)
    // =================================================================
    const wrapper = document.getElementById("users-list-wrapper");
    // Clone trick para limpar listeners antigos
    const newWrapper = wrapper.cloneNode(true);
    wrapper.parentNode.replaceChild(newWrapper, wrapper);

    newWrapper.addEventListener("click", (e) => {
        const target = e.target;

        // A. Toggle Menu (3 pontinhos)
        const toggleBtn = target.closest(".js-toggle-menu");
        if (toggleBtn) {
            e.stopPropagation();
            const id = toggleBtn.dataset.id;
            
            // Fecha outros menus e limpa z-index
            closeAllMenus();

            // Abre o atual
            const menu = document.getElementById(`menu-${id}`);
            if (menu) {
                // Se já estava aberto, apenas fecha (o closeAllMenus já fechou, então não faz nada)
                // Se estava fechado, abrimos:
                if (!menu.classList.contains("show")) { // Lógica ajustada
                     menu.classList.add("show");
                     const parentRow = toggleBtn.closest("tr");
                     if (parentRow) parentRow.classList.add("z-active");
                }
            }
            return;
        }

        // B. Editar
        const editBtn = target.closest(".js-action-edit");
        if (editBtn) {
            openUserModal(editBtn.dataset.id);
            closeAllMenus();
            return;
        }

    });

    // Função auxiliar para limpar menus e z-index
    function closeAllMenus() {
        document.querySelectorAll(".action-dropdown.show").forEach((el) => el.classList.remove("show"));
        document.querySelectorAll("tr.user-row.z-active").forEach((el) => el.classList.remove("z-active"));
    }

    // Fecha menu ao clicar fora
    // (Apenas UM listener global é necessário)
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".action-menu")) {
            closeAllMenus();
        }
    });
}

// ==========================================================================
// 5. FUNÇÕES DE MODAL E LÓGICA
// ==========================================================================

async function openUserModal(userId) {
  // 1. Definição de variáveis e busca de dados
  let user = {};
  const modalOverlay = document.createElement("div");

  // CORREÇÃO 1: Usar a classe correta do seu CSS (admin-modal-overlay)
  modalOverlay.className = "admin-modal-overlay";

  try {
    if (userId) {
      // Mostrar loading se necessário, ou apenas aguardar
      const docRef = doc(db, "usuarios", userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        user = docSnap.data();
      } else {
        throw new Error("Usuário não encontrado.");
      }
    }

    selectedInst = new Set(user.acessoInstituicoes || []);
    selectedUnit = new Set(user.acessoUnidades || []);
    selectedSetor = new Set(user.acessoSetores || []);
    selectedDispositivo = new Set(user.acessoDispositivos || []);

    // Inicializa a árvore garantindo a hierarquia
    initializeAccessTree(user);

    // Validação de segurança para Admins
    if (currentUser.nivel === "admin") {
      if (
        user.nivel === "superAdmin" ||
        (user.nivel === "admin" && userId !== currentUser.uid)
      ) {
        showNotification(
          "Você não tem permissão para editar este nível de usuário.",
          "error"
        );
        return; // Sai antes de criar qualquer elemento visual
      }
    }

    // Reset Sets
    selectedInst = new Set(user.acessoInstituicoes || []);
    selectedUnit = new Set(user.acessoUnidades || []);
    selectedSetor = new Set(user.acessoSetores || []);
    selectedDispositivo = new Set(user.acessoDispositivos || []);

    // ... Opções de Nível ...
    let nivelOptions = "";
    if (currentUser.nivel === "superAdmin") {
      nivelOptions = `
                <option value="operador" ${
                  user.nivel === "operador" ? "selected" : ""
                }>Operador</option>
                <option value="admin" ${
                  user.nivel === "admin" ? "selected" : ""
                }>Admin</option>
                <option value="superAdmin" ${
                  user.nivel === "superAdmin" ? "selected" : ""
                }>Super Admin</option>
            `;
    } else {
      if (userId === currentUser.uid) {
        nivelOptions = `<option value="admin" selected>Admin</option>`;
      } else {
        nivelOptions = `<option value="operador" ${
          user.nivel === "operador" ? "selected" : ""
        }>Operador</option>`;
      }
    }

    // ... Lógica de Senha ...
    const isNewUser = !userId;
    let canEditPassword = false;
    if (!isNewUser) {
      if (currentUser.nivel === "superAdmin") canEditPassword = true;
      else if (currentUser.nivel === "admin" && userId === currentUser.uid)
        canEditPassword = true;
    }

    let passwordHtml = "";
    const passwordRules =
      "Mín. 6 caracteres, 1 maiúscula, 1 minúscula, 1 número.";

    if (isNewUser) {
      passwordHtml = `
                <div class="form-group">
                    <label for="senha" title="${passwordRules}">Senha</label>
                    <input type="password" id="senha" required class="form-control">
                </div>
                <div class="form-group">
                    <label for="senha-confirm">Confirmar Senha</label>
                    <input type="password" id="senha-confirm" required class="form-control">
                </div>
            `;
    } else if (canEditPassword) {
      passwordHtml = `
                <hr>
                <div class="form-group">
                    <label style="margin-top:10px;">Redefinir Senha (Opcional)</label>
                    <label for="senha" style="font-weight:normal; font-size:0.8em;" title="${passwordRules}">Nova Senha</label>
                    <input type="password" id="senha" class="form-control">
                </div>
                <div class="form-group">
                    <label for="senha-confirm" style="font-weight:normal; font-size:0.8em;">Confirmar Nova Senha</label>
                    <input type="password" id="senha-confirm" class="form-control">
                </div>
            `;
    }

    // HTML do Modal
    modalOverlay.innerHTML = `
    <div class="admin-modal-content">
        <div class="modal-header">
            <h3>${userId ? "Editar Usuário" : "Novo Usuário"}</h3>
        </div>
        <div class="modal-body">
            <form id="user-form">
                <div class="form-group">
                    <label for="nome">Nome</label>
                    <input type="text" id="nome" value="${
                      user.nome || ""
                    }" required class="form-control">
                </div>
  

<div class="form-group">
    <label style="display:block; margin-bottom: 8px; font-weight: 600;">Status do Usuário</label>
    
    <label class="switch">
        <input type="checkbox" id="ativo" ${user.ativo !== false ? "checked" : ""}>
        <span class="slider round"></span>
    </label>
    <span style="margin-left: 10px; font-size: 0.9rem; color: #64748b; vertical-align: top; line-height: 26px;">
        ${user.ativo !== false ? "Ativo" : "Inativo"}
    </span>
</div>

                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" value="${
                      user.email || ""
                    }" ${
      userId ? "disabled" : ""
    } required class="form-control">
                </div>
                <div class="form-group">
                    <label for="select-nivel">Nível de Acesso</label>
                    <select id="select-nivel" required class="form-control">${nivelOptions}</select>
                </div>
                
                
                ${passwordHtml}
                
                <div class="form-group">
                    <label for="chatId">Chat ID Telegram</label>
                    <input type="text" id="chatId" value="${
                      user.chatId || ""
                    }" class="form-control">
                </div>

                <div class="form-group">
     <label style="display:block; margin-bottom: 8px; font-weight: 600;">Receber Alertas</label>
    <label class="switch">
        <input type="checkbox" id="alarmesAtivos" ${user.alarmesAtivos !== false ? "checked" : ""}>
        <span class="slider round"></span>
    </label>
    <span style="margin-left: 10px; font-size: 0.9rem; color: #64748b; vertical-align: top; line-height: 26px;">
        ${user.alarmesAtivos !== false ? "Ativo" : "Inativo"}
    </span>
   
    
</div>
                
                <hr>
                <h4>Acessos</h4>
                <div class="hierarchy-access-container">
                    <div class="access-column">
                        <strong>Instituições</strong>
                        <ul id="access-inst-list" class="access-list"></ul>
                    </div>
                    <div class="access-column">
                        <strong>Unidades</strong>
                        <ul id="access-unit-list" class="access-list"></ul>
                    </div>
                    <div class="access-column">
                        <strong>Setores</strong>
                        <ul id="access-setor-list" class="access-list"></ul>
                    </div>
                    <div class="access-column">
                        <strong>Dispositivos</strong>
                        <ul id="access-dispositivo-list" class="access-list"></ul>
                    </div>
                </div>
            </form>
        </div>
        <div class="modal-actions">
            <button type="button" class="admin-button-cancel">Cancelar</button>
            <button type="submit" form="user-form" class="admin-button-save">Salvar</button>
        </div>
    </div>
`;

    // 3. Adicionar ao DOM
    document.body.appendChild(modalOverlay);

    // 4. Inicializa árvore (CORREÇÃO 3: Try/Catch específico para renderização)
    try {
      // Garante que o cache existe antes de tentar renderizar
      if (!hierarchyCache || !hierarchyCache.instituicoes) {
        throw new Error("Dados de hierarquia não carregados.");
      }
      renderAccessInstituicoes();
    } catch (renderError) {
      console.error("Erro ao renderizar árvore:", renderError);
      modalOverlay.remove(); // Remove o modal se falhar a renderização
      showNotification("Erro ao carregar estrutura de acessos.", "error");
      return;
    }

    // 5. Eventos Modal
    const closeModal = () => {
      if (document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
      }
    };

    modalOverlay
      .querySelector(".admin-button-cancel")
      .addEventListener("click", closeModal);

    // Fecha ao clicar fora (opcional)
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    modalOverlay.querySelector("#user-form").addEventListener("submit", (e) => {
      e.preventDefault();
      saveUser(
        userId,
        selectedInst,
        selectedUnit,
        selectedSetor,
        selectedDispositivo,
        closeModal
      );
    });
  } catch (error) {
    console.error("Erro crítico ao abrir modal:", error);
    // Se o modal foi adicionado mas deu erro depois, remove ele para não travar a tela
    if (document.body.contains(modalOverlay)) {
      document.body.removeChild(modalOverlay);
    }
    showNotification("Erro ao abrir formulário: " + error.message, "error");
  }
}

// ==========================================================================
// 6. LÓGICA DA ÁRVORE DE ACESSO (CORRIGIDO)
// ==========================================================================

// --- RENDERIZADORES ---

function renderAccessInstituicoes() {
  const instList = document.getElementById("access-inst-list");
  if (!instList) return;
  instList.innerHTML = "";

  // Proteção se o cache estiver vazio
  if (!hierarchyCache || !hierarchyCache.instituicoes) return;

  const { instituicoesPermitidas } = getPermittedHierarchy();

  instituicoesPermitidas.forEach((inst) => {
    const isChecked = selectedInst.has(inst.id);
    const li = createAccessListItem(inst.id, inst.nome, isChecked, "inst");

    // Evento de NAVEGAÇÃO (Clique na linha/nome)
    li.addEventListener("click", (e) => {
      // Se o clique foi no checkbox, NÃO faz a navegação, deixa o evento 'change' do input cuidar
      if (e.target.tagName === "INPUT") return;

      // Remove active dos irmãos e adiciona neste
      instList
        .querySelectorAll("li")
        .forEach((item) => item.classList.remove("active"));
      li.classList.add("active");

      // Carrega a próxima coluna
      renderAccessUnidades(inst.id);
    });

    instList.appendChild(li);
  });

  // Limpa colunas filhas visualmente
  document.getElementById("access-unit-list").innerHTML = "";
  document.getElementById("access-setor-list").innerHTML = "";
  document.getElementById("access-dispositivo-list").innerHTML = "";
}

function renderAccessUnidades(instId) {
  const unitList = document.getElementById("access-unit-list");
  unitList.innerHTML = "";
  const { unidadesPermitidas } = getPermittedHierarchy();

  unidadesPermitidas
    .filter((unit) => unit.instituicaoId === instId)
    .forEach((unit) => {
      const isChecked = selectedUnit.has(unit.id);
      const li = createAccessListItem(unit.id, unit.nome, isChecked, "unit", {
        instId,
      });

      li.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;

        unitList
          .querySelectorAll("li")
          .forEach((item) => item.classList.remove("active"));
        li.classList.add("active");
        renderAccessSetores(unit.id);
      });

      unitList.appendChild(li);
    });

  document.getElementById("access-setor-list").innerHTML = "";
  document.getElementById("access-dispositivo-list").innerHTML = "";
}

function renderAccessSetores(unitId) {
  const setorList = document.getElementById("access-setor-list");
  setorList.innerHTML = "";
  const { setoresPermitidos } = getPermittedHierarchy();
  const unit = hierarchyCache.unidades.find((u) => u.id === unitId);

  setoresPermitidos
    .filter((setor) => setor.unidadeId === unitId)
    .forEach((setor) => {
      const isChecked = selectedSetor.has(setor.id);
      const li = createAccessListItem(
        setor.id,
        setor.nome,
        isChecked,
        "setor",
        {
          unitId,
          instId: unit?.instituicaoId,
        }
      );

      li.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;

        setorList
          .querySelectorAll("li")
          .forEach((item) => item.classList.remove("active"));
        li.classList.add("active");
        renderAccessDispositivos(setor.id);
      });

      setorList.appendChild(li);
    });

  document.getElementById("access-dispositivo-list").innerHTML = "";
}

function renderAccessDispositivos(setorId) {
  const dispositivoList = document.getElementById("access-dispositivo-list");
  dispositivoList.innerHTML = "";
  const { dispositivosPermitidos } = getPermittedHierarchy();

  // === CORREÇÃO CRÍTICA AQUI ===
  // Mudamos de d.setorId para d.setorID (Verifique no seu banco se é ID ou Id)
  // Normalmente no saveDevice você usou 'setorID'
  const dispositivos = dispositivosPermitidos.filter(
    (d) => d.setorID === setorId || d.setorId === setorId // Aceita os dois casos para garantir
  );

  if (dispositivos.length === 0) {
    dispositivoList.innerHTML =
      '<li style="cursor:default; color:#999; padding:10px;"><em>Nenhum dispositivo</em></li>';
    return;
  }

  dispositivos.forEach((dispositivo) => {
    const isChecked = selectedDispositivo.has(dispositivo.id);
    // Dispositivo não tem filhos para navegar, então não precisa de evento de click na LI
    const li = createAccessListItem(
      dispositivo.id,
      dispositivo.nomeDispositivo, // Nome correto do campo
      isChecked,
      "dispositivo",
      { setorId }
    );
    dispositivoList.appendChild(li);
  });
}

// --- CRIADOR DE ITEM DA LISTA (AJUSTADO HTML) ---
function createAccessListItem(id, name, isChecked, type, parentIds = {}) {
  const li = document.createElement("li");

  li.innerHTML = `
        <input type="checkbox" data-id="${id}" data-type="${type}" ${
    isChecked ? "checked" : ""
  }>
        <span class="item-text">${name || id}</span>
    `;

  const checkbox = li.querySelector("input");
  checkbox.addEventListener("change", (e) => {
    e.stopPropagation();

    if (checkbox.checked) {
      // Ao marcar: marca este item E propaga para cima
      cascadeDown(id, type, true);
      bubbleUp(id, type, parentIds, true);
    } else {
      // Ao desmarcar: desmarca este item E propaga para baixo
      cascadeDown(id, type, false);
      // Se é desmarcação, verifica se deve desmarcar os pais
      checkAndBubbleUncheck(id, type, parentIds);
    }
    refreshAccessTreeUI();
  });

  return li;
}

function refreshAccessTreeUI() {
  // Atualiza apenas os checkboxes visíveis
  document
    .querySelectorAll('#access-inst-list input[type="checkbox"]')
    .forEach((chk) => {
      chk.checked = selectedInst.has(chk.dataset.id);
    });
  document
    .querySelectorAll('#access-unit-list input[type="checkbox"]')
    .forEach((chk) => {
      chk.checked = selectedUnit.has(chk.dataset.id);
    });
  document
    .querySelectorAll('#access-setor-list input[type="checkbox"]')
    .forEach((chk) => {
      chk.checked = selectedSetor.has(chk.dataset.id);
    });
  document
    .querySelectorAll('#access-dispositivo-list input[type="checkbox"]')
    .forEach((chk) => {
      chk.checked = selectedDispositivo.has(chk.dataset.id);
    });
}
function getPermittedHierarchy() {
  const currentUser = getUser();

  // SuperAdmin sempre vê tudo (independente do filtro)
  if (currentUser.nivel === "superAdmin") {
    return {
      instituicoesPermitidas: hierarchyCache.instituicoes || [],
      unidadesPermitidas: hierarchyCache.unidades || [],
      setoresPermitidos: hierarchyCache.setores || [],
      dispositivosPermitidos: hierarchyCache.dispositivos || [],
    };
  }

  // Admin vê APENAS da instituição ativa real
  else if (currentUser.nivel === "admin") {
    const activeInst = getActiveInstitution();
    if (activeInst) {
      const instId = activeInst.id;
      return {
        instituicoesPermitidas: (hierarchyCache.instituicoes || []).filter(
          (i) => i.id === instId
        ),
        unidadesPermitidas: (hierarchyCache.unidades || []).filter(
          (u) => u.instituicaoId === instId
        ),
        setoresPermitidos: (hierarchyCache.setores || []).filter(
          (s) => s.instituicaoId === instId
        ),
        dispositivosPermitidos: (hierarchyCache.dispositivos || []).filter(
          (d) => d.instituicaoID === instId
        ),
      };
    }
  }

  return {
    instituicoesPermitidas: [],
    unidadesPermitidas: [],
    setoresPermitidos: [],
    dispositivosPermitidos: [],
  };
}
// Propaga PARA BAIXO (quando marca/desmarca pai, afeta filhos)
function cascadeDown(id, type, check) {
  switch (type) {
    case "inst":
      if (check) selectedInst.add(id);
      else selectedInst.delete(id);

      // Propaga para unidades
      hierarchyCache.unidades
        .filter((unit) => unit.instituicaoId === id)
        .forEach((unit) => cascadeDown(unit.id, "unit", check));
      break;

    case "unit":
      if (check) selectedUnit.add(id);
      else selectedUnit.delete(id);

      // Propaga para setores
      hierarchyCache.setores
        .filter((setor) => setor.unidadeId === id)
        .forEach((setor) => cascadeDown(setor.id, "setor", check));
      break;

    case "setor":
      if (check) selectedSetor.add(id);
      else selectedSetor.delete(id);

      // Propaga para dispositivos
      hierarchyCache.dispositivos
        .filter((d) => d.setorID === id || d.setorId === id)
        .forEach((d) => cascadeDown(d.id, "dispositivo", check));
      break;

    case "dispositivo":
      if (check) selectedDispositivo.add(id);
      else selectedDispositivo.delete(id);
      break;
  }
}

// Propaga PARA CIMA (quando marca filho, marca todos os pais)
function bubbleUp(id, type, parentIds, check) {
  if (!check) return; // Só propaga para cima quando marca

  switch (type) {
    case "dispositivo":
      // Marca o setor pai
      if (parentIds.setorId) {
        selectedSetor.add(parentIds.setorId);
        // Continua subindo
        const setor = hierarchyCache.setores.find(
          (s) => s.id === parentIds.setorId
        );
        if (setor)
          bubbleUp(setor.id, "setor", { unitId: setor.unidadeId }, true);
      }
      break;

    case "setor":
      // Marca a unidade pai
      if (parentIds.unitId) {
        selectedUnit.add(parentIds.unitId);
        // Continua subindo
        const unit = hierarchyCache.unidades.find(
          (u) => u.id === parentIds.unitId
        );
        if (unit)
          bubbleUp(unit.id, "unit", { instId: unit.instituicaoId }, true);
      }
      break;

    case "unit":
      // Marca a instituição pai
      if (parentIds.instId) {
        selectedInst.add(parentIds.instId);
      }
      break;
  }
}

// Verifica se deve desmarcar pais (quando nenhum filho está marcado)
function checkAndBubbleUncheck(id, type, parentIds) {
  switch (type) {
    case "dispositivo":
      // Verifica se ainda há dispositivos marcados neste setor
      if (parentIds.setorId) {
        const dispositivosDoSetor = hierarchyCache.dispositivos.filter(
          (d) =>
            (d.setorID === parentIds.setorId ||
              d.setorId === parentIds.setorId) &&
            d.id !== id
        );

        const algumDispositivoMarcado = dispositivosDoSetor.some((d) =>
          selectedDispositivo.has(d.id)
        );

        if (!algumDispositivoMarcado) {
          selectedSetor.delete(parentIds.setorId);
          // Continua verificando para cima
          const setor = hierarchyCache.setores.find(
            (s) => s.id === parentIds.setorId
          );
          if (setor)
            checkAndBubbleUncheck(setor.id, "setor", {
              unitId: setor.unidadeId,
            });
        }
      }
      break;

    case "setor":
      // Verifica se ainda há setores marcados nesta unidade
      if (parentIds.unitId) {
        const setoresDaUnidade = hierarchyCache.setores.filter(
          (s) => s.unidadeId === parentIds.unitId && s.id !== id
        );

        const algumSetorMarcado = setoresDaUnidade.some((s) =>
          selectedSetor.has(s.id)
        );

        if (!algumSetorMarcado) {
          selectedUnit.delete(parentIds.unitId);
          // Continua verificando para cima
          const unit = hierarchyCache.unidades.find(
            (u) => u.id === parentIds.unitId
          );
          if (unit)
            checkAndBubbleUncheck(unit.id, "unit", {
              instId: unit.instituicaoId,
            });
        }
      }
      break;

    case "unit":
      // Verifica se ainda há unidades marcadas nesta instituição
      if (parentIds.instId) {
        const unidadesDaInst = hierarchyCache.unidades.filter(
          (u) => u.instituicaoId === parentIds.instId && u.id !== id
        );

        const algumaUnidadeMarcada = unidadesDaInst.some((u) =>
          selectedUnit.has(u.id)
        );

        if (!algumaUnidadeMarcada) {
          selectedInst.delete(parentIds.instId);
        }
      }
      break;
  }
}

function initializeAccessTree(userData) {
  // Primeiro, verifica e preenche os pais baseados nos itens marcados
  const checkAndFillParents = () => {
    // Para cada dispositivo marcado, marca seus pais
    selectedDispositivo.forEach((dispId) => {
      const dispositivo = hierarchyCache.dispositivos.find(
        (d) => d.id === dispId
      );
      if (dispositivo) {
        const setorId = dispositivo.setorID || dispositivo.setorId;
        if (setorId) selectedSetor.add(setorId);

        const setor = hierarchyCache.setores.find((s) => s.id === setorId);
        if (setor) selectedUnit.add(setor.unidadeId);

        const unit = hierarchyCache.unidades.find(
          (u) => u.id === setor?.unidadeId
        );
        if (unit) selectedInst.add(unit.instituicaoId);
      }
    });

    // Para cada setor marcado, marca seus pais
    selectedSetor.forEach((setorId) => {
      const setor = hierarchyCache.setores.find((s) => s.id === setorId);
      if (setor) {
        selectedUnit.add(setor.unidadeId);

        const unit = hierarchyCache.unidades.find(
          (u) => u.id === setor.unidadeId
        );
        if (unit) selectedInst.add(unit.instituicaoId);
      }
    });

    // Para cada unidade marcada, marca sua instituição
    selectedUnit.forEach((unitId) => {
      const unit = hierarchyCache.unidades.find((u) => u.id === unitId);
      if (unit) selectedInst.add(unit.instituicaoId);
    });
  };

  checkAndFillParents();
  renderAccessInstituicoes();
}

// ==========================================================================
// 7. FUNÇÕES DE PERSISTÊNCIA (SAVE / DELETE)
// ==========================================================================

function validatePassword(password) {
  const errors = [];
  if (password.length < 6) errors.push("Mínimo 6 caracteres");
  if (!/(?=.*[a-z])/.test(password)) errors.push("1 Minúscula");
  if (!/(?=.*[A-Z])/.test(password)) errors.push("1 Maiúscula");
  if (!/(?=.*\d)/.test(password)) errors.push("1 Número");

  if (errors.length > 0) return { isValid: false, message: errors.join(", ") };
  return { isValid: true };
}

async function saveUser(
  userId,
  instSet,
  unitSet,
  setorSet,
  dispSet,
  closeModalCallback
) {
  const isNew = !userId;
  const email = document.getElementById("email").value;
  const nome = document.getElementById("nome").value;
  const nivel = document.getElementById("select-nivel").value;
  const senha = document.getElementById("senha")?.value;
  const senhaConfirm = document.getElementById("senha-confirm")?.value;
  const chatId = document.getElementById("chatId").value;
  const alarmesAtivos = document.getElementById("alarmesAtivos").checked;
  const ativo = document.getElementById("ativo").checked;

  try {
    let finalUserId = userId;
    const userData = {
      nome,
      email,
      nivel,
      chatId,
      alarmesAtivos,
      ativo,
      acessoInstituicoes: Array.from(instSet),
      acessoUnidades: Array.from(unitSet),
      acessoSetores: Array.from(setorSet),
      acessoDispositivos: Array.from(dispSet),
    };

    if (!isNew) {
      // só faz sentido em edição
      const targetUserRef = doc(db, "usuarios", finalUserId);
      const targetSnap = await getDoc(targetUserRef);

      if (targetSnap.exists()) {
        const targetData = targetSnap.data();

        if (targetData.nivel === "superAdmin" && ativo === false) {
          throw new Error(
            "Usuários com nível superAdmin não podem ser desativados."
          );
        }
      }
    }

    if (isNew) {
      userData.ativo = true;
      const val = validatePassword(senha);
      if (!val.isValid) throw new Error(val.message);
      if (senha !== senhaConfirm) throw new Error("Senhas não conferem");

      // Cria Auth no Firebase
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      finalUserId = cred.user.uid;

      // Salva no Firestore
      await setDoc(doc(db, "usuarios", finalUserId), userData);
      showNotification("Usuário criado!", "success");
    } else {
      delete userData.email;
      await updateDoc(doc(db, "usuarios", finalUserId), userData);
      showNotification("Usuário atualizado!", "success");
    }

    closeModalCallback();
    showUsuariosView(); // Refresh tabela
  } catch (error) {
    console.error(error);
    showNotification(error.message, "error");
  }
}

async function toggleUserActive(userId, status) {
  try {
    const userRef = doc(db, "usuarios", userId);
    await updateDoc(userRef, { ativo: status });

    showNotification(
      status ? "Usuário restaurado!" : "Usuário desativado!",
      "success"
    );
    showUsuariosView(); // Recarrega a tabela
  } catch (error) {
    console.error("Erro ao alterar status do usuário:", error);
    showNotification("Erro ao processar solicitação", "error");
  }
}

export function cleanupUserManagement() {
  // Limpa apenas o filtro local quando sair da página
  userManagementFilter = null;
  console.log("Filtro de gerenciamento de usuários limpo");
}

// Limpa ao sair da página
window.addEventListener("beforeunload", cleanupUserManagement);
