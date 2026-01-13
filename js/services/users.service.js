// js/services/users.service.js

import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    setUser, 
    clearActiveInstitution, 
    getActiveInstitution 
} from "../core/state.js";

export async function loadUserProfile(uid) {
  if (!uid) throw new Error("UID inválido.");

  const userRef = doc(db, "usuarios", uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) throw new Error("Perfil não encontrado.");

  const data = snapshot.data();

  // 1. Segurança: Bloqueio se usuário foi desativado
  if (data.ativo === false) throw new Error("Usuário desativado.");

  const fullUserData = {
    uid: uid,
    ...data
  };

  // 2. Atualiza o Estado Global
  setUser(fullUserData);

  // 3. SEGURANÇA EXTRA (Validação da Instituição Ativa)
  // Verifica se a instituição que está no cache ainda é válida para este usuário.
  const cachedInst = getActiveInstitution();
  
  if (cachedInst) {
    // O usuário tem permissão para a instituição que está salva?
    const hasAccess = fullUserData.acessoInstituicoes?.includes(cachedInst.id);
    
    // Se ele perdeu o acesso (ex: admin removeu permissão agora pouco), forçamos a limpeza
    if (!hasAccess && fullUserData.nivel !== 'superAdmin') {
      console.warn(`Acesso à instituição ${cachedInst.nome} revogado. Limpando seleção.`);
      clearActiveInstitution();
    }
  }

  return fullUserData;
}

// Exporte também a função updateUserProfile se necessário em outros lugares
export async function updateUserProfile(uid, data) {
  const userRef = doc(db, "usuarios", uid);
  return await updateDoc(userRef, data);
}