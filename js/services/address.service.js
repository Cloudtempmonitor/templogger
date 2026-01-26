

// js/services/address.service.js

export const ESTADOS_BR = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", 
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", 
    "SP", "SE", "TO"
];

export function getEstadoOptions(selectedUF) {
    let options = '<option value="">Selecione...</option>';
    ESTADOS_BR.forEach(uf => {
        const isSelected = selectedUF === uf ? 'selected' : '';
        options += `<option value="${uf}" ${isSelected}>${uf}</option>`;
    });
    return options;
}

export async function buscarDadosCep(cep) {
    // Remove caracteres não numéricos
    const cleanCep = cep.replace(/\D/g, '');
    
    if (cleanCep.length !== 8) {
        return { error: true, msg: "CEP inválido (digite 8 números)" };
    }

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        
        if (data.erro) {
            return { error: true, msg: "CEP não encontrado na base de dados." };
        }
        
        return { error: false, data };
    } catch (error) {
        return { error: true, msg: "Erro de conexão ao buscar CEP." };
    }
}