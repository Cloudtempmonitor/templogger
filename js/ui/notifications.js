// =========================================
// NOTIFICATIONS.JS (COM DEDUPLICAÇÃO)
// =========================================

const notificationQueue = [];
let isShowingNotification = false;

// Variável para armazenar a última notificação e evitar duplicidade
let lastNotificationLog = { message: '', timestamp: 0 };

const TOAST_CONFIG = {
    info: { icon: 'ℹ️', color: '#3498db', defaultTitle: 'Aviso' },
    success: { icon: '✅', color: '#2ecc71', defaultTitle: 'Sucesso!' },
    error: { icon: '❌', color: '#e74c3c', defaultTitle: 'Erro!' }
};

// ... (createToastElement permanece igual) ...
function createToastElement(notif) {
    const config = TOAST_CONFIG[notif.type] || TOAST_CONFIG.info;
    const finalTitle = notif.title === 'Aviso' ? config.defaultTitle : notif.title;

    const div = document.createElement('div');
    div.className = 'notification-toast'; 
    div.setAttribute('role', 'alert');
    div.style.borderLeft = `5px solid ${config.color}`;

    div.innerHTML = `
        <div class="notification-header" style="color: ${config.color}">
            <span class="notification-icon">${config.icon}</span>
            <h4 class="notification-title">${finalTitle}</h4>
            <button class="notification-close-btn" aria-label="Fechar">×</button>
        </div>
        <p class="notification-message">${notif.message}</p>
    `;

    return div;
}

/**
 * Exibe uma notificação em formato toast com fila e filtro anti-spam.
 */
export function showNotification(message, type = 'info', title = 'Aviso', autoCloseMs = 5000) {
    
    // --- LÓGICA ANTI-DUPLICIDADE (NOVO) ---
    const now = Date.now();
    const isSameMessage = message === lastNotificationLog.message;
    const isRecent = (now - lastNotificationLog.timestamp) < 3000; // 3 segundos de tolerância

    // Se for a mesma mensagem e faz menos de 3s, ignora silenciosamente
    if (isSameMessage && isRecent) {
        console.log("Notificação duplicada ignorada:", message);
        return;
    }

    // Atualiza o log da última mensagem
    lastNotificationLog = { message, timestamp: now };
    // --------------------------------------

    if (!['info', 'success', 'error'].includes(type)) type = 'info';
    notificationQueue.push({ message, type, title, autoCloseMs });
    processQueue();
}

function processQueue() {
    if (isShowingNotification || notificationQueue.length === 0) return;

    isShowingNotification = true;
    const notif = notificationQueue.shift();
    const toast = createToastElement(notif);

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    console.log(`[NOTIFICAÇÃO:${notif.type.toUpperCase()}] ${notif.title}: ${notif.message}`);

    let timeoutId = null;
    
    if (notif.type !== 'error' || notif.autoCloseMs > 0) {
        if (notif.autoCloseMs > 0) {
            timeoutId = setTimeout(() => closeToast(toast), notif.autoCloseMs);
        }
    }

    const closeBtn = toast.querySelector('.notification-close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (timeoutId) clearTimeout(timeoutId);
        closeToast(toast);
    });

    toast.addEventListener('click', () => {
        if (timeoutId) clearTimeout(timeoutId);
        closeToast(toast);
    });
}

function closeToast(toast) {
    toast.classList.remove('show');

    toast.addEventListener('transitionend', () => {
        if (toast.parentNode) {
            toast.remove();
        }
        isShowingNotification = false;
        setTimeout(processQueue, 100); 
    }, { once: true });
}

// ... (showConfirmation permanece igual) ...
export function showConfirmation(message, title = "Confirmar Ação") {
  return new Promise((resolve) => {
    const existingOverlay = document.querySelector(".notification-confirm-overlay");
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement("div");
    overlay.className = "notification-confirm-overlay";
    overlay.innerHTML = `
      <div class="notification-confirm-box" role="alertdialog" aria-modal="true">
        <div class="notification-header">
          <span class="notification-icon">⚠️</span>
          <h4 class="notification-title">${title}</h4>
        </div>
        <p class="notification-confirm-message">${message}</p>
        <div class="notification-confirm-actions">
          <button class="notification-btn-confirm">Confirmar</button>
          <button class="notification-btn-cancel">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const box = overlay.querySelector(".notification-confirm-box");
    
    setTimeout(() => {
        overlay.style.opacity = "1";
    }, 10);

    const cleanup = (value) => {
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none"; 
      
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 200);
    };

    overlay.querySelector(".notification-btn-confirm").addEventListener("click", (e) => {
      e.preventDefault();
      cleanup(true);
    });

    overlay.querySelector(".notification-btn-cancel").addEventListener("click", (e) => {
      e.preventDefault();
      cleanup(false);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}