// ==========================================================================
// CONFIG-DEVICES.JS — Versão Final (Correção de Selects + CSS + Modal)
// ==========================================================================

import { db } from "../services/firebase.js";
import { getUser, getActiveInstitution, clearActiveInstitution, setActiveInstitution } from "../core/state.js";
import { loadHierarchyCache } from "../services/hierarchy.service.js"; // Já traz dados filtrados por permissão
import { isSuperAdmin, isAdmin } from "../core/permissions.js";
import { showNotification, showConfirmation } from "../ui/notifications.js";
import { initSearchBar } from "../ui/search-bar.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let hierarchyCache = {}; 
let currentUser = null;
let allDevices = []; 
let deviceManagementFilter = null; 

const contentArea = document.getElementById("devices-content");
const loadingArea = document.getElementById("devices-loading");

document.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
    try {
        currentUser = getUser();
        if (!currentUser) { window.location.href = "../index.html"; return; }
        
        // Carrega a hierarquia (O Service já filtra o que o usuário pode ver)
        hierarchyCache = await loadHierarchyCache();
        
        await determineActiveInstitution();
        await loadDevices();
    } catch (error) {
        console.error(error);
        showNotification("Erro ao carregar.", "error");
    }
}

async function determineActiveInstitution() {
    if (isSuperAdmin()) {
       if (!deviceManagementFilter) {
            const activeGlobal = getActiveInstitution();
            deviceManagementFilter = activeGlobal || { id: "all", nome: "Todas as Instituições" };
        }
    } else if (isAdmin()) {
        const userInsts = currentUser.acessoInstituicoes || [];
        const activeInst = getActiveInstitution();
        if (activeInst && !userInsts.includes(activeInst.id)) clearActiveInstitution();
        if (!getActiveInstitution() && userInsts.length === 1) {
             const inst = hierarchyCache.instituicoes?.find((i) => i.id === userInsts[0]);
             if (inst) setActiveInstitution(inst);
        }
        deviceManagementFilter = getActiveInstitution();
    }
}

async function loadDevices() {
    try {
        if (loadingArea) loadingArea.style.display = "flex";
        if (contentArea) contentArea.style.display = "none";

        let q;
        const devicesRef = collection(db, "dispositivos");

        if (isSuperAdmin()) {
            if (deviceManagementFilter?.id && deviceManagementFilter.id !== "all") {
                q = query(devicesRef, where("instituicaoID", "==", deviceManagementFilter.id));
            } else {
                q = query(devicesRef);
            }
        } else {
             if (!deviceManagementFilter) {
                if (loadingArea) loadingArea.style.display = "none";
                contentArea.innerHTML = `<div class="error-message">Selecione uma instituição.</div>`;
                contentArea.style.display = "block";
                return;
             }
             q = query(devicesRef, where("instituicaoID", "==", deviceManagementFilter.id));
        }

        const snapshot = await getDocs(q);
        allDevices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMainView();

    } catch (error) {
        console.error(error);
        showNotification("Erro ao buscar dados.", "error");
    } finally {
        if (loadingArea) loadingArea.style.display = "none";
        if (contentArea) contentArea.style.display = "block";
    }
}

function renderMainView() {
    const currentLabel = deviceManagementFilter?.id === "all" ? "Todas as Instituições" : deviceManagementFilter?.nome || "Selecione";
    
    const filterHTML = (isSuperAdmin() && hierarchyCache.instituicoes?.length > 0)
        ? `<div class="filter-wrapper">
            <div class="custom-select-container">
                <span>${currentLabel}</span>
                <i class="fas fa-chevron-down" style="font-size:0.7em; margin-left:5px;"></i>
                <select id="inst-filter-devices" class="native-select-overlay">
                    <option value="all">Todas as Instituições</option>
                    ${hierarchyCache.instituicoes.map(inst => `<option value="${inst.id}" ${deviceManagementFilter?.id === inst.id ? "selected" : ""}>${inst.nome}</option>`).join("")}
                </select>
            </div>
        </div>`
        : `<div class="badge-inst-active"><i class="fas fa-hospital"></i> ${currentLabel}</div>`;

    contentArea.innerHTML = `
        <div class="top-filter-bar">
            ${filterHTML}
            <button id="btn-add-device" class="btn-primary"><i class="fas fa-plus"></i> Novo Dispositivo</button>
        </div>
        <div id="devices-list-wrapper">${renderDevicesGrid(allDevices)}</div>
    `;
    setupViewEvents();
}

// === CARD RENDER ===
function renderDevicesGrid(devices) {
    if (devices.length === 0) return `<div class="empty-state"><i class="fas fa-microchip"></i><p>Nenhum dispositivo.</p></div>`;

    return `
    <div class="devices-grid">
      ${devices.map(device => {
          // Busca nomes no Cache Global (evita mostrar ID se nome existir)
          const unit = hierarchyCache.unidades?.find(u => u.id === device.unidadeID);
          const unitName = unit ? unit.nome : (device.nomeUnidade || "Unidade N/A");
          
          const sector = hierarchyCache.setores?.find(s => s.id === device.setorID);
          const sectorName = sector ? sector.nome : (device.nomeSetor || "Setor N/A");
          
          // Status Lógico
          const isAtivo = device.dispositivoAtivo !== false; 
          const statusClass = isAtivo ? "card-online" : "card-standby";
          const statusText = isAtivo ? "Operacional" : "Standby";
          const statusColorClass = isAtivo ? "pill-green" : "pill-gray";

          // Cores Ícones
          const cSonda = (device.sondaAtiva !== false) ? '#2ecc71' : '#cbd5e1'; 
          const cAlarmeSonda = (device.alarmeSondaAtivo !== false) ? '#ef4444' : '#cbd5e1'; 
          const cAlarmeAmb = (device.alarmeTempAmbienteAtivo !== false) ? '#f59e0b' : '#cbd5e1'; 
          const cAlarmeUmid = (device.alarmeUmidadeAtivo !== false) ? '#3b82f6' : '#cbd5e1'; 

          const minSonda = device.alarmeMin?.sonda ?? '-';
          const maxSonda = device.alarmeMax?.sonda ?? '-';

          return `
          <div class="device-card ${statusClass}">
              <div class="device-header">
                  <div class="device-icon-large"><i class="fas fa-wifi"></i></div>
                  <div class="device-info-vertical">
                      <h3 title="${device.nomeDispositivo}">${device.nomeDispositivo || "Sem Nome"}</h3>
                      <span class="d-unit"><i class="fas fa-building" style="font-size:0.8em"></i> ${unitName}</span>
                      <span class="d-sector"><i class="fas fa-door-open" style="font-size:0.8em"></i> ${sectorName}</span>
                  </div>
                  <button class="btn-action-icon btn-edit js-edit-device" data-id="${device.id}"><i class="fas fa-pen"></i></button>
              </div>

              <div class="device-body">
                  <div class="data-row">
                      <small>MAC ID</small>
                      <strong class="monospace">${device.id}</strong>
                  </div>
                  <div class="data-row">
                      <small>Limites Sonda</small>
                      <strong>${minSonda}°C <i class="fas fa-arrows-alt-h" style="font-size:0.7em; color:#ccc;"></i> ${maxSonda}°C</strong>
                  </div>
              </div>

              <div class="icons-dashboard">
                  <div class="icon-status" style="color:${cSonda}" title="Sonda Física"><i class="fas fa-thermometer-half"></i></div>
                  <div class="icon-status" style="color:${cAlarmeSonda}" title="Alarme Sonda"><i class="fas fa-bell"></i></div>
                  <div class="icon-status" style="color:${cAlarmeAmb}" title="Alarme Ambiente"><i class="fas fa-temperature-low"></i></div>
                  <div class="icon-status" style="color:${cAlarmeUmid}" title="Alarme Umidade"><i class="fas fa-tint"></i></div>
              </div>

              <div class="device-footer">
                  <span class="status-pill ${statusColorClass}"><i class="fas fa-circle"></i> ${statusText}</span>
                  <span class="footer-inst" title="${device.nomeInstituicao}">${device.nomeInstituicao || ""}</span>
              </div>
          </div>
          `;
      }).join('')}
    </div>
  `;
}

// === MODAL AJUSTADO (SEM DELETE + AVANÇADO) ===
async function openDeviceModal(deviceId) {
    let device = {};
    if (deviceId) {
        device = allDevices.find(d => d.id === deviceId) || {};
    }

    const isSondaAtiva = device.sondaAtiva !== false;
    const isAlarmeSondaAtivo = device.alarmeSondaAtivo !== false;
    const isAlarmeTempAmbienteAtivo = device.alarmeTempAmbienteAtivo !== false;
    const isAlarmeUmidadeAtivo = device.alarmeUmidadeAtivo !== false;

    const modalOverlay = document.createElement("div");
    modalOverlay.className = "admin-modal-overlay";

    modalOverlay.innerHTML = `
        <div class="admin-modal-content">
            <div class="modal-header">
                <h3>${deviceId ? 'Editar Dispositivo' : 'Novo Dispositivo'}</h3>
            </div>
            
            <div class="modal-body">
                <form id="device-form">
                    <div class="form-group">
                        <label>MAC Address (ID)</label>
                        <input type="text" id="mac" value="${deviceId || ""}" ${deviceId ? "disabled" : ""} required class="form-control uppercase-input">
                    </div>
                    
                    <div class="form-group">
                        <label>Nome do Dispositivo</label>
                        <input type="text" id="nomeDispositivo" value="${device.nomeDispositivo || ""}" required class="form-control">
                    </div>

                    <div class="form-group highlight-box">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <label style="margin:0; font-weight:700; color:#334155;">Dispositivo Operacional</label>
                                <div style="font-size:0.8rem; color:#64748b;">Desative para colocar em modo Standby</div>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="dispositivoAtivo" ${device.dispositivoAtivo !== false ? "checked" : ""}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>

                    <hr class="soft-hr">
                    <h4 class="section-title">Localização</h4>
                    <div class="form-group"><label>Instituição</label><select id="select-inst" required class="form-control"></select></div>
                    <div class="form-group"><label>Unidade</label><select id="select-unit" required class="form-control"></select></div>
                    <div class="form-group"><label>Setor</label><select id="select-setor" required class="form-control"></select></div>

                    <hr class="soft-hr">
                    <h4 class="section-title">Hardware</h4>
                    <div class="form-group" style="display: flex; align-items: center; justify-content: space-between;">
                        <label style="margin:0;">Sonda Externa Conectada?</label>
                        <label class="switch">
                            <input type="checkbox" id="sondaAtiva" ${isSondaAtiva ? "checked" : ""}>
                            <span class="slider round"></span>
                        </label>
                    </div>

                    <details class="advanced-details">
                        <summary>Configurações Avançadas de Alarme</summary>
                        <div class="details-content">
                            
                            <div class="alarm-group">
                                <div class="alarm-header">
                                    <label class="switch-small">
                                        <input type="checkbox" id="alarmeSondaAtivo" ${isAlarmeSondaAtivo ? "checked":""}>
                                        <span class="slider-small round"></span>
                                    </label>
                                    <span class="alarm-title">Alarme Sonda</span>
                                </div>
                                <div class="alarm-inputs">
                                    <input type="number" step="0.1" id="alarmeMin" value="${device.alarmeMin?.sonda || ""}" placeholder="Min °C" class="form-control compact">
                                    <input type="number" step="0.1" id="alarmeMax" value="${device.alarmeMax?.sonda || ""}" placeholder="Max °C" class="form-control compact">
                                </div>
                            </div>

                            <div class="alarm-group">
                                <div class="alarm-header">
                                    <label class="switch-small">
                                        <input type="checkbox" id="alarmeTempAmbienteAtivo" ${isAlarmeTempAmbienteAtivo ? "checked":""}>
                                        <span class="slider-small round"></span>
                                    </label>
                                    <span class="alarm-title">Alarme Ambiente</span>
                                </div>
                                <div class="alarm-inputs">
                                    <input type="number" step="0.1" id="alarmeMinAmb" value="${device.alarmeMin?.temperaturaAmbiente || ""}" placeholder="Min °C" class="form-control compact">
                                    <input type="number" step="0.1" id="alarmeMaxAmb" value="${device.alarmeMax?.temperaturaAmbiente || ""}" placeholder="Max °C" class="form-control compact">
                                </div>
                            </div>

                            <div class="alarm-group">
                                <div class="alarm-header">
                                    <label class="switch-small">
                                        <input type="checkbox" id="alarmeUmidadeAtivo" ${isAlarmeUmidadeAtivo ? "checked":""}>
                                        <span class="slider-small round"></span>
                                    </label>
                                    <span class="alarm-title">Alarme Umidade</span>
                                </div>
                                <div class="alarm-inputs">
                                    <input type="number" step="1" id="alarmeMinUmid" value="${device.alarmeMin?.umidade || ""}" placeholder="Min %" class="form-control compact">
                                    <input type="number" step="1" id="alarmeMaxUmid" value="${device.alarmeMax?.umidade || ""}" placeholder="Max %" class="form-control compact">
                                </div>
                            </div>

                        </div>
                    </details>

                    <div class="modal-actions">
                        <button type="button" class="admin-button-cancel">Cancelar</button>
                        <button type="submit" class="admin-button-save">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);
    setupHierarchySelects(device); // Função corrigida abaixo

    const closeModal = () => { if(document.body.contains(modalOverlay)) modalOverlay.remove(); };
    modalOverlay.querySelector('.admin-button-cancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
    modalOverlay.querySelector('#device-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSave(deviceId, closeModal);
    });

    const chkSonda = document.getElementById("sondaAtiva");
    const chkAlarmeSonda = document.getElementById("alarmeSondaAtivo");
    chkSonda.addEventListener('change', () => {
        if(!chkSonda.checked) { 
            chkAlarmeSonda.checked = false; 
            chkAlarmeSonda.disabled = true;
        } else {
            chkAlarmeSonda.disabled = false;
        }
    });
    // Trigger inicial para estado desabilitado
    chkSonda.dispatchEvent(new Event('change'));

    setupSearchClear();
}

// === HIERARQUIA DINÂMICA ===
function setupHierarchySelects(device) {
    const selInst = document.getElementById('select-inst');
    const selUnit = document.getElementById('select-unit');
    const selSector = document.getElementById('select-setor');

    // 1. Popula Instituições
    let instsPermitidas = isSuperAdmin() 
        ? hierarchyCache.instituicoes 
        : hierarchyCache.instituicoes; // O cache já está filtrado no Service

    selInst.innerHTML = '<option value="">Selecione...</option>';
    instsPermitidas.forEach(inst => {
        selInst.innerHTML += `<option value="${inst.id}">${inst.nome}</option>`;
    });

    // 2. Trava Instituição (se Admin ou Filtro Ativo)
    if (deviceManagementFilter && deviceManagementFilter.id !== "all") {
        selInst.value = deviceManagementFilter.id;
        selInst.disabled = true; 
    }
    if (device && device.instituicaoID) {
        selInst.value = device.instituicaoID;
    }

    // 3. Funções de Cascata (Usando o Cache Global)
    const populateUnits = (instId) => {
        selUnit.innerHTML = '<option value="">Selecione...</option>';
        selSector.innerHTML = '<option value="">Selecione...</option>';
        if(!instId) return;
        // Filtra TODAS as unidades da instituição selecionada disponíveis no cache
        const units = hierarchyCache.unidades.filter(u => u.instituicaoId === instId);
        units.forEach(u => selUnit.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    };

    const populateSectors = (unitId) => {
        selSector.innerHTML = '<option value="">Selecione...</option>';
        if(!unitId) return;
        // Filtra TODOS os setores da unidade selecionada
        const sectors = hierarchyCache.setores.filter(s => s.unidadeId === unitId);
        sectors.forEach(s => selSector.innerHTML += `<option value="${s.id}">${s.nome}</option>`);
    };

    // Listeners
    selInst.addEventListener('change', () => populateUnits(selInst.value));
    selUnit.addEventListener('change', () => populateSectors(selUnit.value));

    // Inicialização (Preencher se editando)
    if (selInst.value) {
        populateUnits(selInst.value); // Carrega as unidades da instituição atual
        if (device && device.unidadeID) {
            selUnit.value = device.unidadeID;
            populateSectors(device.unidadeID); // Carrega setores da unidade atual
            if(device.setorID) selSector.value = device.setorID;
        }
    }
}

// === FUNÇÕES AUXILIARES (Eventos, Save) ===
function setupViewEvents() {
    // 1. Filtro
    const instFilter = document.getElementById("inst-filter-devices");
    if (instFilter) {
        instFilter.addEventListener("change", async (e) => {
            const val = e.target.value;
            deviceManagementFilter = (val === "all") ? { id: "all" } : hierarchyCache.instituicoes.find(x => x.id === val);
            await loadDevices(); 
        });
    }

    // 2. Botão Novo
    const btnAdd = document.getElementById("btn-add-device");
    if (btnAdd) btnAdd.addEventListener("click", () => openDeviceModal(null));

    // 3. Edição
    document.getElementById("devices-list-wrapper")?.addEventListener("click", (e) => {
        const editBtn = e.target.closest(".js-edit-device");
        if (editBtn) openDeviceModal(editBtn.dataset.id);
    });

    // 4. BARRA DE BUSCA - INICIALIZAÇÃO E POSICIONAMENTO
     initSearchBar((term) => {
        const t = term.toLowerCase().trim();
        // Lógica de filtro...
        const f = allDevices.filter(d => 
            (d.nomeDispositivo?.toLowerCase().includes(t) || 
             d.id?.toLowerCase().includes(t) ||
             d.nomeUnidade?.toLowerCase().includes(t))
        );
        document.getElementById("devices-list-wrapper").innerHTML = renderDevicesGrid(f);
    }, "Buscar por Nome, Unidade ou Setor..");

    // === LÓGICA DE POSICIONAMENTO DESKTOP ===
    if (window.innerWidth >= 769) {
        const topBar = document.querySelector(".top-filter-bar");
        const searchWrapper = document.querySelector(".search-component-wrapper");
        const btnAdd = document.getElementById("btn-add-device");
        
        if (topBar && searchWrapper && btnAdd) {
            // Move a busca para o meio
            searchWrapper.remove();
            topBar.insertBefore(searchWrapper, btnAdd);

            // Ajustes visuais
            searchWrapper.style.display = 'flex';
            
            // Corrige o input interno
            const bottom = searchWrapper.querySelector('.bottom-dark-bar');
            if(bottom) { 
                bottom.style.visibility = 'visible'; 
                bottom.style.position = 'static'; 
                bottom.style.transform = 'none';
                bottom.style.background = 'transparent'; 
                bottom.style.boxShadow = 'none';
                bottom.style.width = '100%';
                bottom.style.padding = '0';
            }
            
            const input = searchWrapper.querySelector('input');
            if(input) {
                input.classList.add('global-search-input');
                input.style.background = ''; 
                input.style.color = '';
            }
        }
    }
}

async function handleSave(existingId, closeCallback) {
    const mac = document.getElementById("mac").value.trim().toUpperCase();
    if (!mac) return showNotification("MAC obrigatório.", "error");

    const instSelect = document.getElementById("select-inst");
    const unitSelect = document.getElementById("select-unit");
    const setorSelect = document.getElementById("select-setor");

    const deviceData = {
        nomeDispositivo: document.getElementById("nomeDispositivo").value,
        dispositivoAtivo: document.getElementById("dispositivoAtivo").checked,
        sondaAtiva: document.getElementById("sondaAtiva").checked,
        
        // Checkboxes dentro do details
        alarmeSondaAtivo: document.getElementById("alarmeSondaAtivo").checked,
        alarmeTempAmbienteAtivo: document.getElementById("alarmeTempAmbienteAtivo").checked,
        alarmeUmidadeAtivo: document.getElementById("alarmeUmidadeAtivo").checked,

        instituicaoID: instSelect.value,
        unidadeID: unitSelect.value,
        setorID: setorSelect.value,
        nomeInstituicao: instSelect.options[instSelect.selectedIndex]?.text || "",
        nomeUnidade: unitSelect.options[unitSelect.selectedIndex]?.text || "",
        nomeSetor: setorSelect.options[setorSelect.selectedIndex]?.text || "",

        alarmeMin: { 
            sonda: parseFloat(document.getElementById("alarmeMin").value) || null,
            temperaturaAmbiente: parseFloat(document.getElementById("alarmeMinAmb").value) || null,
            umidade: parseFloat(document.getElementById("alarmeMinUmid").value) || null
        },
        alarmeMax: { 
            sonda: parseFloat(document.getElementById("alarmeMax").value) || null,
            temperaturaAmbiente: parseFloat(document.getElementById("alarmeMaxAmb").value) || null,
            umidade: parseFloat(document.getElementById("alarmeMaxUmid").value) || null
        }
    };

    try {
        const finalId = existingId || mac;
        const docRef = doc(db, "dispositivos", finalId);
        if (!existingId) {
            if ((await getDoc(docRef)).exists()) throw new Error("MAC já cadastrado.");
            deviceData.statusTimestamp = Timestamp.now();
            await setDoc(docRef, deviceData);
            showNotification("Criado!", "success");
        } else {
            await setDoc(docRef, deviceData, { merge: true });
            await updateDoc(docRef, { forceReset: true }); 
            showNotification("Atualizado!", "success");
        }
        closeCallback();
        loadDevices();
    } catch (error) { showNotification(error.message, "error"); }
}



function setupSearchClear() {
  const input = document.querySelector(".global-search-input");
  const clearBtn = document.querySelector(".btn-internal-clear");

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

export function cleanupUserManagement() {
  // Limpa apenas o filtro local quando sair da página
  userManagementFilter = null;
  console.log("Filtro de gerenciamento de usuários limpo");
}

// Limpa ao sair da página
window.addEventListener("beforeunload", cleanupUserManagement);