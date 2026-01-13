// js/ui/search-bar.js

export function initSearchBar(onSearch, placeholder = "Buscar...") {
    // Evita duplicar se já existe na DOM
    if (document.querySelector('.search-component-wrapper')) {
        // Se já existe, apenas atualiza o listener de busca (opcional, mas seguro)
        // Por simplificação, assumimos que ele é criado uma vez por carga de página.
        return; 
    }

    // HTML ESTRUTURAL
    const html = `
    <div class="search-component-wrapper">
        <button class="mobile-search-fab" id="fab-search-trigger">
            <i class="fas fa-search" id="fab-icon"></i>
        </button>

        <div class="bottom-dark-bar" id="search-bar-container">
            <div class="search-input-wrapper-dark">
                <i class="fas fa-search search-icon-dark"></i>
                
                <input type="text" class="global-search-input" placeholder="${placeholder}" autocomplete="off">
                
                <i class="fas fa-times btn-internal-clear" id="btn-internal-clear"></i>
                
                <i class="fas fa-chevron-down mobile-close-search" id="btn-collapse-search"></i>
            </div>
        </div>
    </div>
    `;

    // INJEÇÃO NO DOM
    const topBar = document.querySelector('.top-filter-bar');
    if (topBar) {
        // Insere dentro da barra superior (para Desktop pegar fácil)
        topBar.insertAdjacentHTML('beforeend', html);
    } else {
        document.body.insertAdjacentHTML('beforeend', html);
    }

    // SELEÇÃO DE ELEMENTOS
    const wrapper = document.querySelector('.search-component-wrapper');
    const fabBtn = document.getElementById('fab-search-trigger');
    const fabIcon = document.getElementById('fab-icon');
    const collapseBtn = document.getElementById('btn-collapse-search');
    const internalClearBtn = document.getElementById('btn-internal-clear');
    const input = document.querySelector('.global-search-input');
    
    let timeout;

    // --- 1. FUNÇÕES DE ESTADO ---

    function updateFabState() {
        const hasText = input.value.trim() !== '';
        if (hasText) {
            fabBtn.classList.add('has-filter');
            fabIcon.className = 'fas fa-times'; // Vira X vermelho no mobile
        } else {
            fabBtn.classList.remove('has-filter');
            fabIcon.className = 'fas fa-search'; // Vira Lupa
        }
    }

    function updateInternalClearBtn() {
        // Mostra o X interno se tiver texto
        if (input.value.trim() !== '') {
            internalClearBtn.classList.add('visible');
            internalClearBtn.style.display = 'block'; // Reforço visual
        } else {
            internalClearBtn.classList.remove('visible');
            internalClearBtn.style.display = 'none';
        }
    }

    // --- 2. EVENTOS ---

    // A. Digitação (Input)
    input.addEventListener('input', (e) => {
        const term = e.target.value;
        updateInternalClearBtn(); 
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            onSearch(term);
            updateFabState();
        }, 300);
    });

    // B. Clique no FAB (Mobile)
    fabBtn.addEventListener('click', () => {
        const hasText = input.value.trim() !== '';
        
        if (hasText) {
            // Se tem texto, o FAB serve para LIMPAR tudo
            input.value = '';
            onSearch('');
            updateInternalClearBtn();
            updateFabState();
        } else {
            // Se vazio, serve para ABRIR a busca
            wrapper.classList.add('search-active');
            setTimeout(() => input.focus(), 100);
        }
    });

    // C. Clique na Seta (Fechar Mobile)
    collapseBtn.addEventListener('click', () => {
        wrapper.classList.remove('search-active');
        input.blur();
        updateFabState(); 
    });

    // D. Clique no X Interno (O QUE FALTAVA) 
    internalClearBtn.addEventListener('click', () => {
        input.value = '';           // 1. Limpa valor visual
        onSearch('');               // 2. Dispara busca vazia (reseta lista)
        updateInternalClearBtn();   // 3. Esconde o próprio botão
        updateFabState();           // 4. Atualiza FAB
        input.focus();              // 5. Mantém foco para digitar de novo
    });
}