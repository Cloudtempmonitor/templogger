// js/services/push-notification.js

import { db, messaging } from "./firebase.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// IMPORTANTE: Gere sua chave VAPID no Console do Firebase:
// Configurações do Projeto > Cloud Messaging > Web Push (botão "Generate Key pair")
// Copie a chave longa que aparecer lá e cole abaixo:
const VAPID_KEY = "BLNp-LcDo57ZWUR7BsbWZ6BuPjVRuuiMrexFQ8emJAx1tOGalPhej9yKm-ibFgx4w2l8HorT6nm-r8NAw--cW8o"; 

export async function requestNotificationPermission(userId) {
    if (!userId) return;

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