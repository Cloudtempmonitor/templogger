/**
 * index.js - Cloud Functions 
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const OFFLINE_THRESHOLD_SECONDS = 120;

// ==================================================================
// 1. HELPER: Buscar Tokens (CORRIGIDO PARA 'usuarios')
// ==================================================================
async function getEligibleTokens(macAddress) {
    // LOG DE DEBUG PARA CONFIRMAR O MAC
    logger.info(`🔍 BUSCA: Procurando na coleção 'usuarios' pelo MAC: '${macAddress}'`);
    
    const tokens = [];
    
    try {
        // --- AQUI ESTAVA O ERRO (users -> usuarios) ---
        const usersSnapshot = await db.collection('usuarios') 
            .where('ativo', '==', true)
            .where('alarmesAtivos', '==', true)
            .where('acessoDispositivos', 'array-contains', macAddress)
            .get();

        logger.info(`📊 RESULTADO: Encontrados ${usersSnapshot.size} usuário(s).`);

        if (usersSnapshot.empty) {
            // Se ainda der zero, vamos listar IDs aleatórios para ver se estamos no banco certo
            logger.warn("❌ ALERTA: Nenhum usuário encontrado. Verifique se a coleção se chama realmente 'usuarios'.");
        }

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            logger.info(`👤 USUÁRIO ENCONTRADO: ${doc.id} | Tokens: ${userData.fcmTokens?.length || 0}`);
            
            if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                userData.fcmTokens.forEach(token => {
                    if (token) tokens.push(token);
                });
            }
        });

        // Remove duplicatas
        const uniqueTokens = [...new Set(tokens)];
        logger.info(`🎯 TOKENS FINAIS: ${uniqueTokens.length} para envio.`);
        return uniqueTokens;

    } catch (error) {
        logger.error("❌ ERRO CRÍTICO NA BUSCA:", error);
        return [];
    }
}

// ==================================================================
// 2. HELPER: Enviar Notificação
// ==================================================================
async function sendNotification(tokens, title, body, data = {}) {
    if (tokens.length === 0) {
        logger.warn("⚠️ ENVIO ABORTADO: Lista de tokens vazia.");
        return;
    }

    const message = {
        // ❌ REMOVA O 'notification' - causa duplicação
        // notification: { title, body },
        
        // ✅ Use apenas data - você controla a notificação via SW
        data: {
            titulo: title,
            mensagem: body,
            ...data, // Outros dados como type, mac, etc.
            timestamp: Date.now().toString(),
            icon: '/templogger/img/icon-192.png'
        },
        tokens,
        
        // 🔧 Configurações opcionais para Android
        android: {
            priority: "high",
            ttl: 3600 * 1000, // 1 hora
        },
        
        // 🔧 Configurações opcionais para APNs (iOS)
        apns: {
            headers: {
                "apns-priority": "10",
            },
            payload: {
                aps: {
                    sound: "default",
                    badge: 1,
                },
            },
        },
    };

    try {
        logger.info(`🚀 ENVIANDO FCM para ${tokens.length} dispositivos...`);
        const response = await admin.messaging().sendEachForMulticast(message);
        logger.info(`✅ SUCESSO FCM: ${response.successCount} enviados, ${response.failureCount} falhas.`);
        
        if (response.failureCount > 0) {
             response.responses.forEach((r, i) => {
                 if (!r.success) logger.error(`❌ Falha Token ${i}:`, r.error);
             });
        }
    } catch (error) {
        logger.error("❌ ERRO NO FCM:", error);
    }
}

// ==================================================================
// 3. GATILHO: Dispositivo OFFLINE (Agendado)
// ==================================================================
exports.checkDeviceOffline = onSchedule("every 1 minutes", async (event) => {
    const now = Date.now();
    const cutoffTime = new Date(now - (OFFLINE_THRESHOLD_SECONDS * 1000));
    const firestoreTimestamp = admin.firestore.Timestamp.fromDate(cutoffTime);

    // Nota: Se a coleção de dispositivos se chamar diferente, mude aqui também!
    // Assumindo 'dispositivos' conforme seus logs anteriores.
    const snapshot = await db.collection('dispositivos')
        .where('statusTimestamp', '<', firestoreTimestamp)
        .where('isOffline', '==', false)
        .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    const notificationsPromises = [];

    snapshot.docs.forEach(doc => {
        const deviceData = doc.data();
        const mac = doc.id;
        const nome = deviceData.nomeDispositivo || "Dispositivo";

        batch.update(doc.ref, { isOffline: true });

        const p = getEligibleTokens(mac).then(tokens => {
            return sendNotification(
                tokens,
                "⚠️ Dispositivo Offline",
                `${nome} parou de responder.`,
                { mac: mac, type: 'offline' }
            );
        });
        notificationsPromises.push(p);
    });

    await batch.commit();
    await Promise.all(notificationsPromises);
    logger.info(`Offline processado: ${snapshot.size} dispositivos.`);
});

// ==================================================================
// 4. GATILHO: Dispositivo ONLINE
// ==================================================================
exports.onDeviceUpdate = onDocumentUpdated("dispositivos/{mac}", async (event) => {
    const mac = event.params.mac;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (beforeData.isOffline === true && afterData.statusTimestamp > beforeData.statusTimestamp) {
        await event.data.after.ref.update({ isOffline: false });
        const nome = afterData.nomeDispositivo || "Dispositivo";
        const tokens = await getEligibleTokens(mac);

        await sendNotification(
            tokens,
            "✅ Dispositivo Online",
            `${nome} voltou a operar.`,
            { mac: mac, type: 'online' }
        );
    }
});

// ==================================================================
// 5. GATILHO: Alarmes (CORREÇÃO DE ANINHAMENTO + COLEÇÃO USUARIOS)
// ==================================================================
exports.onAlarmChange = onDocumentWritten("dispositivos/{mac}/eventos/estadoAlarmeAtual", async (event) => {
    const mac = event.params.mac;
    
    // 1. Pegamos os dados crus do documento
    const rawBefore = event.data.before.exists ? event.data.before.data() : {};
    const rawAfter = event.data.after.exists ? event.data.after.data() : {};

    // 2. CORREÇÃO CRÍTICA: Desembrulhar o objeto "estadoAlarmeAtual" se ele existir
    // O frontend lê: snap.data().estadoAlarmeAtual.ativo
    const beforeData = rawBefore.estadoAlarmeAtual || rawBefore;
    const afterData = rawAfter.estadoAlarmeAtual || rawAfter;

    // 3. Agora lemos os booleanos do lugar certo
    const wasActive = beforeData.ativo === true;
    const isActive = afterData.ativo === true;

    logger.info(`🔔 GATILHO: MAC=${mac}`);
    logger.info(`   📦 Estrutura After: ${JSON.stringify(afterData)}`);
    logger.info(`   🎚️ Estado: De '${wasActive}' Para '${isActive}'`);

    // INÍCIO DE ALARME
    if (!wasActive && isActive) {
        logger.info("✅ ALARME INICIADO (Lógica Corrigida).");
        
        const deviceSnap = await db.collection('dispositivos').doc(mac).get();
        if (!deviceSnap.exists) {
            logger.error("❌ Dispositivo não encontrado.");
            return;
        }

        const devData = deviceSnap.data();
        const nomeDisp = devData.nomeDispositivo || "Dispositivo";
        const nomeInst = devData.nomeInstituicao || "Instituição";
        const nomeSetor = devData.nomeSetor || "Setor";
        
        // Pega o tipo de dentro do objeto desembrulhado
        const tipoAlarme = afterData.tipo || "Alarme Genérico"; 
        const idEvento = afterData.idEvento || "";

        // Chama a função que busca na coleção 'usuarios' (já corrigida)
        const tokens = await getEligibleTokens(mac);

        await sendNotification(
            tokens,
            `🚨 Alerta: ${nomeDisp}`,
            `${nomeInst} - ${nomeSetor}\nMotivo: ${tipoAlarme}`,
            { mac, type: 'alarm_start', alarmType: tipoAlarme, eventId: idEvento }
        );
    }
    
    // FIM DE ALARME
    else if (wasActive && !isActive) {
        logger.info("✅ ALARME RESOLVIDO (Lógica Corrigida).");
        
        const deviceSnap = await db.collection('dispositivos').doc(mac).get();
        if (!deviceSnap.exists) return;

        const devData = deviceSnap.data();
        const nomeDisp = devData.nomeDispositivo || "Dispositivo";
        const nomeInst = devData.nomeInstituicao || "Instituição";
        const nomeSetor = devData.nomeSetor || "Setor";
        const tipoAnterior = beforeData.tipo || "Alarme";

        const tokens = await getEligibleTokens(mac);

        await sendNotification(
            tokens,
            `✅ Normalizado: ${nomeDisp}`,
            `${nomeInst} - ${nomeSetor}\nO parâmetro ${tipoAnterior} retornou aos níveis aceitáveis.`,
            { mac, type: 'alarm_end', lastAlarmType: tipoAnterior }
        );
    } else {
        logger.info("ℹ️ Sem mudança de estado (Ignorado).");
    }
});