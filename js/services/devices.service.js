// js/services/devices.service.js

import { db } from './firebase.js'; 
import { getUser } from "../core/state.js"; // Importante para validações futuras

// IMPORTAÇÕES DO FIRESTORE
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    getDocs,
    doc,
    getDoc,
    limit // <--- Essencial para a verificação ser rápida e barata
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================================================================
// INTEGRIDADE DE DADOS (Verificações antes de exclusão)
// =========================================================================

/**
 * Verifica se existe algum dispositivo vinculado a um ID específico da hierarquia.
 * Usa limit(1) para economizar leitura: paramos de buscar assim que achamos o primeiro.
 * * @param {string} fieldName - O campo a verificar ('instituicaoId', 'unidadeId' ou 'setorId')
 * @param {string} id - O ID que está sendo excluído
 * @returns {Promise<boolean>} - True se houver dispositivos vinculados
 */
export async function hasLinkedDevices(fieldName, id) {
    try {
        console.log(`🔍 [DEBUG] Verificando dispositivos para: ${fieldName} = "${id}"`);
        
        const devicesRef = collection(db, "dispositivos");
        
        // Query otimizada
        const q = query(
            devicesRef, 
            where(fieldName, "==", id),
            limit(1) 
        );

        const snapshot = await getDocs(q);
        
        // DEBUG: Mostra os dispositivos encontrados
        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                console.log(`📱 Dispositivo encontrado: ${doc.id}`, doc.data());
            });
        } else {
            console.log(`✅ Nenhum dispositivo encontrado para ${fieldName} = "${id}"`);
        }
        
        return !snapshot.empty; 
    } catch (error) {
        console.error("❌ Erro ao verificar dependências de dispositivos:", error);
        throw new Error("Não foi possível verificar vínculos de dispositivos.");
    }
}

// =========================================================================
// LEITURAS E DETALHES
// =========================================================================

export async function getReadingsByRange(deviceId, startTime, endTime) {
    // Nota: Futuramente adicionar validação de permissão aqui se necessário
    const q = query(
        collection(db, "dispositivos", deviceId, "leituras"),
        where("timestamp", ">=", startTime),
        where("timestamp", "<=", endTime),
        orderBy("timestamp")
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getDeviceById(deviceId) {
    const ref = doc(db, "dispositivos", deviceId);
    const snap = await getDoc(ref);
    
    if (snap.exists()) {
        return { 
            id: snap.id,  
            ...snap.data() 
        };
    } else {
        return null;
    }
}