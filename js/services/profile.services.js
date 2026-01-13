// js/services/profile.service.js
import { db, auth } from './firebase.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { updatePassword as fbUpdatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export const ProfileService = {
    /**
     * Atualiza dados do perfil no Firestore
     */
    async updateProfileData(uid, data) {
        const userRef = doc(db, "usuarios", uid);
        return await updateDoc(userRef, data);
    },

    /**
     * Atualiza a senha no Firebase Auth
     */
    async updateAuthPassword(newPassword) {
        const user = auth.currentUser;
        if (!user) throw new Error("Sessão expirada. Faça login novamente.");
        return await fbUpdatePassword(user, newPassword);
    }
};