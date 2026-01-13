import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, db } from "../services/firebase.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showNotification } from "../ui/notifications.js";
import { setActiveInstitution, setUser } from "../core/state.js";

const loginBtn = document.getElementById("login-btn");
const modalOverlay = document.getElementById("modal-overlay");
const institutionModal = document.getElementById("institution-modal");
const institutionList = document.getElementById("institution-list");
const confirmBtn = document.getElementById("modal-confirm-btn");

// Variável para armazenar as instituições carregadas
let instituicoesDisponiveis = [];

loginBtn.addEventListener("click", iniciarLogin);

async function iniciarLogin() {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value;

  if (!email || !senha) {
    showNotification("Informe email e senha", "info");
    return;
  }

  loginBtn.disabled = true;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, senha);
    const uid = userCredential.user.uid;

    const userDoc = await getDoc(doc(db, "usuarios", uid));
    if (!userDoc.exists() || userDoc.data().ativo === false) {
      throw new Error("Usuário inválido ou desativado");
    }

    const userData = userDoc.data();

    // Salva usuário no state
    setUser({ uid: uid, ...userData });
    
    const instituicoesIds = userData.acessoInstituicoes || [];

    if (instituicoesIds.length === 0) {
      showNotification("Você não tem acesso a nenhuma instituição.", "error");
      loginBtn.disabled = false;
      return;
    }

    // Carrega nomes das instituições
    instituicoesDisponiveis = []; // Reseta a lista
    const querySnapshot = await getDocs(query(collection(db, "instituicoes"), where("__name__", "in", instituicoesIds)));
    
    querySnapshot.forEach(doc => {
        instituicoesDisponiveis.push({ id: doc.id, nome: doc.data().nome || doc.id });
    });

    // Ordena
    instituicoesDisponiveis.sort((a, b) => a.nome.localeCompare(b.nome));

    if (instituicoesDisponiveis.length === 1) {
      // Caso 1: Apenas uma instituição -> Seleciona o OBJETO inteiro
      setActiveInstitution(instituicoesDisponiveis[0]); 
      redirecionarParaDashboard();
    } else {
      // Caso 2: Várias -> Abre modal
      popularSelectInstituicoes(instituicoesDisponiveis);
      mostrarModal();
    }

  } catch (error) {
    console.error("Erro no login:", error);
    showNotification("Email ou senha incorretos", "error");
    loginBtn.disabled = false;
  }
}

function popularSelectInstituicoes(instituicoes) {
  institutionList.innerHTML = "";
  instituicoes.forEach(inst => {
    const option = document.createElement("option");
    option.value = inst.id;
    option.textContent = inst.nome;
    institutionList.appendChild(option);
  });
}

function mostrarModal() {
  modalOverlay.style.display = "flex";
  institutionModal.style.display = "flex";
}

function esconderModal() {
  modalOverlay.style.display = "none";
  institutionModal.style.display = "none";
}

// CORREÇÃO AQUI NO CONFIRM
confirmBtn.addEventListener("click", () => {
  const selectedId = institutionList.value;
  if (!selectedId) {
    showNotification("Selecione uma instituição", "info");
    return;
  }

  // Busca o OBJETO completo na lista que salvamos antes
  const selectedObj = instituicoesDisponiveis.find(i => i.id === selectedId);

  if (selectedObj) {
      setActiveInstitution(selectedObj); // Passa o objeto {id, nome}
      esconderModal();
      redirecionarParaDashboard();
  }
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    esconderModal();
    // Opcional: Reabilitar botão de login se cancelar
    loginBtn.disabled = false; 
  }
});

function redirecionarParaDashboard() {
  // Não precisa de sessionStorage flag, o AuthGuard cuida disso
  window.location.replace("./index.html"); 
}