// CONFIGURAÇÕES
const CONFIG = {
    SPREADSHEET_ID: '1-ijXa2yrUQElotiL8dJcVSloUZmOIKhh53S8J6PlbTo',
    API_KEY: 'AIzaSyCf6NYMH3mzRDj_be974nw2g6mIbaAAr_k',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbygo45yw51FARTHqcAB7SG2OH8EDoYmfWbfGRl1wxJr_EvKiKk1I0bE5A_oFow-2sp-ww/exec',
    SHEET_CLIENTES: 'Clientes',
    SHEET_FRETES: 'Fretes',
    SHEET_RESUMO: 'Resumo'
};

let dadosGlobais = {
    clientes: [],
    fretes: [],
    filtroAtual: 'nao-faturado',
    searchTerm: '',
    filterStatus: '',
    startDate: '',
    endDate: ''
};

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    inicializarEventos();
    carregarDados();
});

function inicializarEventos() {
    // Upload PDF
    document.getElementById('btnImportarPDF').addEventListener('click', abrirModalUpload);
    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('filePDF').click();
    });
    document.getElementById('filePDF').addEventListener('change', handleFilePDF);

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            mudarAba(e.target.dataset.tab);
        });
    });

    // Busca e Filtros
    document.getElementById('searchCliente').addEventListener('input', (e) => {
        dadosGlobais.searchTerm = e.target.value.toLowerCase();
        renderizarDados();
    });

    document.getElementById('filterStatus').addEventListener('change', (e) => {
        dadosGlobais.filterStatus = e.target.value;
        renderizarDados();
    });

    document.getElementById('startDate').addEventListener('change', (e) => {
        dadosGlobais.startDate = e.target.value;
        renderizarDados();
    });

    document.getElementById('endDate').addEventListener('change', (e) => {
        dadosGlobais.endDate = e.target.value;
        renderizarDados();
    });

    // Export e Recarregar
    document.getElementById('btnRecarregar').addEventListener('click', carregarDados);

    // Voucher Upload Events
    document.getElementById('voucherUploadArea').addEventListener('click', () => {
        document.getElementById('fileVoucher').click();
    });
    document.getElementById('fileVoucher').addEventListener('change', handleFileVoucher);
}

function abrirModalUpload() {
    document.getElementById('modalUpload').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('modalUpload').classList.add('hidden');
    document.getElementById('filePDF').value = '';
    document.getElementById('previewDados').classList.add('hidden');
}

async function handleFilePDF(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const { clientes, fretes } = await extrairDadosPDF(file);
        exibirPreviewDados(clientes);

        document.getElementById('btnConfirmarImportacao').disabled = false;
        document.getElementById('btnConfirmarImportacao').onclick = () => confirmarImportacao(clientes);

    } catch (error) {
        alert('Erro ao processar PDF: ' + error.message);
    }
}

function exibirPreviewDados(clientes) {
    const tbody = document.querySelector('#tabelaPreview tbody');
    tbody.innerHTML = '';

    clientes.slice(0, 10).forEach(cliente => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${cliente.nome}</td>
            <td>${cliente.cidade}</td>
            <td>${cliente.tipo}</td>
            <td>${cliente.fretes ? cliente.fretes.length : 0}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('previewDados').classList.remove('hidden');
}

async function confirmarImportacao(clientes) {
    try {
        mostrarCarregamento(true);
        await sincronizarComSheets(clientes);
        mostrarMensagem('sucesso', '✓ Importação realizada com sucesso!');
        fecharModal();
        await carregarDados();
    } catch (error) {
        mostrarMensagem('erro', 'Erro na importação: ' + error.message);
    } finally {
        mostrarCarregamento(false);
    }
}

async function carregarDados() {
    try {
        mostrarCarregamento(true);
        // Tentar buscar via GET primeiro (que agora trataremos no script)
        console.log('🔄 Iniciando carregamento de dados...');
        dadosGlobais.clientes = await buscarDadosSheet('Clientes');
        dadosGlobais.fretes = await buscarDadosSheet('Fretes');

        console.log('✅ Dados carregados:', {
            clientes: dadosGlobais.clientes.length,
            fretes: dadosGlobais.fretes.length
        });

        renderizarDados();
        atualizarTimestamp();
    } catch (error) {
        console.error('❌ Erro crítico ao carregar dados:', error);
        mostrarMensagem('erro', 'Erro ao carregar dados. Verifique a conexão.');
    } finally {
        mostrarCarregamento(false);
    }
}

function renderizarDados() {
    const tab = dadosGlobais.filtroAtual;

    if (tab === 'nao-faturado') {
        renderizarClientesPorTipo('NAO-FATURADO', 'gridNaoFaturado');
    } else if (tab === 'faturado') {
        renderizarClientesPorTipo('FATURADO', 'gridFaturado');
    } else if (tab === 'todos') {
        renderizarTabelaTodos();
    } else if (tab === 'dashboard') {
        renderizarDashboard();
    }
}

// Helper para buscar observação independente da grafia na planilha (robusto)
function obterObservacao(cliente) {
    if (!cliente) return '';

    // Procura por chaves ignorando maiúsculas, minúsculas, espaços e acentos
    const keys = Object.keys(cliente);
    const obsKey = keys.find(k => {
        const normalized = k.toString().trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return normalized === 'observacao' || normalized === 'obs' || normalized.includes('observaca');
    });

    if (obsKey) {
        const valor = cliente[obsKey];
        return (valor !== undefined && valor !== null) ? valor.toString().trim() : '';
    }
    return '';
}

// Helper universal para evitar erros de undefined.toString()
function safeStr(val) {
    if (val === undefined || val === null) return '';
    return val.toString().trim();
}

// Helper para buscar qualquer valor independente da grafia da chave
function obterValorPelaChave(obj, chaveProcurada) {
    if (!obj) return null;
    const keys = Object.keys(obj);
    const target = chaveProcurada.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Lista de variações comuns para chaves importantes
    let variacoes = [target];
    if (target.includes('comprovante')) variacoes.push('link', 'arquivo', 'compr', 'voucher', 'drive', 'foto');
    if (target.includes('tipo')) variacoes.push('faturamento', 'cat', 'classificacao');

    const keyMatch = keys.find(k => {
        const normalized = k.toString().trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return variacoes.some(v => normalized === v || normalized.includes(v));
    });
    return keyMatch ? obj[keyMatch] : null;
}

function formatarDataBR(dataStr) {
    if (!dataStr) return '--';
    try {
        const data = new Date(dataStr);
        if (isNaN(data.getTime())) return dataStr.split('T')[0].split('-').reverse().join('/');
        return data.toLocaleDateString('pt-BR');
    } catch (e) {
        return dataStr;
    }
}

function renderizarClientesPorTipo(tipo, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Inicializar working array
    let clientesFiltrados = [...dadosGlobais.clientes];

    // Lógica: FATURADO pega quem tem Tipo_Faturamento que CONTÉM 'FAT'
    // NAO-FATURADO pega todo o resto
    clientesFiltrados = clientesFiltrados.filter(c => {
        const t = safeStr(obterValorPelaChave(c, 'Tipo_Faturamento')).toUpperCase();
        // REGRA ABSOLUTA: Se conter "FAT", é faturado. Caso contrário (vazio, semanal, etc), NÃO é faturado.
        const ehEmpresaFaturada = t.includes('FAT');

        if (tipo === 'FATURADO') return ehEmpresaFaturada;
        return !ehEmpresaFaturada;
    });

    if (dadosGlobais.searchTerm) {
        const term = safeStr(dadosGlobais.searchTerm).toLowerCase();
        clientesFiltrados = clientesFiltrados.filter(c =>
            safeStr(c.Nome).toLowerCase().includes(term) ||
            safeStr(c.ID_Cliente) === term
        );
    }

    clientesFiltrados.forEach(cliente => {
        let fretes = (dadosGlobais.fretes || []).filter(f =>
            safeStr(f.ID_Cliente) === safeStr(cliente.ID_Cliente) &&
            safeStr(f.Status_Pagamento).toUpperCase() === 'ABERTO'
        );

        // Filtro de Data
        if (dadosGlobais.startDate) {
            fretes = fretes.filter(f => f.Data_Emissao.substring(0, 10) >= dadosGlobais.startDate);
        }
        if (dadosGlobais.endDate) {
            fretes = fretes.filter(f => f.Data_Emissao.substring(0, 10) <= dadosGlobais.endDate);
        }

        const totalAberto = fretes.reduce((sum, f) => sum + parseFloat(f.Valor_Frete || 0), 0);

        const card = document.createElement('div');
        const tipoClass = tipo === 'FATURADO' ? 'fat' : 'nao-fat';
        card.className = `cliente-card ${tipoClass}`;

        const linkComprovante = obterValorPelaChave(cliente, 'Link_Comprovante');
        const iconesVoucher = linkComprovante ? `
            <div class="voucher-actions-inline" style="display: inline-flex; gap: 5px; margin-left: 8px;">
                <span class="status-comprovante" onclick="window.open('${linkComprovante}', '_blank')" title="Ver Comprovante" style="cursor:pointer;">👁️</span>
                <span class="status-comprovante remover" onclick="removerVoucher(${cliente.ID_Cliente})" title="Remover Comprovante" style="cursor:pointer; filter: hue-rotate(140deg);">🗑️</span>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="card-header-flex">
                <h3>${cliente.Nome} ${iconesVoucher}</h3>
                <span class="id-badge">#${cliente.ID_Cliente}</span>
            </div>
            <div class="cliente-info">
                <p>📍 <strong>Cidade:</strong> ${cliente.Cidade}</p>
                <p>📄 <strong>Documentos:</strong> ${fretes.length} pendentes</p>
                <div class="obs-area" style="background: #fffbe6; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; border-left: 3px solid #ffe58f; font-size: 0.85rem; min-height: 30px;">
                    <strong>Obs:</strong> ${obterObservacao(cliente) || '<i>Sem observação</i>'}
                </div>
            </div>
            <div class="valor-aberto">R$ ${totalAberto.toFixed(2)}</div>
            <div class="cliente-actions">
                <button class="btn btn-secondary" onclick="editarObservacao(${cliente.ID_Cliente})" title="Adicionar Observação">📝 OBS</button>
                <button class="btn btn-voucher" onclick="abrirModalVoucher(${cliente.ID_Cliente})" title="Anexar Comprovante">📸 ANEXO</button>
                ${tipo !== 'FATURADO' ?
                `<button class="btn btn-info" onclick="verDocumentos(${cliente.ID_Cliente})" style="background: #722ed1;">📄 CTES</button>
                     <button class="btn btn-info" onclick="gerarCobranca(${cliente.ID_Cliente})" style="background: #1890ff;">📱 COBRAR</button>
                     <button class="btn btn-primary" onclick="marcarPago(${cliente.ID_Cliente})" style="width: 100%; margin-top: 0.5rem;">✓ BAIXA</button>`
                : '<span style="color: var(--verde); font-weight: bold; width: 100%; text-align: center;">✓ PROCESSADO</span>'
            }
            </div>
        `;
        container.appendChild(card);
    });

    if (clientesFiltrados.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: white; border-radius: 12px; border: 2px dashed #ccc;">
                <p style="font-size: 1.2rem; color: #666;">Nenhum cliente encontrado.</p>
            </div>
        `;
    }
}

// FUNÇÕES DE MODAL CUSTOMIZADO
function abrirCustomModal(titulo, corpo, confirmarTexto = 'ENTENDI', mostrarCancelar = false, callback = null) {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').textContent = titulo;
    document.getElementById('modalBody').innerHTML = corpo;

    const btnConfirmar = document.getElementById('btnModalConfirm');
    const btnCancelar = document.getElementById('btnModalCancel');

    btnConfirmar.textContent = confirmarTexto;
    btnConfirmar.onclick = () => {
        fecharCustomModal();
        if (callback) callback(true);
    };

    if (mostrarCancelar) {
        btnCancelar.style.display = 'block';
        btnCancelar.onclick = () => {
            fecharCustomModal();
            if (callback) callback(false);
        };
    } else {
        btnCancelar.style.display = 'none';
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function fecharCustomModal() {
    const modal = document.getElementById('customModal');
    modal.style.display = 'none';
    modal.classList.add('hidden');
}

// Sobrescrever funções originais modificando o código existente
function gerarCobranca(clienteId) {
    const cliente = dadosGlobais.clientes.find(c => c.ID_Cliente.toString().trim() === clienteId.toString().trim());
    const fretes = dadosGlobais.fretes.filter(f =>
        f.ID_Cliente.toString().trim() === clienteId.toString().trim() &&
        f.Status_Pagamento.toString().toUpperCase() === 'ABERTO'
    );

    if (fretes.length === 0) {
        mostrarMensagem('info', 'Nenhum frete em aberto');
        return;
    }

    const total = fretes.reduce((sum, f) => sum + parseFloat(f.Valor_Frete || 0), 0);

    const listaCtes = fretes.map(f => {
        const dataApenas = f.Data_Emissao.split('T')[0].split('-').reverse().join('/');
        const valorIndividual = parseFloat(f.Valor_Frete || 0).toFixed(2);
        return `📄 CTe: ${f.Numero_CTE} (${dataApenas}) - *R$ ${valorIndividual}*`;
    }).join('\n');

    const observacao = obterObservacao(cliente);
    const obsTexto = observacao ? `\n\n*OBS:* ${observacao}` : '';
    const mensagem = `Olá ${cliente.Nome}, seguem os fretes pendentes para pagamento:\n\n${listaCtes}${obsTexto}\n\n*Total a pagar: R$ ${total.toFixed(2)}*\n\n🔑 PIX para pagamento: poa@saojoaoencomendas.com.br\n🏢 (SÃO JOÃO ENCOMENDAS)\n\nPor favor, favor enviar o comprovante após o pagamento.`;

    navigator.clipboard.writeText(mensagem).then(() => {
        mostrarMensagem('sucesso', 'Mensagem copiada!');
        abrirCustomModal("📱 COPIADO PARA WHATSAPP", mensagem.replace(/\n/g, '<br>'));
    });
}

function verDocumentos(clienteId) {
    const cliente = dadosGlobais.clientes.find(c => c.ID_Cliente == clienteId);
    const fretes = dadosGlobais.fretes.filter(f => f.ID_Cliente == clienteId && f.Status_Pagamento === 'ABERTO');

    if (fretes.length === 0) {
        mostrarMensagem('info', 'Nenhum documento em aberto');
        return;
    }

    const listaHtml = fretes.map(f => {
        const data = f.Data_Emissao.split('T')[0].split('-').reverse().join('/');
        return `<div style="padding: 10px; background: #f0f2f5; border-radius: 12px; margin-bottom: 8px; border-left: 4px solid var(--azul-claro);">
            <strong>📄 CTe: ${f.Numero_CTE}</strong><br>
            📅 Data: ${data} | 💰 Valor: <strong>R$ ${parseFloat(f.Valor_Frete).toFixed(2)}</strong>
        </div>`;
    }).join('');

    abrirCustomModal(`📄 DOCUMENTOS - ${cliente.Nome}`, `<div style="max-height: 400px; overflow-y: auto; padding-right: 5px;">${listaHtml}</div>`);
}

async function editarObservacao(clienteId) {
    const cliente = dadosGlobais.clientes.find(c => c.ID_Cliente == clienteId);

    // Para simplificar o prompt customizado sem criar um input complexo agora,
    // vamos usar um modal com um campo de texto simples inserido no body.
    const corpoHtml = `
        <p style="margin-bottom: 10px;">Digite a nova observação para <strong>${cliente.Nome}</strong>:</p>
        <textarea id="promptObs" class="input-filter" style="width: 100%; height: 100px; padding: 10px; border-radius: 15px;">${obterObservacao(cliente)}</textarea>
    `;

    abrirCustomModal("📝 EDITAR OBSERVAÇÃO", corpoHtml, "SALVAR", true, async (confirmou) => {
        if (confirmou) {
            const novaObs = document.getElementById('promptObs').value;
            try {
                mostrarCarregamento(true);
                await atualizarClienteSheet(clienteId, {
                    Observacao: novaObs,
                    'Observação': novaObs
                });
                mostrarMensagem('sucesso', 'Observação salva!');
                await carregarDados();
            } catch (error) {
                mostrarMensagem('erro', 'Erro ao salvar observação');
            } finally {
                mostrarCarregamento(false);
            }
        }
    });
}

function renderizarTabelaTodos() {
    const tbody = document.querySelector('#tabelaTodos tbody');
    tbody.innerHTML = '';

    let fretesFiltrados = dadosGlobais.fretes;

    if (dadosGlobais.searchTerm) {
        fretesFiltrados = fretesFiltrados.filter(f => {
            const cliente = dadosGlobais.clientes.find(c => c.ID_Cliente == f.ID_Cliente);
            return cliente && (cliente.Nome.toLowerCase().includes(dadosGlobais.searchTerm) || cliente.ID_Cliente.toString().includes(dadosGlobais.searchTerm));
        });
    }

    // REGRA: Mostrar apenas clientes que NÃO são faturados (os que controlamos)
    fretesFiltrados = fretesFiltrados.filter(f => {
        const cliente = dadosGlobais.clientes.find(c => safeStr(c.ID_Cliente) === safeStr(f.ID_Cliente));
        if (!cliente) return false;

        const t = safeStr(obterValorPelaChave(cliente, 'Tipo_Faturamento')).toUpperCase();
        const ehEmpresaFaturada = t.includes('FAT');
        return !ehEmpresaFaturada;
    });

    if (dadosGlobais.filterStatus) {
        fretesFiltrados = fretesFiltrados.filter(f => f.Status_Pagamento === dadosGlobais.filterStatus);
    }

    // Filtro de Data
    if (dadosGlobais.startDate) {
        fretesFiltrados = fretesFiltrados.filter(f => f.Data_Emissao.substring(0, 10) >= dadosGlobais.startDate);
    }
    if (dadosGlobais.endDate) {
        fretesFiltrados = fretesFiltrados.filter(f => f.Data_Emissao.substring(0, 10) <= dadosGlobais.endDate);
    }

    const agrupados = {};
    fretesFiltrados.forEach(f => {
        const key = `${f.ID_Cliente}_${f.Status_Pagamento}`;
        if (!agrupados[key]) {
            agrupados[key] = {
                idCliente: f.ID_Cliente,
                status: f.Status_Pagamento,
                total: 0,
                qtd: 0,
                data: f.Data_Emissao
            };
        }
        agrupados[key].total += parseFloat(f.Valor_Frete || 0);
        agrupados[key].qtd += 1;
    });

    Object.values(agrupados).forEach(item => {
        const clienteId = safeStr(item.idCliente);
        const cliente = dadosGlobais.clientes.find(c => safeStr(c.ID_Cliente) === clienteId);
        const statusParaExibir = safeStr(item.status).toUpperCase();
        const classeStatus = statusParaExibir.toLowerCase();

        const dataFormatada = formatarDataBR(item.data);
        const tr = document.createElement('tr');

        const linkComprovante = obterValorPelaChave(cliente, 'Link_Comprovante');
        const btnComprovante = linkComprovante ? `
            <button class="btn btn-info" onclick="window.open('${linkComprovante}', '_blank')" title="Ver Comprovante" style="background: #13c2c2; color: white; padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;">👁️</button>
            <button class="btn btn-danger" onclick="removerVoucher(${item.idCliente})" title="Remover Comprovante" style="background: #ff4d4f; color: white; padding: 4px 8px; font-size: 0.8rem; margin-right: 5px; border:none; border-radius:4px; cursor:pointer;">🗑️</button>
        ` : `
            <button class="btn btn-secondary" onclick="mostrarMensagem('info', 'Nenhum comprovante anexado para este cliente.')" title="Sem Comprovante" style="opacity: 0.5; padding: 4px 8px; font-size: 0.8rem; margin-right: 5px; cursor: help;">👁️</button>
        `;

        tr.innerHTML = `
            <td>${cliente?.Nome || 'Desconhecido'}</td>
            <td>${item.qtd} docs</td>
            <td>${dataFormatada}</td>
            <td>R$ ${item.total.toFixed(2)}</td>
            <td><strong class="status-${classeStatus}">${statusParaExibir}</strong></td>
            <td>
                ${btnComprovante}
                ${(statusParaExibir === 'ABERTO') ?
                `<button class="btn btn-secondary" onclick="marcarPago('${item.idCliente}')">Dar Baixa</button>` :
                '✓ PAGO'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function marcarPago(clienteId) {
    const fretes = dadosGlobais.fretes.filter(f => safeStr(f.ID_Cliente) === safeStr(clienteId) && safeStr(f.Status_Pagamento).toUpperCase() === 'ABERTO');
    if (fretes.length === 0) return;

    abrirCustomModal("❓ CONFIRMAR BAIXA", `Deseja confirmar a baixa de ${fretes.length} documento(s) como PAGO?`, "CONFIRMAR", true, async (confirmou) => {
        if (confirmou) {
            try {
                mostrarCarregamento(true);
                for (const frete of fretes) {
                    await atualizarFreteSheet(frete.ID_Frete, { Status_Pagamento: 'PAGO' });
                }
                // REGRA: Nunca mudar o Tipo_Faturamento aqui
                mostrarMensagem('sucesso', 'Baixa realizada com sucesso!');
                await carregarDados();
            } catch (error) {
                mostrarMensagem('erro', 'Erro na baixa');
            } finally {
                mostrarCarregamento(false);
            }
        }
    });
}

function renderizarDashboard() {
    // Aplicar Filtro de Data nos Fretes primeiro
    let fretesFiltrados = dadosGlobais.fretes;
    if (dadosGlobais.startDate) {
        fretesFiltrados = fretesFiltrados.filter(f => f.Data_Emissao.substring(0, 10) >= dadosGlobais.startDate);
    }
    if (dadosGlobais.endDate) {
        fretesFiltrados = fretesFiltrados.filter(f => f.Data_Emissao.substring(0, 10) <= dadosGlobais.endDate);
    }

    // Pegar apenas clientes que NÃO são Empresas Faturadas (os que controlamos)
    const clientesNaoFaturados = dadosGlobais.clientes.filter(c => {
        const t = safeStr(obterValorPelaChave(c, 'Tipo_Faturamento')).toUpperCase();
        return !t.includes('FAT');
    });

    // IDs dos clientes controlados (Não Faturados)
    const idsNaoFaturados = new Set(clientesNaoFaturados.map(c => safeStr(c.ID_Cliente)));

    // Filtrar fretes apenas desses clientes
    const fretesNaoFaturados = fretesFiltrados.filter(f => idsNaoFaturados.has(safeStr(f.ID_Cliente)));

    const fretesAbertos = fretesNaoFaturados.filter(f => safeStr(f.Status_Pagamento).toUpperCase() === 'ABERTO');
    const totalAberto = fretesAbertos.reduce((sum, f) => sum + parseFloat(f.Valor_Frete || 0), 0);

    const fretesPagos = fretesNaoFaturados.filter(f => safeStr(f.Status_Pagamento).toUpperCase() === 'PAGO');
    const totalPago = fretesPagos.reduce((sum, f) => sum + parseFloat(f.Valor_Frete || 0), 0);

    const qtdClientesPendentes = new Set(fretesAbertos.map(f => safeStr(f.ID_Cliente))).size;

    const grid = document.querySelector('.dashboard-grid');
    grid.innerHTML = `
        <div class="card-stat highlight" style="border-top-color: #e74c3c;">
            <h3>📂 PENDENTE (NÃO FATURADOS)</h3>
            <p class="valor" style="color: #e74c3c">R$ ${totalAberto.toFixed(2)}</p>
            <p class="sub-valor">📦 ${fretesAbertos.length} Documentos / ${qtdClientesPendentes} Clientes</p>
        </div>
        <div class="card-stat" style="border-top-color: var(--verde);">
            <h3>✅ RECEBIDO (BAIXADOS)</h3>
            <p class="valor" style="color: var(--verde)">R$ ${totalPago.toFixed(2)}</p>
            <p class="sub-valor">📦 ${fretesPagos.length} Documentos baixados</p>
        </div>
    `;

    const oldProg = document.querySelector('.progress-section');
    if (oldProg) oldProg.remove();

    const totalGeral = totalAberto + totalPago;
    const percentual = totalGeral > 0 ? (totalPago / totalGeral * 100) : 0;

    const progHtml = `
        <div class="progress-section" style="margin-top: 2rem; background: white; padding: 2rem; border-radius: 20px; box-shadow: var(--sombra);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="color: var(--azul-marinho); margin: 0;">📊 PERCENTUAL DE RECEBIMENTO</h3>
                <button class="btn btn-pdf" onclick="gerarRelatorioPDF()">📥 EXPORTAR RELATÓRIO PDF</button>
            </div>
            <div style="height: 35px; background: #eee; border-radius: 20px; overflow: hidden; display: flex; box-shadow: inset 0 2px 5px rgba(0,0,0,0.1);">
                <div style="width: ${percentual}%; background: linear-gradient(90deg, var(--verde) 0%, var(--verde-claro) 100%); transition: width 1s ease-in-out;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 0.8rem;">
                <p style="font-weight: 800; font-size: 1.1rem; color: var(--verde);">${percentual.toFixed(1)}% Recebido</p>
                <p style="font-weight: 600; color: #666;">Meta: 100%</p>
            </div>
        </div>
    `;
    grid.insertAdjacentHTML('afterend', progHtml);
}

// ============================================
// FUNÇÕES DE VOUCHER (UPLOAD COMPROVANTE)
// ============================================
let clienteVoucherAtual = null;

function abrirModalVoucher(clienteId) {
    clienteVoucherAtual = clienteId;
    const cliente = dadosGlobais.clientes.find(c => c.ID_Cliente == clienteId);
    document.getElementById('voucherClienteNome').textContent = cliente.Nome;
    document.getElementById('modalVoucher').classList.remove('hidden');
}

function fecharModalVoucher() {
    document.getElementById('modalVoucher').classList.add('hidden');
    document.getElementById('fileVoucher').value = '';
    document.getElementById('voucherPreview').classList.add('hidden');
    document.getElementById('btnConfirmarVoucher').disabled = true;
    clienteVoucherAtual = null;
}

function handleFileVoucher(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('imgVoucherPreview').src = e.target.result;
        document.getElementById('voucherPreview').classList.remove('hidden');
        document.getElementById('btnConfirmarVoucher').disabled = false;
        document.getElementById('btnConfirmarVoucher').onclick = () => confirmarVoucher(file);
    };
    reader.readAsDataURL(file);
}

async function confirmarVoucher(file) {
    try {
        mostrarCarregamento(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result.split(',')[1];
            const dados = {
                clienteId: clienteVoucherAtual,
                arquivo: base64,
                tipo: file.type,
                nome: `Comprovante_${clienteVoucherAtual}_${new Date().getTime()}.${file.name.split('.').pop()}`
            };

            await enviarArquivoParaDrive(dados);
            mostrarMensagem('sucesso', 'Comprovante salvo com sucesso!');
            fecharModalVoucher();
            await carregarDados();
        };
        reader.readAsDataURL(file);
    } catch (error) {
        mostrarMensagem('erro', 'Erro ao salvar comprovante');
    } finally {
        mostrarCarregamento(false);
    }
}

async function removerVoucher(clienteId) {
    const cliente = dadosGlobais.clientes.find(c => c.ID_Cliente == clienteId);

    abrirCustomModal(
        "🗑️ REMOVER COMPROVANTE",
        `Deseja realmente apagar o comprovante de <strong>${cliente.Nome}</strong>?`,
        "REMOVER",
        true,
        async (confirmou) => {
            if (confirmou) {
                try {
                    mostrarCarregamento(true);
                    await removerVoucherSheet(clienteId);
                    mostrarMensagem('sucesso', 'Comprovante removido!');
                    await carregarDados();
                } catch (error) {
                    mostrarMensagem('erro', 'Erro ao remover comprovante');
                } finally {
                    mostrarCarregamento(false);
                }
            }
        }
    );
}

// ============================================
// GERAÇÃO DE RELATÓRIO PDF (PRO)
// ============================================
async function gerarRelatorioPDF() {
    try {
        mostrarCarregamento(true);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // 1. Cabeçalho com Logo (Fundo Branco para mesclar com o logo)
        try {
            // Desenhar um fundo branco no topo
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, 210, 45, 'F');

            // Adicionar a imagem da logo
            doc.addImage('assets/logo.jpeg', 'JPEG', 10, 5, 45, 30);

            // Texto em Azul Marinho para contraste no fundo branco
            doc.setTextColor(13, 59, 102);
            doc.setFontSize(20);
            doc.text("SÃO JOÃO ENCOMENDAS", 65, 20);
            doc.setFontSize(10);
            doc.text("RELATÓRIO DE PRESTAÇÃO DE CONTAS - FRETES PENDENTES", 65, 30);

            // Linha decorativa
            doc.setDrawColor(13, 59, 102);
            doc.setLineWidth(0.5);
            doc.line(10, 40, 200, 40);
        } catch (e) {
            console.warn("Logo não encontrada ou erro ao carregar:", e);
            doc.setFillColor(13, 59, 102);
            doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.text("SÃO JOÃO ENCOMENDAS", 105, 20, { align: 'center' });
        }

        // 2. Informações do Período
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        const periodo = (dadosGlobais.startDate && dadosGlobais.endDate)
            ? `${dadosGlobais.startDate.split('-').reverse().join('/')} até ${dadosGlobais.endDate.split('-').reverse().join('/')}`
            : 'Período Geral';
        doc.text(`Período: ${periodo}`, 14, 55);
        doc.text(`Data de Emissão: ${new Date().toLocaleString()}`, 14, 62);

        // 3. Tabela de Dados (Apenas Não Faturados)
        const clientesNaoFaturados = dadosGlobais.clientes.filter(c => {
            const t = (c.Tipo_Faturamento || '').toUpperCase();
            return !(t === 'FATURADO' || t === 'FAT' || t === 'PAGO');
        });
        const idsNaoFaturados = new Set(clientesNaoFaturados.map(c => c.ID_Cliente));

        let fretesParaRelatorio = dadosGlobais.fretes.filter(f => idsNaoFaturados.has(f.ID_Cliente));

        if (dadosGlobais.startDate) fretesParaRelatorio = fretesParaRelatorio.filter(f => f.Data_Emissao.substring(0, 10) >= dadosGlobais.startDate);
        if (dadosGlobais.endDate) fretesParaRelatorio = fretesParaRelatorio.filter(f => f.Data_Emissao.substring(0, 10) <= dadosGlobais.endDate);

        const rows = fretesParaRelatorio.map(f => {
            const cliente = clientesNaoFaturados.find(c => c.ID_Cliente == f.ID_Cliente);
            const data = f.Data_Emissao.split('T')[0].split('-').reverse().join('/');
            const obs = obterObservacao(cliente);
            return [
                cliente?.Nome || 'N/D',
                f.Numero_CTE,
                data,
                `R$ ${parseFloat(f.Valor_Frete).toFixed(2)}`,
                f.Status_Pagamento,
                obs || '-'
            ];
        });

        doc.autoTable({
            startY: 70,
            head: [['Cliente', 'CTe', 'Data', 'Valor', 'Status', 'Observação']],
            body: rows,
            headStyles: { fillColor: [13, 59, 102], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 50 },
                5: { cellWidth: 40 }
            }
        });

        // 4. Totais
        const finalY = (doc.lastAutoTable.finalY || 70) + 10;
        const total = fretesParaRelatorio.reduce((sum, f) => sum + parseFloat(f.Valor_Frete || 0), 0);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`VALOR TOTAL PENDENTE: R$ ${total.toFixed(2)}`, 14, finalY);

        // 5. Rodapé
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text("Documento gerado automaticamente pelo Sistema Gestor de Fretes - São João Encomendas", 105, 285, { align: 'center' });

        doc.save(`Relatorio_Fretes_Nao_Faturados_${new Date().getTime()}.pdf`);
        mostrarMensagem('sucesso', 'PDF gerado com sucesso!');
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        mostrarMensagem('erro', 'Erro ao gerar PDF');
    } finally {
        mostrarCarregamento(false);
    }
}

function mudarAba(novaAba) {
    dadosGlobais.filtroAtual = novaAba;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${novaAba}"]`).classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    const targetSet = document.getElementById(`tab-${novaAba}`);
    if (targetSet) targetSet.classList.add('active');
    renderizarDados();
}

function mostrarMensagem(tipo, mensagem) {
    const div = document.createElement('div');
    div.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 1rem; background: ${tipo === 'sucesso' ? '#4CAF50' : '#f44336'}; color: white; border-radius: 8px; z-index: 9999; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
    div.textContent = mensagem;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function mostrarCarregamento(ativo) {
    let loader = document.getElementById('loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loader';
        loader.style.cssText = 'position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999; color:white; font-weight:bold;';
        loader.innerHTML = 'Carregando...';
        document.body.appendChild(loader);
    }
    loader.style.display = ativo ? 'flex' : 'none';
}

function atualizarTimestamp() {
    const el = document.getElementById('ultimaAtualizacao');
    if (el) el.textContent = new Date().toLocaleString('pt-BR');
}

function exportarDados() {
    let csv = 'Cliente,CTe,Data,Valor,Status\n';
    dadosGlobais.fretes.forEach(f => {
        const c = dadosGlobais.clientes.find(cli => cli.ID_Cliente == f.ID_Cliente);
        csv += `"${c?.Nome}",${f.Numero_CTE},${f.Data_Emissao},${f.Valor_Frete},${f.Status_Pagamento}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fretes_export.csv';
    a.click();
}
