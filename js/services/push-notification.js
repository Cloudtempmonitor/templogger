// js/services/push-notification.js

import { db, messaging } from "./firebase.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
// IMPORTANTE: Gere sua chave VAPID no Console do Firebase:
// Configurações do Projeto > Cloud Messaging > Web Push (botão "Generate Key pair")
// Copie a chave longa que aparecer lá e cole abaixo:
const VAPID_KEY = "BLNp-LcDo57ZWUR7BsbWZ6BuPjVRuuiMrexFQ8emJAx1tOGalPhej9yKm-ibFgx4w2l8HorT6nm-r8NAw--cW8o"; 

export async function requestNotificationPermission(userId) {
    // 🔍 DEBUG: Vamos ver o que está chegando aqui
    console.log("🚀 [Push] requestNotificationPermission chamada.");
    console.log("👤 [Push] userId recebido:", userId);

    if (!userId) {
        console.error("❌ [Push] ABORTADO: userId é nulo ou indefinido!");
        return;
    }
    try {
        // 1. Pede permissão ao navegador
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log("🔔 Permissão de notificação concedida!");

            // 2. Pega o Token Único (RG) deste dispositivo
            // Se der erro de "missing valid vapid key", você precisa preencher a const acima.
            const currentToken = await getToken(messaging, { 
                vapidKey: VAPID_KEY 
            });

            if (currentToken) {
                console.log("📲 Token gerado:", currentToken);
                
                // 3. Salva no perfil do usuário no Firestore
                const userRef = doc(db, "usuarios", userId);
                
                // arrayUnion garante que não vamos apagar tokens de outros dispositivos (celular vs pc)
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken)
                });
                
                console.log("💾 Token salvo no perfil do usuário.");
            } else {
                console.log("⚠️ Não foi possível obter o token.");
            }
        } else {
            console.log("🚫 Permissão de notificação negada pelo usuário.");
        }
    } catch (error) {
        console.error("❌ Erro ao configurar notificações:", error);
    }
}


export function listenToForegroundMessages() {
    console.log("👂 Iniciando escuta de mensagens em primeiro plano...");
    
    onMessage(messaging, (payload) => {
        console.log('🚨 Mensagem recebida com o site aberto:', payload);
        
        // Tenta tocar um som de alerta (opcional)
        // const audio = new Audio('/sons/alerta.mp3');
        // audio.play().catch(e => console.log("Navegador bloqueou o som automático"));

        // Cria um alerta visual simples no navegador
        const titulo = payload.notification.title || "Alarme!";
        const corpo = payload.notification.body || "Verifique o painel.";
        
        alert(`${titulo}\n\n${corpo}`);
    });
}