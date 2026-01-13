const CACHE_NAME = 'templogger-v3'; //

// Lista de arquivos vitais para o App funcionar offline
const ASSETS_TO_CACHE = []; 

self.addEventListener('install', (event) => {
    // Pula a espera para ativar o SW imediatamente, mas sem tentar baixar arquivos
    self.skipWaiting(); 
});

