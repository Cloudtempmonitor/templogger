// js/core/state.js

const state = {
  user: null,
  activeInstitution: null
};

/* =====================================================
   USER STATE (Centralizado)
   ===================================================== */

export function setUser(userData) {
  if (!userData) {
    resetState();
    return;
  }

  // Normalização: Garante que os arrays sempre existam, mesmo se vierem vazios do banco
  const userObj = {
    // Dados Básicos
    uid: userData.uid,
    nome: userData.nome,
    email: userData.email || null,
    nivel: userData.nivel,
    ativo: userData.ativo !== false,
    alarmesAtivos: !!userData.alarmesAtivos,
    chatId: userData.chatId || null,
    fcmTokens: Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [],

    // PERMISSÕES: Agora estão dentro do objeto User
    acessoInstituicoes: Array.isArray(userData.acessoInstituicoes) ? userData.acessoInstituicoes : [],
    acessoUnidades: Array.isArray(userData.acessoUnidades) ? userData.acessoUnidades : [],
    acessoSetores: Array.isArray(userData.acessoSetores) ? userData.acessoSetores : [],
    acessoDispositivos: Array.isArray(userData.acessoDispositivos) ? userData.acessoDispositivos : []
  };
  
  // Salva no estado e no LocalStorage
  state.user = userObj;
  localStorage.setItem("user", JSON.stringify(userObj));
}

export function getUser() {
  if (!state.user) {
    const saved = localStorage.getItem("user");
    if (saved) {
      try { 
        state.user = JSON.parse(saved); 
      } catch (e) { 
        console.error("Erro ao recuperar user do cache:", e);
        localStorage.removeItem("user"); // Limpa se estiver corrompido
      }
    }
  }
  return state.user;
}

/* =====================================================
   INSTITUIÇÃO ATIVA
   ===================================================== */

export function setActiveInstitution(institution) {
  if (!institution || !institution.id) return;
  const instObj = { id: institution.id, nome: institution.nome || "Instituição" };
  state.activeInstitution = instObj;
  localStorage.setItem("activeInstitution", JSON.stringify(instObj));
}

export function getActiveInstitution() {
  if (!state.activeInstitution) {
    const saved = localStorage.getItem("activeInstitution");
    if (saved) {
        try { state.activeInstitution = JSON.parse(saved); }
        catch (e) { localStorage.removeItem("activeInstitution"); }
    }
  }
  return state.activeInstitution;
}

export function clearActiveInstitution() {
   state.activeInstitution = null;
   localStorage.removeItem("activeInstitution");
}

/* =====================================================
   RESET GERAL
   ===================================================== */

export function resetState() {
  state.user = null;
  state.activeInstitution = null;
  localStorage.removeItem("user");
  localStorage.removeItem("activeInstitution");
}


export function updateState(partialData) {
  if (!state.user) return;
  
  // 1. Mescla os dados no objeto de memória
  state.user = { ...state.user, ...partialData };
  
  // 2. Sincroniza o LocalStorage 
  localStorage.setItem("user", JSON.stringify(state.user));
  
  // 3. Atualiza o nome no menu superior (UI) instantaneamente
  const nameDisplay = document.getElementById("user-name");
  if (nameDisplay && partialData.nome) {
    nameDisplay.textContent = partialData.nome;
  }
}
