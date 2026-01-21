// ==========================================================================
// CONFIG-HIERARCHY.JS - GERENCIAMENTO DE HIERARQUIA
// ==========================================================================

// Importações Firebase
import { db } from "../services/firebase.js";
import {
    collection,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Importações do Sistema
import { getUser, getActiveInstitution } from "../core/state.js";
import { hasRole, ROLES, permissions } from "../core/permissions.js";
import { loadHierarchyCache, getCachedHierarchy } from "../services/hierarchy.service.js";
import { showNotification, showConfirmation } from "../ui/notifications.js";
import { hasLinkedDevices } from "../services/devices.service.js";

// Variáveis globais
let hierarchyCache = null;
let currentSelectedInstId = null;
let currentSelectedUnitId = null;
const contentArea = document.getElementById("admin-content-area");
const loadingEl = document.getElementById("hierarchy-loading");
const contentEl = document.getElementById("hierarchy-content");



document.addEventListener("DOMContentLoaded", () => {
    const user = getUser();
    if (user) {
        adminHierarchy();
    } else {
        window.addEventListener("userReady", () => {
            adminHierarchy();
        });
    }
});


export async function adminHierarchy() {
    try {
        console.log("Iniciando adminHierarchy...");
        
        if (loadingEl) loadingEl.style.display = "block";
        if (contentEl) contentEl.style.display = "none";
        
        await loadHierarchyCache();
        hierarchyCache = getCachedHierarchy();
        
        checkAndUpdateSelection();
        
        await showHierarchyView();
        
        setupTableListeners();
        
        if (loadingEl) loadingEl.style.display = "none";
        if (contentEl) contentEl.style.display = "block";
        
        console.log("adminHierarchy concluído com sucesso");
        
    } catch (error) {
        console.error("Erro em adminHierarchy:", error);
        
        // Mostra erro no próprio elemento de loading
        if (loadingEl) {
            loadingEl.innerHTML = `
                <p style="color:#dc2626; font-size:1rem; margin-bottom:15px;">
                    ❌ Erro ao carregar hierarquia
                </p>
                <p style="color:#64748b; font-size:0.9rem;">
                    ${error.message || "Tente recarregar a página"}
                </p>
                <button onclick="adminHierarchy()" style="margin-top:15px; padding:8px 16px; background:#3498db; color:white; border:none; border-radius:6px; cursor:pointer;">
                    Tentar novamente
                </button>
            `;
        }
        
        showNotification("Falha ao carregar estrutura hierárquica", "error");
    }
}

/* ==========================================================================
   VIEW PRINCIPAL
   ========================================================================== */

async function showHierarchyView() {
    const currentUser = getUser();
    if (!currentUser) return;
    
    // Atualiza título
    const adminTitle = document.getElementById("admin-title");
    if (adminTitle) {
        adminTitle.textContent = "Gerenciar Hierarquia";
    }
    
    // Reset seleções
    currentSelectedInstId = null;
    currentSelectedUnitId = null;
    
    // Botão principal (apenas para superAdmin)
    let mainButtonHtml = '';
    if (hasRole(ROLES.SUPER_ADMIN)) {
        mainButtonHtml = `
            <div class="hierarchy-actions">
                <button id="add-new-inst-main" class="admin-button-new">
                    <i class="fas fa-plus"></i> Nova Instituição
                </button>
            </div>
        `;
    }
    
   contentArea.innerHTML = mainButtonHtml + `
    <div class="hierarchy-columns-container">
        <!-- Coluna 1: Instituições -->
        <div class="hierarchy-column" id="col-instituicoes">
            <div class="column-header">
                <h3><i class="fas fa-hospital"></i> Instituições</h3>
                ${hasRole(ROLES.SUPER_ADMIN) ? 
                    '<button id="add-new-inst" class="btn-icon-small" title="Adicionar instituição"><i class="fas fa-plus"></i></button>' : 
                    ''}
            </div>
            <div class="column-content">
                <ul id="inst-list" class="hierarchy-list"></ul>
            </div>
            <div class="column-footer">
                <span id="inst-count">Carregando...</span>
            </div>
        </div>
        
        <!-- Coluna 2: Unidades -->
        <div class="hierarchy-column" id="col-unidades">
            <div class="column-header">
                <h3><i class="fas fa-building"></i> Unidades</h3>
                ${hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN) ? 
                    '<button id="add-new-unit" class="btn-icon-small" title="Adicionar unidade"><i class="fas fa-plus"></i></button>' : 
                    ''}
            </div>
            <div class="column-content">
                <ul id="unit-list" class="hierarchy-list"></ul>
            </div>
            <div class="column-footer">
                <span id="unit-count">Selecione uma instituição</span>
            </div>
        </div>
        
        <!-- Coluna 3: Setores -->
        <div class="hierarchy-column" id="col-setores">
            <div class="column-header">
                <h3><i class="fas fa-door-closed"></i> Setores</h3>
                ${hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN) ? 
                    '<button id="add-new-setor" class="btn-icon-small" title="Adicionar setor"><i class="fas fa-plus"></i></button>' : 
                    ''}
            </div>
            <div class="column-content">
                <ul id="setor-list" class="hierarchy-list"></ul>
            </div>
            <div class="column-footer">
                <span id="setor-count">Selecione uma unidade</span>
            </div>
        </div>
    </div>
    
    <div class="hierarchy-info">
        <p><i class="fas fa-info-circle"></i> Clique em uma instituição para ver suas unidades. Clique em uma unidade para ver seus setores.</p>
    </div>
`;
    
    // Renderiza instituições
    renderInstituicoes();
}

/* ==========================================================================
   RENDERIZAÇÃO DAS LISTAS
   ========================================================================== */
function renderInstituicoes() {
    const list = document.getElementById("inst-list");
    const countEl = document.getElementById("inst-count");
    const btnAdd = document.getElementById("add-new-inst") || document.getElementById("btn-add-inst"); 

    if (!list || !countEl) return;

    list.innerHTML = "";

    const currentUser = getUser();
    const activeInst = getActiveInstitution(); 

    if (!currentUser) return;

    // ============================================================
    // LÓGICA DE FILTRAGEM
    // ============================================================
    let instituicoesPermitidas = [];
    
    if (hasRole(ROLES.SUPER_ADMIN)) {
        // SuperAdmin vê tudo
        instituicoesPermitidas = hierarchyCache.instituicoes || [];
        
        // Habilita botão de adicionar
        if (btnAdd) btnAdd.style.display = "flex"; 
    } else {
        // Admin vê APENAS a instituição ativa no momento
        if (activeInst && activeInst.id) {
            instituicoesPermitidas = (hierarchyCache.instituicoes || []).filter(inst => 
                inst.id === activeInst.id
            );
        }
        
        // Esconde botão de adicionar para não-SuperAdmin
        if (btnAdd) btnAdd.style.display = "none";
    }

    // Atualiza contador
    countEl.textContent = `${instituicoesPermitidas.length} instituição${instituicoesPermitidas.length !== 1 ? 's' : ''}`;

    // Se não houver instituições
    if (instituicoesPermitidas.length === 0) {
        list.innerHTML = `
            <li class="empty-state">
                <i class="fas fa-hospital"></i>
                <p>Nenhuma instituição acessível</p>
            </li>
        `;
        return;
    }

    // ============================================================
    // RENDERIZAÇÃO
    // ============================================================
    instituicoesPermitidas.forEach(inst => {
        const li = document.createElement("li");
        li.dataset.id = inst.id;
        li.dataset.instId = inst.id;

        // Se for Admin (só tem 1 item), já deixa visualmente ativo
        if (!hasRole(ROLES.SUPER_ADMIN) || currentSelectedInstId === inst.id) {
             li.classList.add("active");
        }

        //Botões de ação apenas para SuperAdmin
        const actionsHtml = hasRole(ROLES.SUPER_ADMIN) ? 
            `<div class="item-actions">
                <button class="edit-btn" data-id="${inst.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn" data-id="${inst.id}" data-name="${inst.nome || inst.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>` : 
            `<div class="item-actions"><span style="font-size:0.8em; color:#ccc;">(Atual)</span></div>`;

        li.innerHTML = `
            <span class="item-text">${inst.nome || inst.id}</span>
            ${actionsHtml}
        `;

        // ============================================================
        // EVENTO DE CLIQUE 
        // ============================================================
        li.addEventListener("click", (e) => {
            if (e.target.closest(".item-actions")) return;

            // Remove active de todas as instituições
            list.querySelectorAll("li").forEach(item => item.classList.remove("active"));
            
            // Remove active de todas as unidades
            const unitList = document.getElementById("unit-list");
            if (unitList) {
                unitList.querySelectorAll("li").forEach(item => item.classList.remove("active"));
            }

            // Ativa a instituição clicada
            li.classList.add("active");

            // Atualiza seleção global
            currentSelectedInstId = inst.id;
            currentSelectedUnitId = null; 

            // Mostra botão de adicionar unidade 
            const addUnitBtn = document.getElementById("add-new-unit");
            if (addUnitBtn) {
                addUnitBtn.style.display = "block"; 
            }

            // Esconde botão de adicionar setor (pois resetou unidade)
            const addSetorBtn = document.getElementById("add-new-setor");
            if (addSetorBtn) addSetorBtn.style.display = "none";

            // Limpa e renderiza unidades
            renderUnidades(inst.id);

            // Limpa os setores explicitamente
            renderSetores(null, true); 
        });

        list.appendChild(li);
    });

    if (instituicoesPermitidas.length === 1 && !currentSelectedInstId) {
        const firstLi = list.querySelector("li");
        if (firstLi) firstLi.click();
    }
}

function renderUnidades(instId) {
    const list = document.getElementById("unit-list");
    const countEl = document.getElementById("unit-count");
    
    if (!list || !countEl) return;
    
    list.innerHTML = "";
    
    // Filtra unidades da instituição selecionada
    const unidadesDaInst = (hierarchyCache.unidades || []).filter(unit => 
        unit.instituicaoId === instId
    );
    
    // Atualiza contador
    countEl.textContent = `${unidadesDaInst.length} unidade${unidadesDaInst.length !== 1 ? 's' : ''}`;
    
    // Se não houver unidades
    if (unidadesDaInst.length === 0) {
        list.innerHTML = `
            <li class="empty-state">
                <i class="fas fa-building"></i>
                <p>Nenhuma unidade nesta instituição</p>
            </li>
        `;
        
        // Limpa setores (mostra mensagem de seleção)
        renderSetores(null, true);
        return;
    }
    
    // Renderiza cada unidade
    unidadesDaInst.forEach(unit => {
        const li = document.createElement("li");
        li.dataset.id = unit.id;
        li.dataset.unitId = unit.id;
        li.dataset.instId = unit.instituicaoId; // Armazena também a instituição
        
        li.innerHTML = `
            <span class="item-text">${unit.nome || unit.id}</span>
            ${hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN) ? 
                `<div class="item-actions">
                    <button class="edit-btn" data-id="${unit.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" data-id="${unit.id}" data-name="${unit.nome || unit.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>` : 
                ''}
        `;
        
        // Evento de clique na linha (seleção)
        li.addEventListener("click", (e) => {
            if (e.target.closest(".item-actions")) return;
            
            // Verifica se a unidade pertence à instituição selecionada
            if (currentSelectedInstId && unit.instituicaoId !== currentSelectedInstId) {
                showNotification("Esta unidade não pertence à instituição selecionada", "warning");
                return;
            }
            
            // Remove active de todas as unidades
            list.querySelectorAll("li").forEach(item => item.classList.remove("active"));
            
            // Ativa a unidade clicada
            li.classList.add("active");
            
            // Atualiza seleção
            currentSelectedUnitId = unit.id;
            
            // Mostra botão de adicionar setor
            const addSetorBtn = document.getElementById("add-new-setor");
            if (addSetorBtn) addSetorBtn.style.display = "block";
            
            // Renderiza setores da unidade selecionada
            renderSetores(unit.id, false);
        });
        
        list.appendChild(li);
    });
}

function renderSetores(unitId, forceClear = false) {
    const list = document.getElementById("setor-list");
    const countEl = document.getElementById("setor-count");
    
    if (!list || !countEl) return;
    
    list.innerHTML = "";
    
    // Se forceClear for true ou não houver unitId, mostra estado vazio
    if (forceClear || !unitId) {
        if (!currentSelectedUnitId) {
            countEl.textContent = "Selecione uma unidade";
            list.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-door-closed"></i>
                    <p>Selecione uma unidade para ver os setores</p>
                </li>
            `;
        } else {
            countEl.textContent = "0 setores";
            list.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-door-closed"></i>
                    <p>Nenhum setor nesta unidade</p>
                </li>
            `;
        }
        return;
    }
    
    // Filtra setores da unidade selecionada
    const setoresDaUnidade = (hierarchyCache.setores || []).filter(setor => 
        setor.unidadeId === unitId
    );
    
    // Atualiza contador
    countEl.textContent = `${setoresDaUnidade.length} setor${setoresDaUnidade.length !== 1 ? 'es' : ''}`;
    
    // Se não houver setores
    if (setoresDaUnidade.length === 0) {
        list.innerHTML = `
            <li class="empty-state">
                <i class="fas fa-door-closed"></i>
                <p>Nenhum setor nesta unidade</p>
            </li>
        `;
        return;
    }
    
    // Renderiza cada setor
    setoresDaUnidade.forEach(setor => {
        const li = document.createElement("li");
        li.dataset.id = setor.id;
        
        li.innerHTML = `
            <span class="item-text">${setor.nome || setor.id}</span>
            ${hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN) ? 
                `<div class="item-actions">
                    <button class="edit-btn" data-id="${setor.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" data-id="${setor.id}" data-name="${setor.nome || setor.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>` : 
                ''}
        `;
        
        // Evento de clique (não navega, pois setor é o último nível)
        li.addEventListener("click", (e) => {
            if (e.target.closest(".item-actions")) return;
            
            // Remove active dos irmãos
            list.querySelectorAll("li").forEach(item => item.classList.remove("active"));
            li.classList.add("active");
        });
        
        list.appendChild(li);
    });
}


/* ==========================================================================
   CONFIGURAÇÃO DE EVENT LISTENERS
   ========================================================================== */


function setupTableListeners() {
    if (contentArea.dataset.listenersAttached === "true") {
        return; 
    }

    // Botão principal para nova instituição
    const addNewInstMain = document.getElementById("add-new-inst-main");
    if (addNewInstMain) {
        addNewInstMain.addEventListener("click", () => openHierarchyModal("instituicao"));
    }
    
    // Botões nas colunas
    const addNewInst = document.getElementById("add-new-inst");
    if (addNewInst) {
        addNewInst.addEventListener("click", () => {
            if (!hasRole(ROLES.SUPER_ADMIN)) {
                showNotification("Apenas Super Admin pode adicionar instituições", "error");
                return;
            }
            openHierarchyModal("instituicao");
        });
    }
    
    const addNewUnit = document.getElementById("add-new-unit");
    if (addNewUnit) {
        addNewUnit.addEventListener("click", () => {
            if (!currentSelectedInstId) {
                showNotification("Selecione uma instituição primeiro", "warning");
                return;
            }
            openHierarchyModal("unidade");
        });
    }
    
    const addNewSetor = document.getElementById("add-new-setor");
    if (addNewSetor) {
        addNewSetor.addEventListener("click", () => {
            if (!currentSelectedUnitId) {
                showNotification("Selecione uma unidade primeiro", "warning");
                return;
            }
            openHierarchyModal("setor");
        });
    }
    
    // Event delegation para botões de ação
    contentArea.addEventListener("click", (e) => {
        // Botões de edição
        if (e.target.closest(".edit-btn")) {
            const btn = e.target.closest(".edit-btn");
            const id = btn.dataset.id;
            const listItem = btn.closest("li");
            
            // Determina o tipo baseado na coluna
            if (listItem.closest("#inst-list")) {
                openHierarchyModal("instituicao", id);
            } else if (listItem.closest("#unit-list")) {
                openHierarchyModal("unidade", id);
            } else if (listItem.closest("#setor-list")) {
                openHierarchyModal("setor", id);
            }
        }
        
        // Botões de exclusão
        if (e.target.closest(".delete-btn")) {
            const btn = e.target.closest(".delete-btn");
            const id = btn.dataset.id;
            const name = btn.dataset.name;
            const listItem = btn.closest("li");
            
            // Determina o tipo baseado na coluna
            if (listItem.closest("#inst-list")) {
                deleteHierarchyItem("instituicao", id, name);
            } else if (listItem.closest("#unit-list")) {
                deleteHierarchyItem("unidade", id, name);
            } else if (listItem.closest("#setor-list")) {
                deleteHierarchyItem("setor", id, name);
            }
        }
    });

    contentArea.dataset.listenersAttached = "true";
}


/* ==========================================================================
   MODAIS (CRUD)
   ========================================================================== */

async function openHierarchyModal(type, docId = null) {
    if (document.querySelector(".admin-modal-overlay")) {
        return; 
    }

    const currentUser = getUser();
    if (!currentUser) return;
    
    // Verifica permissões
    if (type === "instituicao" && !hasRole(ROLES.SUPER_ADMIN)) {
        showNotification("Apenas Super Admin pode gerenciar instituições", "error");
        return;
    }
    
    if ((type === "unidade" || type === "setor") && 
        !hasRole(ROLES.SUPER_ADMIN) && !hasRole(ROLES.ADMIN)) {
        showNotification("Apenas administradores podem gerenciar unidades e setores", "error");
        return;
    }
    
    // Validações de contexto
    if (type === "unidade" && !currentSelectedInstId) {
        showNotification("Selecione uma instituição antes de adicionar uma unidade", "warning");
        return;
    }
    
    if (type === "setor" && (!currentSelectedInstId || !currentSelectedUnitId)) {
        showNotification("Selecione uma instituição e uma unidade antes de adicionar um setor", "warning");
        return;
    }
    
    // Carrega dados se for edição
    let data = {};
    let title = "";
    
    if (docId) {
        switch (type) {
            case "instituicao":
                data = (hierarchyCache.instituicoes || []).find(i => i.id === docId) || {};
                title = "Editar Instituição";
                break;
            case "unidade":
                data = (hierarchyCache.unidades || []).find(u => u.id === docId) || {};
                title = "Editar Unidade";
                break;
            case "setor":
                data = (hierarchyCache.setores || []).find(s => s.id === docId) || {};
                title = "Editar Setor";
                break;
        }
    } else {
        switch (type) {
            case "instituicao":
                title = "Nova Instituição";
                break;
            case "unidade":
                title = "Nova Unidade";
                break;
            case "setor":
                title = "Novo Setor";
                break;
        }
    }
    
    // Cria modal
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "admin-modal-overlay";
    
    // Campos específicos por tipo
    let extraFields = "";
    
    if (type === "instituicao") {
        extraFields = `
            <div class="form-group">
                <label for="cnpj">CNPJ (opcional)</label>
                <input type="text" id="cnpj" value="${data.cnpj || ""}" class="form-control" placeholder="00.000.000/0000-00">
            </div>
            <div class="form-group">
                <label for="endereco">Endereço (opcional)</label>
                <input type="text" id="endereco" value="${data.endereco || ""}" class="form-control" placeholder="Rua, número, bairro">
            </div>
        `;
    }
    
    modalOverlay.innerHTML = `
        <div class="admin-modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
            </div>
            <div class="modal-body">
                <form id="hierarchy-form">
                    <div class="form-group">
                        <label for="nome">Nome *</label>
                        <input type="text" id="nome" value="${data.nome || ""}" required class="form-control" autofocus>
                    </div>
                    
                    ${extraFields}
                    
                    ${type === "unidade" ? `
                        <div class="form-group">
                            <label>Instituição vinculada</label>
                            <input type="text" value="${getInstituicaoNome(currentSelectedInstId)}" class="form-control" disabled>
                            <input type="hidden" id="instituicaoId" value="${currentSelectedInstId}">
                        </div>
                    ` : ""}
                    
                    ${type === "setor" ? `
                        <div class="form-group">
                            <label>Unidade vinculada</label>
                            <input type="text" value="${getUnidadeNome(currentSelectedUnitId)}" class="form-control" disabled>
                            <input type="hidden" id="unidadeId" value="${currentSelectedUnitId}">
                        </div>
                        <div class="form-group">
                            <label>Instituição</label>
                            <input type="text" value="${getInstituicaoNome(currentSelectedInstId)}" class="form-control" disabled>
                        </div>
                    ` : ""}
                </form>
            </div>
            <div class="modal-actions">
                ${docId ? `
                    <button type="button" class="admin-button-delete" id="delete-hierarchy-btn">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                ` : ""}
                <button type="button" class="admin-button-cancel">Cancelar</button>
                <button type="submit" form="hierarchy-form" class="admin-button-save">
                    <i class="fas fa-save"></i> ${docId ? "Atualizar" : "Salvar"}
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalOverlay);
    
    // Event listeners do modal
    const closeModal = () => {
        if (document.body.contains(modalOverlay)) {
            document.body.removeChild(modalOverlay);
        }
    };
    
    // Botão Cancelar
    modalOverlay.querySelector(".admin-button-cancel").addEventListener("click", closeModal);
    
    // Fecha ao clicar fora
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    // Submissão do formulário
    modalOverlay.querySelector("#hierarchy-form").addEventListener("submit", (e) => {
        e.preventDefault();
        saveHierarchyItem(type, docId, closeModal);
    });
    
    // Botão de exclusão
    if (docId) {
        modalOverlay.querySelector("#delete-hierarchy-btn").addEventListener("click", () => {
            deleteHierarchyItem(type, docId, data.nome || docId, closeModal);
        });
    }
}

/* ==========================================================================
   FUNÇÕES AUXILIARES
   ========================================================================== */

function getInstituicaoNome(instId) {
    if (!instId || !hierarchyCache.instituicoes) return "Não selecionada";
    const inst = hierarchyCache.instituicoes.find(i => i.id === instId);
    return inst ? inst.nome || inst.id : "Não encontrada";
}

function getUnidadeNome(unitId) {
    if (!unitId || !hierarchyCache.unidades) return "Não selecionada";
    const unit = hierarchyCache.unidades.find(u => u.id === unitId);
    return unit ? unit.nome || unit.id : "Não encontrada";
}


function checkAndUpdateSelection() {
    if (currentSelectedInstId) {
        const instExists = (hierarchyCache.instituicoes || []).some(inst => inst.id === currentSelectedInstId);
        if (!instExists) {
            currentSelectedInstId = null;
            currentSelectedUnitId = null;
            
            renderInstituicoes();
            renderUnidades(null);
            renderSetores(null, true);
            return;
        }
    }
    
    if (currentSelectedUnitId) {
        const unit = (hierarchyCache.unidades || []).find(u => u.id === currentSelectedUnitId);
        if (!unit || (currentSelectedInstId && unit.instituicaoId !== currentSelectedInstId)) {
            currentSelectedUnitId = null;
            
            renderUnidades(currentSelectedInstId);
            renderSetores(null, true);
        }
    }
}


/* ==========================================================================
   OPERAÇÕES CRUD
   ========================================================================== */

async function saveHierarchyItem(type, docId, closeModal, formRef) {
    const currentUser = getUser();
    if (!currentUser) return;

    const context = formRef || document;

    const saveButton = context.querySelector(".admin-button-save") || document.querySelector(".admin-button-save");
    
    const originalBtnText = saveButton ? saveButton.innerHTML : "";
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    const nomeInput = context.querySelector("#nome");
    const nome = nomeInput ? nomeInput.value.trim() : "";

    if (!nome) {
        showNotification("O nome é obrigatório", "error");
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalBtnText;
        }
        return;
    }

    try {
        let collectionName, data, ref;
        let baseData = {
            nome,
            updatedAt: serverTimestamp(),
            updatedBy:currentUser.uid 
        };

        const cnpjInput = context.querySelector("#cnpj");
        const enderecoInput = context.querySelector("#endereco");

        switch (type) {
            case "instituicao":
                collectionName = "instituicoes";
                data = {
                    ...baseData,
                    cnpj: cnpjInput ? cnpjInput.value.trim() : null,
                    endereco: enderecoInput ? enderecoInput.value.trim() : null,
                };
                break;

            case "unidade":
                collectionName = "unidades";
                data = { ...baseData };
                if (!docId) {
                    if (!currentSelectedInstId) throw new Error("Instituição não selecionada.");
                    data.instituicaoId = currentSelectedInstId;
                }
                break;

            case "setor":
                collectionName = "setores";
                data = { ...baseData };
                if (!docId) {
                    if (!currentSelectedUnitId) throw new Error("Unidade não selecionada.");
                    if (!currentSelectedInstId) throw new Error("Instituição não selecionada.");
                    data.unidadeId = currentSelectedUnitId;
                    data.instituicaoId = currentSelectedInstId;
                }
                break;

            default:
                throw new Error("Tipo de hierarquia inválido");
        }

        if (!docId) {
            data.createdBy = currentUser.uid;
            data.createdAt = serverTimestamp();
        }

        if (docId) {
            ref = doc(db, collectionName, docId);
            await updateDoc(ref, data);
            showNotification(`${type} atualizado com sucesso`, "success");
        } else {
            ref = doc(collection(db, collectionName));
            await setDoc(ref, data);
            showNotification(`${type} criado com sucesso`, "success");
        }

        if (closeModal) closeModal();

        try {
            await loadHierarchyCache(true);
            hierarchyCache = getCachedHierarchy();
            await showHierarchyView();
        } catch (viewError) {
            console.error("Erro ao atualizar a visualização:", viewError);
        }

    } catch (error) {
        console.error(`Erro ao salvar ${type}:`, error);
        showNotification(`Erro ao salvar: ${error.message}`, "error");
        
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalBtnText;
        }
    }
}

async function deleteHierarchyItem(type, docId, itemName, closeModal) {
    const currentUser = getUser();
    if (!currentUser) return;

    if (type === "instituicao" && !hasRole(ROLES.SUPER_ADMIN)) {
        showNotification("Apenas Super Admin pode excluir instituições", "error");
        return;
    }

    if ((type === "unidade" || type === "setor") && 
        !hasRole(ROLES.SUPER_ADMIN) && !hasRole(ROLES.ADMIN)) {
        showNotification("Apenas administradores podem excluir", "error");
        return;
    }

    let hasDevices = false;
    try {
        let fieldName;
        switch (type) {
            case "instituicao": fieldName = "instituicaoID"; break;
            case "unidade": fieldName = "unidadeID"; break;
            case "setor": fieldName = "setorID"; break;
            default: throw new Error("Tipo inválido");
        }
        hasDevices = await hasLinkedDevices(fieldName, docId);
    } catch (error) {
        console.error(`Erro ao verificar vínculos para ${type}:`, error);
        showNotification(`Não foi possível verificar os dispositivos vinculados: ${error.message}`, "error");
        return; 
    }

    let hasDependencies = false;
    let dependencyMessage = "";

    switch (type) {
        case "instituicao":
            const unidadesDaInst = (hierarchyCache.unidades || []).filter(u => u.instituicaoId === docId);
            if (unidadesDaInst.length > 0) {
                hasDependencies = true;
                dependencyMessage = `Esta instituição possui ${unidadesDaInst.length} unidade(s) vinculada(s).`;
            }
            break;

        case "unidade":
            const setoresDaUnidade = (hierarchyCache.setores || []).filter(s => s.unidadeId === docId);
            if (setoresDaUnidade.length > 0) {
                hasDependencies = true;
                dependencyMessage = `Esta unidade possui ${setoresDaUnidade.length} setor(es) vinculado(s).`;
            }
            break;
    }

    if (hasDevices) {
        showNotification(
            `Não é possível excluir ${type} "${itemName}" porque existem dispositivos vinculados a ele. ` +
            `Desvincule os dispositivos antes de excluir.`,
            "error"
        );
        return; 
    }

    if (hasDependencies) {
        showNotification(
            `Não é possível excluir ${type} "${itemName}". ` +
            `${dependencyMessage} ` +
            `Você deve excluir os itens filhos antes de remover este item pai.`,
            "error"
        );
        return; 
    }

    const confirmationMessage = `Tem certeza que deseja excluir ${type} "${itemName}"?<br><br>` +
        `<small>Este item não possui dispositivos nem sub-itens vinculados.</small>`;

        const confirmed = await showConfirmation(confirmationMessage, "Confirmar Exclusão");
    if (!confirmed) return;

    try {
        let collectionName;
        switch (type) {
            case "instituicao": collectionName = "instituicoes"; break;
            case "unidade": collectionName = "unidades"; break;
            case "setor": collectionName = "setores"; break;
        }

        await deleteDoc(doc(db, collectionName, docId));
        showNotification(`${type} "${itemName}" excluído com sucesso`, "success");

        if (closeModal) closeModal();

        await loadHierarchyCache(true);
        hierarchyCache = getCachedHierarchy();
        await showHierarchyView();

    } catch (error) {
        console.error(`Erro ao excluir ${type}:`, error);
        showNotification(`Erro ao excluir: ${error.message}`, "error");
    }
}

