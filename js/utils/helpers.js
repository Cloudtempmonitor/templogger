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