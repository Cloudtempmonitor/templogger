// js/core/permissions.js
import { getUser } from './state.js';

export const ROLES = {
    SUPER_ADMIN: 'superAdmin',
    ADMIN: 'admin',
    OPERADOR: 'operador'
};

/* =====================================================
   VERIFICAÇÕES DE IDENTIDADE
   ===================================================== */

export function hasRole(role) {
    const user = getUser();
    return user?.nivel === role;
}

export function isSuperAdmin() {
    return hasRole(ROLES.SUPER_ADMIN);
}

export function isAdmin() {
    return hasRole(ROLES.ADMIN);
}

/* =====================================================
   VERIFICAÇÕES DE ESCOPO (HIERARQUIA)
   ===================================================== */

// Verifica se o usuário tem permissão para ver uma instituição específica
export function canAccessInstitution(instId) {
    const user = getUser();
    if (!user) return false;
    
    // SuperAdmin vê tudo
    if (user.nivel === ROLES.SUPER_ADMIN) return true;
    
    // Verifica se o ID está no array (com proteção contra undefined)
    return user.acessoInstituicoes?.includes(instId) || false;
}

// Verifica se o usuário tem permissão para ver uma unidade específica
export function canAccessUnit(unitId) {
    const user = getUser();
    if (!user) return false;
    if (user.nivel === ROLES.SUPER_ADMIN) return true;
    return user.acessoUnidades?.includes(unitId) || false;
}

/* =====================================================
   LOGICA DE NEGÓCIO (Permissões Complexas)
   ===================================================== */

export const permissions = {
    // Quem pode acessar páginas de configuração do sistema?
    canManageSystem: () => {
        const user = getUser();
        return user && (user.nivel === ROLES.SUPER_ADMIN || user.nivel === ROLES.ADMIN);
    },

    // Quem pode excluir dispositivos?
    canDeleteDevices: () => {
        return isSuperAdmin();
    },

    // Quem pode editar usuários?
    canEditUser: (targetUser) => {
        const currentUser = getUser();
        if (!currentUser) return false;

        // Regra 1: SuperAdmin edita qualquer um
        if (currentUser.nivel === ROLES.SUPER_ADMIN) return true;

        // Regra 2: Admin pode editar, mas com restrições
        if (currentUser.nivel === ROLES.ADMIN) {
            // Admin não edita SuperAdmin
            if (targetUser.nivel === ROLES.SUPER_ADMIN) return false;
            
            // Admin não edita outros Admins (exceto ele mesmo)
            if (targetUser.nivel === ROLES.ADMIN && targetUser.id !== currentUser.uid) return false;

            // Admin só edita se tiver acesso à mesma instituição
            // (Verifica se há intersecção entre as instituições do Admin e do Alvo)
            const adminInst = currentUser.acessoInstituicoes || [];
            const targetInst = targetUser.acessoInstituicoes || [];
            const hasCommonInst = adminInst.some(id => targetInst.includes(id));
            
            return hasCommonInst;
        }

        // Regra 3: Operador só edita a si mesmo 
        if (targetUser.id === currentUser.uid) return true;

        return false;
    }
};
