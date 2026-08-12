/* -------- 03-board.js --------
   Board (home) route:
   - Hero carousel built from MetaRow fibers' catalog props
   - Continue Watching row forced to landscape (16:9) with width = 2x poster */

(function () {
    const { getReactFiber, findFiberProps } = window.__cu.utils;

    // ============================================================
    // Hero carousel
    // ============================================================
    let currentCatalogsJSON = '';
    let carouselTimer = null;
    let carouselIndex = 0;
    let carouselItems = [];
    let isCarouselPaused = false;

    // ---- tendências, buscadas direto no addon ---------------------------
    //
    // O Painel carrega as fileiras conforme você rola, então o catálogo de
    // tendências só ficava `Ready` depois de você chegar até ele — e o
    // destaque, que escolhe entre os catálogos prontos, nunca o via de saída.
    // Buscar direto resolve na origem: o destaque deixa de depender de onde a
    // página está rolada.
    //
    // O endereço sai do perfil, não fica fixo aqui: qualquer addon que ofereça
    // um catálogo com "tendências"/"trending" no nome serve.
    // v2: a v1 guardava os ids do TMDB, que a tela de detalhes não abre.
    const CHAVE_TEND = 'cu:tendencias2';
    const TTL_TEND = 30 * 60 * 1000;
    let tendencias = null;
    let buscandoTend = false;
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_TEND) || 'null');
        if (salvo && Date.now() - salvo.quando < TTL_TEND) tendencias = salvo.itens;
    } catch (_) { /* ignore */ }

    function buscaTendencias() {
        if (tendencias || buscandoTend) return;
        let perfil;
        try { perfil = JSON.parse(localStorage.getItem('profile') || '{}'); } catch (_) { return; }

        let alvo = null;
        (perfil.addons || []).forEach((a) => {
            if (alvo) return;
            (a.manifest?.catalogs || []).forEach((c) => {
                if (alvo || c.type !== 'movie') return;
                if (/tend[êe]ncia|trending/i.test(c.name || '')) {
                    alvo = { base: (a.transportUrl || '').replace(/manifest\.json$/, ''), tipo: c.type, id: c.id };
                }
            });
        });
        if (!alvo || !alvo.base) return;

        buscandoTend = true;
        fetch(alvo.base + 'catalog/' + alvo.tipo + '/' + encodeURIComponent(alvo.id) + '.json')
            .then((r) => r.json())
            .then((j) => {
                // Só itens com id do IMDb. O catálogo do TMDB identifica cada
                // filme como `tmdb:1315772`, e quem responde pela tela de
                // detalhes é o Cinemeta, que não conhece esse prefixo — clicar
                // no destaque caía em "Não foram encontrados metadados". O
                // mesmo id também é o que o botão de avaliar precisa: ele
                // procura um `tt` na rota.
                const itens = (j.metas || [])
                    .filter((m) => m.imdb_id && (m.background || m.poster))
                    .slice(0, 8);
                if (!itens.length) return;
                itens.forEach((m) => {
                    m.id = m.imdb_id;
                    // O item vindo do catálogo não tem `deepLinks` (isso é do
                    // modelo do app), então o endereço é montado aqui — no
                    // mesmo formato que as fileiras produzem.
                    m.deepLinks = { metaDetailsVideos: '#/detail/' + m.type + '/' + encodeURIComponent(m.id) };
                });
                tendencias = itens;
                try { localStorage.setItem(CHAVE_TEND, JSON.stringify({ quando: Date.now(), itens })); } catch (_) { /* ignore */ }
            })
            .catch(() => { /* segue com os catálogos da tela */ })
            .finally(() => { buscandoTend = false; });
    }

    // Qual catálogo alimenta o destaque. Antes era simplesmente o PRIMEIRO
    // que estivesse pronto — o que dava um resultado imprevisível, dependente
    // da ordem de carregamento. Agora há uma preferência declarada, e a ordem
    // de chegada só decide o desempate quando nenhuma delas está pronta.
    const PREFERIDOS = [/tend[êe]ncia/i, /popular/i, /destaque|featured/i];

    function nomeDoCatalogo(catalog) {
        return String(catalog?.title || catalog?.name || catalog?.id || '');
    }

    function ordenaCatalogos(catalogs) {
        const prontos = (catalogs || []).filter((c) => c?.content?.type === 'Ready');
        const nota = (c) => {
            const nome = nomeDoCatalogo(c);
            const i = PREFERIDOS.findIndex((re) => re.test(nome));
            // Filme antes de série: o destaque é uma arte grande e horizontal,
            // e as de filme costumam ser mais bem acabadas.
            const ehSerie = /s[ée]rie|series/i.test(nome) ? 1 : 0;
            return (i < 0 ? PREFERIDOS.length : i) * 2 + ehSerie;
        };
        return prontos.slice().sort((a, b) => nota(a) - nota(b));
    }

    function pickHeroItems(catalogs) {
        // Tendências buscadas direto têm prioridade sobre o que estiver na tela.
        buscaTendencias();
        if (tendencias && tendencias.length) return tendencias;

        const seen = new Set();
        const items = [];
        for (const catalog of ordenaCatalogos(catalogs)) {
            if (catalog?.content?.type !== 'Ready') continue;
            for (const item of catalog.content.content) {
                const id = item.id || item.name;
                if (seen.has(id)) continue;
                const hasArt = item.background || item.poster;
                if (!hasArt) continue;
                seen.add(id);
                items.push(item);
                if (items.length >= 8) break;
            }
            if (items.length >= 8) break;
        }
        return items;
    }

    function getHref(item) {
        if (!item || !item.deepLinks) return null;
        const dl = item.deepLinks;
        // Prefer the no-streams URL so the user sees the preview/details first,
        // then clicks Assistir to open the streams popup.
        return dl.metaDetailsVideos || dl.metaDetailsStreams || dl.player || null;
    }

    function updateCarouselSlide(idx) {
        if (carouselItems.length === 0) return;
        carouselIndex = idx;
        const carouselEl = document.querySelector('.hero-carousel');
        if (!carouselEl) return;

        const slides = carouselEl.querySelectorAll('.hero-slide');
        slides.forEach((slide, i) => {
            if (i === idx) {
                slide.classList.add('active');
                slide.setAttribute('aria-hidden', 'false');
                slide.setAttribute('tabindex', '0');
            } else {
                slide.classList.remove('active');
                slide.setAttribute('aria-hidden', 'true');
                slide.setAttribute('tabindex', '-1');
            }
        });

        const dots = carouselEl.querySelectorAll('.hero-dot');
        dots.forEach((dot, i) => {
            if (i === idx) dot.classList.add('active');
            else dot.classList.remove('active');
        });
    }

    function handleHeroCarousel() {
        // .board-content (the inner scrollable) — not .board-content-container
        const boardContent = document.querySelector('[class*="board-content"]:not([class*="container"])')
            || document.querySelector('[class*="board-content"]');
        if (!boardContent) {
            currentCatalogsJSON = '';
            if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
            return;
        }

        // board.catalogs is hook state on Board, not a prop, so we collect each
        // MetaRow's `catalog` prop from its fiber instead.
        const rowEls = boardContent.querySelectorAll('[class*="meta-row-container"]');
        const catalogs = [];
        rowEls.forEach((rowEl) => {
            const f = getReactFiber(rowEl);
            if (!f) return;
            const p = findFiberProps(f, (pp) => pp && pp.catalog && pp.catalog.content);
            if (p && p.catalog && !catalogs.includes(p.catalog)) {
                catalogs.push(p.catalog);
            }
        });
        if (catalogs.length === 0) return;

        const catalogsJSON = JSON.stringify(catalogs.map((c) => ({
            id: c.addon?.transportUrl + c.id,
            status: c.content?.type,
            itemsCount: c.content?.content?.length || 0,
        })));
        if (currentCatalogsJSON === catalogsJSON) return;
        currentCatalogsJSON = catalogsJSON;

        const items = pickHeroItems(catalogs);
        carouselItems = items;
        carouselIndex = 0;

        if (items.length === 0) {
            const existing = boardContent.querySelector('.hero-carousel');
            if (existing) existing.remove();
            return;
        }

        let carouselEl = boardContent.querySelector('.hero-carousel');
        if (!carouselEl) {
            carouselEl = document.createElement('div');
            carouselEl.className = 'hero-carousel';
            boardContent.prepend(carouselEl);
        }

        let slidesHTML = '';
        items.forEach((item, i) => {
            const itemBg = item.background || item.poster;
            const href = getHref(item) || '#';
            const isActive = i === 0;

            const logoOrTitleHTML = item.logo
                ? `<img class="hero-logo" src="${item.logo}" alt="${item.name || ''}" />`
                : `<h2 class="hero-title">${item.name || ''}</h2>`;

            let metaHTML = '';
            if (item.releaseInfo) metaHTML += `<span class="meta-pill">${item.releaseInfo}</span>`;
            if (item.runtime) metaHTML += `<span class="meta-pill">${item.runtime}</span>`;
            if (item.imdbRating) {
                metaHTML += `
                    <span class="meta-rating">
                        <svg class="rating-icon" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                        ${item.imdbRating}
                    </span>`;
            }

            const descHTML = item.description ? `<p class="hero-description">${item.description}</p>` : '';

            slidesHTML += `
                <a href="${href}" class="hero-slide ${isActive ? 'active' : ''}" aria-hidden="${!isActive}" tabindex="${isActive ? 0 : -1}">
                    <div class="hero-image-wrapper">
                        <img class="hero-image" src="${itemBg}" alt=" " />
                    </div>
                    <div class="hero-gradient"></div>
                    <div class="hero-content">
                        ${logoOrTitleHTML}
                        <div class="hero-meta">${metaHTML}</div>
                        ${descHTML}
                        <div class="hero-actions">
                            <div class="hero-btn hero-btn-primary">
                                <svg class="btn-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <span>Assistir</span>
                            </div>
                            <div class="hero-btn hero-btn-secondary">
                                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v4.6"/><path d="M12 8.1v.15"/></svg>
                                <span>Detalhes</span>
                            </div>
                        </div>
                    </div>
                </a>`;
        });

        let dotsHTML = '';
        if (items.length > 1) {
            items.forEach((_, i) => {
                dotsHTML += `<button type="button" class="hero-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`;
            });
        }

        carouselEl.innerHTML = `
            <div class="hero-stage">${slidesHTML}</div>
            ${items.length > 1 ? `
                <button type="button" class="hero-arrow hero-arrow-prev">
                    <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <button type="button" class="hero-arrow hero-arrow-next">
                    <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
                <div class="hero-dots">${dotsHTML}</div>
            ` : ''}`;

        carouselEl.addEventListener('mouseenter', () => { isCarouselPaused = true; });
        carouselEl.addEventListener('mouseleave', () => { isCarouselPaused = false; });

        const prevBtn = carouselEl.querySelector('.hero-arrow-prev');
        const nextBtn = carouselEl.querySelector('.hero-arrow-next');
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let prev = carouselIndex - 1;
                if (prev < 0) prev = items.length - 1;
                updateCarouselSlide(prev);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let next = (carouselIndex + 1) % items.length;
                updateCarouselSlide(next);
            });
        }
        carouselEl.querySelectorAll('.hero-dot').forEach((dot) => {
            dot.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                updateCarouselSlide(parseInt(dot.getAttribute('data-index'), 10));
            });
        });

        if (carouselTimer) clearInterval(carouselTimer);
        carouselTimer = setInterval(() => {
            if (!isCarouselPaused && items.length > 1) {
                updateCarouselSlide((carouselIndex + 1) % items.length);
            }
        }, 8000);
    }

    // ============================================================
    // Continue Watching → arte horizontal de verdade
    // ------------------------------------------------------------
    // Os itens da fileira NÃO carregam `background` nas props — só `poster`
    // (verificado lendo o fiber: as props são name/type/poster/posterShape/
    // progress/deepLinks/...). Por isso a versão anterior, que lia
    // props.background, nunca disparava: o que se via era o pôster vertical
    // cropado em 16:9 pelo object-fit.
    //
    // Mas o pôster vem do metahub, que serve a arte horizontal na MESMA URL:
    //   .../poster/small/tt10986410/img  →  .../background/medium/tt10986410/img
    // Então dá pra derivar sem chamar API nenhuma. Pôsteres de outros addons
    // não casam com o padrão e ficam como estão.
    //
    // O cache guarda: undefined = testando, string = URL boa, null = sem arte.
    const landscapeCache = new Map();
    const METAHUB_POSTER = /^(https?:\/\/images\.metahub\.space)\/poster\/[^/]+\/([^/]+)\/img/;

    function landscapeFor(posterUrl) {
        if (!posterUrl) return null;
        if (landscapeCache.has(posterUrl)) return landscapeCache.get(posterUrl);

        const m = METAHUB_POSTER.exec(posterUrl);
        if (!m) { landscapeCache.set(posterUrl, null); return null; }

        const url = `${m[1]}/background/medium/${m[2]}/img`;
        landscapeCache.set(posterUrl, undefined); // em teste
        const probe = new Image();
        probe.onload = () => landscapeCache.set(posterUrl, url);
        probe.onerror = () => landscapeCache.set(posterUrl, null); // sem arte: mantém o pôster
        probe.src = url;
        return undefined;
    }

    // Logo da série/filme, servida pelo metahub no mesmo padrão da capa:
    //   .../poster/small/tt…/img  ->  .../logo/medium/tt…/img
    const logoCache = new Map();
    function logoFor(posterUrl) {
        if (!posterUrl) return null;
        if (logoCache.has(posterUrl)) return logoCache.get(posterUrl);
        const m = METAHUB_POSTER.exec(posterUrl);
        if (!m) { logoCache.set(posterUrl, null); return null; }
        const url = `${m[1]}/logo/medium/${m[2]}/img`;
        logoCache.set(posterUrl, undefined);
        const probe = new Image();
        probe.onload = () => logoCache.set(posterUrl, url);
        probe.onerror = () => logoCache.set(posterUrl, null);
        probe.src = url;
        return undefined;
    }

    // O href do item carrega o id do vídeo no formato tt123:TEMPORADA:EPISODIO
    // (percent-encoded). É de onde sai o "T4:E2".
    function seasonEpisode(href) {
        const m = /tt\d+(?:%3A|:)(\d+)(?:%3A|:)(\d+)/i.exec(href || '');
        return m ? { s: m[1], e: m[2] } : null;
    }

    // ---- duração, ao lado do episódio -----------------------------------
    //
    // Duas fontes, nesta ordem:
    //
    //   1. `cu:duracoesEp`, que a tela de detalhes já preenche com a duração de
    //      CADA episódio (vem do addon do TMDB). É a informação exata, e para
    //      as séries que você abriu ela já está em disco — de graça aqui.
    //   2. o Cinemeta, que devolve uma duração no nível do título: para filme é
    //      a duração dele, para série é a duração típica de um episódio.
    //
    // A segunda existe porque a primeira só cobre o que já foi aberto. Melhor
    // "46min" aproximado do que campo vazio.
    const CHAVE_DUR = 'cu:duracoesEp';
    const CHAVE_DUR_TITULO = 'cu:duracoesTitulo';

    let duracoesEp = {};
    let duracoesTitulo = {};
    try { duracoesEp = JSON.parse(localStorage.getItem(CHAVE_DUR) || '{}'); } catch (_) { /* ignore */ }
    try { duracoesTitulo = JSON.parse(localStorage.getItem(CHAVE_DUR_TITULO) || '{}'); } catch (_) { /* ignore */ }
    const durPedidas = new Set();

    // ---- episódio que ainda não estreou --------------------------------
    //
    // O Continuar assistindo aponta para o PRÓXIMO episódio. Terminado o último
    // que saiu, ele passa a apontar para um que ainda não existe: a série fica
    // na fileira com um card que não dá para assistir, e sem stream nenhum.
    //
    // É o que Netflix, Disney+ e Max fazem: a série sai da fileira quando você
    // se põe em dia, e volta sozinha quando estreia o próximo — ali sim com o
    // selo de episódio novo. A fileira passa a significar "o que dá para
    // continuar agora", que é o nome dela.
    //
    // A régua é a mesma do calendário e da tela de detalhes: estreia em
    // qualquer hora de HOJE já conta como disponível.
    const CHAVE_ESTREIA = 'cu:estreiasEp';
    let estreias = {};
    try { estreias = JSON.parse(localStorage.getItem(CHAVE_ESTREIA) || '{}'); } catch (_) { /* ignore */ }

    function jaEstreou(href) {
        const se = seasonEpisode(href);
        if (!se) return true;                       // filme: sempre disponível
        const id = /(tt\d+)/i.exec(decodeURIComponent(href || ''));
        if (!id) return true;

        const mapa = estreias[id[1]];
        if (!mapa) {
            // Pede a busca DAQUI. Ela era disparada só pelo caminho da duração,
            // e esse caminho tem uma saída antecipada: quando a duração exata do
            // episódio já está em disco — o que vale para toda série que você
            // abriu na tela de detalhes — ele retorna antes de pedir qualquer
            // coisa. Resultado: justamente as séries que você acompanha nunca
            // tinham as datas buscadas, e nenhuma ficava marcada como
            // indisponível. Medido com um probe: o cache de estreias estava
            // vazio e só o filme, que não tem duração exata, havia sido buscado.
            buscaDuracaoTitulo('series', id[1]);
            // Enquanto não chega, mostro: esconder por falta de informação seria
            // pior do que mostrar um card a mais por alguns segundos.
            return true;
        }

        const quando = mapa[se.s + ':' + se.e];
        if (quando === undefined) return true;      // episódio que o Cinemeta não conhece
        if (!quando) return true;                   // sem data: não dá para afirmar que é futuro

        const fimDeHoje = new Date();
        fimDeHoje.setHours(23, 59, 59, 999);
        return new Date(quando) <= fimDeHoje;
    }

    // "1 h 45 min", "46 min", "46min" → "1h45" / "46min"
    function arrumaDuracao(bruto) {
        const txt = String(bruto || '').trim();
        if (!txt) return '';
        const h = /(\d+)\s*h/i.exec(txt);
        const m = /(\d+)\s*min/i.exec(txt);
        if (h && m) return `${h[1]}h${String(m[1]).padStart(2, '0')}`;
        if (h) return `${h[1]}h`;
        if (m) return `${m[1]}min`;
        const so = /^(\d+)$/.exec(txt);
        return so ? `${so[1]}min` : txt;
    }

    function buscaDuracaoTitulo(tipo, imdb) {
        // A guarda tem que olhar as DUAS coisas que esta busca preenche. Ela
        // olhava só a duração — e para as séries cuja duração já estava em
        // disco de antes, a busca nunca mais rodava: as estreias ficavam vazias
        // para sempre, e nenhum episódio era reconhecido como indisponível.
        const temTudo = duracoesTitulo[imdb] !== undefined && estreias[imdb];
        if (!imdb || temTudo || durPedidas.has(imdb)) return;
        durPedidas.add(imdb);
        fetch(`https://v3-cinemeta.strem.io/meta/${tipo}/${imdb}.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((j) => {
                // Grava até quando vem vazio: sem isso, um título sem duração
                // seria pedido de novo a cada volta do laço, para sempre.
                duracoesTitulo[imdb] = j.meta?.runtime || '';
                try { localStorage.setItem(CHAVE_DUR_TITULO, JSON.stringify(duracoesTitulo)); } catch (_) { /* ignore */ }

                // A MESMA resposta traz a estreia de cada episódio. Guardar
                // agora evita uma segunda ida à rede pela informação que já
                // está aqui na mão.
                const mapa = {};
                (j.meta?.videos || []).forEach((v) => {
                    if (v.season != null && v.episode != null) {
                        mapa[v.season + ':' + v.episode] = v.released || '';
                    }
                });
                estreias[imdb] = mapa;
                try { localStorage.setItem(CHAVE_ESTREIA, JSON.stringify(estreias)); } catch (_) { /* ignore */ }
            })
            .catch(() => { durPedidas.delete(imdb); });
    }

    function duracaoDe(href) {
        const bruto = decodeURIComponent(href || '');
        const id = /(tt\d+)/i.exec(bruto);
        if (!id) return '';
        const imdb = id[1];
        const se = seasonEpisode(href);

        if (se) {
            const exata = duracoesEp[imdb] && duracoesEp[imdb][se.s + ':' + se.e];
            if (exata) return arrumaDuracao(exata);
        }
        const doTitulo = duracoesTitulo[imdb];
        if (doTitulo === undefined) buscaDuracaoTitulo(se ? 'series' : 'movie', imdb);
        return arrumaDuracao(doTitulo || '');
    }

    // A miniatura do EPISÓDIO — a mesma que a lista da tela de detalhes usa.
    // Um card de "continuar assistindo" é sobre onde você parou, e o still do
    // episódio diz isso; o banner da série é o mesmo em todos os episódios e
    // não diferencia nada.
    //
    // O endereço se monta a partir do id: o metahub serve por série/temporada/
    // episódio. Ele responde mesmo para episódios cujo still não existe, e aí
    // a imagem morre no carregamento — por isso quem chama trata o `error`.
    //
    // Só séries. Filme não tem still: o metahub guarda pôster, fundo e logo,
    // e nenhum deles é um quadro do filme.
    function stillDoEpisodio(href) {
        const id = /(tt\d+)/i.exec(decodeURIComponent(href || ''));
        const se = seasonEpisode(href);
        if (!id || !se) return null;
        return `https://episodes.metahub.space/${id[1]}/${se.s}/${se.e}/w780.jpg`;
    }

    function applyLandscapeArt(item) {
        // Tem que ser `img[...]`: existe uma <div class="poster-image-layer-…">
        // ANTES do <img class="poster-image-…"> no DOM, então um seletor só por
        // classe devolve a div e a troca nunca acontece.
        const img = item.querySelector('img[class*="poster-image"]');
        if (!img) {
            // Sem o <img> ainda não dá pra trocar a capa, mas a logo e o T/E
            // não dependem dele — sem isto, um tick em que o React ainda não
            // montou a imagem deixava o card sem logo até o próximo rerender.
            const fb = item.querySelector('[class*="poster-image"]');
            if (fb && fb.dataset && fb.dataset.origPoster) decorateCard(item, fb.dataset.origPoster);
            return;
        }

        // O pôster de referência vem das PROPS, não do img.src — o src já foi
        // trocado por nós. E não dá pra memorizar uma vez só: quando a ordem da
        // fileira muda (você assiste algo e ele pula pro começo), o React reusa
        // o mesmo elemento pra outro título; com o valor memorizado, a capa
        // ficava a do item anterior.
        const fiber0 = getReactFiber(item);
        const props0 = fiber0 ? findFiberProps(fiber0, (p) => p.poster) : null;
        const poster = props0?.poster || img.dataset.origPoster || img.src;

        // TROCA DE IDENTIDADE: o React reordena a fileira (você assiste algo e
        // ele pula pro começo) reaproveitando os MESMOS elementos para outros
        // títulos. Sem reagir a isso, a capa e a logo continuavam as do item
        // anterior — era o "Mario com a thumb do Severance".
        //
        // A regra é: assim que o pôster das props muda, volta na hora para a
        // capa do item CERTO e joga fora a decoração do anterior. A versão
        // horizontal entra depois, quando resolver. Assim nunca se mostra a
        // arte de outro título, nem por um quadro.
        if (img.dataset.origPoster !== poster) {
            img.dataset.origPoster = poster;
            if (poster && img.src !== poster) img.src = poster;
            // O React reaproveita o MESMO card para outro título quando a
            // fileira se reordena. Sem apagar o que é nosso aqui, o card do
            // Homem-Aranha ficava com o nome e o "T4:E2" do Ted Lasso até a
            // próxima passada — e a miniatura do episódio, com a da série
            // anterior. Some tudo agora; é repreenchido logo abaixo, já com os
            // dados certos.
            delete img.dataset.cuStill;
            const pcAgora = item.querySelector('[class*="poster-container"]');
            const dentroAntigo = pcAgora && pcAgora.querySelector('.cu-cw-dentro');
            if (dentroAntigo) dentroAntigo.remove();
            const tagAntiga = item.querySelector('.cu-cw-ep');
            if (tagAntiga) tagAntiga.remove();
        }

        // Série em dia, com o próximo episódio ainda por estrear: o card sai
        // da fileira. A busca que preenche `estreias` é a mesma da duração, e
        // acontece logo abaixo — até ela responder, o card fica visível.
        const hrefAgora = (() => {
            const f = getReactFiber(item);
            const pr = f ? findFiberProps(f, (p) => p.href || p.deepLinks) : null;
            return pr?.href || pr?.deepLinks?.metaDetailsStreams || '';
        })();
        item.classList.toggle('cu-cw-indisponivel', !jaEstreou(hrefAgora));

        const landscape = landscapeFor(poster);

        // Série: o still do episódio na frente do banner. Se ele não existir, o
        // `error` devolve o card ao banner — melhor um banner do que um vão.
        const fiberSE = getReactFiber(item);
        const propsSE = fiberSE ? findFiberProps(fiberSE, (p) => p.href || p.deepLinks) : null;
        const still = stillDoEpisodio(propsSE?.href || propsSE?.deepLinks?.metaDetailsStreams || '');

        const alvo = still || landscape;
        if (alvo && img.src !== alvo) {
            if (still && img.dataset.cuStill !== still) {
                img.dataset.cuStill = still;
                img.addEventListener('error', function volta() {
                    if (landscape && img.src !== landscape) img.src = landscape;
                }, { once: true });
            }
            img.src = alvo;
        }

        decorateCard(item, poster);
    }

    // Logo sobre a capa + "T4:E2" no título.
    function decorateCard(item, posterUrl) {
        const pc = item.querySelector('[class*="poster-container"]');
        if (!pc) return;

        // A logo da série saiu. Ela repetia o que o nome já diz, e como cada
        // título a entrega num tamanho e num peso diferentes, a fileira nunca
        // ficava alinhada. Só a remoção: o layout do card fica como estava.
        const logoAntiga = pc.querySelector('.cu-cw-logo-wrap');
        if (logoAntiga) logoAntiga.remove();

        // --- os três pontinhos, ao lado do X ---
        // Por JS e não por CSS: a classe do botão é gerada, e o seletor por
        // substring que eu tinha escrito não pegou nenhum elemento. Aqui a
        // busca é pelo que ele É — um filho posicionado do card, ancorado à
        // direita, que não é nosso nem a barra de progresso.
        Array.from(pc.children).forEach((filho) => {
            const cls = filho.className && filho.className.baseVal !== undefined
                ? filho.className.baseVal : String(filho.className || '');
            if (/^cu-/.test(cls) || /progress-bar|poster-image/.test(cls)) return;
            // O selo de episódios novos também é absoluto, no topo à direita —
            // e foi ele que o laço moveu para a esquerda, no lugar do menu.
            // Menu tem botão dentro; o selo é só texto.
            if (/new-videos/.test(cls)) return;
            if (!filho.querySelector('button, svg')) return;

            const s = getComputedStyle(filho);
            if (s.position !== 'absolute') return;
            // Ancorado à direita e no topo: é o menu. O X usa a esquerda.
            if (s.right === 'auto' || parseFloat(s.right) > 40) return;
            if (parseFloat(s.top) > 40) return;

            filho.style.setProperty('right', 'auto', 'important');
            filho.style.setProperty('left', '3.1rem', 'important');
            filho.style.setProperty('top', '0.5rem', 'important');
            filho.dataset.cuMovido = '1';
        });

        // --- selo de episódios novos ---
        // O app mostra só o número, dentro de um ícone de "páginas empilhadas"
        // que fica atrás do card (z-index negativo) e espia pela borda — o
        // número sai branco sobre a arte e não dá para ler. Aqui ele vira um
        // selo com texto, no mesmo material do selo de biblioteca.
        const selo = pc.querySelector('[class*="new-videos"]');
        if (selo) {
            const n = parseInt((selo.textContent || '').replace(/\D/g, ''), 10);
            if (Number.isFinite(n) && n > 0) {
                selo.classList.add('cu-cw-novos');
                const texto = n === 1 ? '+1 episódio' : `+${n} episódios`;
                if (selo.dataset.cuTexto !== texto) {
                    selo.dataset.cuTexto = texto;
                    selo.textContent = texto;
                }
            }
        }

        // --- nome e episódio DENTRO da miniatura ---
        //
        // Só acréscimo: os dois elementos são `absolute` dentro do contêiner da
        // capa, então não entram no fluxo e não têm como mexer no tamanho do
        // card. Da última vez eu reescrevi esta função inteira junto e a fileira
        // virou vertical; desta vez o que já funciona fica intocado.
        let sombra = pc.querySelector('.cu-cw-sombra');
        if (!sombra) {
            sombra = document.createElement('div');
            sombra.className = 'cu-cw-sombra';
            // Antes da barra de progresso no DOM: a barra fica acima dela.
            const barraProg = pc.querySelector('[class*="progress-bar-layer"]');
            if (barraProg) pc.insertBefore(sombra, barraProg); else pc.appendChild(sombra);
        }

        // Cadeado no lugar do play, quando o episódio ainda não estreou.
        const trancado = item.classList.contains('cu-cw-indisponivel');
        let cadeado = pc.querySelector('.cu-cw-cadeado');
        if (trancado && !cadeado) {
            cadeado = document.createElement('div');
            cadeado.className = 'cu-cw-cadeado';
            cadeado.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8.2 10.5V7.2a3.8 3.8 0 0 1 7.6 0v3.3"/></svg>';
            pc.appendChild(cadeado);
        } else if (!trancado && cadeado) {
            cadeado.remove();
        }

        const barraTitulo = item.querySelector('[class*="title-bar-container"]');
        const elTitulo = barraTitulo ? barraTitulo.querySelector('[class*="title"]') : null;
        const nome = (elTitulo?.textContent || '').trim();

        if (nome) {
            let dentro = pc.querySelector('.cu-cw-dentro');
            if (!dentro) {
                dentro = document.createElement('div');
                dentro.className = 'cu-cw-dentro';
                dentro.innerHTML = '<span class="cu-cw-nome"></span><span class="cu-cw-se"></span>';
                const barra = pc.querySelector('[class*="progress-bar-layer"]');
                if (barra) pc.insertBefore(dentro, barra); else pc.appendChild(dentro);
            }
            const elNome = dentro.querySelector('.cu-cw-nome');
            if (elNome.textContent !== nome) elNome.textContent = nome;
        }

        // --- T{temporada}:E{episódio} ao lado do nome ---
        const fiber = getReactFiber(item);
        const props = fiber ? findFiberProps(fiber, (p) => p.href || p.deepLinks) : null;
        const se = seasonEpisode(props?.href || props?.deepLinks?.metaDetailsStreams || '');
        const bar = item.querySelector('[class*="title-bar-container"]');
        if (!bar) return;

        let tag = bar.querySelector('.cu-cw-ep');
        if (!se) {
            // Filme: não há temporada nem episódio. O campo precisa ser LIMPO,
            // não deixado como está — senão ele conserva o do título anterior,
            // que é como o Homem-Aranha aparecia com "T4:E2".
            if (tag) tag.remove();
            // Filme: sem temporada, mas a duração continua valendo.
            const soDuracao = pc.querySelector('.cu-cw-se');
            if (soDuracao) {
                const d = duracaoDe(props?.href || props?.deepLinks?.metaDetailsStreams || '');
                if (soDuracao.textContent !== d) soDuracao.textContent = d;
            }
            return;
        }
        if (!tag) {
            // Elemento nosso, separado do título nativo: o React reescreve o
            // título dele a cada render e apagaria qualquer texto que a gente
            // concatenasse ali.
            tag = document.createElement('span');
            tag.className = 'cu-cw-ep';
            bar.appendChild(tag);
        }
        const txt = `T${se.s}:E${se.e}`;
        if (tag.textContent !== txt) tag.textContent = txt;

        // O mesmo texto no canto inferior direito da miniatura. A tag antiga
        // continua existindo no DOM (é o CSS que a esconde junto com o título)
        // para não mexer no que já funciona.
        const elSE = pc.querySelector('.cu-cw-se');
        if (elSE) {
            const d = duracaoDe(props?.href || props?.deepLinks?.metaDetailsStreams || '');
            const completo = d ? `${txt} · ${d}` : txt;
            if (elSE.textContent !== completo) elSE.textContent = completo;
        }
    }

    // "Continuar a ver" -> "Continuar assistindo".
    //
    // O texto NÃO pode ser escrito no `title-container`: dentro dele existe um
    // segundo elemento (`title`) que carrega a tipografia da fileira — 22.4px,
    // peso 500. Escrever no container apaga esse filho, e o texto passa a
    // herdar o 14px/400 do pai, ficando visivelmente menor que "Populares".
    //
    // Então: escreve sempre no filho. E se o filho não existir (por exemplo,
    // porque uma versão anterior deste código o apagou), ele é reconstruído
    // copiando a classe de uma fileira normal — assim a tipografia vem do
    // próprio app, sem depender de nome de classe fixo.
    function renomeiaTitulo(row) {
        const cont = row.querySelector('[class*="title-container"]') || row.querySelector('[class*="title"]');
        if (!cont) return;

        let alvo = cont.querySelector('[class*="title"]');
        if (!alvo) {
            const modelo = document.querySelector(
                '[class*="meta-row-container"]:not(.custom-continue-watching-row) [class*="title-container"] [class*="title"]'
            );
            if (!modelo) return;   // sem referência, melhor não mexer
            alvo = document.createElement(modelo.tagName);
            alvo.className = modelo.className;
            cont.textContent = '';
            cont.appendChild(alvo);
        }
        if (alvo.textContent.trim() !== 'Continuar assistindo') {
            alvo.textContent = 'Continuar assistindo';
        }
    }

    function handleContinueWatchingLandscape() {
        const rows = Array.from(document.querySelectorAll('[class*="meta-row-container"]'));
        if (rows.length === 0) return;

        // Measure a reference poster card to size CW cards at exactly 2x its width
        let posterPxWidth = 0;
        for (const r of rows) {
            const t = (r.querySelector('[class*="title"]')?.textContent || '').trim().toLowerCase();
            if (/continue watching|continuar assistindo|continuar/i.test(t)) continue;
            const item = r.querySelector('[class*="meta-item-container"]');
            if (!item) continue;
            // Use offsetWidth (layout size, ignores CSS transforms) so a hovered/scaled
            // card doesn't inflate the measurement and cause CW cards to grow.
            const w = item.offsetWidth;
            if (w > 0) { posterPxWidth = w; break; }
        }

        rows.forEach((row) => {
            const titleEl = row.querySelector('[class*="title"]');
            const titleTxt = (titleEl?.textContent || '').trim().toLowerCase();
            const isCW = /continue watching|continuar assistindo|continuar/i.test(titleTxt)
                || row.className.includes('continue-watching');
            if (!isCW) return;

            row.classList.add('custom-continue-watching-row');

            renomeiaTitulo(row);

            const cwContainer = row.querySelector('[class*="meta-items-container"]');
            const cwContainerWidth = cwContainer ? cwContainer.getBoundingClientRect().width : 0;
            const cwItemWidth = posterPxWidth > 0 ? posterPxWidth * 2 : 0;
            const maxCols = (cwItemWidth > 0 && cwContainerWidth > 0)
                ? Math.max(1, Math.floor(cwContainerWidth / cwItemWidth))
                : 4;

            const items = Array.from(row.querySelectorAll('[class*="meta-item-container"]'));
            items.forEach((item, idx) => {
                item.classList.add('force-landscape');
                if (idx >= maxCols) item.classList.add('cw-overflow');
                else item.classList.remove('cw-overflow');

                if (cwItemWidth > 0) {
                    item.style.flex = `0 0 ${cwItemWidth}px`;
                    item.style.width = `${cwItemWidth}px`;
                    item.style.maxWidth = `${cwItemWidth}px`;
                }

                // Uma falha decorando um card não pode interromper o laço: os
                // seguintes ficariam sem a largura aplicada acima.
                try { applyLandscapeArt(item); } catch (_) { /* segue */ }
            });
        });
    }

    window.__cu.register(handleHeroCarousel);
    window.__cu.register(handleContinueWatchingLandscape);

    // A largura dos cards de Continuar assistindo é calculada em JS (2× a de um
    // pôster). Enquanto isso só acontecia no laço de 400ms, arrastar a borda da
    // janela fazia os cards saltarem de tamanho em degraus, em vez de
    // acompanhar o ponteiro. Aqui o recálculo passa a ser disparado pelo
    // próprio redimensionamento — o resultado final é o mesmo, o caminho até
    // ele é que fica contínuo.
    let agendado = false;
    function recalculaJa() {
        if (agendado) return;
        agendado = true;
        // Um quadro por vez: o resize dispara dezenas de vezes por segundo e
        // remedir a cada um custaria mais do que o olho percebe.
        requestAnimationFrame(() => {
            agendado = false;
            try { handleContinueWatchingLandscape(); } catch (_) { /* ignore */ }
        });
    }

    window.addEventListener('resize', recalculaJa);



    // O redimensionamento da JANELA não cobre tudo: abrir o painel lateral ou
    // trocar de rota muda a largura do conteúdo sem um evento de resize.
    if (window.ResizeObserver) {
        const observador = new ResizeObserver(recalculaJa);
        let observado = null;
        window.__cu.register(function vigiaLargura() {
            const alvo = document.querySelector('[class*="board-content"]:not([class*="container"])');
            if (alvo && alvo !== observado) {
                if (observado) observador.unobserve(observado);
                observador.observe(alvo);
                observado = alvo;
            }
        });
    }
})();
