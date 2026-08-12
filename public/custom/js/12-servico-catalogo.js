/* -------- 12-servico-catalogo.js --------
   As telas de cada streaming, montadas a partir do catálogo inteiro.

   O Painel mostrava só duas fileiras por serviço — "Netflix - Filme" e
   "Netflix - Série". Mas o catálogo do addon devolve 98 itens por tipo numa
   única resposta, cada um com gênero, ano, nota, arte e id do IMDb (medido).
   Era tudo o que faltava para montar as fileiras por gênero que as telas dos
   streamings de verdade têm.

   Duas limitações do addon definiram o desenho:
     · `extraSupported: []` — ele não aceita filtro na requisição, então o
       agrupamento por gênero é feito aqui, com o que veio;
     · `skip` não pagina (skip=100 devolve a mesma primeira página), então 98
       itens por tipo é o teto.

   COMO O DESIGN BATE COM O DO PAINEL
   A primeira versão montava a marcação à mão e tentava reproduzir os
   espaçamentos, o tamanho dos cards e o texto por CSS. Ficou parecido e errado
   em tudo que importa. Esta versão CLONA uma fileira nativa e troca o
   conteúdo: as classes com hash do app vêm junto, e com elas todo o estilo,
   inclusive o hover que precisa de `overflow` nos ancestrais certos.

   O que se perde no clone são os manipuladores do React (o nó copiado não tem
   fiber). Navegar continua funcionando porque o card é um `<a href>` — que é
   como o próprio app navega. */

(function () {
    const TTL = 30 * 60 * 1000;
    const cache = new Map();        // "base|tipo|id" -> { quando, itens }
    const buscando = new Set();

    const GENEROS = {
        Action: 'Ação', Adventure: 'Aventura', Animation: 'Animação', Biography: 'Biografia',
        Comedy: 'Comédia', Crime: 'Crime', Documentary: 'Documentário', Drama: 'Drama',
        Family: 'Família', Fantasy: 'Fantasia', History: 'História', Horror: 'Terror',
        Music: 'Música', Musical: 'Musical', Mystery: 'Mistério', Romance: 'Romance',
        'Sci-Fi': 'Ficção científica', Sport: 'Esporte', Thriller: 'Suspense', War: 'Guerra',
        Western: 'Faroeste', Reality: 'Reality', Talk: 'Talk show', News: 'Notícias',
    };
    const traduz = (g) => GENEROS[g] || g;

    const MINIMO_POR_GENERO = 8;
    const POR_FILEIRA = 20;         // o que cabe numa fileira rolável
    const LOTE = 4;                 // fileiras montadas por vez
    const MARGEM_FIM = 700;         // px do fim da página que disparam o próximo lote

    function catalogosDoServico(servico) {
        let perfil;
        try { perfil = JSON.parse(localStorage.getItem('profile') || '{}'); } catch (_) { return []; }
        const achados = [];
        (perfil.addons || []).forEach((a) => {
            const url = a.transportUrl || '';
            (a.manifest?.catalogs || []).forEach((c) => {
                const nome = String(c.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (nome === servico) achados.push({ url, base: url.replace(/manifest\.json$/, ''), tipo: c.type, id: c.id });
            });
        });
        return achados;
    }

    function pede(cat) {
        const chave = cat.base + '|' + cat.tipo + '|' + cat.id;
        const guardado = cache.get(chave);
        if (guardado && Date.now() - guardado.quando < TTL) return guardado.itens;
        if (buscando.has(chave)) return null;

        buscando.add(chave);
        fetch(cat.base + 'catalog/' + cat.tipo + '/' + encodeURIComponent(cat.id) + '.json')
            .then((r) => r.json())
            .then((j) => {
                // Só o necessário: a resposta crua passa de 240KB por catálogo.
                const itens = (j.metas || [])
                    .filter((m) => m.imdb_id || /^tt\d+/.test(m.id || ''))
                    .map((m) => ({
                        id: m.imdb_id || m.id,
                        tipo: m.type || cat.tipo,
                        nome: m.name || '',
                        poster: m.poster || '',
                        generos: m.genres || m.genre || [],
                    }));
                cache.set(chave, { quando: Date.now(), itens });
            })
            .catch(() => { /* fica sem esta fileira */ })
            .finally(() => { buscando.delete(chave); });
        return null;
    }

    // Trocar de serviço só é instantâneo se o catálogo já estiver na mão. Como
    // são cinco e a resposta é grande, o adiantamento vai um por vez, em
    // segundo plano, e nunca atrapalha o que você está vendo.
    function adianta() {
        if (buscando.size) return;
        const botoes = document.querySelectorAll('.cu-servico-btn');
        for (const b of botoes) {
            const nome = String(b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim().toLowerCase();
            if (!nome || nome === 'tudo') continue;
            const cats = catalogosDoServico(nome);
            for (const c of cats) {
                const chave = c.base + '|' + c.tipo + '|' + c.id;
                const g = cache.get(chave);
                if (!g || Date.now() - g.quando >= TTL) { pede(c); return; }
            }
        }
    }

    function montaFileiras(servico) {
        const cats = catalogosDoServico(servico);
        if (!cats.length) return null;

        const porTipo = {};
        const catPorTipo = {};
        cats.forEach((c) => {
            const itens = pede(c);
            if (itens) { porTipo[c.tipo] = itens; catPorTipo[c.tipo] = c; }
        });
        if (!Object.keys(porTipo).length) return null;

        // "Ver tudo" leva ao Explorar já no catálogo daquele serviço — é o
        // mesmo destino que a fileira nativa tinha.
        const verTudo = (tipo) => {
            const c = catPorTipo[tipo];
            return c ? '#/discover/' + encodeURIComponent(c.url) + '/' + c.tipo + '/' + encodeURIComponent(c.id) : null;
        };

        const fileiras = [];
        if (porTipo.movie?.length) fileiras.push({ titulo: 'Filmes populares', itens: porTipo.movie, verTudo: verTudo('movie') });
        if (porTipo.series?.length) fileiras.push({ titulo: 'Séries populares', itens: porTipo.series, verTudo: verTudo('series') });

        // Filmes e séries entram juntos nas fileiras de gênero: quem procura
        // "Terror" quer terror, não uma lista de cada.
        const todos = [...(porTipo.movie || []), ...(porTipo.series || [])];
        const porGenero = new Map();
        todos.forEach((it) => {
            (it.generos || []).forEach((g) => {
                if (!porGenero.has(g)) porGenero.set(g, []);
                porGenero.get(g).push(it);
            });
        });

        // Sem teto: entram todos os gêneros com material suficiente. Quem
        // controla o peso é a montagem em lotes, não um corte na lista.
        [...porGenero.entries()]
            .filter(([, itens]) => itens.length >= MINIMO_POR_GENERO)
            .sort((a, b) => b[1].length - a[1].length)
            .forEach(([g, itens]) => {
                // O "Ver tudo" do gênero abre a lista AQUI, em grade, em vez de
                // levar ao Explorar. Não é preferência: o Explorar não tem
                // filtro de gênero para este catálogo — medido, ele oferece só
                // "Filme" e "Netflix", e `?genre=Horror` não muda uma linha do
                // resultado. Como o addon declara `extraSupported: []`, o app
                // nem desenha o controle. Expandir no lugar é o único jeito de
                // ver todos os itens daquele gênero.
                fileiras.push({ titulo: traduz(g), itens, expandir: true });
            });

        return fileiras;
    }

    // ---- clonagem da fileira nativa --------------------------------------
    let moldeFileira = null;
    let moldeItem = null;

    function pegaMoldes() {
        if (moldeFileira && moldeItem) return true;
        const fileiras = document.querySelectorAll('[class*="meta-row-container"]');
        for (const f of fileiras) {
            if (f.classList.contains('custom-continue-watching-row')) continue;   // essa é paisagem
            if (f.classList.contains('cu-cat-fileira')) continue;                 // não clonar a nossa
            const it = f.querySelector('[class*="meta-item-container"]');
            if (!it) continue;
            moldeFileira = f.cloneNode(false);      // só a casca, com as classes
            const cabecalho = f.querySelector('[class*="header-container"]');
            const itens = f.querySelector('[class*="meta-items-container"]');
            if (!cabecalho || !itens) { moldeFileira = null; continue; }
            moldeFileira.appendChild(cabecalho.cloneNode(true));
            const caixa = itens.cloneNode(false);
            moldeFileira.appendChild(caixa);
            moldeItem = it.cloneNode(true);
            return true;
        }
        return false;
    }

    function fazItem(it) {
        const el = moldeItem.cloneNode(true);
        el.classList.add('cu-cat-card');
        el.setAttribute('href', '#/detail/' + it.tipo + '/' + encodeURIComponent(it.id));
        el.setAttribute('title', it.nome);
        el.removeAttribute('style');                       // o molde pode vir com largura fixa
        el.classList.remove('force-landscape', 'cw-overflow', 'cu-ep-visto');

        const img = el.querySelector('img[class*="poster-image"]');
        if (img) {
            img.src = it.poster || '';
            delete img.dataset.origPoster;
        }
        // Camadas que pertencem ao estado do app, não a um card recém-criado.
        el.querySelectorAll('[class*="dismiss-icon-layer"], [class*="watched-icon-layer"], [class*="menu-container"], .cu-lib-selo, .cu-lb-nota')
            .forEach((x) => x.remove());

        const titulo = el.querySelector('[class*="title-bar"], [class*="title-container"]');
        if (titulo) titulo.textContent = it.nome;
        return el;
    }

    function fazFileira(f) {
        const linha = moldeFileira.cloneNode(true);
        linha.classList.add('cu-cat-fileira');
        linha.classList.remove('cu-fileira-oculta');

        const t = linha.querySelector('[class*="title-container"] [class*="title"]') || linha.querySelector('[class*="title"]');
        if (t) { t.textContent = f.titulo; t.setAttribute('title', f.titulo); }

        const caixa = linha.querySelector('[class*="meta-items-container"]');
        const verTudo = linha.querySelector('a[class*="see-all"]');

        const desenha = (todos) => {
            caixa.innerHTML = '';
            (todos ? f.itens : f.itens.slice(0, POR_FILEIRA)).forEach((it) => caixa.appendChild(fazItem(it)));
            linha.classList.toggle('cu-cat-expandida', !!todos);
            if (verTudo) {
                const rotulo = verTudo.querySelector('[class*="label"]');
                if (rotulo) rotulo.textContent = todos ? 'Mostrar menos' : 'Ver tudo';
            }
        };

        if (verTudo) {
            if (f.verTudo) {
                verTudo.setAttribute('href', f.verTudo);
                verTudo.style.removeProperty('display');
            } else if (f.expandir && f.itens.length > POR_FILEIRA) {
                // Vira um botão, não um link: o destino é esta mesma tela.
                verTudo.removeAttribute('href');
                verTudo.style.removeProperty('display');
                verTudo.classList.add('cu-cat-expandir');
                let aberta = false;
                verTudo.addEventListener('click', (e) => {
                    e.preventDefault();
                    aberta = !aberta;
                    desenha(aberta);
                });
            } else {
                verTudo.style.display = 'none';
            }
        }

        desenha(false);
        return linha;
    }

    // No começo do conteúdo, mas SEMPRE depois da barra de serviços. Inserir
    // como primeiro filho jogava a barra para a segunda posição — e como ela é
    // `sticky`, o ponto de partida dela passava a ser depois de todas as
    // fileiras: media 1584px do topo, fora da tela. Parecia que ela sumia.
    function insereNoTopo(conteudo, elemento) {
        const barra = conteudo.querySelector(':scope > .cu-servicos');
        conteudo.insertBefore(elemento, barra ? barra.nextSibling : conteudo.firstChild);
    }

    function render(servico) {
        const conteudo = document.querySelector('[class*="board-content"]:not([class*="container"])');
        if (!conteudo || !pegaMoldes()) return;

        const fileiras = montaFileiras(servico);
        let area = conteudo.querySelector(':scope > .cu-cat-area');

        if (!fileiras) {
            if (!area) {
                area = document.createElement('div');
                area.className = 'cu-cat-area';
                area.innerHTML = '<div class="cu-cat-carregando">Carregando catálogo…</div>';
                conteudo.appendChild(area);
            }
            return;
        }

        const assinatura = servico + '|' + fileiras.map((f) => f.titulo + ':' + f.itens.length).join(',');
        if (area && area.dataset.assinatura === assinatura) return;

        if (!area) {
            area = document.createElement('div');
            area.className = 'cu-cat-area';
            insereNoTopo(conteudo, area);
        }
        area.dataset.assinatura = assinatura;
        area.innerHTML = '';
        pendentes = fileiras.slice();
        montaLote(area);
    }

    // ---- montagem em lotes ----------------------------------------------
    // Um serviço rende mais de uma dúzia de gêneros. Montar tudo de uma vez
    // significa criar centenas de cards antes de a primeira fileira aparecer;
    // em lotes, a tela responde na hora e o resto chega enquanto você desce.
    let pendentes = [];

    function montaLote(area) {
        if (!pendentes.length) return;
        const lote = pendentes.splice(0, LOTE);
        lote.forEach((f) => area.appendChild(fazFileira(f)));
    }

    function continuaSeChegouAoFim() {
        if (!pendentes.length) return;
        const area = document.querySelector('.cu-cat-area');
        const cont = document.querySelector('[class*="board-content"]:not([class*="container"])');
        if (!area || !cont) return;
        const restante = cont.scrollHeight - cont.clientHeight - cont.scrollTop;
        if (restante < MARGEM_FIM) montaLote(area);
    }

    function limpa() {
        document.querySelectorAll('.cu-cat-area').forEach((e) => e.remove());
        pendentes = [];
    }

    function sync() {
        if (window.__cu.utils.currentRoute()) { limpa(); return; }

        pegaMoldes();
        adianta();

        const escolhido = document.querySelector('.cu-servico-btn.selecionado');
        const rotulo = escolhido ? (escolhido.getAttribute('aria-label') || escolhido.textContent) : '';
        const servico = String(rotulo || '').replace(/\s+/g, ' ').trim().toLowerCase();

        if (!servico || servico === 'tudo') { limpa(); return; }
        render(servico);
        continuaSeChegouAoFim();
    }

    window.__cu.register(sync);
})();
