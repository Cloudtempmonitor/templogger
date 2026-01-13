// login.js - VERSÃO MELHORADA
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, db } from "../services/firebase.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showNotification } from "../ui/notifications.js";
import { setActiveInstitution, setUser } from "../core/state.js";

// Elementos principais
const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const modalOverlay = document.getElementById("modal-overlay");
const institutionModal = document.getElementById("institution-modal");
const institutionList = document.getElementById("institution-list");
const confirmBtn = document.getElementById("modal-confirm-btn");
const cancelBtn = document.getElementById("modal-cancel-btn");
const closeBtn = document.getElementById("modal-close");
const togglePasswordBtn = document.getElementById("toggle-password");
const passwordInput = document.getElementById("senha");
const institutionCount = document.getElementById("institution-count");

// Variáveis de estado
let instituicoesDisponiveis = [];
let isSubmitting = false;

// Inicialização
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Verificar se há credenciais salvas
    checkRememberMe();
    
    // Configurar eventos
    setupEventListeners();
    
    // Focar no primeiro campo
    setTimeout(() => {
        document.getElementById('email').focus();
    }, 300);
}

function setupEventListeners() {
    // Formulário de login
    loginForm.addEventListener('submit', handleLogin);
    
    // Alternar visibilidade da senha
    togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    
    // Modal
    confirmBtn.addEventListener('click', handleModalConfirm);
    cancelBtn.addEventListener('click', hideModal);
    closeBtn.addEventListener('click', hideModal);
    modalOverlay.addEventListener('click', handleOverlayClick);
    
    // Seleção de instituição
    institutionList.addEventListener('change', handleInstitutionChange);
    
    // Teclado - ESC para fechar modal
    document.addEventListener('keydown', handleKeyDown);
}

function checkRememberMe() {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        document.getElementById('email').value = rememberedEmail;
        document.getElementById('remember-me').checked = true;
        passwordInput.focus();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    const email = document.getElementById("email").value.trim();
    const senha = passwordInput.value;
    const rememberMe = document.getElementById("remember-me").checked;

    // Validação básica
    if (!validateForm(email, senha)) {
        return;
    }

    // Salvar email se "lembrar-me" estiver marcado
    if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
    } else {
        localStorage.removeItem('rememberedEmail');
    }

    // Estado de carregamento
    setLoadingState(true);

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        const uid = userCredential.user.uid;

        const userDoc = await getDoc(doc(db, "usuarios", uid));
        
        if (!userDoc.exists() || userDoc.data().ativo === false) {
            throw new Error("Usuário inválido ou desativado");
        }

        const userData = userDoc.data();
        setUser({ uid: uid, ...userData });
        
        const instituicoesIds = userData.acessoInstituicoes || [];

        if (instituicoesIds.length === 0) {
            showNotification("Você não tem acesso a nenhuma instituição.", "error");
            return;
        }

        await loadInstitutions(instituicoesIds);

    } catch (error) {
        console.error("Erro no login:", error);
        handleLoginError(error);
    } finally {
        setLoadingState(false);
    }
}

function validateForm(email, senha) {
    let isValid = true;
    
    // Resetar erros
    clearErrors();
    
    if (!email) {
        showFieldError('email', 'Email é obrigatório');
        isValid = false;
    } else if (!isValidEmail(email)) {
        showFieldError('email', 'Email inválido');
        isValid = false;
    }
    
    if (!senha) {
        showFieldError('senha', 'Senha é obrigatória');
        isValid = false;
    } else if (senha.length < 6) {
        showFieldError('senha', 'Senha deve ter no mínimo 6 caracteres');
        isValid = false;
    }
    
    return isValid;
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const group = field.closest('.input-group');
    
    field.classList.add('error');
    group.classList.add('has-error');
    
    // Criar ou atualizar mensagem de erro
    let errorElement = group.querySelector('.error-message');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.style.cssText = `
            color: #fc8181;
            font-size: 0.85rem;
            margin-top: 6px;
            text-align: left;
            padding-left: 5px;
        `;
        group.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
}

function clearErrors() {
    document.querySelectorAll('.form-input').forEach(input => {
        input.classList.remove('error');
        input.closest('.input-group').classList.remove('has-error');
    });
    
    document.querySelectorAll('.error-message').forEach(el => el.remove());
}

function setLoadingState(loading) {
    isSubmitting = loading;
    loginBtn.disabled = loading;
    
    if (loading) {
        loginBtn.classList.add('loading');
    } else {
        loginBtn.classList.remove('loading');
    }
}

async function loadInstitutions(instituicoesIds) {
    try {
        // Resetar lista
        instituicoesDisponiveis = [];
        
        // Carregar nomes das instituições
        const querySnapshot = await getDocs(
            query(collection(db, "instituicoes"), where("__name__", "in", instituicoesIds))
        );
        
        querySnapshot.forEach(doc => {
            instituicoesDisponiveis.push({ 
                id: doc.id, 
                nome: doc.data().nome || doc.id 
            });
        });

        // Ordenar por nome
        instituicoesDisponiveis.sort((a, b) => a.nome.localeCompare(b.nome));
        
        // Atualizar contador
        institutionCount.textContent = instituicoesDisponiveis.length;

        if (instituicoesDisponiveis.length === 1) {
            // Apenas uma instituição
            setActiveInstitution(instituicoesDisponiveis[0]);
            redirectToDashboard();
        } else {
            // Múltiplas instituições
            populateInstitutionSelect();
            showModal();
        }

    } catch (error) {
        console.error("Erro ao carregar instituições:", error);
        showNotification("Erro ao carregar instituições", "error");
        throw error;
    }
}

function populateInstitutionSelect() {
    institutionList.innerHTML = '<option value="">Selecione uma instituição...</option>';
    
    instituicoesDisponiveis.forEach(inst => {
        const option = document.createElement("option");
        option.value = inst.id;
        option.textContent = inst.nome;
        institutionList.appendChild(option);
    });
    
    // Resetar estado do botão
    confirmBtn.disabled = true;
}

function showModal() {
    modalOverlay.classList.add('active');
    institutionModal.classList.add('active');
    
    // Focar no select
    setTimeout(() => {
        institutionList.focus();
    }, 300);
}

function hideModal() {
    modalOverlay.classList.remove('active');
    institutionModal.classList.remove('active');
    
    // Resetar estado
    setLoadingState(false);
}

function handleModalConfirm() {
    const selectedId = institutionList.value;
    
    if (!selectedId) {
        showNotification("Selecione uma instituição", "info");
        return;
    }

    const selectedObj = instituicoesDisponiveis.find(i => i.id === selectedId);
    
    if (selectedObj) {
        setActiveInstitution(selectedObj);
        hideModal();
        redirectToDashboard();
    }
}

function handleInstitutionChange() {
    confirmBtn.disabled = !institutionList.value;
}

function handleOverlayClick(e) {
    if (e.target === modalOverlay) {
        hideModal();
    }
}

function handleKeyDown(e) {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        hideModal();
    }
    
    if (e.key === 'Enter' && e.target.type !== 'password') {
        e.preventDefault();
        if (!modalOverlay.classList.contains('active')) {
            loginForm.requestSubmit();
        } else if (!confirmBtn.disabled) {
            handleModalConfirm();
        }
    }
}

function togglePasswordVisibility() {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    
    const icon = togglePasswordBtn.querySelector('i');
    icon.className = type === 'password' ? 'fa fa-eye' : 'fa fa-eye-slash';
    
    togglePasswordBtn.setAttribute('aria-label', 
        type === 'password' ? 'Mostrar senha' : 'Ocultar senha'
    );
}

function handleLoginError(error) {
    let message = "Email ou senha incorretos";
    
    switch (error.code) {
        case 'auth/invalid-email':
            message = "Email inválido";
            break;
        case 'auth/user-disabled':
            message = "Usuário desativado";
            break;
        case 'auth/user-not-found':
            message = "Usuário não encontrado";
            break;
        case 'auth/wrong-password':
            message = "Senha incorreta";
            break;
        case 'auth/too-many-requests':
            message = "Muitas tentativas. Tente novamente mais tarde";
            break;
        case 'auth/network-request-failed':
            message = "Erro de conexão. Verifique sua internet";
            break;
    }
    
    showNotification(message, "error");
}

function redirectToDashboard() {
    // Adicionar transição suave
    document.body.style.opacity = '0.9';
    document.body.style.transition = 'opacity 0.3s ease';
    
    setTimeout(() => {
        window.location.replace("./index.html");
    }, 300);
}

// Adicionar estilos dinâmicos para erros
const style = document.createElement('style');
style.textContent = `
    .form-input.error {
        border-color: #fc8181 !important;
        background: #fff5f5 !important;
    }
    
    .has-error .input-icon {
        color: #fc8181 !important;
    }
    
    .has-error .input-hint {
        color: #fc8181 !important;
    }
`;
document.head.appendChild(style);