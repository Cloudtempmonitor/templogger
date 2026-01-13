// =========================================
// NOTIFICATIONS.JS (OTIMIZADO)
// =========================================

const notificationQueue = [];
let isShowingNotification = false;

// Configuração de ícones e cores (Centralizado)
const TOAST_CONFIG = {
    info: { icon: 'ℹ️', color: '#3498db', defaultTitle: 'Aviso' },
    success: { icon: '✅', color: '#2ecc71', defaultTitle: 'Sucesso!' },
    error: { icon: '❌', color: '#e74c3c', defaultTitle: 'Erro!' }
};

/**
 * Cria o elemento HTML do Toast
 */
function createToastElement(notif) {
    const config = TOAST_CONFIG[notif.type] || TOAST_CONFIG.info;
    const finalTitle = notif.title === 'Aviso' ? config.defaultTitle : notif.title;

    const div = document.createElement('div');
    div.className = 'notification-toast'; // Classe base
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
 * Exibe uma notificação em formato toast com fila e auto-close.
 */
export function showNotification(message, type = 'info', title = 'Aviso', autoCloseMs = 5000) {
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

    // Força um reflow para garantir que a transição CSS funcione
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    console.log(`[NOTIFICAÇÃO:${notif.type.toUpperCase()}] ${notif.title}: ${notif.message}`);

    // Lógica de fechamento
    let timeoutId = null;
    
    // Auto-close (exceto para erros, a menos que especificado)
    if (notif.type !== 'error' || notif.autoCloseMs > 0) {
        if (notif.autoCloseMs > 0) {
            timeoutId = setTimeout(() => closeToast(toast), notif.autoCloseMs);
        }
    }

    // Eventos de Click
    const closeBtn = toast.querySelector('.notification-close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (timeoutId) clearTimeout(timeoutId);
        closeToast(toast);
    });

    // Fecha ao clicar no corpo do toast (UX Mobile)
    toast.addEventListener('click', () => {
        if (timeoutId) clearTimeout(timeoutId);
        closeToast(toast);
    });
}

function closeToast(toast) {
    // Remove a classe .show para disparar a animação de saída do CSS
    toast.classList.remove('show');

    // Aguarda o fim da transição CSS para remover do DOM
    toast.addEventListener('transitionend', () => {
        if (toast.parentNode) {
            toast.remove();
        }
        isShowingNotification = false;
        // Pequeno delay para não sobrepor animações se houver muitos na fila
        setTimeout(processQueue, 100); 
    }, { once: true });
}

/**
 * Modal de Confirmação (Promise-based)
 */
export function showConfirmation(message, title = "Confirmar Ação") {
  return new Promise((resolve) => {
    // 1. Remove qualquer overlay existente para evitar duplicidade
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

    // 2. Removido o excesso de requestAnimationFrame que travava o primeiro clique
    const box = overlay.querySelector(".notification-confirm-box");
    
    // Pequeno atraso apenas para a animação visual, sem bloquear eventos
    setTimeout(() => {
        overlay.style.opacity = "1";
    }, 10);

    const cleanup = (value) => {
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none"; 
      
      // Remove do DOM após a animação de saída
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 200);
    };

    // 3. Uso de click direto sem travas
    overlay.querySelector(".notification-btn-confirm").addEventListener("click", (e) => {
      e.preventDefault();
      cleanup(true);
    });

    overlay.querySelector(".notification-btn-cancel").addEventListener("click", (e) => {
      e.preventDefault();
      cleanup(false);
    });

    // Fecha ao clicar no fundo escuro (overlay)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}
