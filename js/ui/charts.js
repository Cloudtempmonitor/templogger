// js/ui/charts.js

export class DeviceChartManager {
    constructor() {
        this.mainChart = null;
        this.modalChart = null;
    }

    /**
     * Renderiza o gráfico principal
     */
    renderMainChart(canvasId, readings) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (this.mainChart) {
            this.mainChart.destroy();
            this.mainChart = null;
        }

        const data = this._processData(readings);
        const config = this._getChartConfig(data, false);

        this.mainChart = new Chart(ctx, config);
    }

    /**
     * Renderiza o gráfico do Modal
     */
    renderModalChart(canvasId, readings) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (this.modalChart) {
            this.modalChart.destroy();
            this.modalChart = null;
        }

        const data = this._processData(readings);
        const config = this._getChartConfig(data, true);

        this.modalChart = new Chart(ctx, config);
    }

    destroyAll() {
        if (this.mainChart) this.mainChart.destroy();
        if (this.modalChart) this.modalChart.destroy();
    }

    // =========================================
    // MÉTODOS PRIVADOS (Helpers)
    // =========================================

    /**
     * Transforma e AMOSTRA os dados para visualização
     */
    _processData(readings) {
        const isMobile = window.innerWidth < 768;

        // CÁLCULO DO LIMITE DE PONTOS (TAXA FIXA)
        // 1 leitura a cada 5 min = 12/hora = 288/dia.
        // 3 dias = 864 pontos.
        // Desktop: Fixamos em ~864 pontos para evitar saturação visual.
        // Mobile: Mantemos 300 para performance em telas pequenas.
        const maxPoints = isMobile ? 300 : 864;
        
        let dataToProcess = readings;

        // Lógica de Decimação (Downsampling)
        if (readings.length > maxPoints) {
            const step = Math.ceil(readings.length / maxPoints);
            // Pega 1 ponto a cada 'step'
            dataToProcess = readings.filter((_, index) => index % step === 0);
        }

        const labels = [];
        const temperatures = [];
        const ambientTemps = [];
        const humidities = [];

        dataToProcess.forEach((reading) => {
            if (typeof reading.timestamp !== "number") return;
            const date = new Date(reading.timestamp * 1000);
            labels.push(date.toLocaleString("pt-BR"));
            
            temperatures.push(reading.temperatura ?? null);
            ambientTemps.push(reading.temperaturaAmbiente ?? null);
            humidities.push(reading.umidade ?? null);
        });

        return { labels, temperatures, ambientTemps, humidities };
    }

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
                        pointRadius: 0, 
                        pointHoverRadius: 6, 
                        borderWidth: 2,      
                        tension: 0.1,
                        spanGaps: true,
                    },
                    {
                        label: "Ambiente (°C)",
                        data: data.ambientTemps,
                        borderColor: "#3498db",
                        backgroundColor: "rgba(52, 152, 219, 0.1)",
                        fill: true,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        borderWidth: 2,
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
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        borderWidth: 2,
                        tension: 0.1,
                        spanGaps: true,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: isMobile ? 10 : 40,
                            font: { size: isMobile ? 10 : 12 }
                        }
                    },
                    tooltip: {
                        titleFont: { size: isMobile ? 13 : 14 },
                        bodyFont: { size: isMobile ? 12 : 13 },
                        padding: 10,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)'
                    }
                },
                scales: {
                    x: {
                        title: { display: !isMobile, text: "Horário" },
                        grid: { display: !isMobile },
                        ticks: {
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