// js/services/push-notification.js

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
        
        // Tenta tocar um som de alerta (opcional)
         const audio = new Audio('/sons/alerta.mp3');
         audio.play().catch(e => console.log("Navegador bloqueou o som automático"));

        // Cria um alerta visual simples no navegador
        const titulo = payload.notification.title || "Alarme!";
        const corpo = payload.notification.body || "Verifique o painel.";
        
        alert(`${titulo}\n\n${corpo}`);
    });
}