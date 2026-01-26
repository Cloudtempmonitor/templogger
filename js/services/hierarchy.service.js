// js/services/hierarchy.service.js

import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUser } from "../core/state.js"; 

// Cache em memória
let hierarchyCache = {
    instituicoes: [],
    unidades: [],
    setores: [],
    dispositivos: []
};

let isLoaded = false;

export async function loadHierarchyCache(force = false) {
    if (isLoaded && !force) return hierarchyCache;

    try {
        // 1. Busca tudo do banco
        const [instSnap, unitSnap, sectorSnap, deviceSnap] = await Promise.all([
            getDocs(collection(db, "instituicoes")),
            getDocs(collection(db, "unidades")),
            getDocs(collection(db, "setores")),
            getDocs(collection(db, "dispositivos"))
        ]);
        
        // 2. Transforma em objetos puros
        const rawInstituicoes = instSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const rawUnidades = unitSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const rawSetores = sectorSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const rawDispositivos = deviceSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 3. FILTRAGEM DE SEGURANÇA
        const user = getUser();
        
        if (user && user.nivel !== 'superAdmin') {
            // Se não for SuperAdmin, filtra apenas o que ele tem acesso

            hierarchyCache.instituicoes = rawInstituicoes.filter(i => 
                user.acessoInstituicoes.includes(i.id)
            );

            hierarchyCache.unidades = rawUnidades.filter(u => 
                user.acessoUnidades.includes(u.id)
            );

            hierarchyCache.setores = rawSetores.filter(s => 
                user.acessoSetores.includes(s.id)
            );

            hierarchyCache.dispositivos = rawDispositivos.filter(d => 
                user.acessoDispositivos.includes(d.id)
            );

        } else {
            // SuperAdmin vê tudo
            hierarchyCache.instituicoes = rawInstituicoes;
            hierarchyCache.unidades = rawUnidades;
            hierarchyCache.setores = rawSetores;
            hierarchyCache.dispositivos = rawDispositivos;
        }
        
        isLoaded = true;
        return hierarchyCache;

    } catch (error) {
        console.error("Erro ao carregar hierarquia:", error);
        throw error;
    }
}

export function getCachedHierarchy() {
    return hierarchyCache;
}

// Limpa cache (útil no logout)
export function clearHierarchyCache() {
    hierarchyCache = { instituicoes: [], unidades: [], setores: [], dispositivos: [] };
    isLoaded = false;
}

