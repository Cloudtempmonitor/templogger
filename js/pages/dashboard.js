// js/pages/dashboard.js 
import { getUser, getActiveInstitution } from "../core/state.js";
import { getFriendlyAlarmMessage} from "../utils/helpers.js";
import { auth, db } from "../services/firebase.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showNotification} from "../ui/notifications.js";
import { requestNotificationPermission, listenToForegroundMessages } from "../services/push-notification.js";

// Variáveis globais
let allDevicesConfig = {};
let deviceCards = {};
let deviceStatus = {};
let deviceAlarmStatus = {};
let deviceListeners = {};
let alarmListeners = {};
let activeAlarms = new Set();
let lastValidReadings = {};
const OFFLINE_THRESHOLD_SECONDS = 200;  


// Init: Após auth, carrega dados
document.addEventListener("DOMContentLoaded", async () => {
  const user = getUser();

  // Cenário 1: Usuário já está no localStorage (login recente)
  if (user) {
    console.log("Usuário carregado do cache local:", user.email);
    initDashboard();
    
  }
  // Cenário 2: Usuário null, mas pode ser delay do Firebase.
  else {
    console.log("Aguardando autenticação (AuthGuard)...");

    // Escuta o evento do auth.js
    window.addEventListener("userReady", () => {
     initDashboard();
    });
  }
});

async function initDashboard() {
  const user = getUser();
   requestNotificationPermission(user.uid);
   listenToForegroundMessages();
  if (!user) return;
  clearAllListeners();
  const institution = getActiveInstitution();

  if (!institution || !institution.id) {
    console.log("Nenhuma instituição ativa. Tentando definir automaticamente...");
    showNotification(
      "Nenhuma instituição selecionada. Redirecionando...",
      "info"
    );
    setTimeout(() => window.location.replace("./login.html"), 2000);
    return;
  }

  const uiTree = await buildUiTree(institution.id);
  renderDashboard(uiTree);

  setInterval(checkAllDeviceStatus, 60000);
  checkAllDeviceStatus();
}

// Constrói a hierarquia uiTree (instituição > unidade > setor > devices)
async function buildUiTree(instId) {
  // 1. Busca dados da Instituição
  const instDoc = await getDoc(doc(db, "instituicoes", instId));
  if (!instDoc.exists()) return null;
  const instData = instDoc.data();

  // Estrutura base que o renderDashboard espera
  const result = {
    id: instId,
    nome: instData.nome || "Instituição",
    unidades: [], // Array vazio para começar
  };

  // 2. Busca TODAS as unidades dessa instituição
  const unitsQuery = query(
    collection(db, "unidades"),
    where("instituicaoId", "==", instId)
  );
  const unitsSnapshot = await getDocs(unitsQuery);

  // Se não tiver unidades, retorna logo
  if (unitsSnapshot.empty) return result;

  // 3. Busca TODOS os setores dessas unidades 

  // Vamos buscar também TODOS os dispositivos da instituição de uma vez para não fazer milhares de leituras
  const devicesQuery = query(
    collection(db, "dispositivos"),
    where("instituicaoID", "==", instId)
  );
  const devicesSnapshot = await getDocs(devicesQuery);

  // Cria um mapa de dispositivos agrupados por SetorID para acesso rápido
  const devicesBySector = {};
  devicesSnapshot.forEach((doc) => {
    const data = doc.data();
    const sectorId = data.setorID;

    if (!devicesBySector[sectorId]) devicesBySector[sectorId] = [];

    // Adiciona o dispositivo à lista do setor, salvando o MAC (id do doc) e a config
    devicesBySector[sectorId].push({
      mac: doc.id,
      ...data,
    });

    // Aproveita para atualizar o cache global de configurações
    allDevicesConfig[doc.id] = data;
  });

  // 4. Monta a árvore Unidade -> Setor -> Dispositivos
  for (const unitDoc of unitsSnapshot.docs) {
    const unitData = unitDoc.data();
    const unitId = unitDoc.id;

    const unidadeObj = {
      id: unitId,
      nome: unitData.nome || "Unidade Sem Nome",
      setores: [],
    };

    // Busca setores desta unidade
    const sectorsQuery = query(
      collection(db, "setores"),
      where("unidadeId", "==", unitId)
    );
    const sectorsSnapshot = await getDocs(sectorsQuery);

    sectorsSnapshot.forEach((sectorDoc) => {
      const sectorId = sectorDoc.id;
      const sectorData = sectorDoc.data();

      // Pega os dispositivos deste setor do nosso mapa pré-carregado
      const setorDispositivos = devicesBySector[sectorId] || [];

      // Só adiciona o setor se tiver nome 
      unidadeObj.setores.push({
        id: sectorId,
        nome: sectorData.nome || "Setor Sem Nome",
        dispositivos: setorDispositivos,
      });
    });

    // Adiciona a unidade completa à lista
    result.unidades.push(unidadeObj);
  }

  // Ordena unidades por nome 
  result.unidades.sort((a, b) => a.nome.localeCompare(b.nome));

  return result;
}

// Função para iniciar o listener em tempo real para um dispositivo
function startDeviceListener(mac) {
  if (deviceListeners[mac]) return;

  const unsubscribe = onSnapshot(doc(db, "dispositivos", mac), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();

      allDevicesConfig[mac] = { ...allDevicesConfig[mac], ...data };

      checkDeviceStatus(mac);

      if (deviceCards[mac]) {
        updateCardContent(deviceCards[mac], mac);
      }
    }
  }, (error) => {
    console.error(`Erro ao escutar dispositivo ${mac}:`, error);
  });

  deviceListeners[mac] = unsubscribe;
}

// Renderiza o dashboard com hierarquia vertical e cards horizontais
function renderDashboard(uiTree) {
  const container = document.getElementById("dashboard-container");
  if (!container) {
    console.error(
      "ERRO CRÍTICO: Elemento <main id='dashboard-container'> não encontrado no HTML."
    );
    return;
  }

  container.replaceChildren();

  if (!uiTree || !uiTree.unidades || uiTree.unidades.length === 0) {
    container.innerHTML =
      '<div class="no-data">Nenhuma unidade encontrada.</div>';
    return;
  }

  uiTree.unidades.forEach((unidade) => {
    // 🔍 Filtra apenas setores que possuem dispositivos
    const setoresComDispositivos = (unidade.setores || []).filter(
      (setor) => setor.dispositivos && setor.dispositivos.length > 0
    );

    // 🚫 Se a unidade não tiver nenhum setor com dispositivos, ignora
    if (setoresComDispositivos.length === 0) return;

    // Cria a Unidade
    const unitSection = document.createElement("section");
    unitSection.className = "unit-section";

    const unitName = document.createElement("div");
    unitName.className = "unit-name";
    unitName.textContent = unidade.nome;
    unitSection.appendChild(unitName);

    // Renderiza apenas setores válidos
    setoresComDispositivos.forEach((setor) => {
      const sectorSection = document.createElement("section");
      sectorSection.className = "sector-section";

      const sectorName = document.createElement("div");
      sectorName.className = "sector-name";
      sectorName.innerHTML = `<i class="fas fa-layer-group"></i> ${setor.nome}`;
      sectorSection.appendChild(sectorName);

      const sectorCardsContainer = document.createElement("div");
      sectorCardsContainer.className = "sector-cards";

      setor.dispositivos.forEach((deviceConfig) => {
        const cardEl = document.createElement("div");
        cardEl.className = "device-container";
        cardEl.id = `card-${deviceConfig.mac}`;

        sectorCardsContainer.appendChild(cardEl);
        deviceCards[deviceConfig.mac] = cardEl;

        renderDeviceCard({ ...deviceConfig, setorNome: setor.nome }, null);
        startDeviceListener(deviceConfig.mac);
        startAlarmListener(deviceConfig.mac);
      });

      

      sectorSection.appendChild(sectorCardsContainer);
      unitSection.appendChild(sectorSection);
    });

    container.appendChild(unitSection);
  });
}

// =========================================================================
// FUNÇÃO DE RENDERIZAÇÃO DO CARD 
// =========================================================================
function renderDeviceCard(deviceConfig, data) {
  // 1. Encontra ou cria o elemento do card
  let cardElement = document.getElementById(`card-${deviceConfig.mac}`);
  
  // Se o card não existe, cria um novo
  if (!cardElement) {
    cardElement = document.createElement('div');
    cardElement.id = `card-${deviceConfig.mac}`;
    cardElement.className = 'device-card';
    
    // Adiciona ao container de dispositivos
    const devicesContainer = document.getElementById('devices-container');
    if (devicesContainer) {
      devicesContainer.appendChild(cardElement);
    }
  }

  let mainValue = "--";
  let humidityValue = "--";
  let timestampText = "Aguardando dados...";
  let status = "OFFLINE";
  let mainColor = "#2c3e50"; 
  let badgeClass = "status-offline";
  let isAlarm = false;

  // 3. Processa os dados se existirem
  if (data) {
    // Temperatura
    if (data.t !== undefined) {
      mainValue = parseFloat(data.t).toFixed(1) + "°C";
    }

    // Umidade
    if (data.h !== undefined) {
      humidityValue = parseFloat(data.h).toFixed(0) + "%";
    }

    // Timestamp e Status Online/Offline
    if (data.ts) {
      // Converte timestamp do Firestore ou número
      const readingTime = data.ts.toDate ? data.ts.toDate() : new Date(data.ts);
      timestampText = readingTime.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Verifica se está online 
      const now = new Date();
      const diffSeconds = (now - readingTime) / 1000;

      if (diffSeconds < (OFFLINE_THRESHOLD_SECONDS || 300)) {
        status = "ONLINE";
        badgeClass = "status-online";
      }
    }

    // 4. Lógica de Cores e Alarmes
    const tempVal = parseFloat(data.t);
    const min = parseFloat(deviceConfig.alarmeMin || -999);
    const max = parseFloat(deviceConfig.alarmeMax || 999);

    if (!isNaN(tempVal)) {
      if (tempVal < min || tempVal > max) {
        mainColor = "#e74c3c"; 
        isAlarm = true;
        cardElement.classList.add("in-alarm");
      } else {
        mainColor = "#27ae60"; // Verde (Normal)
        cardElement.classList.remove("in-alarm");
      }
    }
  }

  const setorDisplay = deviceConfig.setorNome || "Setor";

  cardElement.innerHTML = `
    <div class="device-header">${setorDisplay}</div>
    <div class="device-name">${deviceConfig.nome || deviceConfig.mac}</div>
    
    <div class="device-header" style="margin-top: 10px;">Temperatura</div>
    <div class="main-temperature" style="color: ${mainColor};">
      ${mainValue}
    </div>

    <div class="alarm-info">
      <span>Min: ${deviceConfig.alarmeMin || "--"}°</span>
      <span>Max: ${deviceConfig.alarmeMax || "--"}°</span>
    </div>

    ${
      humidityValue !== "--"
        ? `
      <div class="additional-data">
        <div class="data-item">
          <div class="data-label">Umidade</div>
          <div class="data-value">${humidityValue}</div>
        </div>
      </div>
    `
        : ""
    }

    <div class="timestamp">Atualizado: ${timestampText}</div>
    <div class="status-badge ${badgeClass}">${status}</div>
    
    `;

    cardElement.onclick = () => openDeviceDetails(deviceConfig);
  
  return cardElement;

}

function checkDeviceStatus(mac) {
  const config = allDevicesConfig[mac];
  const statusTimestamp = config?.statusTimestamp;
  if (!config || !statusTimestamp) {
    deviceStatus[mac] = "OFFLINE";
    return;
  }

  try {
    const nowMillis = Date.now();
    const statusTimestampMillis = statusTimestamp.toMillis();
    const differenceMillis = nowMillis - statusTimestampMillis;
    deviceStatus[mac] =
      differenceMillis > OFFLINE_THRESHOLD_SECONDS * 1000
        ? "OFFLINE"
        : "ONLINE";
    if (deviceCards[mac]) updateCardContent(deviceCards[mac], mac);
  } catch (e) {
    console.warn(`Erro ao verificar status do MAC ${mac}:`, e);
    deviceStatus[mac] = "OFFLINE";
  }
}

function checkAllDeviceStatus() {
  console.log("Executando verificação periódica de status...");
  for (const mac in allDevicesConfig) {
    checkDeviceStatus(mac);
  }
}

//Função que atualiza o conteúdo de cada card.
function updateCardContent(cardElement, mac) {
  const deviceConfig = allDevicesConfig[mac];
  const currentReading = deviceConfig.ultimasLeituras;
  const status = deviceStatus[mac] || "OFFLINE";

  const alarm = deviceAlarmStatus[mac] || { ativo: false, tipo: "Nenhum" };
    const isAlarm = alarm.ativo === true;

    const isSondaAtiva = deviceConfig.sondaAtiva === true;
  let mainValue = "N/A";
  let ambientTempValue = "N/A";
  let humidityValue = "N/A";
  let timestampText = "Sem dados";
  let mainColor = "#000000";
  let alarmeMinDisplay = "N/A";
  let alarmeMaxDisplay = "N/A";
  let mainLabelText = isSondaAtiva
    ? "🌡️ Sonda Externa"
    : "🏠 Temperatura Ambiente";
  let dataTexto = "--/--/----";
  let horaTexto = "--:--";
  let timestampLabel = "Última leitura:";



    if (isAlarm) {
        mainColor = "#e74c3c";     // vermelho
        
    } else if (status !== "ONLINE") {
        mainColor = "#95a5a6";     // cinza offline
    }


  cardElement.classList.toggle("in-alarm", isAlarm);

  
  if (
    status === "ONLINE" &&
    currentReading &&
    typeof currentReading === "object"
  ) {
    const tempSonda = currentReading.temperatura;
    const tempAmb = currentReading.temperaturaAmbiente;
    const umidade = currentReading.umidade;

    if (tempAmb !== undefined && tempAmb > -50)
      ambientTempValue = `${tempAmb.toFixed(1)}°C`;
    if (umidade !== undefined)
      humidityValue = `${parseFloat(umidade).toFixed(1)}%`;

    if (isSondaAtiva) {
      const minAlarm = deviceConfig.alarmeMin?.sonda;
      const maxAlarm = deviceConfig.alarmeMax?.sonda;
      alarmeMinDisplay = minAlarm !== undefined ? `${minAlarm}°C` : "N/A";
      alarmeMaxDisplay = maxAlarm !== undefined ? `${maxAlarm}°C` : "N/A";
      if (tempSonda !== undefined)
        mainValue = tempSonda <= -100 ? "N/A" : `${tempSonda.toFixed(1)}°C`;
    } else {
      const minAlarmAmb = deviceConfig.alarmeMin?.temperaturaAmbiente;
      const maxAlarmAmb = deviceConfig.alarmeMax?.temperaturaAmbiente;
      alarmeMinDisplay = minAlarmAmb !== undefined ? `${minAlarmAmb}°C` : "N/A";
      alarmeMaxDisplay = maxAlarmAmb !== undefined ? `${maxAlarmAmb}°C` : "N/A";
      if (tempAmb !== undefined)
        mainValue = tempAmb <= -100 ? "N/A" : `${tempAmb.toFixed(1)}°C`;

      if (umidade !== undefined)
        humidityValue =
          umidade < 0 ? "N/A" : `${parseFloat(umidade).toFixed(1)}%`;
    }

    const timestamp = currentReading.timestamp;
    if (timestamp && typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      dataTexto = date.toLocaleDateString("pt-BR");
      horaTexto = date.toLocaleTimeString("pt-BR");
    }
  } else {
    mainColor = "#95a5a6";
    if (
      currentReading?.timestamp &&
      typeof currentReading.timestamp.toDate === "function"
    ) {
      const date = currentReading.timestamp.toDate();
      dataTexto = date.toLocaleDateString("pt-BR");
      horaTexto = date.toLocaleTimeString("pt-BR");
    }

    const badgeEl = cardElement.querySelector('.status-badge');
if (badgeEl) {
    // LIMPEZA IMPORTANTE: Remove estilos inline forçados pela função de sync
    badgeEl.style.backgroundColor = ""; 
    badgeEl.style.color = "";
    
    // Seu código original continua aqui:
    badgeEl.className = `status-badge status-${status.toLowerCase()}`;
    badgeEl.textContent = status;
}

  }

  const setorDisplay = deviceConfig.nomeSetor || "N/A";
  const nomeDispositivoDisplay =
    deviceConfig.nomeDispositivo || "Dispositivo Desconhecido";

  const additionalDataHTML = isSondaAtiva
    ? `
        <div class="additional-data">
          <div class="data-item">
            <div class="data-label">Temp. Ambiente</div>
            <div class="data-value">${ambientTempValue}</div>
          </div>
          <div class="data-item">
            <div class="data-label">Umidade</div>
            <div class="data-value">${humidityValue}</div>
          </div>
        </div>
      `
    : `
        <div class="additional-data single-item">
          <div class="data-item">
            <div class="data-label">Umidade</div>
            <div class="data-value">${humidityValue}</div>
          </div>
        </div>
      `;

  cardElement.innerHTML = `
    <div class="device-header">${setorDisplay}</div>
    <div class="device-name">${nomeDispositivoDisplay}</div>
    <div class="device-header" style="font-weight: bold; color: ${
      isSondaAtiva ? "var(--cor-texto-cinza)" : "#3498db"
    };">
      ${mainLabelText}
    </div>
    <div class="main-temperature" style="color: ${mainColor};">${mainValue}</div>
    <div class="alarm-info">
      <span style="color: #3498db;">${alarmeMinDisplay}</span>
      &lt; alarmes &gt;
      <span style="color: #e74c3c;">${alarmeMaxDisplay}</span>
    </div>
    ${additionalDataHTML}
    <div class="timestamp">
  <span class="label">${timestampLabel}</span>
  <span class="datetime">
    <span class="date">${dataTexto}</span>
    <span class="time">${horaTexto}</span>
  </span>
</div>
    <div class="status-badge status-${status.toLowerCase()}">${status}</div>
  `;

  cardElement.onclick = () => {
 openDeviceDetails(deviceConfig);
  };
}


function clearAllListeners() {
    Object.values(deviceListeners).forEach(unsub => unsub && unsub());
    Object.values(alarmListeners).forEach(unsub => unsub && unsub());
    
    deviceListeners = {};
    alarmListeners = {};
    activeAlarms.clear();
}

//Função que direcionar para a página de detalhes do dispositivo clicado
function openDeviceDetails(deviceConfig) {
  const mac = deviceConfig.mac;
  
  if (!mac) {
    console.error('Dispositivo sem MAC:', deviceConfig);
    return;
  }

  window.location.href = `device-details.html?mac=${mac}`;
  
}


function checkInstallOverlay() {
    const lastTime = localStorage.getItem('pwa_prompt_timestamp');
    const agora = new Date().getTime();
    const umDia = 24 * 60 * 60 * 1000;

    // Se já instalou, não faz nada
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Só mostra se for Desktop e se passou mais de 24h desde o último "fechar"
    if (window.innerWidth > 1024 && (!lastTime || (agora - lastTime > umDia))) {
        setTimeout(() => {
            document.getElementById('desktop-install-overlay').style.display = 'block';
        }, 3000); 
    }
}

// Ao clicar em fechar
document.querySelector('.close-overlay').addEventListener('click', () => {
    document.getElementById('desktop-install-overlay').style.display = 'none';
    localStorage.setItem('pwa_prompt_timestamp', new Date().getTime());
});

// Chame a função
document.addEventListener('DOMContentLoaded', checkInstallOverlay);




// ======================================================
// 6. INSTALAÇÃO DO PWA 
// ======================================================

let deferredPrompt = null;
let installButton = null;

// 1. Captura o evento de instalação
window.addEventListener('beforeinstallprompt', (e) => {
  
  // Previne o prompt automático
  e.preventDefault();
  
  // Armazena o evento para uso posterior
  deferredPrompt = e;
  
  // Mostra o botão de instalação após 3 segundos
  setTimeout(showInstallButton, 3000);
});

// 2. Função para mostrar botão de instalação
function showInstallButton() {
  if (window.innerWidth > 1024) return;
  // Não mostra se já está instalado ou se já existe o botão
  if (isPWAInstalled() || document.getElementById('pwa-install-button')) {
    return;
  }
  
  // Cria o botão
  installButton = document.createElement('button');
  installButton.id = 'pwa-install-button';
  installButton.innerHTML = `
    <span style="font-size: 20px;">📱</span>
    <div style="text-align: left;">
      <div style="font-weight: bold; font-size: 14px;">Instalar App</div>
      <div style="font-size: 11px; opacity: 0.8;">Acesse aos dispositivos pelo celular</div>
    </div>
    <span style="margin-left: auto;">↓</span>
  `;
  
  // Estilos
  installButton.style.cssText = `
    position: fixed;
    bottom: 70px;
    right: 20px;
    background: linear-gradient(135deg, #153664 0%, #1e4a8e 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 15px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(21, 54, 100, 0.4);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 320px;
    animation: slideInUp 0.5s ease, pulse 2s infinite;
    transition: all 0.3s ease;
  `;
  
  // Adiciona animação
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(50px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes pulse {
      0% { box-shadow: 0 6px 20px rgba(21, 54, 100, 0.4); }
      50% { box-shadow: 0 6px 30px rgba(21, 54, 100, 0.7); }
      100% { box-shadow: 0 6px 20px rgba(21, 54, 100, 0.4); }
    }
    
    @media (max-width: 768px) {
      #pwa-install-button {
        left: 20px;
        right: 20px;
        bottom: 80px;
        width: calc(100% - 40px);
        max-width: none;
      }
    }
  `;
  document.head.appendChild(style);
  
  // Evento de clique
  installButton.addEventListener('click', installPWA);
  
  // Adiciona ao documento
  document.body.appendChild(installButton);
  
  // Remove após 30 segundos
  setTimeout(() => {
    if (installButton && document.body.contains(installButton)) {
      hideInstallButton();
    }
  }, 30000);
}

// 3. Função para instalar o PWA
async function installPWA() {
  if (!deferredPrompt) {
    showManualInstallGuide();
    return;
  }
  
  try {
    // Mostra o prompt de instalação
    deferredPrompt.prompt();
    
    // Aguarda a resposta do usuário
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      // Sucesso na instalação
      installButton.innerHTML = '✅ Instalado! O app será aberto em breve...';
      installButton.style.background = '#28a745';
      installButton.style.animation = 'none';
      
      setTimeout(hideInstallButton, 2000);
    }
    
    // Limpa o prompt
    deferredPrompt = null;
    
  } catch (error) {
    installButton.innerHTML = '❌ Erro na instalação';
    installButton.style.background = '#dc3545';
    
    setTimeout(hideInstallButton, 3000);
  }
}

//Função para identificar confição de alarme
function startAlarmListener(mac) {
    if (alarmListeners[mac]) return; // evita duplicatas

    const alarmRef = doc(db, "dispositivos", mac, "eventos", "estadoAlarmeAtual");

    const unsubscribe = onSnapshot(alarmRef, (snap) => {
        let alarmData = { ativo: false, tipo: "Nenhum" };

        if (snap.exists()) {
            const data = snap.data();
            alarmData = data?.estadoAlarmeAtual || alarmData;
        }

        deviceAlarmStatus[mac] = alarmData;

        // Opcional: notificação toast quando entra em alarme
        const wasActive = activeAlarms.has(mac);
        const isNowActive = alarmData.ativo === true;

        if (isNowActive && !wasActive && deviceStatus[mac] === "ONLINE") {
            const config = allDevicesConfig[mac];
            if (config) {
                const message = getFriendlyAlarmMessage(alarmData.tipo);
                showNotification(
                    `Alarme em ${config.nomeDispositivo || mac}: ${message}`,
                    "error",
                    "Atenção",
                    8000
                );
                activeAlarms.add(mac);
            }
        } else if (!isNowActive && wasActive) {
            activeAlarms.delete(mac);
        }

        // Atualiza o card visualmente
        if (deviceCards[mac]) {
            updateCardContent(deviceCards[mac], mac);
        }
    }, (err) => {
        console.error(`Erro no listener de alarme ${mac}:`, err);
        deviceAlarmStatus[mac] = { ativo: false, tipo: "Nenhum" };
        activeAlarms.delete(mac);
        if (deviceCards[mac]) updateCardContent(deviceCards[mac], mac);
    });

    alarmListeners[mac] = unsubscribe;
}

// 4. Função para esconder o botão
function hideInstallButton() {
  if (installButton && document.body.contains(installButton)) {
    installButton.style.opacity = '0';
    installButton.style.transform = 'translateY(50px)';
    
    setTimeout(() => {
      if (installButton && document.body.contains(installButton)) {
        installButton.remove();
        installButton = null;
      }
    }, 300);
  }
}

// 5. Verifica se o PWA já está instalado
function isPWAInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

// 6. Guia de instalação manual (fallback)
function showManualInstallGuide() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  
  let message = '';
  
  if (isIOS) {
    message = 'Para instalar: 1. Toque no ícone de compartilhar (📤) 2. Role para baixo 3. Toque em "Adicionar à Tela de Início"';
  } else if (isAndroid) {
    message = 'Para instalar: 1. Toque no menu (três pontos) 2. Toque em "Adicionar à tela inicial" 3. Confirme a instalação';
  } else {
    message = 'Para instalar: Clique no ícone de instalação (📥) na barra de endereços do navegador';
  }
  
  alert(message);
}

// 7. Inicialização
document.addEventListener('DOMContentLoaded', () => {
  // Verifica após carregamento completo
  setTimeout(() => {
    if (!isPWAInstalled() && deferredPrompt) {
      showInstallButton();
    }
  }, 2000);
  
  // =========================================================================
// CORREÇÃO MOBILE: RECONEXÃO AO VOLTAR O FOCO
// =========================================================================
// Reconexão agressiva ao voltar para foreground (muito importante em PWA/mobile)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("→ Visibilitychange: página visível novamente");

        // 1. Mostra "Sincronizando..." visualmente
        document.querySelectorAll('.status-badge').forEach(badge => {
            badge.className = 'status-badge status-sync';
            badge.textContent = 'Sincronizando...';
            badge.style.backgroundColor = '#f39c12';
        });

        // 2. Força verificação imediata
        checkAllDeviceStatus();

        // 3. Dá tempo pro Firestore restabelecer websocket
        setTimeout(checkAllDeviceStatus, 4000);
        setTimeout(checkAllDeviceStatus, 10000); // segunda chance

        // 4. Opcional: força uma leitura leve para "acordar" a conexão
        if (Object.keys(allDevicesConfig).length > 0) {
            const primeiroMac = Object.keys(allDevicesConfig)[0];
            getDoc(doc(db, "dispositivos", primeiroMac))
                .catch(() => {}); // silencioso
        }
    }
});

// Função auxiliar visual para mostrar que estamos reconectando
function forceSyncStatusUI() {
    const badges = document.querySelectorAll('.status-badge');
    
    badges.forEach(badge => {
        badge.classList.remove('status-online', 'status-offline');
        badge.style.backgroundColor = "#f1c40f"; 
        badge.style.color = "#fff";
        badge.textContent = "Sincronizando...";
    });
}
  });
