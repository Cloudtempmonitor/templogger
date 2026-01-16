// js/utils/helpers.js
// Funções auxiliares
export function initDateRangePicker(selector, options = {}) {
    const defaultOptions = {
        mode: 'range',
        locale: 'pt',
        dateFormat: 'd/m/Y',
        ...options
    };
    
    return flatpickr(selector, defaultOptions);
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}




export function getFriendlyAlarmMessage(tipo) {
    const messages = {
        sonda_min:          "Sonda abaixo do mínimo",
        sonda_max:          "Sonda acima do máximo",
        temperaturaAmbiente_min: "Temperatura ambiente baixa",
        temperaturaAmbiente_max: "Temperatura ambiente alta",
        umidade_min:        "Umidade abaixo do mínimo",
        umidade_max:        "Umidade acima do máximo",
        falha_sonda:        "Falha na sonda",
        Nenhum:             "Nenhum alarme",
    };
    return messages[tipo] || tipo || "Alarme desconhecido";
}