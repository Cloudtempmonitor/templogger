// js/services/push-notification.js

import { showNotification } from "../ui/notifications.js";
import { db, messaging } from "./firebase.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
const VAPID_KEY = "BLNp-LcDo57ZWUR7BsbWZ6BuPjVRuuiMrexFQ8emJAx1tOGalPhej9yKm-ibFgx4w2l8HorT6nm-r8NAw--cW8o"; 

export async function requestNotificationPermission(userId) {
    if (!userId) return;

    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log("🔔 Permissão concedida! Registrando SW manualmente...");

            const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
            
            await navigator.serviceWorker.ready;

            const currentToken = await getToken(messaging, { 
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (currentToken) {
                console.log("📲 Token gerado:", currentToken);
                
                const userRef = doc(db, "usuarios", userId);
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken)
                });
                
                console.log("💾 Token salvo no perfil.");
            } else {
                console.log("⚠️ Falha ao obter token.");
            }
        } else {
            console.log("🚫 Permissão negada.");
        }
    } catch (error) {
        console.error("❌ Erro no processo de notificação:", error);
    }
}


export function listenToForegroundMessages() {
    console.log("👂 Iniciando escuta de mensagens em primeiro plano...");
    
    onMessage(messaging, (payload) => {
        console.log('🚨 Mensagem recebida com o site aberto:', payload);
        
        const titulo = payload.notification?.title || "Novo Alarme!";
        const corpo = payload.notification?.body || "Verifique os detalhes.";
        
        // Tentar Notificação Nativa (mesmo com app aberto)
        if (Notification.permission === "granted") {
            const notification = new Notification(titulo, {
                body: corpo,
                icon: './img/icon-192.png' 
            });
            
            notification.onclick = () => {
                // Ao clicar, foca na janela ou abre URL
                window.focus();
                notification.close();
            };
        } 
        // OPÇÃO 2: chame sua função de showNotification
        else {
            
            showNotification(`${titulo}: ${corpo}`, "warning");
            alert(`${titulo}\n${corpo}`); // Fallback
        }

        const audio = new Audio('./assets/sounds/alerta.mp3'); 
        audio.play().catch(() => console.log("Som silenciado pelo navegador"));
    });
}