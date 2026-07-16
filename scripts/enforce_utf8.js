const fs = require('fs');
const path = require('path');

const directories = ['c:/classificado'];
const extensions = ['.html', '.js', '.css', '.json'];
const excludeDirs = ['node_modules', '.git', 'bkp'];

function enforceUtf8(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!excludeDirs.includes(file)) {
                enforceUtf8(fullPath);
            }
        } else if (extensions.includes(path.extname(fullPath))) {
            try {
                // Lê como buffer para verificar a existência de BOM
                const buffer = fs.readFileSync(fullPath);
                let content = buffer.toString('utf8');
                let modified = false;

                // Remove UTF-8 BOM se existir
                if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                    content = content.substring(1);
                    modified = true;
                    console.log(`BOM removido de: ${fullPath}`);
                }

                // Se for HTML, garante que meta charset UTF-8 exista e seja a primeira tag no head
                if (path.extname(fullPath) === '.html') {
                    // Limpa caracteres estranhos de corrupção de encoding no topo do arquivo (ex: )
                    if (content.includes('')) {
                        console.log(`Aviso: Caractere de substituição () encontrado em ${fullPath}. Possível corrupção anterior.`);
                    }

                    if (content.includes('<head>') && !content.match(/<head>\s*<meta charset="UTF-8">/i)) {
                        // Remove meta charset antigo
                        content = content.replace(/<meta[^>]*charset=["']?UTF-8["']?[^>]*>/ig, '');
                        // Insere no topo do head
                        content = content.replace(/<head>/i, '<head>\n  <meta charset="UTF-8">');
                        modified = true;
                    }
                }

                if (modified) {
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Corrigido e salvo em UTF-8: ${fullPath}`);
                }
            } catch (err) {
                console.error(`Erro ao processar ${fullPath}:`, err);
            }
        }
    });
}

directories.forEach(dir => enforceUtf8(dir));
console.log('Verificação de UTF-8 concluída.');
