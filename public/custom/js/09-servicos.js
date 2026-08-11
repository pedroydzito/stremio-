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
    const TUDO = '\u0000tudo';          // valor reservado: nenhum serviço se chama assim
    let selecionado = TUDO;
    try { selecionado = localStorage.getItem(CHAVE) || TUDO; } catch (_) { /* ignore */ }

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
        // A barra vive DENTRO do conteúdo do Painel, não solta no body. Na
        // primeira versão ela era `fixed` e eu dava padding-top no
        // `board-container` para abrir espaço — só que esse contêiner inclui a
        // NAVBAR, que desceu 42px junto. Como filha do conteúdo, ela herda a
        // largura das fileiras e gruda sozinha ao rolar, sem empurrar nada.
        const conteudo = document.querySelector('[class*="board-content"]:not([class*="container"])')
            || document.querySelector('[class*="board-content-container"]');
        if (!conteudo) return null;

        let barra = conteudo.querySelector(':scope > .cu-servicos');
        if (barra && barra.dataset.itens === String(lista.length)) return barra;

        if (!barra) {
            document.querySelectorAll('.cu-servicos').forEach((b) => b.remove());
            barra = document.createElement('div');
            barra.className = 'cu-servicos';
            conteudo.insertBefore(barra, conteudo.firstChild);
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
                // "Tudo" é o estado de repouso: clicar no serviço já escolhido
                // volta para ele, em vez de deixar a tela sem filtro nenhum.
                selecionado = (selecionado === valor) ? TUDO : valor;
                try { localStorage.setItem(CHAVE, selecionado); } catch (_) { /* ignore */ }
                aplica();
            });
            barra.appendChild(b);
        };

        botao('Tudo', TUDO);
        lista.forEach((nome) => botao(nome, chave(nome)));
        return barra;
    }

    function aplica() {
        document.querySelectorAll('.cu-servico-btn').forEach((b) => {
            b.classList.toggle('selecionado', b.dataset.servico === selecionado);
        });

        const emTudo = selecionado === TUDO;
        const lista = servicos().map(chave);

        document.querySelectorAll('[class*="meta-row-container"]').forEach((fileira) => {
            const titulo = tituloDaFileira(fileira);
            const dono = lista.find((s) => titulo.startsWith(s));
            // Em "Tudo": as genéricas aparecem e as de streaming somem.
            // Num serviço: só as dele — o resto da página sai de cena, incluindo
            // o destaque grande do topo (pela classe no body).
            const mostrar = dono ? (!emTudo && dono === selecionado) : emTudo;
            fileira.classList.toggle('cu-fileira-oculta', !mostrar);
        });

        document.body.classList.toggle('cu-servico-ativo', !emTudo);
    }

    function sync() {
        const noPainel = !window.__cu.utils.currentRoute();
        const barra = document.querySelector('.cu-servicos');

        if (!noPainel) {
            if (barra) barra.remove();
            // Sair do Painel não pode deixar fileira escondida em outra tela.
            document.querySelectorAll('.cu-fileira-oculta').forEach((f) => f.classList.remove('cu-fileira-oculta'));
            document.body.classList.remove('cu-com-servicos', 'cu-servico-ativo');
            return;
        }

        const lista = servicos();
        if (!lista.length) return;

        if (!montaBarra(lista)) return;
        document.body.classList.add('cu-com-servicos');
        aplica();
    }

    window.__cu.register(sync);
})();
