// js/services/hierarchy.service.js

import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUser } from "../core/state.js";

// Cache em memória
let hierarchyCache = {
  instituicoes: [],
  unidades: [],
  setores: [],
  locais: [],
  dispositivos: [],
};

let isLoaded = false;

export async function loadHierarchyCache(force = false) {
  if (isLoaded && !force) return hierarchyCache;

  try {
    const [instSnap, unitSnap, sectorSnap, localSnap, deviceSnap] = await Promise.all([
      getDocs(collection(db, "instituicoes")),
      getDocs(collection(db, "unidades")),
      getDocs(collection(db, "setores")),
      getDocs(collection(db, "locais")),
      getDocs(collection(db, "dispositivos")),
    ]);

    const rawInstituicoes = instSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const rawUnidades = unitSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const rawSetores = sectorSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const rawLocais = localSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const rawDispositivos = deviceSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const user = getUser();

    if (user && user.nivel !== "superAdmin") {
      hierarchyCache.instituicoes = rawInstituicoes.filter((i) =>
        (user.acessoInstituicoes || []).includes(i.id),
      );

      hierarchyCache.unidades = rawUnidades.filter((u) =>
        (user.acessoUnidades || []).includes(u.id),
      );

      hierarchyCache.setores = rawSetores.filter((s) =>
        (user.acessoSetores || []).includes(s.id),
      );

      hierarchyCache.locais = rawLocais.filter((l) => {
        const acessoLocais = user.acessoLocais || [];
        if (acessoLocais.length > 0) {
          return acessoLocais.includes(l.id);
        }

        return (user.acessoSetores || []).includes(l.setorId);
      });

      hierarchyCache.dispositivos = rawDispositivos.filter((d) =>
        (user.acessoDispositivos || []).includes(d.id),
      );
    } else {
      hierarchyCache.instituicoes = rawInstituicoes;
      hierarchyCache.unidades = rawUnidades;
      hierarchyCache.setores = rawSetores;
      hierarchyCache.locais = rawLocais;
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

export function clearHierarchyCache() {
  hierarchyCache = {
    instituicoes: [],
    unidades: [],
    setores: [],
    locais: [],
    dispositivos: [],
  };
  isLoaded = false;
}
