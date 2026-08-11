/* -------- 09-servicos.js --------
   Barra de serviços de streaming no Painel.

   O Painel misturava as fileiras genéricas (Populares, Em destaque) com as de
   cada serviço, uma embaixo da outra — quanto mais serviços ativos, mais longa
   e mais confusa a página. Aqui elas saem da rolagem e passam a ser um filtro:
   nenhuma aparece até você escolher um serviço.

   De onde vem a lista: dos catálogos do addon instalado, não de uma lista fixa
   no código. Se você ativar ou desativar um serviço na configuração do addon,
   a barra acompanha sozinha.

   Sobre as marcas: os botões usam o NOME de cada serviço, não o logotipo.
   Redesenhar logotipo de marca é reproduzir material de terceiros, e eu não
   faço isso por conta própria — se você me passar os arquivos oficiais, eu
   troco os textos pelas imagens em monocromático. */

(function () {
    const CHAVE = 'cu:servico';
    let selecionado = '';
    try { selecionado = localStorage.getItem(CHAVE) || ''; } catch (_) { /* ignore */ }

    // Normaliza para comparar: um dos catálogos do addon vem com espaço duplo
    // no nome ("Prime  Video"), o que criava dois botões para o mesmo serviço.
    const normaliza = (t) => String(t || '').replace(/\s+/g, ' ').trim();
    const chave = (t) => normaliza(t).toLowerCase();

    // Serviço é o que vira fileira "<Nome> - Filme" / "<Nome> - Série" no
    // Painel. Duas fontes, unidas:
    //
    //   1. os catálogos que o addon de streamings declara — assim os cinco
    //      botões existem desde o primeiro quadro, sem esperar a rolagem;
    //   2. os títulos das fileiras já na tela — assim qualquer outro addon do
    //      mesmo formato entra sozinho.
    //
    // A primeira versão disto varria TODOS os catálogos de TODOS os addons e
    // trouxe "Ano", "Idioma", "Search" e "Last videos" para a barra: nome de
    // catálogo, sozinho, não distingue um serviço de um filtro.
    // A lista precisa cobrir os nomes em PORTUGUÊS também: "Em destaque - Filme"
    // casa com o padrão de fileira de serviço e entrou na barra como se fosse
    // um streaming, escondendo as próprias fileiras por padrão.
    const GENERICOS = new RegExp('^(' + [
        'popular', 'populares', 'featured', 'em destaque', 'destaque',
        'top', 'new', 'novidades', 'trending', 'tend[êe]ncias',
        'search', 'busca', 'calendar', 'calend[áa]rio', 'last', '[úu]ltimos',
        'continuar', 'year', 'ano', 'idioma', 'language',
        'genre', 'g[êe]nero', 'recomend',
    ].join('|') + ')', 'i');

    function servicosDoAddon() {
        let perfil;
        try { perfil = JSON.parse(localStorage.getItem('profile') || '{}'); } catch (_) { return []; }
        const addon = (perfil.addons || []).find((a) =>
            /netflix-catalog/i.test(a.transportUrl || '') || /streaming catalogs/i.test(a.manifest?.name || ''));
        if (!addon) return [];

        // Serviço aparece como catálogo de filme E de série com o mesmo nome;
        // é isso que o separa de um filtro avulso.
        const contagem = new Map();
        (addon.manifest?.catalogs || []).forEach((c) => {
            const n = normaliza(c.name);
            if (!n || GENERICOS.test(n)) return;
            contagem.set(chave(n), { nome: n, vezes: (contagem.get(chave(n))?.vezes || 0) + 1 });
        });
        return [...contagem.values()].filter((x) => x.vezes >= 2).map((x) => x.nome);
    }

    function servicosDasFileiras() {
        const achados = [];
        document.querySelectorAll('[class*="meta-row-container"]').forEach((f) => {
            const el = f.querySelector('[class*="title-container"] [class*="title"]') || f.querySelector('[class*="title"]');
            const m = /^(.+?)\s+-\s+(Filme|S[ée]rie|Movie|Series)s?$/i.exec(normaliza(el ? el.textContent : ''));
            if (m && !GENERICOS.test(m[1])) achados.push(m[1]);
        });
        return achados;
    }

    function servicos() {
        const vistos = new Map();
        [...servicosDoAddon(), ...servicosDasFileiras()].forEach((n) => {
            if (!vistos.has(chave(n))) vistos.set(chave(n), n);
        });
        return [...vistos.values()];
    }

    // "Netflix - Filme" / "Netflix - Série" → pertence ao serviço "Netflix".
    function tituloDaFileira(fileira) {
        const el = fileira.querySelector('[class*="title-container"] [class*="title"]')
            || fileira.querySelector('[class*="title"]');
        return el ? chave(el.textContent) : '';
    }

    function montaBarra(lista) {
        let barra = document.querySelector('.cu-servicos');
        if (barra && barra.dataset.itens === String(lista.length)) return barra;

        if (!barra) {
            barra = document.createElement('div');
            barra.className = 'cu-servicos';
            document.body.appendChild(barra);
        }
        barra.dataset.itens = String(lista.length);
        barra.innerHTML = '';

        const botao = (rotulo, valor) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cu-servico-btn';
            b.textContent = rotulo;
            b.dataset.servico = valor;
            b.addEventListener('click', () => {
                // Clicar no que já está escolhido desliga o filtro — sem isso
                // não haveria como voltar para "nenhum" sem um botão extra.
                selecionado = (selecionado === valor) ? '' : valor;
                try { localStorage.setItem(CHAVE, selecionado); } catch (_) { /* ignore */ }
                aplica();
            });
            barra.appendChild(b);
        };

        lista.forEach((nome) => botao(nome, chave(nome)));
        return barra;
    }

    function aplica() {
        document.querySelectorAll('.cu-servico-btn').forEach((b) => {
            b.classList.toggle('selecionado', b.dataset.servico === selecionado);
        });

        const lista = servicos().map(chave);
        document.querySelectorAll('[class*="meta-row-container"]').forEach((fileira) => {
            const titulo = tituloDaFileira(fileira);
            const dono = lista.find((s) => titulo.startsWith(s));
            if (!dono) { fileira.classList.remove('cu-fileira-oculta'); return; }   // genérica: sempre visível
            fileira.classList.toggle('cu-fileira-oculta', dono !== selecionado);
        });
    }

    function sync() {
        const noPainel = !window.__cu.utils.currentRoute();
        const barra = document.querySelector('.cu-servicos');

        if (!noPainel) {
            if (barra) barra.remove();
            // Sair do Painel não pode deixar fileira escondida em outra tela.
            document.querySelectorAll('.cu-fileira-oculta').forEach((f) => f.classList.remove('cu-fileira-oculta'));
            document.body.classList.remove('cu-com-servicos');
            return;
        }

        const lista = servicos();
        if (!lista.length) return;

        montaBarra(lista);
        document.body.classList.add('cu-com-servicos');
        aplica();
    }

    window.__cu.register(sync);
})();
