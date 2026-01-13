// js/utils/formatters.js


export const formatDateDM = (d) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });



export const formatDate = (d) => {
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

export const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
};


export const formatDateTime = (date) => {
    return `${formatDate(date)} ${formatTime(date)}`;
};

export const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
};


export const formatTemperature = (value) => {
    return value !== null && value !== undefined 
        ? `${value.toFixed(1)}°C` 
        : 'N/A';
};

export const formatHumidity = (value) => {
    return value !== null && value !== undefined 
        ? `${value.toFixed(1)}%` 
        : 'N/A';
};








