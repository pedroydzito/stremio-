/* -------- 12-servico-catalogo.js --------
   As telas de cada streaming, montadas a partir do catálogo inteiro.

   O Painel mostrava só duas fileiras por serviço — "Netflix - Filme" e
   "Netflix - Série" —, com uma dúzia de itens cada. Mas o catálogo do addon
   devolve MUITO mais que isso numa única resposta: 98 itens por tipo, cada um
   com gênero, nota, ano, arte e id do IMDb (medido). Era tudo o que faltava
   para montar as fileiras por gênero que as telas dos streamings de verdade
   têm.

   Duas descobertas que definiram o desenho:

     · o addon declara `extraSupported: []` — não aceita filtro de gênero na
       requisição. Então o agrupamento é feito aqui, com o que veio;
     · `skip` não funciona (skip=100 devolve a mesma primeira página), então
       98 itens por tipo é o teto. É bastante para as fileiras, e nada além
       disso é alcançável sem outro addon.

   Os cards são construídos com as MESMAS classes dos nativos
   (`meta-item-container`, `poster-container`), de propósito: assim o selo de
   biblioteca, os estilos de card e o resto do que já existe continuam valendo
   sem nenhuma adaptação. */

(function () {
    const TTL = 30 * 60 * 1000;
    const cache = new Map();        // "base|tipo|id" -> { quando, itens }
    const buscando = new Set();

    // O catálogo devolve os gêneros em inglês.
    const GENEROS = {
        Action: 'Ação', Adventure: 'Aventura', Animation: 'Animação', Biography: 'Biografia',
        Comedy: 'Comédia', Crime: 'Crime', Documentary: 'Documentário', Drama: 'Drama',
        Family: 'Família', Fantasy: 'Fantasia', History: 'História', Horror: 'Terror',
        Music: 'Música', Musical: 'Musical', Mystery: 'Mistério', Romance: 'Romance',
        'Sci-Fi': 'Ficção científica', Sport: 'Esporte', Thriller: 'Suspense', War: 'Guerra',
        Western: 'Faroeste', Reality: 'Reality', Talk: 'Talk show', News: 'Notícias',
    };
    const traduz = (g) => GENEROS[g] || g;

    // Quantos itens uma fileira de gênero precisa ter para valer a pena.
    const MINIMO_POR_GENERO = 6;
    const MAX_FILEIRAS = 9;

    function catalogosDoServico(servico) {
        let perfil;
        try { perfil = JSON.parse(localStorage.getItem('profile') || '{}'); } catch (_) { return []; }
        const achados = [];
        (perfil.addons || []).forEach((a) => {
            const base = (a.transportUrl || '').replace(/manifest\.json$/, '');
            (a.manifest?.catalogs || []).forEach((c) => {
                const nome = String(c.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (nome === servico) achados.push({ base, tipo: c.type, id: c.id });
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
                // Só o necessário fica na memória: a resposta crua passa de
                // 240KB por catálogo, e nada disso precisa sobreviver à sessão.
                const itens = (j.metas || [])
                    .filter((m) => m.imdb_id || /^tt\d+/.test(m.id || ''))
                    .map((m) => ({
                        id: m.imdb_id || m.id,
                        tipo: m.type || cat.tipo,
                        nome: m.name || '',
                        poster: m.poster || '',
                        ano: (m.releaseInfo || m.year || '').toString().slice(0, 4),
                        nota: m.imdbRating || '',
                        generos: m.genres || m.genre || [],
                    }));
                cache.set(chave, { quando: Date.now(), itens });
            })
            .catch(() => { /* fica sem esta fileira */ })
            .finally(() => { buscando.delete(chave); });
        return null;
    }

    function montaFileiras(servico) {
        const cats = catalogosDoServico(servico);
        if (!cats.length) return null;

        const porTipo = {};
        let faltando = false;
        cats.forEach((c) => {
            const itens = pede(c);
            if (!itens) { faltando = true; return; }
            porTipo[c.tipo] = itens;
        });
        if (faltando && !Object.keys(porTipo).length) return null;

        const fileiras = [];
        if (porTipo.movie?.length) fileiras.push({ titulo: 'Filmes', itens: porTipo.movie });
        if (porTipo.series?.length) fileiras.push({ titulo: 'Séries', itens: porTipo.series });

        // Gêneros a partir do que veio, os mais numerosos primeiro. Filmes e
        // séries entram na mesma fileira de gênero: quem procura "Terror" quer
        // terror, não uma lista de filmes de terror e outra de séries.
        const todos = [...(porTipo.movie || []), ...(porTipo.series || [])];
        const porGenero = new Map();
        todos.forEach((it) => {
            (it.generos || []).forEach((g) => {
                if (!porGenero.has(g)) porGenero.set(g, []);
                porGenero.get(g).push(it);
            });
        });

        [...porGenero.entries()]
            .filter(([, itens]) => itens.length >= MINIMO_POR_GENERO)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, MAX_FILEIRAS - fileiras.length)
            .forEach(([g, itens]) => fileiras.push({ titulo: traduz(g), itens }));

        return fileiras;
    }

    function cardHTML(it) {
        const nome = String(it.nome).replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const href = '#/detail/' + it.tipo + '/' + encodeURIComponent(it.id);
        // As classes são as mesmas dos cards nativos para que os selos e o
        // estilo já existentes se apliquem sem tratamento especial.
        return `<a class="meta-item-container cu-cat-card" href="${href}" title="${nome}">
            <div class="poster-container">
                ${it.poster ? `<img class="poster-image" src="${it.poster}" alt="" loading="lazy" />` : '<div class="cu-cat-sem-arte"></div>'}
            </div>
            <div class="cu-cat-nome">${nome}</div>
            ${it.ano ? `<div class="cu-cat-ano">${it.ano}</div>` : ''}
        </a>`;
    }

    function render(servico) {
        const conteudo = document.querySelector('[class*="board-content"]:not([class*="container"])');
        if (!conteudo) return;

        let area = conteudo.querySelector(':scope > .cu-cat-area');
        const fileiras = montaFileiras(servico);
        if (!fileiras) {
            // Ainda buscando: não apaga o que já está na tela.
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
            conteudo.appendChild(area);
        }
        area.dataset.assinatura = assinatura;
        area.innerHTML = fileiras.map((f) => `
            <section class="cu-cat-fileira">
                <h3 class="cu-cat-titulo">${f.titulo}</h3>
                <div class="cu-cat-itens">${f.itens.map(cardHTML).join('')}</div>
            </section>`).join('');
    }

    function limpa() {
        document.querySelectorAll('.cu-cat-area').forEach((e) => e.remove());
    }

    function sync() {
        if (window.__cu.utils.currentRoute()) { limpa(); return; }
        const escolhido = document.querySelector('.cu-servico-btn.selecionado');
        const rotulo = escolhido ? (escolhido.getAttribute('aria-label') || escolhido.textContent) : '';
        const servico = String(rotulo || '').replace(/\s+/g, ' ').trim().toLowerCase();

        // "Tudo" não é serviço: ali o Painel segue como sempre foi.
        if (!servico || servico === 'tudo') { limpa(); return; }
        render(servico);
    }

    window.__cu.register(sync);
})();
