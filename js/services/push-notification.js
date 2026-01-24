// js/services/push-notification.js

import { showNotification } from "../ui/notifications.js";
import { db, messaging } from "./firebase.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// Mantenha sua chave VAPID
const VAPID_KEY = "BLNp-LcDo57ZWUR7BsbWZ6BuPjVRuuiMrexFQ8emJAx1tOGalPhej9yKm-ibFgx4w2l8HorT6nm-r8NAw--cW8o"; 


export async function requestNotificationPermission(userId) {
    if (!userId) return;

    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log("🔔 Permissão concedida!");

            // --- CORREÇÃO 1: Usar o SW principal já existente ---
            // Não registramos mais o 'firebase-messaging-sw.js'
            // Buscamos o registro do service-worker.js que o index.html já carregou
            const registration = await navigator.serviceWorker.getRegistration('./service-worker.js');

            if (!registration) {
                console.error("❌ Service Worker principal não encontrado. Recarregue a página.");
                return;
            }

            // Passamos o registro correto para o getToken
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
        const titulo = payload.notification?.title || payload.data?.titulo || "Novo Alarme!";
        const corpo = payload.notification?.body || payload.data?.mensagem || "Verifique os detalhes.";
        if (typeof showNotification === 'function') {
            showNotification(`${titulo}: ${corpo}`, "warning");
        } else {
            console.warn("Função showNotification não encontrada, usando alert.");
            alert(`${titulo}\n${corpo}`);
        }
    });
}