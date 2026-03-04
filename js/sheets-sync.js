// Sincronização com Google Sheets - VERSÃO LOCAL

// ✅ SINCRONIZAR COM GOOGLE SHEETS (API Real)
async function sincronizarComSheets(clientes) {
    try {
        console.log('📤 Enviando dados para o Google Sheets...');

        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                acao: 'importar',
                clientes: clientes // clientes agora contém seus próprios fretes
            })
        });

        // Com no-cors, o fetch não retorna o corpo da resposta, mas se não der erro de rede, geralmente funcionou
        console.log('✅ Requisição enviada!');

        return {
            sucesso: true,
            mensagem: '✅ Dados enviados para processamento! Verifique sua planilha em alguns segundos.',
            clientes: clientes.length
        };
    } catch (error) {
        console.error('❌ Erro ao sincronizar:', error);
        throw error;
    }
}

// ✅ BUSCAR DADOS DO GOOGLE SHEETS
async function buscarDadosSheet(abaNome) {
    try {
        console.log('📥 Buscando dados reais da aba:', abaNome);

        const url = `${CONFIG.APPS_SCRIPT_URL}?acao=buscar&aba=${abaNome}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error('Falha na comunicação com o Google Sheets');

        const dados = await response.json();
        console.log(`✅ ${dados.length} registros recebidos para ${abaNome}`);

        return dados;
    } catch (error) {
        console.error('❌ Erro ao buscar dados:', error);
        // Fallback para Local Storage caso a API falhe mas existam dados salvos anteriormente (opcional)
        return [];
    }
}

// ✅ ATUALIZAR CLIENTE
async function atualizarClienteSheet(clienteId, novosDados) {
    try {
        console.log('📝 Atualizando cliente na planilha:', clienteId);

        await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                acao: 'atualizar_cliente',
                clienteId: clienteId,
                dados: novosDados
            })
        });

        return { sucesso: true };
    } catch (error) {
        console.error('❌ Erro ao atualizar cliente:', error);
        return { sucesso: false, erro: error.message };
    }
}

// ✅ ATUALIZAR FRETE
async function atualizarFreteSheet(freteId, novosDados) {
    try {
        console.log('📝 Atualizando frete na planilha:', freteId);

        await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                acao: 'atualizar_frete',
                freteId: freteId,
                dados: novosDados
            })
        });

        return { sucesso: true };
    } catch (error) {
        console.error('❌ Erro ao atualizar frete:', error);
        return { sucesso: false, erro: error.message };
    }
}

// ✅ EXPORTAR PARA GOOGLE SHEETS (Copiar/Colar Manual)
function exportarParaGoogleSheets() {
    const clientesLocal = localStorage.getItem('clientes_importados');
    const fretesLocal = localStorage.getItem('fretes_importados');

    if (!clientesLocal || !fretesLocal) {
        alert('❌ Nenhum dado para exportar!');
        return;
    }

    const clientes = JSON.parse(clientesLocal);
    const fretes = JSON.parse(fretesLocal);

    // Gerar CSV para Clientes
    let csvClientes = 'ID_Cliente\tNome\tCidade\tUF\tTipo_Faturamento\tData_Criacao\tAtivo\n';
    clientes.forEach(c => {
        csvClientes += `${c.id}\t${c.nome}\t${c.cidade}\t${c.uf}\t${c.tipo}\t${new Date().toLocaleDateString()}\tSIM\n`;
    });

    // Gerar CSV para Fretes
    let csvFretes = 'ID_Frete\tID_Cliente\tNumero_CTE\tData_Emissao\tValor_Frete\tChave_CTE\tStatus_Pagamento\tData_Importacao\n';
    fretes.forEach((f, index) => {
        csvFretes += `${index + 1}\t${f.id_cliente}\t${f.numero_cte}\t${f.data}\t${f.valor}\t${f.chave}\tABERTO\t${new Date().toLocaleDateString()}\n`;
    });

    // Copiar para clipboard
    const textoCompleto = `CLIENTES:\n${csvClientes}\n\nFRETES:\n${csvFretes}`;
    navigator.clipboard.writeText(textoCompleto).then(() => {
        alert('✅ Dados copiados! Cole no Google Sheets');
    });
}