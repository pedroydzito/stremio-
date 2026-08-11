/* -------- 09-servicos.js --------
   Barra de serviços de streaming no Painel.

   O Painel misturava as fileiras genéricas (Populares, Em destaque) com as de
   cada serviço, uma embaixo da outra — quanto mais serviços ativos, mais longa
   e mais confusa a página. Aqui elas saem da rolagem e passam a ser um filtro:
   nenhuma aparece até você escolher um serviço.

   De onde vem a lista: dos catálogos do addon instalado, não de uma lista fixa
   no código. Se você ativar ou desativar um serviço na configuração do addon,
   a barra acompanha sozinha.

   Os logotipos são os arquivos que você forneceu, em custom/img/. Eles entram
   como MÁSCARA, não como imagem: assim herdam a cor do botão e acompanham o
   cinza/branco do estado, sem precisar de uma versão colorida e outra não.
   Serviço sem arquivo correspondente continua mostrando o nome em texto. */

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

        // Pastilha que desliza de um botão para o outro. É ela que pinta o
        // fundo do selecionado — o botão só muda de cor. Fosse o fundo do
        // próprio botão, a troca seria um corte seco.
        const pilula = document.createElement('span');
        pilula.className = 'cu-servico-pilula';
        barra.appendChild(pilula);

        // nome do serviço → arquivo do logotipo
        const LOGOS = {
            'netflix': 'netflix',
            'hbo max': 'hbo-max',
            'disney+': 'disney-plus',
            'prime video': 'prime-video',
            'apple tv+': 'apple-tv',
        };

        const botao = (rotulo, valor) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cu-servico-btn';
            b.dataset.servico = valor;

            const arquivo = LOGOS[valor];
            if (arquivo) {
                // O nome fica no title e como rótulo acessível: o logotipo é
                // desenho, não texto, e sem isso o botão ficaria mudo.
                b.title = rotulo;
                b.setAttribute('aria-label', rotulo);
                const logo = document.createElement('span');
                logo.className = 'cu-logo cu-logo-' + arquivo;
                b.appendChild(logo);
            } else {
                b.textContent = rotulo;
            }
            b.addEventListener('click', () => {
                // "Tudo" é o estado de repouso: clicar no serviço já escolhido
                // volta para ele, em vez de deixar a tela sem filtro nenhum.
                selecionado = (selecionado === valor) ? TUDO : valor;
                try { localStorage.setItem(CHAVE, selecionado); } catch (_) { /* ignore */ }
                aplica(true);
            });
            barra.appendChild(b);
        };

        botao('Tudo', TUDO);
        lista.forEach((nome) => botao(nome, chave(nome)));
        return barra;
    }

    // Leva a pastilha até o botão escolhido. `animar` desliga a transição na
    // primeira pintura: sem isso ela entraria voando do canto esquerdo toda vez
    // que a tela é montada.
    function moveP1lula(animar) {
        const barra = document.querySelector('.cu-servicos');
        const pilula = barra?.querySelector('.cu-servico-pilula');
        const alvo = barra?.querySelector('.cu-servico-btn.selecionado');
        if (!pilula || !alvo) return;
        // Anima `left`, não `transform`: dentro desta barra o translateX era
        // aplicado no estilo mas não chegava a valer na pintura (medido: style
        // dizia 67px e a pastilha renderizava nos 5px anteriores). `left` não
        // depende de pilha de transformação e aqui não custa nada — é um
        // elemento pequeno numa barra pequena.
        pilula.style.transition = animar ? '' : 'none';
        pilula.style.width = alvo.offsetWidth + 'px';
        pilula.style.left = alvo.offsetLeft + 'px';
        pilula.style.opacity = '1';
        if (!animar) requestAnimationFrame(() => { pilula.style.transition = ''; });
    }

    // A barra não pode empurrar o conteúdo: ela flutua por cima. A margem
    // inferior negativa devolve o espaço que ela ocuparia.
    //
    // A conta é sobre o espaço LÍQUIDO até o que vem depois:
    //     líquido = margemSuperior + altura + margemInferior
    // Então a margem inferior sai do espaço desejado. Isso desacopla as duas
    // coisas: a margem superior decide onde a barra começa (e pode crescer sem
    // empurrar nada), enquanto o espaço antes do destaque grande fica fixo aqui.
    // Em "Tudo" o destaque vai de ponta a ponta e encosta na navbar, então a
    // barra não pode deixar folga acima dele — ela flutua por cima. Num
    // serviço não há destaque, e a primeira fileira precisa de respiro.
    const ESPACO_TUDO = 0;
    const ESPACO_SERVICO = 14;

    function naoOcuparEspaco(emTudo) {
        const barra = document.querySelector('.cu-servicos');
        if (!barra) return;
        const alt = Math.round(barra.getBoundingClientRect().height);
        if (!alt) return;
        const topo = Math.round(parseFloat(getComputedStyle(barra).marginTop) || 0);
        const desejado = emTudo ? ESPACO_TUDO : ESPACO_SERVICO;
        const valor = (desejado - topo - alt) + 'px';
        if (barra.style.marginBottom !== valor) barra.style.marginBottom = valor;
    }

    // As 3 linhas por catálogo foram revertidas: cada catálogo entrega só 10
    // itens (medido no Painel), e 10 pôsteres no tamanho normal não chegam a
    // formar 3 linhas. Para forçá-las eu teria que esticar os cards, que foi
    // justamente o que ficou ruim. Fica uma fileira, como no resto do app.

    function aplica(animar) {
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
        naoOcuparEspaco(emTudo);
        moveP1lula(animar !== false);
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

        // A lista sai do manifesto guardado no perfil, que já está no
        // localStorage quando a página abre — a barra não precisa esperar as
        // fileiras chegarem. Era essa espera que a fazia aparecer atrasada.
        const lista = servicos();
        if (!lista.length) return;

        const nova = !document.querySelector('.cu-servicos');
        if (!montaBarra(lista)) return;
        document.body.classList.add('cu-com-servicos');
        aplica(!nova);
    }

    window.__cu.register(sync);
})();
