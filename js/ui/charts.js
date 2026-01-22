// js/ui/charts.js

export class DeviceChartManager {
    constructor() {
        this.mainChart = null;
        this.modalChart = null;
    }

    /**
     * Renderiza o gráfico principal da página de detalhes
     * @param {string} canvasId - ID do elemento canvas
     * @param {Array} readings - Array de objetos de leitura
     */
    renderMainChart(canvasId, readings) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Limpa instância anterior para evitar sobreposição/glitch
        if (this.mainChart) {
            this.mainChart.destroy();
            this.mainChart = null;
        }

        const data = this._processData(readings);
        const config = this._getChartConfig(data, false); // false = não é modal 

        this.mainChart = new Chart(ctx, config);
    }

    /**
     * Renderiza o gráfico dentro do Modal de Alarmes
     * @param {string} canvasId - ID do elemento canvas
     * @param {Array} readings - Array de objetos de leitura
     */
    renderModalChart(canvasId, readings) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (this.modalChart) {
            this.modalChart.destroy();
            this.modalChart = null;
        }

        const data = this._processData(readings);
        const config = this._getChartConfig(data, true); // true = é modal

        this.modalChart = new Chart(ctx, config);
    }

    /**
     * Destrói os gráficos manualmente 
     */
    destroyAll() {
        if (this.mainChart) this.mainChart.destroy();
        if (this.modalChart) this.modalChart.destroy();
    }

    // =========================================
    // MÉTODOS PRIVADOS (Helpers)
    // =========================================

    /**
     * Transforma os dados brutos do Firebase no formato do Chart.js
     */
    _processData(readings) {
        const labels = [];
        const temperatures = [];
        const ambientTemps = [];
        const humidities = [];

        readings.forEach((reading) => {
            if (typeof reading.timestamp !== "number") return;
            const date = new Date(reading.timestamp * 1000);
            // Formatação curta para mobile, longa para desktop 
            labels.push(date.toLocaleString("pt-BR"));
            
            temperatures.push(reading.temperatura ?? null);
            ambientTemps.push(reading.temperaturaAmbiente ?? null);
            humidities.push(reading.umidade ?? null);
        });

        return { labels, temperatures, ambientTemps, humidities };
    }

    /**
     * Gera a configuração do Chart.js baseada no dispositivo (Mobile/Desktop)
     */
    _getChartConfig(data, isModal) {
        const isMobile = window.innerWidth < 768;

        return {
            type: "line",
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: "Sonda (°C)",
                        data: data.temperatures,
                        borderColor: "#e74c3c", 
                        backgroundColor: "rgba(231, 76, 60, 0.1)",
                        fill: true,
                        // Mobile: sem pontos (0), linha mais fina. Desktop: pontos (3)
                        pointRadius: isMobile ? 0 : 3,
                        pointHoverRadius: isMobile ? 4 : 6,
                        borderWidth: isMobile ? 1.5 : 2,
                        tension: 0.1,
                        spanGaps: true,
                    },
                    {
                        label: "Ambiente (°C)",
                        data: data.ambientTemps,
                        borderColor: "#3498db", 
                        backgroundColor: "rgba(52, 152, 219, 0.1)",
                        fill: true,
                        pointRadius: isMobile ? 0 : 3,
                        pointHoverRadius: isMobile ? 4 : 6,
                        borderWidth: isMobile ? 1.5 : 2,
                        tension: 0.1,
                        spanGaps: true,
                    },
                    {
                        label: "Umidade (%)",
                        data: data.humidities,
                        borderColor: "#2ecc71", 
                        backgroundColor: "rgba(46, 204, 113, 0.1)",
                        fill: true,
                        yAxisID: "y1",
                        pointRadius: isMobile ? 0 : 3,
                        pointHoverRadius: isMobile ? 4 : 6,
                        borderWidth: isMobile ? 1.5 : 2,
                        tension: 0.1,
                        spanGaps: true,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Permite que o CSS controle a altura (para o mobile)
                
                interaction: {
                    mode: 'index',      // Mostra todos os datasets do mesmo índice X
                    intersect: false,   // Ativa o tooltip mesmo sem passar em cima do ponto
                },
                
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            // Diminui a fonte da legenda no celular
                            boxWidth: isMobile ? 10 : 40,
                            font: { size: isMobile ? 10 : 12 }
                        }
                    },
                    tooltip: {
                        // Tooltip um pouco maior no mobile 
                        titleFont: { size: isMobile ? 13 : 14 },
                        bodyFont: { size: isMobile ? 12 : 13 },
                        padding: 10,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)'
                    }
                },
                scales: {
                    x: {
                        title: { display: !isMobile, text: "Horário" }, // Esconde título do eixo no mobile para ganhar espaço
                        grid: {
                            display: !isMobile // Remove grades verticais no mobile 
                        },
                        ticks: {
                            // No mobile, limita o número de datas exibidas 
                            maxTicksLimit: isMobile ? 4 : 12,
                            maxRotation: 0,
                            font: { size: isMobile ? 10 : 12 }
                        }
                    },
                    y: {
                        title: { display: !isMobile, text: "Temperatura (°C)" },
                        ticks: { font: { size: isMobile ? 10 : 12 } }
                    },
                    y1: {
                        position: "right",
                        title: { display: !isMobile, text: "Umidade (%)" },
                        grid: { drawOnChartArea: false },
                        ticks: { font: { size: isMobile ? 10 : 12 } }
                    },
                },
            },
        };
    }
}