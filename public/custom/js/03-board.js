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

    function pickHeroItems(catalogs) {
        const seen = new Set();
        const items = [];
        for (const catalog of catalogs || []) {
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
            const pcAntigo = item.querySelector('[class*="poster-container"]');
            const wrapAntigo = pcAntigo && pcAntigo.querySelector('.cu-cw-logo-wrap');
            if (wrapAntigo) wrapAntigo.remove();
            const tagAntiga = item.querySelector('.cu-cw-ep');
            if (tagAntiga) tagAntiga.remove();
        }

        const landscape = landscapeFor(poster);
        if (landscape && img.src !== landscape) img.src = landscape;

        decorateCard(item, poster);
    }

    // Logo sobre a capa + "T4:E2" no título.
    function decorateCard(item, posterUrl) {
        const pc = item.querySelector('[class*="poster-container"]');
        if (!pc) return;

        // --- logo, canto inferior esquerdo ---
        // A faixa da logo carrega o pôster que a originou. Se não bater com o
        // item atual, ela é do título anterior e sai de cena.
        let wrap = pc.querySelector('.cu-cw-logo-wrap');
        if (wrap && wrap.dataset.paraPoster !== posterUrl) { wrap.remove(); wrap = null; }

        const logo = logoFor(posterUrl);
        if (logo) {
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'cu-cw-logo-wrap';
                wrap.innerHTML = '<img class="cu-cw-logo" alt="" />';
                // INSERE ANTES da barra de progresso, não no fim. Os dois ficam
                // em z-index 1, então quem decide é a ordem no DOM: assim a
                // barra continua acima da faixa da logo, e as duas ficam acima
                // do degradê de hover (z-index 0) — que antes tapava a logo.
                const barra = pc.querySelector('[class*="progress-bar-layer"]');
                if (barra) pc.insertBefore(wrap, barra); else pc.appendChild(wrap);
            }
            wrap.dataset.paraPoster = posterUrl;
            const el = wrap.querySelector('img');
            if (el.src !== logo) el.src = logo;
        }

        // --- T{temporada}:E{episódio} ao lado do nome ---
        const fiber = getReactFiber(item);
        const props = fiber ? findFiberProps(fiber, (p) => p.href || p.deepLinks) : null;
        const se = seasonEpisode(props?.href || props?.deepLinks?.metaDetailsStreams || '');
        const bar = item.querySelector('[class*="title-bar-container"]');
        if (!bar) return;

        let tag = bar.querySelector('.cu-cw-ep');
        if (!se) { if (tag) tag.remove(); return; }
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

                applyLandscapeArt(item);
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
