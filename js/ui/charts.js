// Variável para armazenar a instância e permitir destruir depois
let modalChartInstance = null;

export function renderAlarmChart(canvasId, readings) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destrói gráfico anterior se existir
    if (modalChartInstance) {
        modalChartInstance.destroy();
        modalChartInstance = null;
    }

    if (!readings || readings.length === 0) {
        const context = ctx.getContext('2d');
        context.clearRect(0, 0, ctx.width, ctx.height);
        context.fillText('Nenhum dado disponível', 50, 50);
        return;
    }

    // Preparação dos dados (apenas transformação visual)
    const labels = readings.map(r => new Date(r.timestamp * 1000));
    
    modalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sonda (°C)',
                    data: readings.map(r => r.temperatura),
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: 'Ambiente (°C)',
                    data: readings.map(r => r.temperaturaAmbiente),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    tension: 0.1
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    type: 'time', 
                    time: { unit: 'minute', tooltipFormat: 'dd/MM/yyyy HH:mm' } 
                },
                y: { title: { display: true, text: 'Temperatura (°C)' } }
            }
        }
    });
}
