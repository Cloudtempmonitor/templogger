// profile.js
import { getUser, updateState } from "../core/state.js";
import { ProfileService } from "../services/profile.services.js";
import { showNotification } from "../ui/notifications.js";

function validatePassword(password) {
  const errors = [];

  if (password.length < 6) errors.push("Mínimo 6 caracteres");
  if (!/[a-z]/.test(password)) errors.push("1 minúscula");
  if (!/[A-Z]/.test(password)) errors.push("1 maiúscula");
  if (!/\d/.test(password)) errors.push("1 número");
  // Verifica se há pelo menos um caractere especial (símbolo)
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("1 caractere especial");

  if (errors.length > 0) {
    // Retorna mensagem formatada pronta para o showNotification
    return { isValid: false, message: "Faltam requisitos: " + errors.join(", ") };
  }

  return { isValid: true };
}

let originalValues = {};

async function initProfile() {
  const user = getUser();
  if (!user) {
    window.addEventListener("userReady", () => renderProfile(), { once: true });
    return;
  }
  await renderProfile();
  setupEventListeners();
}

async function renderProfile() {
  const user = getUser();
  if (!user) return;

  // Cabeçalho
  document.getElementById("profile-display-name").textContent = user.nome || "—";
  document.getElementById("profile-display-role").textContent = user.nivel || "Usuário";

  // Campos editáveis
  const nameInput = document.getElementById("profile-input-name");
  const chatIdInput = document.getElementById("profile-input-chatid");

  nameInput.value = user.nome || "";
  document.getElementById("profile-input-email").value = user.email || "";
  chatIdInput.value = user.chatId || "";

  // Guarda valores originais para cancelar
  originalValues = {
    nome: nameInput.value,
    chatId: chatIdInput.value
  };
}

function setupEventListeners() {
  const saveBtn = document.getElementById("btn-save-profile");
  const cancelBtn = document.getElementById("btn-cancel-profile");

  // Botões de edição individuais
  document.querySelectorAll('.btn-edit[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        input.readOnly = false;
        input.classList.add('editing');
        input.focus();
        saveBtn.style.display = "inline-block";
        cancelBtn.style.display = "inline-block";
      }
    });
  });

  // Abrir área de mudança de senha
  document.getElementById('btn-change-password-trigger')?.addEventListener('click', () => {
    document.getElementById('password-edit-area').style.display = 'block';
    saveBtn.style.display = "inline-block";
    cancelBtn.style.display = "inline-block";
  });

  // Toggle mostrar/esconder senha
  document.querySelectorAll('.toggle-password-btn').forEach(button => {
    button.addEventListener('click', function() {
      const targetId = this.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = this.querySelector('i');

      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  });

  // Botão CANCELAR
  cancelBtn?.addEventListener('click', () => {
    // Restaura valores
    document.getElementById("profile-input-name").value = originalValues.nome;
    document.getElementById("profile-input-chatid").value = originalValues.chatId;

    // Limpa e fecha senha
    document.getElementById("new-password").value = "";
    document.getElementById("confirm-password").value = "";
    document.getElementById('password-edit-area').style.display = 'none';

    // Remove modo edição
    document.querySelectorAll('.profile-input.editing').forEach(input => {
      input.readOnly = true;
      input.classList.remove('editing');
    });

    // Esconde botões
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";

    showNotification("Alterações canceladas", "info");
  });

  // Botão SALVAR
  saveBtn?.addEventListener('click', async () => {
    const user = getUser();
    const nome = document.getElementById("profile-input-name").value.trim();
    const chatId = document.getElementById("profile-input-chatid").value.trim();
    const novaSenha = document.getElementById("new-password").value;
    const confirmSenha = document.getElementById("confirm-password").value;

    try {
      let passwordChanged = false;
      let profileUpdated = false;
      const updates = { nome, chatId };

      // 1. Tratamento de Senha
      if (novaSenha) {
        const val = validatePassword(novaSenha);
        if (!val.isValid) return showNotification(val.message, "error");
        if (novaSenha !== confirmSenha) return showNotification("As senhas não conferem", "error");

        try {
          await ProfileService.updateAuthPassword(novaSenha);
          passwordChanged = true;
        } catch (pwError) {
          if (pwError.code === 'auth/requires-recent-login') {
            return showNotification("Por segurança, saia e entre novamente para trocar a senha.", "error");
          }
          throw pwError;
        }
      }

      // 2. Atualização de Perfil + Sincronização de Cache
      if (nome !== (user.nome || "") || chatId !== (user.chatId || "")) {
        await ProfileService.updateProfileData(user.uid, updates);
        
        // CRUCIAL: Atualiza o cache local para não mostrar dados antigos
        updateState(updates);
        profileUpdated = true;
      }

      // 3. Feedback Final
      if (passwordChanged || profileUpdated) {
        showNotification("Alterações salvas com sucesso!", "success");
        
        // O reload agora serve apenas para limpar o estado de "edição" da UI
        setTimeout(() => location.reload(), 1500);
      } else {
        showNotification("Nenhuma alteração detectada.", "info");
      }

    } catch (error) {
      console.error("Erro:", error);
      showNotification("Erro ao atualizar dados.", "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", initProfile);