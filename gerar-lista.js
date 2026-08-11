// Gera arquivos.js a partir do que existe em public/custom.
//
// A lista é gerada e COMMITADA em vez de lida em tempo de execução: na Vercel
// a função só enxerga o que foi empacotado com ela, e depender de leitura de
// diretório em runtime é exatamente o tipo de coisa que funciona no teste e
// falha no deploy. Rode este script sempre que adicionar ou remover um módulo.
const fs = require('fs');
const path = require('path');

const lista = (dir, ext) => fs.readdirSync(path.join(__dirname, 'public/custom', dir))
    .filter((f) => f.toLowerCase().endsWith(ext) && !f.startsWith('.'))
    .sort();

const css = lista('css', '.css');
const js = lista('js', '.js');

fs.writeFileSync(path.join(__dirname, 'arquivos.js'),
    '// GERADO por gerar-lista.js — não edite à mão.\n' +
    '// A ordem alfabética é o que define a ordem de carga (por isso os prefixos 00-, 01-…).\n' +
    'module.exports = {\n' +
    `    CSS: ${JSON.stringify(css, null, 8).replace(/\n/g, '\n    ')},\n` +
    `    JS: ${JSON.stringify(js, null, 8).replace(/\n/g, '\n    ')},\n` +
    '};\n');

console.log(`arquivos.js: ${css.length} CSS, ${js.length} JS`);
