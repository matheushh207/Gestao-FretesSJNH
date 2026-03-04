// Processador de PDF
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function extrairDadosPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let textoCompleto = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Ordenar itens por Y (cima para baixo) e depois por X (esquerda para direita)
            const items = textContent.items.sort((a, b) => {
                const yA = a.transform[5];
                const yB = b.transform[5];
                if (Math.abs(yA - yB) > 5) {
                    return yB - yA;
                }
                return a.transform[4] - b.transform[4];
            });

            let currentY = -1;
            let currentLine = '';

            items.forEach(item => {
                if (currentY === -1 || Math.abs(item.transform[5] - currentY) < 5) {
                    currentLine += item.str + ' ';
                    currentY = item.transform[5];
                } else {
                    textoCompleto += currentLine + '\n';
                    currentLine = item.str + ' ';
                    currentY = item.transform[5];
                }
            });
            textoCompleto += currentLine + '\n';
        }

        console.log('📄 PDF Processado. Total de linhas:', textoCompleto.split('\n').length);
        return processarTexto(textoCompleto);
    } catch (error) {
        console.error('Erro ao extrair PDF:', error);
        throw error;
    }
}

function processarTexto(texto) {
    const clientes = [];
    const clientesMap = {};

    // Dividir o texto por linhas
    const linhas = texto.split('\n');
    let clienteAtual = null;

    // Regex refinadas baseadas na imagem
    // Pattern: Cliente..: ID NOME
    const regexCliente = /Cliente\.\.+:\s*(\d+)\s+([A-Z0-9\s\.\-\/]+?)(?=\s+Cidade:|$)/i;
    const regexCidadeUF = /Cidade:\s*([A-Z\s]+?)\s+UF:\s*([A-Z]{2})/i;

    // Pattern: [8-digit CTe] [Data DD/MM/YYYY] [Valor X,XX] [Chave 44 digits]
    const regexFrete = /(\d{8})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d\.]*,\d{2})\s+(\d{44})/g;

    linhas.forEach((linha, index) => {
        // 1. Tentar identificar Cliente
        const matchCliente = linha.match(regexCliente);
        if (matchCliente) {
            const id = matchCliente[1];
            const nome = matchCliente[2].trim();

            // Buscar cidade/uf na mesma linha
            const matchCidade = linha.match(regexCidadeUF);
            const cidade = matchCidade ? matchCidade[1].trim() : 'N/D';
            const uf = matchCidade ? matchCidade[2].trim() : 'N/D';

            // Detectar tipo FAT
            const isFaturado = linha.includes(' FAT');
            const tipo = isFaturado ? 'FAT' : 'SEMANAL';

            if (!clientesMap[id]) {
                clientesMap[id] = {
                    id: id,
                    nome: nome,
                    cidade: cidade,
                    uf: uf,
                    tipo: tipo,
                    fretes: []
                };
                clientes.push(clientesMap[id]);
            }
            clienteAtual = clientesMap[id];

            console.log(`👤 Cliente detectado: ${nome} (ID: ${id})`);
            return;
        }

        // 2. Tentar identificar Fretes (CTes)
        let matchFrete;
        while ((matchFrete = regexFrete.exec(linha)) !== null) {
            if (clienteAtual) {
                const numCte = matchFrete[1];
                const data = matchFrete[2];
                const valorLimpo = matchFrete[3].replace(/\./g, '').replace(',', '.');
                const chave = matchFrete[4];

                // Evitar duplicatas
                if (!clienteAtual.fretes.find(f => f.numero_cte === numCte)) {
                    clienteAtual.fretes.push({
                        numero_cte: numCte,
                        data: data,
                        valor: parseFloat(valorLimpo),
                        chave: chave
                    });
                    console.log(`   📄 CTe ${numCte} adicionado para ${clienteAtual.nome}`);
                }
            }
        }
    });

    console.log(`✅ Processamento concluído: ${clientes.length} clientes encontrados.`);
    return { clientes };
}
