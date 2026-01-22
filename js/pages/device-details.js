// js/pages/device-details.js

import { auth, db } from "../services/firebase.js";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, startAt, endAt, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showNotification, showConfirmation } from "../ui/notifications.js";
import { formatDate, formatTime, formatDuration } from "../utils/formatters.js";
import { getUser } from "../core/state.js";
import { DeviceChartManager } from "../ui/charts.js"; 

/* ==========================================================================
   1. VARIÁVEIS GLOBAIS, CONSTANTES E ESTADO
   ========================================================================== */
let currentMac = null;
let currentReadings = [];
let flatpickrInstance = null;
const OFFLINE_THRESHOLD_SECONDS = 120;

// Instância do Gerenciador de Gráficos
const chartManager = new DeviceChartManager(); 

/* ==========================================================================
   2. INICIALIZAÇÃO E AUTH
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    const user = getUser();
    if (user) {
        initDeviceDetails();
    } else {
        window.addEventListener("userReady", () => {
            initDeviceDetails();
        });
    }
});

async function initDeviceDetails() {
    const user = getUser();
    if (!user) return;

    currentMac = new URLSearchParams(window.location.search).get("mac");

    if (!currentMac) {
        showNotification("Dispositivo não especificado.", "error");
        setTimeout(() => window.location.href = "./index.html", 2000);
        return;
    }

    console.log(`Iniciando monitoramento para: ${currentMac}`);

    if (typeof listenToDeviceStatus === 'function') listenToDeviceStatus(currentMac);
    if (typeof listenToAlarmStatus === 'function') listenToAlarmStatus(currentMac);
    if (typeof initializeFilters === 'function') initializeFilters();
}

function showLoading(show) {
    let loader = document.getElementById("loading-indicator");
    if (!loader) {
        loader = createLoader();
    }
    loader.style.display = show ? "block" : "none";
}

function createLoader() {
    const loader = document.createElement("div");
    loader.id = "loading-indicator";
    loader.innerHTML = "Carregando...";
    loader.style.cssText =
        "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000;";
    document.body.appendChild(loader);
    return loader;
}

/* ==========================================================================
   3. BUSCA DE DADOS E LISTENERS REAL-TIME
   ========================================================================== */

async function fetchData(startTimeStamp, endTimeStamp) {
    console.log(`Buscando dados de ${new Date(startTimeStamp * 1000)} até ${new Date(endTimeStamp * 1000)}`);
    showLoading(true);

    try {
        // Busca LEITURAS para o gráfico
        const dataQuery = query(
            collection(db, "dispositivos", currentMac, "leituras"),
            where("timestamp", ">=", startTimeStamp),
            where("timestamp", "<=", endTimeStamp),
            orderBy("timestamp")
        );
        const snapshot = await getDocs(dataQuery);
        currentReadings = [];
        snapshot.docs.forEach((doc) => {
            currentReadings.push(doc.data());
        });

        // Busca EVENTOS DE ALARME
        const alarmEvents = await fetchAlarmEvents(startTimeStamp, endTimeStamp);

        // Renderiza Gráfico Principal usando o Manager
        chartManager.renderMainChart("device-chart", currentReadings);

        const deviceSnap = await getDoc(doc(db, "dispositivos", currentMac));
        const deviceConfig = deviceSnap.exists() ? deviceSnap.data() : {};

        renderAlarmHistory(alarmEvents, deviceConfig);
        renderStats(currentReadings, deviceConfig);
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        showNotification("Erro ao carregar dados do gráfico.", "error");
    } finally {
        showLoading(false);
    }
}

async function fetchAlarmEvents(startTimeStamp, endTimeStamp) {
    try {
        const eventsQuery = query(
            collection(db, "dispositivos", currentMac, "eventos"),
            where("startTime", ">=", new Date(startTimeStamp * 1000)),
            where("startTime", "<=", new Date(endTimeStamp * 1000)),
            orderBy("startTime")
        );

        const snapshot = await getDocs(eventsQuery);
        const alarmEvents = [];

        snapshot.docs.forEach((doc) => {
            const eventData = doc.data();
            alarmEvents.push({
                id: doc.id,
                ...eventData,
                startTimestamp: eventData.startTime?.toMillis() / 1000,
                endTimestamp: eventData.endTime?.toMillis() / 1000,
            });
        });

        return alarmEvents;
    } catch (error) {
        console.error("Erro ao buscar eventos de alarme:", error);
        return [];
    }
}

function listenToDeviceStatus(mac) {
    const deviceDocRef = doc(db, "dispositivos", mac);

    onSnapshot(deviceDocRef, (snapshot) => {
        const statusBox = document.getElementById("realtime-status-box");
        const statusText = document.getElementById("realtime-status-text");
        const statusDetail = document.getElementById("realtime-status-detail");
        const lastReadingEl = document.getElementById("last-reading");
        const lastUpdateEl = document.getElementById("last-update-time");
        const deviceNameEl = document.getElementById("device-name");
        const setorEl = document.getElementById("info-setor");
        const unidadeEl = document.getElementById("info-unidade");
        const configListEl = document.getElementById("info-config-list");

        if (snapshot.exists()) {
            const deviceData = snapshot.data();

            deviceNameEl.textContent = deviceData.nomeDispositivo || "Dispositivo sem nome";
            unidadeEl.textContent = deviceData.nomeUnidade || "Não definida";
            setorEl.textContent = deviceData.nomeSetor || "Não definido";

            configListEl.innerHTML = `
                <li><strong>Intervalo de Envio:</strong> ${(typeof deviceData.intervaloEnvio === 'number') ? (deviceData.intervaloEnvio / 60) + ' min' : 'N/A'}</li>
                <li><strong>Alarme Ambiente:</strong> ${deviceData.alarmeTempAmbienteAtivo ? '✅' : '❌'}</li>
                <li><strong>Sonda Ativa:</strong> ${deviceData.sondaAtiva ? '✅' : '❌'}</li>
                <li><strong>Alarme Sonda:</strong> ${deviceData.alarmeSondaAtivo ? '✅' : '❌'}</li>
                <li><strong>Alarme Umidade:</strong> ${deviceData.alarmeUmidadeAtivo ? '✅' : '❌'}</li>
                <li><strong>Alarme Falha Sonda:</strong> ${deviceData.alarmeFalhaSondaAtivo ? '✅' : '❌'}</li>
            `;

            const lastReading = deviceData.ultimasLeituras || {};
            const sondaTemp = lastReading.temperatura;
            const ambTemp = lastReading.temperaturaAmbiente;
            const umid = lastReading.umidade;

            lastReadingEl.textContent = `Sonda: ${sondaTemp !== undefined ? sondaTemp.toFixed(1) : "N/A"}°C | Amb: ${ambTemp !== undefined ? ambTemp.toFixed(1) : "N/A"}°C | Umid: ${umid !== undefined ? umid.toFixed(1) : "N/A"}%`;

            const lastReadingTimestamp = deviceData.ultimasLeituras?.timestamp;
            if (lastReadingTimestamp && lastReadingTimestamp.toDate) {
                lastUpdateEl.textContent = `Atualizado em: ${lastReadingTimestamp.toDate().toLocaleString('pt-BR')}`;
            } else {
                lastUpdateEl.textContent = "Nenhuma leitura recente.";
            }

            const statusTimestamp = deviceData.statusTimestamp;
            let status = "OFFLINE";
            if (statusTimestamp && typeof statusTimestamp.toMillis === "function") {
                const nowMillis = Date.now();
                const statusTimestampMillis = statusTimestamp.toMillis();
                const differenceMillis = nowMillis - statusTimestampMillis;

                if (differenceMillis <= OFFLINE_THRESHOLD_SECONDS * 1000) {
                    status = "ONLINE";
                }
            }

            if (status === "ONLINE") {
                if (!statusBox.classList.contains('alarme')) {
                    statusBox.className = "status-box normal";
                    statusText.textContent = "NORMAL";
                    statusDetail.textContent = "Operando dentro dos limites";
                }
            } else {
                statusBox.className = "status-box offline";
                statusText.textContent = "OFFLINE";
                statusDetail.textContent = "Sem comunicação";
            }

        } else {
            showNotification("Dispositivo não encontrado.", "error");
            window.location.href = "index.html";
        }
    }, (error) => {
        console.error("Erro ao ouvir documento do dispositivo: ", error);
        document.getElementById("realtime-status-text").textContent = "ERRO DE CONEXÃO";
        document.getElementById("realtime-status-detail").textContent = "Falha ao carregar dados.";
        document.getElementById("realtime-status-box").className = "status-box offline";
    });
}

function listenToAlarmStatus(mac) {
    const statusBox = document.getElementById("realtime-status-box");
    const statusText = document.getElementById("realtime-status-text");
    const statusDetail = document.getElementById("realtime-status-detail");
    const alarmStatusRef = doc(db, "dispositivos", mac, "eventos", "estadoAlarmeAtual");

    onSnapshot(alarmStatusRef, (docSnap) => {
        if (statusBox.classList.contains('offline')) return;

        if (docSnap.exists()) {
            const data = docSnap.data().estadoAlarmeAtual || {};
            if (data.ativo === true) {
                statusBox.className = "status-box alarme";
                statusText.textContent = "EM ALARME";
                statusDetail.textContent = `Tipo: ${data.tipo || 'Indefinido'}`;
            } else {
                statusBox.className = "status-box normal";
                statusText.textContent = "NORMAL";
                statusDetail.textContent = "Operando dentro dos limites";
            }
        } else {
            statusBox.className = "status-box normal";
            statusText.textContent = "NORMAL";
            statusDetail.textContent = "Operando dentro dos limites";
        }
    }, (error) => {
        console.error("Erro ao ouvir status de alarme: ", error);
    });
}

document.getElementById("close-modal").addEventListener("click", closeModal);
document.getElementById("alarm-graph-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("alarm-graph-modal")) closeModal();
});

/* ==========================================================================
   4. RENDERIZAÇÃO E FILTROS
   ========================================================================== */

async function updateChartData() {
    if (!currentMac || !flatpickrInstance) return;
    const selectedDates = flatpickrInstance.selectedDates;

    if (selectedDates.length < 2) {
        showNotification("Por favor, selecione um período válido.", "info");
        return;
    }

    const startDate = selectedDates[0];
    const endDate = selectedDates[1];
    const startTimeStamp = Math.floor(startDate.getTime() / 1000);
    const endTimeStamp = Math.floor(endDate.getTime() / 1000);

    if (startTimeStamp > endTimeStamp) {
        showNotification("Data inicial não pode ser posterior à data final.", "error");
        return;
    }
    await fetchData(startTimeStamp, endTimeStamp);
}

function renderStats(readings, deviceConfig) {
    const summaryEl = document.getElementById("stats-summary");
    if (!readings || readings.length === 0) {
        summaryEl.innerHTML = "<p>Nenhum dado no período.</p>";
        return;
    }

    const calculateMetrics = (readingKey, configKey) => {
        const values = readings
            .map((r) => r[readingKey])
            .filter((v) => v !== null && v !== undefined && typeof v === "number");

        const minLimit = deviceConfig?.alarmeMin?.[configKey];
        const maxLimit = deviceConfig?.alarmeMax?.[configKey];
        let hasError = false;

        if (values.length === 0) {
            return { avg: "N/A", max: "N/A", min: "N/A", minLimit, maxLimit, hasError };
        }

        const sum = values.reduce((a, b) => a + b, 0);
        const avg = (sum / values.length);
        const max = Math.max(...values);
        const min = Math.min(...values);

        if ((minLimit !== undefined && min < minLimit) || (maxLimit !== undefined && max > maxLimit)) {
            hasError = true;
        }

        return { avg, max, min, minLimit, maxLimit, hasError };
    };

    const sondaStats = calculateMetrics("temperatura", "sonda");
    const ambStats = calculateMetrics("temperaturaAmbiente", "temperaturaAmbiente");
    const umidStats = calculateMetrics("umidade", "umidade");

    const formatStatLine = (label, value, limit, unit, type) => {
        if (value === "N/A") return `<p><strong>${label}:</strong> N/A</p>`;
        let isError = false;
        let limitStr = "";
        if (limit !== undefined && limit !== null) {
            limitStr = ` / (Limite: ${limit.toFixed(1)}${unit})`;
            if (type === 'min' && value < limit) isError = true;
            if (type === 'max' && value > limit) isError = true;
        }
        return `<p class="${isError ? 'stat-error' : ''}"><strong>${label}:</strong> ${value.toFixed(2)}${unit}<span class="stat-limit">${limitStr}</span></p>`;
    };

    const formatAvgLine = (label, value, unit) => {
        if (value === "N/A") return `<p><strong>${label}:</strong> N/A</p>`;
        return `<p><strong>${label}:</strong> ${value.toFixed(2)}${unit}</p>`;
    };

    summaryEl.innerHTML = `
        <div class="stats-card ${sondaStats.hasError ? 'error-card' : ''}">
            <h4>🌡️ Temperatura Sonda</h4>
            ${formatAvgLine("Média", sondaStats.avg, "°C")}
            ${formatStatLine("Mínima", sondaStats.min, sondaStats.minLimit, "°C", 'min')}
            ${formatStatLine("Máxima", sondaStats.max, sondaStats.maxLimit, "°C", 'max')}
        </div>
        <div class="stats-card ${ambStats.hasError ? 'error-card' : ''}">
            <h4>🌡️ Temperatura Ambiente</h4>
            ${formatAvgLine("Média", ambStats.avg, "°C")}
            ${formatStatLine("Mínima", ambStats.min, ambStats.minLimit, "°C", 'min')}
            ${formatStatLine("Máxima", ambStats.max, ambStats.maxLimit, "°C", 'max')}
        </div>
        <div class="stats-card ${umidStats.hasError ? 'error-card' : ''}">
            <h4>💧 Umidade</h4>
            ${formatAvgLine("Média", umidStats.avg, "%")}
            ${formatStatLine("Mínima", umidStats.min, umidStats.minLimit, "%", 'min')}
            ${formatStatLine("Máxima", umidStats.max, umidStats.maxLimit, "%", 'max')}
        </div>
    `;
}

function renderAlarmHistory(alarmEvents, deviceConfig = {}) {
    const alarmList = document.getElementById("alarm-list");
    alarmList.innerHTML = "";

    if (!alarmEvents || alarmEvents.length === 0) {
        alarmList.innerHTML = `<li style="text-align:center;padding:20px;color:#95a5a6;font-style:italic;">Nenhum alarme no período.</li>`;
        return;
    }

    alarmEvents.forEach((event) => {
        const li = document.createElement("li");
        const startDate = new Date(event.startTimestamp * 1000);
        const endDate = event.endTimestamp ? new Date(event.endTimestamp * 1000) : null;
        const startStr = `${formatDate(startDate)} ${formatTime(startDate)}`;
        const endStr = endDate ? `${formatDate(endDate)} ${formatTime(endDate)}` : "ATIVO";

        let duracao = "Em andamento";
        if (endDate) {
            const diff = Math.round((endDate - startDate) / 60000);
            duracao = diff < 60 ? `${diff} min` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
        }

        const startReading = event.startReading || {};
        const sonda = formatValue(startReading.temperatura, "sonda", "°C", deviceConfig);
        const amb = formatValue(startReading.temperaturaAmbiente, "temperaturaAmbiente", "°C", deviceConfig);
        const umid = formatValue(startReading.umidade, "umidade", "%", deviceConfig);
        const statusText = event.status === "resolvido" ? "RESOLVIDO" : "ATIVO";
        const icon = event.status === "resolvido" ? "✅" : "⚠️";

        li.innerHTML = `
            <span class="alarm-icon" style="cursor:pointer;">${icon}</span>
            <span style="flex:1; display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:0.95em;">
                <span><strong>Início:</strong> ${startStr} → <strong>Fim:</strong> ${endStr} ${duracao !== "Em andamento" ? ` | <strong>Duração:</strong> ${duracao}` : ""}</span>
                <span style="color:#2c3e50;">${sonda ? `Sonda: ${sonda}` : ""} ${amb ? ` · Ambiente: ${amb}` : ""} ${umid ? ` · Umidade: ${umid}` : ""}</span>
                <span class="alarm-status ${event.status === "resolvido" ? "resolvido" : "ativo"}">${statusText}</span>
            </span>
        `;
        li.querySelector(".alarm-icon").addEventListener("click", () => {
            openAlarmGraph(event, deviceConfig);
        });
        alarmList.appendChild(li);
    });
}

function initializeFilters() {
    flatpickrInstance = flatpickr("#date-range-picker", {
        mode: "range", enableTime: true, dateFormat: "d/m/y H:i", locale: "pt", defaultHour: 0, defaultMinute: 0,
        onChange: function (selectedDates) {
            if (selectedDates.length === 2) document.getElementById("time-filter").value = "custom";
        },
    });
    document.getElementById("update-button").addEventListener("click", updateChartData);
    document.getElementById("time-filter").addEventListener("change", (e) => setPickerToPreset(e.target.value));
    setPickerToPreset("12");
    updateChartData();
}

function setPickerToPreset(hoursValue) {
    if (hoursValue === "custom" || !flatpickrInstance) return;
    const hours = parseInt(hoursValue);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hours * 3600 * 1000);
    flatpickrInstance.setDate([startDate, endDate]);
}

document.getElementById("export-csv").addEventListener("click", () => {
    if (currentReadings.length === 0) return showNotification("Nenhum dado para exportar.", "info");
    let csv = "Data,Hora,Sonda,TemperaturaAmbiente,Umidade,Alarme\n";
    currentReadings.forEach((r) => {
        const dateStr = new Date(r.timestamp * 1000).toLocaleString("pt-BR");
        csv += `${dateStr},${r.temperatura ?? "N/A"},${r.temperaturaAmbiente ?? "N/A"},${r.umidade ?? "N/A"},${r.alarme ?? "N/A"}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leituras_${currentMac}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

/* ==========================================================================
   5. MODAL DE DETALHES DE ALARME (CONTROLLER)
   ========================================================================== */

async function openAlarmGraph(alarmEvent, deviceConfig) {
    console.log("🔧 Abrindo modal para evento:", alarmEvent.id);

    const modal = document.getElementById("alarm-graph-modal");
    if (!modal) return;

    // Limpa textos da UI
    document.getElementById("modal-device-name").textContent = deviceConfig.nomeDispositivo || "Dispositivo";
    document.getElementById("modal-device-mac").textContent = currentMac;
    document.getElementById("modal-alarm-start").textContent = "";
    document.getElementById("modal-alarm-end").textContent = "";
    document.getElementById("modal-alarm-duration").textContent = "";
    document.getElementById("modal-alarm-trigger").innerHTML = "";
    document.getElementById("modal-event-details").innerHTML = "";

    // Datas do Cabeçalho
    const startDate = new Date(alarmEvent.startTimestamp * 1000);
    const endDate = alarmEvent.endTimestamp ? new Date(alarmEvent.endTimestamp * 1000) : null;
    document.getElementById("modal-alarm-start").textContent = `${formatDate(startDate)} ${formatTime(startDate)}`;
    document.getElementById("modal-alarm-end").textContent = endDate ? `${formatDate(endDate)} ${formatTime(endDate)}` : "Em andamento";
    document.getElementById("modal-alarm-duration").textContent = endDate ? formatDuration((endDate - startDate) / 1000) : "Em andamento";

    //Busca dados do período "Exato" para calcular Picos
    const exactReadings = await getAlarmPeriodReadings(alarmEvent);
    const eventPeaks = calculateEventPeaks(exactReadings);
    
    document.getElementById("modal-alarm-trigger").innerHTML = `
        <div class="peaks-section">
            <h4 style="margin:0 0 12px; color:#2c3e50; border-bottom:2px solid #3498db; padding-bottom:4px;">📈 Picos do Evento</h4>
            ${formatEventPeaks(eventPeaks)}
        </div>`;

    document.getElementById("modal-event-details").innerHTML = `
        <div class="details-section">
            <h4 style="margin:20px 0 12px; color:#2c3e50; border-bottom:2px solid #e67e22; padding-bottom:4px;">📋 Detalhes do Evento</h4>
            ${formatEventDetails(alarmEvent, deviceConfig)}
        </div>`;

    //Busca dados com BUFFER (30 min antes/depois) para o Gráfico
    const buffer = 30 * 60; 
    const startTimeWithBuffer = alarmEvent.startTimestamp - buffer;
    const endTimeWithBuffer = (alarmEvent.endTimestamp || Math.floor(Date.now() / 1000)) + buffer;

    console.log(`🔍 Buscando leituras do modal (buffer 30min)...`);
    const bufferQuery = query(
        collection(db, "dispositivos", currentMac, "leituras"),
        where("timestamp", ">=", startTimeWithBuffer),
        where("timestamp", "<=", endTimeWithBuffer),
        orderBy("timestamp")
    );
    const bufferSnapshot = await getDocs(bufferQuery);
    const bufferReadings = [];
    bufferSnapshot.docs.forEach(doc => bufferReadings.push(doc.data()));

    //Renderiza usando o Manager
    if (bufferReadings.length > 0) {
        chartManager.renderModalChart("modal-chart", bufferReadings);
    } else {
        const ctx = document.getElementById("modal-chart").getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillText('Nenhum dado disponível para este período', 50, 50);
    }

    modal.style.display = "flex";
    setTimeout(() => modal.classList.add("show"), 50);
}

function closeModal() {
    const modal = document.getElementById("alarm-graph-modal");
    modal.classList.remove("show");
    setTimeout(() => {
        modal.style.display = "none";
        // O ChartManager lidará com a destruição na próxima renderização
    }, 300);
}

// Helpers de Dados 
async function getAlarmPeriodReadings(alarmEvent) {
    try {
        const queryRef = query(
            collection(db, "dispositivos", currentMac, "leituras"),
            where("timestamp", ">=", alarmEvent.startTimestamp),
            where("timestamp", "<=", (alarmEvent.endTimestamp || Math.floor(Date.now() / 1000))),
            orderBy("timestamp")
        );
        const snapshot = await getDocs(queryRef);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Erro busca exata:", error);
        return [];
    }
}

// --- Helpers de Formatação (formatEventPeaks, formatEventDetails, formatLimites, etc...)

function formatEventDetails(alarmEvent, config) {
    const startLimites = alarmEvent.limitesIniciais || {};
    const endLimites = alarmEvent.limitesFinais || {};
    const endReading = alarmEvent.endReading || {};
    const limitesAlterados = verificarMudancasLimites(startLimites, endLimites);
    let motivoDisplay = '✅ Leituras normalizadas';
    let motivoCor = '#27ae60';
    if (limitesAlterados.temMudancas) {
        motivoDisplay = '⚙️ Limites ajustados';
        motivoCor = '#e67e22';
    }
    return `
        <div style="font-size:0.9em; line-height:1.3;">
            <div style="display:flex; justify-content:space-between; margin:8px 0;">
                <div><strong>🔔 Tipo:</strong> <span style="color:#e74c3c; font-weight:600;">${alarmEvent.tipoAlarme || 'N/A'}</span></div>
                <div><strong>📈 Status:</strong> <span class="alarm-status ${alarmEvent.status}" style="padding:2px 8px;">${alarmEvent.status?.toUpperCase() || 'ATIVO'}</span></div>
            </div>
            ${alarmEvent.status === 'resolvido' ? `<div style="margin:6px 0; padding:6px; background:#e8f5e8; border-radius:4px;"><strong>🎯 Motivo:</strong> <span style="color:${motivoCor};">${motivoDisplay}</span></div>` : ''}
            <div style="margin:10px 0;"><strong>📏 Limites Vigentes:</strong>${formatLimites(startLimites)}</div>
             ${(limitesAlterados.temMudancas && alarmEvent.status === 'resolvido') ? `<div style="margin:8px 0; padding:6px; background:#fff3cd; border-radius:4px;"><strong>🔄 Limites Alterados:</strong>${formatMudancas(limitesAlterados.mudancas)}</div>` : ''}
            ${alarmEvent.status === 'resolvido' ? `<div style="margin:8px 0; padding:6px; background:#e8f4fd; border-radius:4px;"><strong>📉 Leituras Finais:</strong>${formatEndReadings(endReading, config)}</div>` : ''}
        </div>`;
}

function calculateEventPeaks(readings) {
    const peaks = { sonda: { min: null, max: null }, ambiente: { min: null, max: null }, umidade: { min: null, max: null } };
    const getVals = (key) => readings.map(r => r[key]).filter(v => typeof v === 'number' && !isNaN(v));
    const sVals = getVals('temperatura'), aVals = getVals('temperaturaAmbiente'), uVals = getVals('umidade');
    if (sVals.length) peaks.sonda = { min: Math.min(...sVals), max: Math.max(...sVals) };
    if (aVals.length) peaks.ambiente = { min: Math.min(...aVals), max: Math.max(...aVals) };
    if (uVals.length) peaks.umidade = { min: Math.min(...uVals), max: Math.max(...uVals) };
    return peaks;
}

function formatEventPeaks(peaks) {
    const rows = [
        { l: 'Sonda', u: '°C', d: peaks.sonda }, { l: 'Ambiente', u: '°C', d: peaks.ambiente }, { l: 'Umidade', u: '%', d: peaks.umidade }
    ].map(s => `
        <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:4px 8px 4px 0; font-size:0.9em;"><strong>${s.l}</strong></td>
            <td style="padding:4px 8px; text-align:center; font-size:0.9em; color:#3498db; font-weight:600;">${s.d.min !== null ? s.d.min.toFixed(1) + s.u : '--'}</td>
            <td style="padding:4px 8px; text-align:center; font-size:0.9em; color:#e74c3c; font-weight:600;">${s.d.max !== null ? s.d.max.toFixed(1) + s.u : '--'}</td>
        </tr>`).join('');
    return `<table style="width:100%; font-size:0.85em; border-collapse:collapse; background:#f8f9fa; border-radius:4px;"><thead><tr style="background:#e9ecef;"><th style="padding:5px 8px; text-align:left;">Sensor</th><th style="padding:5px 8px; text-align:center;">Mín. Evento</th><th style="padding:5px 8px; text-align:center;">Máx. Evento</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function formatLimites(limites) {
    const rows = [
        { k: 'sonda', l: 'Sonda', u: '°C' }, { k: 'temperaturaAmbiente', l: 'Ambiente', u: '°C' }, { k: 'umidade', l: 'Umidade', u: '%' }
    ].map(s => {
        const l = limites[s.k] || {};
        return `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:3px;font-size:0.85em;"><strong>${s.l}</strong></td><td style="text-align:center;font-size:0.85em;">${l.min?.toFixed(1) || '--'}${s.u}</td><td style="text-align:center;font-size:0.85em;">${l.max?.toFixed(1) || '--'}${s.u}</td><td style="text-align:center;font-size:0.85em;">${l.ativo ? '✅' : '❌'}</td></tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;background:#f8f9fa;"><thead><tr style="background:#e9ecef;"><th>Sensor</th><th>Mín</th><th>Máx</th><th>Ativo</th></tr></thead><tbody>${rows}</tbody></table>${limites.histerese ? `<div style="font-size:0.8em;color:#7f8c8d;margin-top:4px;"><strong>Histerese:</strong> ${limites.histerese}°C</div>` : ''}`;
}

function formatMudancas(mudancas) {
    const labels = { sonda: 'Sonda', temperaturaAmbiente: 'Ambiente', umidade: 'Umidade' };
    return mudancas.map(m => {
        const c = [];
        if (m.min.alterado) c.push(`Mín: ${m.min.inicio}→${m.min.fim}`);
        if (m.max.alterado) c.push(`Máx: ${m.max.inicio}→${m.max.fim}`);
        if (m.ativo.alterado) c.push(`${m.ativo.inicio ? '✅' : '❌'}→${m.ativo.fim ? '✅' : '❌'}`);
        return `<div style="margin:2px 0; font-size:0.85em;"><strong>${labels[m.sensor]}:</strong> ${c.join(' | ')}</div>`;
    }).join('');
}

function formatValue(val, key, unit, config) {
    if (val === null || val === undefined) return "";
    const min = config?.alarmeMin?.[key], max = config?.alarmeMax?.[key];
    let isError = (min !== undefined && val < min) || (max !== undefined && val > max);
    let limitStr = isError ? (val < min ? ` (Min: ${min.toFixed(1)})` : ` (Max: ${max.toFixed(1)})`) : "";
    return isError ? `<span style="color:#e74c3c; font-weight:bold;">${val.toFixed(1)}${unit}</span><span style="font-size:0.9em; color:#7f8c8d;">${limitStr}</span>` : "";
}

function formatEndReadings(endReading, config) {
    return [
        { k: 'temperatura', l: 'Sonda', u: '°C' }, { k: 'temperaturaAmbiente', l: 'Ambiente', u: '°C' }, { k: 'umidade', l: 'Umidade', u: '%' }
    ].map(s => {
        if (endReading[s.k] === undefined) return '';
        const alarm = endReading[`alarme${s.l.replace(' ', '')}`];
        return `<span style="margin-right:12px; color:${alarm ? '#e74c3c' : '#27ae60'};">${s.l}: ${endReading[s.k].toFixed(1)}${s.u}${alarm ? ' ⚠️' : ' ✅'}</span>`;
    }).join('');
}

function verificarMudancasLimites(inicio, fim) {
    const mudancas = [];
    ['sonda', 'temperaturaAmbiente', 'umidade'].forEach(key => {
        const i = inicio[key] || {}, f = fim[key] || {};
        if (i.min !== f.min || i.max !== f.max || i.ativo !== f.ativo) {
            mudancas.push({ sensor: key, min: { inicio: i.min, fim: f.min, alterado: i.min !== f.min }, max: { inicio: i.max, fim: f.max, alterado: i.max !== f.max }, ativo: { inicio: i.ativo, fim: f.ativo, alterado: i.ativo !== f.ativo } });
        }
    });
    return { temMudancas: mudancas.length > 0, mudancas };
}

document.getElementById("export-png-btn").addEventListener("click", () => {
    const modalContent = document.querySelector("#alarm-graph-modal .modal-content");
    if (!modalContent) return showNotification("Erro: Modal não encontrado.", "error");
    const deviceName = document.getElementById("modal-device-name").textContent.trim();
    const startTime = document.getElementById("modal-alarm-start").textContent.trim().replace(/[:\/]/g, "-");
    showNotification("Gerando imagem...", "info");
    html2canvas(modalContent, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff" })
        .then((canvas) => {
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/jpeg", 0.9);
            a.download = `Alarme_${deviceName}_${startTime}.jpg`;
            a.click();
            showNotification("Imagem exportada!", "success");
        })
        .catch(err => { console.error(err); showNotification("Falha ao gerar imagem.", "error"); });
});