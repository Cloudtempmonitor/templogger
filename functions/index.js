/**
 * functions/index.js
 * Backend para monitoramento de alarmes e envio de notificações Push.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

// ==================================================================
// 1. GATILHO: INÍCIO DE ALARME (Novo documento em 'eventos')
// ==================================================================
exports.notificarInicioAlarme = functions.firestore
  .document('dispositivos/{mac}/eventos/{eventId}')
  .onCreate(async (snap, context) => {
    const eventData = snap.data();
    const mac = context.params.mac;

    // Busca nome do dispositivo para a mensagem
    const deviceSnap = await admin.firestore().collection('dispositivos').doc(mac).get();
    const deviceName = deviceSnap.exists ? (deviceSnap.data().nomeDispositivo || mac) : mac;

    const tipo = eventData.tipoAlarme || "Alarme Crítico";
    console.log(`🚨 Novo Alarme: ${deviceName} [${mac}] - ${tipo}`);

    const payload = {
        notification: {
            title: `🚨 ALARME: ${deviceName}`,
            body: `${tipo} detectado! Verifique imediatamente.`,
            sound: 'default' // Toca o som padrão do celular
        },
        data: {
            type: 'ALARM_START',
            mac: mac,
            eventId: context.params.eventId,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            url: `/device-details.html?mac=${mac}` // Para abrir direto na página
        }
    };

    return enviarParaResponsaveis(mac, payload);
});

// ==================================================================
// 2. GATILHO: FIM DE ALARME (Status muda para 'resolvido')
// ==================================================================
exports.notificarFimAlarme = functions.firestore
  .document('dispositivos/{mac}/eventos/{eventId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    const mac = context.params.mac;

    // Só dispara se mudou de 'ativo' para 'resolvido'
    if (newData.status === 'resolvido' && oldData.status !== 'resolvido') {
        
        const deviceSnap = await admin.firestore().collection('dispositivos').doc(mac).get();
        const deviceName = deviceSnap.exists ? (deviceSnap.data().nomeDispositivo || mac) : mac;
        
        console.log(`✅ Alarme Resolvido: ${deviceName}`);

        const payload = {
            notification: {
                title: `✅ Normalizado: ${deviceName}`,
                body: `O dispositivo voltou a operar dentro dos limites.`,
                sound: 'default'
            },
            data: {
                type: 'ALARM_RESOLVED',
                mac: mac,
                eventId: context.params.eventId,
                url: `/device-details.html?mac=${mac}`
            }
        };

        return enviarParaResponsaveis(mac, payload);
    }
    return null;
});

// ==================================================================
// 3. FUNÇÃO AUXILIAR DE ENVIO (Lógica da Lista Branca)
// ==================================================================
async function enviarParaResponsaveis(mac, payload) {
    const db = admin.firestore();
    
    // REGRA DE OURO: 
    // Envia APENAS para quem tem este MAC explicitamente na lista 'acessoDispositivos'
    // E está com notificações ativas.
    
    const snapshot = await db.collection('usuarios')
        .where('ativo', '==', true)                // Usuário não está banido
        .where('alarmesAtivos', '==', true)        // Chave mestra de alertas ligada
        .where('acessoDispositivos', 'array-contains', mac) // Vínculo direto
        .get();

    if (snapshot.empty) {
        console.log(`⚠️ Nenhum usuário configurado para receber alertas do dispositivo ${mac}`);
        return;
    }

    // Coleta os tokens FCM
    const tokensParaEnviar = [];
    
    snapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
            tokensParaEnviar.push(...userData.fcmTokens);
        }
    });

    // Envia (se houver tokens válidos)
    if (tokensParaEnviar.length > 0) {
        // Remove duplicatas
        const listaUnica = [...new Set(tokensParaEnviar)];
        
        console.log(`📤 Enviando Push para ${listaUnica.length} dispositivos.`);
        
        try {
            const response = await admin.messaging().sendToDevice(listaUnica, payload);
            console.log(`✅ Sucesso: ${response.successCount}, Falhas: ${response.failureCount}`);
            
            // (Opcional) Aqui você poderia remover tokens que deram erro (ex: app desinstalado)
        } catch (error) {
            console.error("❌ Erro ao enviar notificação:", error);
        }
    }
}