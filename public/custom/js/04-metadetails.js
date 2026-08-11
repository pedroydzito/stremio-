/* -------- 04-metadetails.js --------
   Disney+ style metadetails:
   - Preview (left): logo, year/runtime/IMDB, short description, buttons
   - Side card (right): persistent tabs (Episódios for series, Sugestões, Extras, Detalhes)
   - Genres/cast/director ONLY in Detalhes tab (native versions hidden by CSS)
   - Play button: smart label/target (ASSISTIR / CONTINUAR Tx:Ey / ASSISTIR Tx:Ey)
   - Click play → navigate to streams URL → native streams-list rendered as centered modal
   - Streaming-provider icons bottom-right (detected from stream metadata) */

(function () {
    const { getReactFiber, findFiberProps, findFiberInSubtree, findHookState } = window.__cu.utils;

    // Whether the user explicitly clicked our ASSISTIR/CONTINUAR button.
    // Sources of truth: this var + body.cu-streams-open class. If neither is set
    // and we land on a streams URL (catalog/CW click or direct link), we
    // auto-redirect to the preview URL. The body class is also what unhides
    // the streams-list popup via CSS (otherwise it stays display:none).
    let streamsRequested = false;
    function setStreamsRequested(val) {
        streamsRequested = !!val;
        document.body.classList.toggle('cu-streams-open', !!val);
    }

    // ============================================================
    // Hash-change listener: auto-redirect from streams URL to preview URL
    // when the user didn't click ASSISTIR. Runs IMMEDIATELY on every hash
    // change (no 400ms delay) so the popup never flickers in.
    // ============================================================
    // A rota da tela de detalhes JÁ FOI `/detail/` e hoje o web.stremio.com usa
    // `/metadetails/`. Nada avisa quando isso muda: os regexes simplesmente
    // param de casar e a lógica de streams inteira vira no-op — foi o que fez
    // o modal ficar preso em "Carregando fontes...". Aceitamos os dois nomes.
    const DETAIL_SEG = '(?:metadetails|detail)';
    function isStreamsUrlHash(h) {
        return new RegExp('^#?\\/' + DETAIL_SEG + '\\/[^/]+\\/[^/]+\\/[^/]+').test(h || '');
    }
    function isDetailHash(h) {
        return new RegExp('^#?\\/' + DETAIL_SEG + '\\/').test(h || '');
    }
    function stripLastSegment(h) {
        const s = (h || '').replace(/\/[^/]+$/, '');
        return s && s !== h ? s : null;
    }
    function cleanupModalChrome() {
        document.querySelectorAll(
            '.disney-streams-backdrop, .disney-streams-popup, .disney-streams-close, .disney-streams-close-inline'
        ).forEach((el) => el.remove());
    }

    // Verdadeiro enquanto estamos "quicando" a rota de propósito (ver
    // agendaRetry). Sem isto, o passo intermediário pela URL de preview cairia
    // no ramo que zera streamsRequested e FECHARIA o modal — que é exatamente
    // o "card sumiu sozinho depois de 10s" relatado.
    let emRetry = false;

    function syncStreamsFlagWithUrl() {
        if (emRetry) return;
        const hash = window.location.hash || '';
        if (!isDetailHash(hash)) {
            // Left the detail route entirely (e.g. went to /player or /board) —
            // remove ALL modal chrome so it can't cover the next screen
            setStreamsRequested(false);
            cleanupModalChrome();
            document.querySelectorAll('.disney-side-card').forEach((el) => el.remove());
            return;
        }
        if (!isStreamsUrlHash(hash)) {
            // On preview URL — make sure flag is cleared so next ASSISTIR works
            setStreamsRequested(false);
            return;
        }
        // We ARE on a streams URL
        if (!streamsRequested) {
            // User didn't ask for this (catalog click landed here) — redirect to preview.
            // Use location.replace so the streams URL doesn't end up in browser history
            // (otherwise back button would re-enter the streams URL and loop).
            const stripped = stripLastSegment(hash);
            if (stripped) {
                const newHref = window.location.pathname + window.location.search + stripped;
                window.location.replace(newHref);
            }
        }
        // else: streamsRequested is true → keep the URL, modal will show
    }
    window.addEventListener('hashchange', syncStreamsFlagWithUrl);
    // Run once at module load in case we boot already on a streams URL
    syncStreamsFlagWithUrl();

    // Click interceptor: catch <a href="#/metadetails/X/X/X"> clicks (catalog cards,
    // hero, etc.) BEFORE navigation happens, and rewrite to the preview URL.
    // This keeps the streams URL out of browser history entirely → back works.
    document.addEventListener('click', function onLinkClick(e) {
        if (streamsRequested) return; // explicit ASSISTIR — allow
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        // On Discover/Search routes, Stremio uses single-click to SELECT (showing
        // info in the right panel) — don't intercept those, let native handlers run.
        const route = window.__cu.utils.currentRoute();
        if (route === 'discover' || route === 'search') return;

        const link = e.target.closest('a');
        if (!link) return;

        // Skip if the click is on an interactive sub-element NESTED inside the link
        // (e.g. the Remover X on Continue Watching, or the 3-dot menu trigger).
        // Those have their own handlers that need to run uninterrupted.
        const interactive = e.target.closest(
            '[class*="dismiss"], [class*="menu-label"], [class*="menu-options"], ' +
            '[class*="multiselect"], [class*="popup"], button, [role="button"]'
        );
        if (interactive && interactive !== link && link.contains(interactive)) return;

        const href = link.getAttribute('href') || '';
        if (!isStreamsUrlHash(href)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const stripped = stripLastSegment(href);
        if (stripped) {
            const cleanHash = stripped.startsWith('#') ? stripped.substring(1) : stripped;
            window.location.hash = cleanHash;
        }
    }, true);

    // ============================================================
    // Hook-state finders
    // ============================================================
    function getMetaDetailsData(fiber) {
        if (!fiber) return null;
        const result = { metaItem: null, libraryItem: null, streams: null };

        function harvest(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (!result.metaItem && obj.metaItem) result.metaItem = obj.metaItem;
            if (!result.libraryItem && obj.libraryItem) result.libraryItem = obj.libraryItem;
            if (!result.streams && obj.streams) result.streams = obj.streams;
        }

        // 1) Walk up: hook states + props on ancestor fibers
        try {
            let curr = fiber;
            while (curr) {
                let hook = curr.memoizedState;
                let safety = 0;
                while (hook && safety++ < 50) {
                    harvest(hook.memoizedState);
                    hook = hook.next;
                }
                harvest(curr.memoizedProps);
                curr = curr.return;
            }
        } catch (_) {}

        // 2) Walk down: subtree props (StreamsList has streams, MetaDetailsTabs has metaItem etc.)
        try {
            const visited = new Set();
            function walk(f, depth) {
                if (!f || depth > 50 || visited.has(f)) return;
                visited.add(f);
                harvest(f.memoizedProps);
                let hook = f.memoizedState;
                let safety = 0;
                while (hook && safety++ < 50) {
                    harvest(hook.memoizedState);
                    hook = hook.next;
                }
                walk(f.child, depth + 1);
                walk(f.sibling, depth + 1);
            }
            walk(fiber, 0);
        } catch (_) {}

        // 3) DIRECT lookup: streams-list DOM element → walk its fiber ancestors
        //    (most reliable on streams URL since StreamsList component owns the prop)
        if (!result.streams) {
            try {
                const slEl = document.querySelector('[class*="metadetails-content"] [class*="streams-list"]');
                if (slEl) {
                    const slFiber = window.__cu.utils.getReactFiber(slEl);
                    let curr = slFiber;
                    let safety = 0;
                    while (curr && safety++ < 30) {
                        if (curr.memoizedProps && curr.memoizedProps.streams) {
                            result.streams = curr.memoizedProps.streams;
                            break;
                        }
                        curr = curr.return;
                    }
                }
            } catch (_) {}
        }

        return result.metaItem ? result : null;
    }

    // ============================================================
    // Provider detection (Netflix, Disney+, etc.)
    // ============================================================
    const PROVIDER_MAP = {
        'netflix':     { name: 'Netflix',       icon: 'https://images.justwatch.com/icon/207360008/s100',  url: 'https://www.netflix.com/search?q=' },
        'amazon':      { name: 'Prime Video',   icon: 'https://images.justwatch.com/icon/52449861/s100',   url: 'https://www.primevideo.com/search?phrase=' },
        'prime video': { name: 'Prime Video',   icon: 'https://images.justwatch.com/icon/52449861/s100',   url: 'https://www.primevideo.com/search?phrase=' },
        'disney':      { name: 'Disney+',       icon: 'https://images.justwatch.com/icon/147638351/s100',  url: 'https://www.disneyplus.com/search/' },
        'hbo':         { name: 'Max',           icon: 'https://images.justwatch.com/icon/305828233/s100',  url: 'https://play.max.com/search?q=' },
        'max':         { name: 'Max',           icon: 'https://images.justwatch.com/icon/305828233/s100',  url: 'https://play.max.com/search?q=' },
        'apple':       { name: 'Apple TV+',     icon: 'https://images.justwatch.com/icon/152862153/s100',  url: 'https://tv.apple.com/search?term=' },
        'paramount':   { name: 'Paramount+',    icon: 'https://images.justwatch.com/icon/232112628/s100',  url: 'https://www.paramountplus.com/search/' },
        'peacock':     { name: 'Peacock',       icon: 'https://images.justwatch.com/icon/194559901/s100',  url: 'https://www.peacocktv.com/search?q=' },
        'hulu':        { name: 'Hulu',          icon: 'https://images.justwatch.com/icon/116305230/s100',  url: 'https://www.hulu.com/search?q=' },
        'crunchyroll': { name: 'Crunchyroll',   icon: 'https://images.justwatch.com/icon/128599720/s100',  url: 'https://www.crunchyroll.com/search?q=' },
        'globoplay':   { name: 'Globoplay',     icon: 'https://images.justwatch.com/icon/112328871/s100',  url: 'https://globoplay.globo.com/busca/?q=' },
        'star+':       { name: 'Star+',         icon: 'https://images.justwatch.com/icon/215498498/s100',  url: 'https://www.starplus.com/search/' },
    };
    function detectProviders(streams) {
        if (!Array.isArray(streams) || streams.length === 0) return [];
        const found = new Map();
        streams.forEach((s) => {
            const blob = ((s.title || '') + ' ' + (s.name || '') + ' ' + (s.description || '')).toLowerCase();
            for (const [key, info] of Object.entries(PROVIDER_MAP)) {
                if (blob.includes(key) && !found.has(info.name)) found.set(info.name, info);
            }
        });
        return Array.from(found.values());
    }

    // ============================================================
    // Smart play button: ASSISTIR / CONTINUAR Tx:Ey / ASSISTIR Tx:Ey
    // ============================================================
    function sortVideos(vs) {
        return [...vs].sort((a, b) =>
            (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
    }
    function getPlayButtonInfo(metaItem, libraryItem) {
        const details = metaItem?.content?.content;
        if (!details) return null;

        const videos = Array.isArray(details.videos) ? details.videos.filter((v) => (v.season || 0) > 0) : [];
        const isSeries = details.type === 'series' || videos.length > 1;

        if (!isSeries || videos.length === 0) {
            return {
                label: 'ASSISTIR',
                href: details.deepLinks?.metaDetailsStreams || details.deepLinks?.player || ''
            };
        }

        const sorted = sortVideos(videos);
        const lastId = libraryItem?.state?.video_id;
        let target = null;
        let isContinue = false;
        if (lastId) {
            const lastIdx = sorted.findIndex((v) => v.id === lastId);
            if (lastIdx >= 0) {
                target = sorted[lastIdx];
                isContinue = true;
            }
        }
        if (!target) target = sorted[0];
        if (!target) return null;

        const epTag = (target.season && target.episode)
            ? `T${target.season}:E${target.episode}`
            : '';
        return {
            label: isContinue
                ? (epTag ? `CONTINUAR ${epTag}` : 'CONTINUAR')
                : (epTag ? `ASSISTIR ${epTag}` : 'ASSISTIR'),
            href: target.deepLinks?.metaDetailsStreams || target.deepLinks?.player || ''
        };
    }

    // ============================================================
    // Hide all native preview UI we replace
    // ============================================================
    function hideNativeMetaPreview(previewEl) {
        if (!previewEl) return;
        // Hide native genre/cast/director/writer link rows
        previewEl.querySelectorAll('[class*="meta-links"]').forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
        });
        // Hide native "SUMMARY" label above description
        previewEl.querySelectorAll('[class*="description-container"] [class*="label-container"]').forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
        });
        // Hide native action buttons (Trailer/Library/Eye/Share)
        previewEl.querySelectorAll('[class*="action-buttons-container"]').forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
        });
    }

    // ============================================================
    // Inject Disney buttons row into preview
    // ============================================================
    function injectButtons(metaItem, libraryItem, previewEl) {
        if (!previewEl) return;
        // Buttons must live INSIDE meta-info-container (which is positioned
        // absolute bottom-left). Appending to meta-preview puts them top-left.
        const infoContainer = previewEl.querySelector('[class*="meta-info-container"]');
        const target = infoContainer || previewEl;
        let btnRow = target.querySelector('.disney-buttons-row');
        const info = getPlayButtonInfo(metaItem, libraryItem);
        const trailers = metaItem?.content?.content?.trailerStreams || [];

        if (btnRow) btnRow.remove();
        btnRow = document.createElement('div');
        btnRow.className = 'disney-buttons-row';

        if (info) {
            const playBtn = document.createElement('button');
            playBtn.className = 'disney-play-btn';
            playBtn.type = 'button';
            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>${info.label}</span>`;
            playBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (info.href) {
                    window.__cuOrigem = 'botao-continuar';
                    setStreamsRequested(true);
                    // Use REPLACE (not push) so streams URL takes over the preview
                    // entry. Otherwise after watching → back from player would
                    // land on streams URL → redirect → preview, requiring two
                    // back-clicks to actually leave the detail page.
                    window.location.replace(info.href);
                }
            });
            btnRow.appendChild(playBtn);
        }

        if (trailers.length > 0) {
            const trailerBtn = document.createElement('button');
            trailerBtn.className = 'disney-trailer-btn';
            trailerBtn.type = 'button';
            trailerBtn.innerHTML = `
                <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 17l7-5-7-5z"/></svg>
                <span>Trailer</span>`;
            trailerBtn.addEventListener('click', () => {
                const url = trailers[0].deepLinks?.player || trailers[0].url;
                if (url) window.location.href = url;
            });
            btnRow.appendChild(trailerBtn);
        }

        const dd = metaItem?.content?.content;
        // libraryItem can exist even when NOT in library (Stremio keeps it for
        // tracking watch progress). Use only the canonical inLibrary flag.
        const inLib = !!dd?.inLibrary || !!(libraryItem && libraryItem._id && !libraryItem.removed);
        const watched = !!dd?.watched;

        // Avaliar entra ANTES do botão de biblioteca (ordem: Assistir, Trailer,
        // Avaliar, Biblioteca, Assistido).
        const rateBtnEarly = document.createElement('a');
        rateBtnEarly.className = 'disney-action-btn disney-rate-btn';
        rateBtnEarly.rel = 'noopener noreferrer';
        rateBtnEarly.addEventListener('click', (e) => {
            e.preventDefault();
            abreFora(rateBtnEarly.getAttribute('href'));
        });
        rateBtnEarly.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        btnRow.appendChild(rateBtnEarly);

        const libBtn = document.createElement('button');
        libBtn.className = 'disney-action-btn';
        libBtn.type = 'button';
        libBtn.title = inLib ? 'Remover da Biblioteca' : 'Adicionar à Biblioteca';
        libBtn.innerHTML = inLib
            ? `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`
            : `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
        libBtn.addEventListener('click', () => {
            const ok = triggerNativeAction(previewEl, 'library');
            showToast(ok
                ? (inLib ? 'Removido da Biblioteca' : 'Adicionado à Biblioteca')
                : 'Não foi possível alterar a biblioteca');
        });
        btnRow.appendChild(libBtn);

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'disney-action-btn';
        eyeBtn.type = 'button';
        eyeBtn.title = watched ? 'Marcar como Não Assistido' : 'Marcar como Assistido';
        eyeBtn.innerHTML = watched
            ? `<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`
            : `<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
        eyeBtn.addEventListener('click', () => {
            const ok = triggerNativeAction(previewEl, 'watched');
            showToast(ok
                ? (watched ? 'Marcado como Não Assistido' : 'Marcado como Assistido')
                : 'Não foi possível alterar o status');
        });
        btnRow.appendChild(eyeBtn);



        target.appendChild(btnRow);
    }

    // Último meta renderizado, pro runner do chip não depender do ciclo de
    // injectButtons (que só roda quando a assinatura de play/biblioteca muda —
    // e a resolução do id do TMDB não mexe nessa assinatura).
    let lastDd = null;

    // Chip "Avaliar" na mesma linha do botão de IMDb.
    function injectRatingChip(metaItem, previewEl) {
        const imdbBtn = previewEl.querySelector('[class*="imdb-button-container"]');
        const row = imdbBtn ? imdbBtn.parentElement
                            : previewEl.querySelector('[class*="runtime-release-info-container"]');
        if (!row) return;

        const rate = ratingTarget(metaItem?.content?.content || lastDd);
        let chip = row.querySelector('.cu-rate-chip');
        if (!rate) { if (chip) chip.remove(); return; }

        if (!chip) {
            // <a target="_blank"> é o MESMO mecanismo do botão de IMDb do
            // stremio-web (MetaPreview.js), que já abre no navegador do sistema.
            // window.open não serve: o override do shell depende do
            // initShellComm, que falha nesta versão.
            chip = document.createElement('a');
            chip.className = 'cu-rate-chip';
            chip.rel = 'noopener noreferrer';
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                abreFora(chip.getAttribute('href'));
            });
            row.appendChild(chip);
        }
        if (chip.href !== rate.url) chip.href = rate.url;
        chip.title = rate.label;
        const wanted = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><span>${rate.service}</span>`;
        if (chip.innerHTML !== wanted) chip.innerHTML = wanted;
    }

    // Abrir link externo. `target="_blank"` não funciona nesta shell (medido:
    // window.open devolve null e o clique na âncora não faz nada), então o
    // pedido vai para o /abrir, que chama o `open` do sistema.
    //
    // Quando a interface é servida pela nuvem esse endereço não existe — não há
    // processo do outro lado capaz de abrir um navegador no SEU computador. Aí
    // o link vai para a área de transferência, que é a melhor saída possível:
    // um Cmd+V resolve, em vez de um clique que não faz nada.
    function abreFora(url) {
        if (!url) return;
        fetch('/abrir?url=' + encodeURIComponent(url))
            .then((r) => { if (!r.ok) throw new Error(String(r.status)); })
            .catch(() => navigator.clipboard.writeText(url)
                .then(() => showToast('Link copiado — cole no navegador'))
                .catch(() => showToast('Não consegui abrir o link')));
    }

    // ============================================================
    // Avaliar: tudo no Trakt
    // ============================================================
    // Avaliar continua sendo no site — o botão leva para a página certa (filme,
    // série ou aquele episódio). O que volta para cá é só a nota, via
    // /trakt/data (ver 06-trakt.js e trakt-bridge.js).
    // imdb id -> id do TMDB, via Cinemeta. Cache em memória + localStorage;
    // undefined = ainda buscando, null = não tem.
    const tmdbCache = new Map();
    try {
        const saved = JSON.parse(localStorage.getItem('cu:tmdb') || '{}');
        Object.entries(saved).forEach(([k, v]) => tmdbCache.set(k, v));
    } catch (_) { /* ignore */ }

    function tmdbFor(imdb) {
        if (tmdbCache.has(imdb)) return tmdbCache.get(imdb);
        tmdbCache.set(imdb, undefined);
        fetch(`https://v3-cinemeta.strem.io/meta/series/${imdb}.json`)
            .then((r) => r.json())
            .then((j) => {
                const id = j?.meta?.moviedb_id || null;
                tmdbCache.set(imdb, id);
                if (id) {
                    try {
                        const cur = JSON.parse(localStorage.getItem('cu:tmdb') || '{}');
                        cur[imdb] = id;
                        localStorage.setItem('cu:tmdb', JSON.stringify(cur));
                    } catch (_) { /* ignore */ }
                }
            })
            .catch(() => tmdbCache.set(imdb, null));
        return undefined;
    }

    function ratingTarget(dd) {
        const path = (window.location.hash || '').split('?')[0].replace(/^#\/?/, '').split('/');
        // A MESMA armadilha de rota que travou o modal de fontes: aqui estava
        // escrito `!== 'metadetails'`, mas a navegação real do app produz
        // `#/detail/...` (o botão ASSISTIR e o interceptador de cliques usam
        // essa forma). Resultado: ratingTarget devolvia null e o syncRateButton
        // escondia o botão — sempre. Só passava quando eu abria a URL
        // `#/metadetails/...` na mão pra testar.
        // Usa o mesmo DETAIL_SEG do resto do arquivo, uma fonte só.
        if (!new RegExp('^' + DETAIL_SEG + '$').test(path[0] || '')) return null;

        const type = path[1];
        const imdb = (decodeURIComponent(path[2] || '').match(/tt\d+/) || [])[0];

        if (!imdb) return null;

        // Sem API do Trakt não há nota para mostrar — o botão é só o caminho
        // até a página certa, onde você avalia. O endereço sai de título+ano
        // (ver 06-trakt.js), porque o slug é o único jeito de chegar num
        // episódio específico.
        const t = window.__cu.trakt;
        if (!t) return null;

        if (type === 'movie') {
            return { url: t.url(dd, 'movie', imdb), label: 'Avaliar no Trakt', service: 'Trakt' };
        }
        if (type === 'series') {
            return { url: t.url(dd, 'series', imdb), label: 'Avaliar no Trakt', service: 'Trakt' };
        }
        return null;
    }

    // ============================================================
    // Trigger native library/watched actions (their buttons are display:none
    // via our CSS, but .click() still fires the React handler).
    // ============================================================
    function triggerNativeAction(previewEl, type) {
        if (!previewEl) return false;
        // ActionsGroup renders <div class="group-container"> with child <div class="icon-container" onClick>
        // (NOT real buttons). Find the group with exactly 2 icons (the lib/watched one).
        const groups = previewEl.querySelectorAll('[class*="group-container"]');
        for (const g of groups) {
            const icons = g.querySelectorAll('[class*="icon-container"]');
            if (icons.length === 2) {
                const target = icons[type === 'library' ? 0 : 1];
                if (target) {
                    // Dispatch via MouseEvent so React's synthetic event system catches it
                    try {
                        target.dispatchEvent(new MouseEvent('click', {
                            bubbles: true, cancelable: true, view: window
                        }));
                        return true;
                    } catch (_) {
                        try { target.click(); return true; } catch (_) {}
                    }
                }
            }
        }
        return false;
    }

    // ============================================================
    // Simple toast notification
    // ============================================================
    let toastTimer = null;
    function showToast(message) {
        let toast = document.querySelector('.disney-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'disney-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        // Trigger reflow to restart animation
        // eslint-disable-next-line no-unused-expressions
        toast.offsetHeight;
        toast.classList.add('disney-toast-show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('disney-toast-show');
            toastTimer = setTimeout(() => { try { toast.remove(); } catch (_) {} }, 350);
        }, 2400);
    }

    // ============================================================
    // Right-side card with persistent tabs
    // ============================================================
    let activeTab = '';
    let lastCardMetaId = '';

    // "125 min" -> "2h 5min". Vivia DENTRO do bloco da aba Detalhes: declaração
    // de função em bloco é escopada ao bloco, então a aba Episódios não a
    // enxergava e o render inteiro morria com ReferenceError. Uma definição só,
    // no escopo do módulo, para as duas abas.
    function formatRuntime(r) {
        if (!r) return '';
        const m = String(r).match(/^(\d+)\s*min$/i);
        if (!m) return r;
        const mins = parseInt(m[1], 10);
        const h = Math.floor(mins / 60);
        const rest = mins % 60;
        return h > 0 ? (rest > 0 ? `${h}h ${rest}min` : `${h}h`) : `${rest}min`;
    }

    // ---- duração por episódio -------------------------------------------
    //
    // O Cinemeta, que é quem serve o `meta` no app, NÃO tem duração por
    // episódio — só a da série. Mas o addon do TMDB que já está instalado tem:
    // ele monta cada episódio com `runtime` vindo do TMDB (verificado no
    // /meta: '33min', '32min', '1h13min' — valores distintos de verdade).
    //
    // Então buscamos direto nele. O endereço sai do próprio perfil, não fica
    // fixo no código, e o resultado é guardado para sempre: duração de episódio
    // não muda, e a instância do addon costuma hibernar (504 na primeira
    // chamada), então recomeçar do zero a cada abertura seria lento à toa.
    const CHAVE_DUR = 'cu:duracoesEp';
    let duracoes = {};
    try { duracoes = JSON.parse(localStorage.getItem(CHAVE_DUR) || '{}'); } catch (_) { /* ignore */ }
    const durPedidas = new Set();

    function baseTmdb() {
        let perfil;
        try { perfil = JSON.parse(localStorage.getItem('profile') || '{}'); } catch (_) { return null; }
        const a = (perfil.addons || []).find((x) => /tmdb-addon/i.test(x.transportUrl || ''));
        return a ? a.transportUrl.replace(/manifest\.json$/, '') : null;
    }

    function pedeDuracoes(imdb) {
        if (!imdb || duracoes[imdb] || durPedidas.has(imdb)) return;
        const base = baseTmdb();
        if (!base) return;
        durPedidas.add(imdb);
        fetch(base + 'meta/series/' + imdb + '.json')
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((j) => {
                const mapa = {};
                (j.meta?.videos || []).forEach((v) => {
                    if (v.runtime && v.season != null && v.episode != null) {
                        mapa[v.season + ':' + v.episode] = v.runtime;
                    }
                });
                if (!Object.keys(mapa).length) return;
                duracoes[imdb] = mapa;
                try { localStorage.setItem(CHAVE_DUR, JSON.stringify(duracoes)); } catch (_) { /* ignore */ }
            })
            .catch(() => {
                // instância hibernando: libera para tentar de novo depois
                durPedidas.delete(imdb);
            });
    }

    function syncDuracoes() {
        const cards = document.querySelectorAll('.disney-episode-card');
        if (!cards.length) return;

        const path = (window.location.hash || '').split('?')[0].replace(/^#\/?/, '').split('/');
        const imdb = (decodeURIComponent(path[2] || '').match(/tt\d+/) || [])[0];
        if (!imdb) return;

        const mapa = duracoes[imdb];
        if (!mapa) { pedeDuracoes(imdb); return; }

        cards.forEach((card) => {
            if (card.classList.contains('cu-ep-bloqueado')) return;
            const t = card.dataset.temporada;
            const e = card.dataset.episodio;
            const valor = mapa[t + ':' + e];
            let selo = card.querySelector('.disney-episode-duracao');
            if (!valor) { if (selo) selo.remove(); return; }
            if (!selo) {
                selo = document.createElement('span');
                selo.className = 'disney-episode-duracao';
                card.querySelector('.disney-episode-thumb-wrap')?.appendChild(selo);
            }
            if (selo.textContent !== valor) selo.textContent = valor;
        });
    }

    // Miniatura de episódio sem imagem: cadeado quando ainda não lançou,
    // relógio quando lançou mas a arte não existe (ou falhou ao carregar).
    const TRACO = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
    // "2026-08-12T…" → "12/08/2026"
    function dataBR(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
    }

    const CADEADO_SVG = `<svg viewBox="0 0 24 24" ${TRACO}><rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8.2 10.5V7.2a3.8 3.8 0 0 1 7.6 0v3.3"/></svg>`;
    const RELOGIO_SVG = `<svg viewBox="0 0 24 24" ${TRACO}><circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.1 2"/></svg>`;

    function renderTabContent(metaItem, libraryItem) {
        const body = document.querySelector('.disney-side-card .disney-tab-body');
        if (!body) return;
        const details = metaItem?.content?.content;
        if (!details) { body.innerHTML = ''; return; }

        if (activeTab === 'episodes') {
            // Real episodes are season > 0 (season 0 = specials → Extras tab)
            const videos = (Array.isArray(details.videos) ? details.videos : [])
                .filter((v) => (v.season || 0) > 0);
            if (videos.length === 0) {
                body.innerHTML = `<div class="disney-empty">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v12H4z" opacity=".3"/><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 18V6h16v12H4zm6-2l5-4-5-4z"/></svg>
                    <span>Nenhum episódio disponível</span>
                </div>`;
                return;
            }
            const bySeason = {};
            videos.forEach((v) => { (bySeason[v.season] = bySeason[v.season] || []).push(v); });
            const seasonKeys = Object.keys(bySeason).sort((a, b) => +a - +b);
            seasonKeys.forEach((s) => bySeason[s].sort((a, b) => (a.episode || 0) - (b.episode || 0)));

            // Selected season — persisted per series in localStorage
            const metaKey = details.id || details.name;
            const storageKey = 'cu:selectedSeason:' + metaKey;
            let selected = parseInt(localStorage.getItem(storageKey) || '', 10);
            if (!seasonKeys.includes(String(selected))) selected = parseInt(seasonKeys[0], 10);

            const optionsHTML = seasonKeys.map((s) =>
                `<option value="${s}" ${+s === selected ? 'selected' : ''}>Temporada ${s}</option>`
            ).join('');
            // A duração de cada episódio é preenchida depois, pelo syncDuracoes:
            // ela vem do addon do TMDB, não do Cinemeta que serve esta tela.

            const epsHTML = (bySeason[selected] || []).map((v) => {
                const epNum = v.episode != null ? v.episode : null;
                const titleTxt = (v.title || v.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                const href = v.deepLinks?.metaDetailsStreams || v.deepLinks?.player || '';
                const thumb = v.thumbnail || '';

                // Episódio ainda não lançado: sem miniatura e sem nome de
                // verdade (o Cinemeta manda "TBA"), ou com data no futuro. Em vez
                // da imagem quebrada, ganha um visual próprio de bloqueado.
                const semNome = !titleTxt || /^(tba|tbd)$/i.test(titleTxt.trim());
                const noFuturo = v.released ? new Date(v.released).getTime() > Date.now() : false;
                // Data de estreia no futuro basta para bloquear. Antes eu exigia
                // TAMBÉM que o episódio não tivesse nome, e por isso os que já
                // foram anunciados — com nome e arte, mas sem ter ido ao ar —
                // apareciam como disponíveis e não davam fonte nenhuma. É a
                // mesma data que o calendário usa, então as duas telas passam a
                // concordar. Sem data, segue valendo a falta de nome e arte.
                const bloqueado = noFuturo || (!thumb && semNome);
                // Já lançado, com nome, mas o metahub ainda não gerou a arte:
                // é espera, não bloqueio — daí o relógio no lugar do cadeado.
                const semArte = !bloqueado && !thumb;

                // A miniatura vai DENTRO de um contêiner: `<img>` é elemento
                // substituído e não renderiza filhos — o check de "visto"
                // aceitava o appendChild no DOM e simplesmente não aparecia.
                // temporada/episódio ficam no próprio card: é a chave com que
                // o Trakt indexa a nota daquele episódio.
                // Três casos, nesta ordem:
                //   bloqueado COM arte → a arte fica, apagada, e o cadeado vem
                //     por cima: dá para reconhecer o episódio e ver que ainda
                //     não saiu ao mesmo tempo
                //   bloqueado SEM arte → só o vão com o cadeado
                //   disponível         → a imagem normal
                const miniatura = (bloqueado && thumb)
                    ? `<img class="disney-episode-thumb" src="${thumb}" alt="" loading="lazy" />
                       <div class="cu-ep-cadeado">${CADEADO_SVG}</div>`
                    : ((bloqueado || semArte)
                        ? `<div class="disney-episode-thumb disney-episode-thumb-vazia">${bloqueado ? CADEADO_SVG : RELOGIO_SVG}</div>`
                        : `<img class="disney-episode-thumb" src="${thumb}" alt="" loading="lazy" />`);

                // No episódio que ainda não saiu, o selo da miniatura mostra a
                // data de estreia — é a informação que falta ali. Nos demais,
                // ele é preenchido depois com a duração (ver syncDuracoes).
                const dataEstreia = bloqueado ? dataBR(v.released) : '';

                // Título vira só a numeração; o NOME do episódio desce para a
                // linha de baixo, onde cabe inteiro sem corte.
                const rotulo = epNum != null ? `Episódio ${epNum}` : 'Episódio';
                const segundaLinha = bloqueado ? 'Ainda não disponível' : titleTxt;

                return `<div class="disney-episode-card${bloqueado ? ' cu-ep-bloqueado' : ''}" data-href="${href}" data-temporada="${selected}" data-episodio="${epNum != null ? epNum : ''}">
                    <div class="disney-episode-thumb-wrap">
                        ${miniatura}
                    </div>
                    <div class="disney-episode-info">
                        <span class="disney-episode-title">${rotulo}</span>
                        ${segundaLinha ? `<span class="disney-episode-overview">${segundaLinha}</span>` : ''}
                    </div>
                    ${dataEstreia ? `<span class="cu-ep-estreia">${dataEstreia}</span>` : ''}
                    <div class="cu-ep-acoes">
                        <a class="cu-ep-nota" target="_blank" rel="noopener noreferrer"></a>
                    </div>
                </div>`;
            }).join('');

            body.innerHTML = `
                <div class="disney-season-picker">
                    <label class="disney-season-picker-label">Temporada</label>
                    <select class="disney-season-select">${optionsHTML}</select>
                </div>
                <div class="disney-episodes-list">${epsHTML}</div>`;

            const select = body.querySelector('.disney-season-select');
            select.addEventListener('change', () => {
                localStorage.setItem(storageKey, select.value);
                renderTabContent(metaItem, libraryItem);
            });
            // O metahub devolve URL de miniatura mesmo para episódios cujo still
            // ainda não existe, e a imagem morre no carregamento — era daí que
            // vinha o ícone de imagem quebrada. Falhou, cai no mesmo estado de
            // "sem arte" dos que nem URL têm.
            body.querySelectorAll('img.disney-episode-thumb').forEach((img) => {
                img.addEventListener('error', () => {
                    const wrap = img.closest('.disney-episode-thumb-wrap');
                    if (!wrap || wrap.querySelector('.disney-episode-thumb-vazia')) return;
                    const vazia = document.createElement('div');
                    vazia.className = 'disney-episode-thumb disney-episode-thumb-vazia';
                    // Num episódio bloqueado o cadeado JÁ está sobreposto: pôr o
                    // relógio aqui deixava os dois ícones no mesmo quadrado.
                    // O vão entra vazio e quem identifica o estado é o cadeado.
                    vazia.innerHTML = wrap.querySelector('.cu-ep-cadeado') ? '' : RELOGIO_SVG;
                    img.replaceWith(vazia);
                }, { once: true });
            });

            body.querySelectorAll('.disney-episode-card').forEach((card) => {
                card.addEventListener('click', () => {
                    // Episódio não lançado não abre fontes: não há o que buscar,
                    // e o modal ficaria girando à toa.
                    if (card.classList.contains('cu-ep-bloqueado')) return;
                    const href = card.getAttribute('data-href');
                    if (href) {
                        window.__cuOrigem = 'card-episodio';
                        setStreamsRequested(true);
                        window.location.replace(href);
                    }
                });
            });
            return;
        }

        if (activeTab === 'details') {
            const row = (k, v) => v
                ? `<div class="disney-detail-row"><span class="disney-detail-key">${k}</span><span class="disney-detail-value">${v}</span></div>`
                : '';

            // Normalize cast/director/writer — addons return either string[] or
            // object[] { name, character, photo/image }
            function personList(arr) {
                if (!Array.isArray(arr)) return [];
                return arr.map((p) => {
                    if (typeof p === 'string') return { name: p, character: '', photo: '', url: '' };
                    return {
                        name: p.name || p.fullName || String(p),
                        character: p.character || p.role || '',
                        photo: p.image || p.photo || p.profile || p.profileImage || p.profile_path || '',
                        url: p.url || p.imdbUrl || '',
                    };
                }).filter((p) => p.name);
            }
            // Also try details.links — Cinemata puts cast/director/writer there as
            // { category, name, url } entries (and TMDB addon may add `image`).
            function personsFromLinks(category) {
                const links = Array.isArray(details.links) ? details.links : [];
                const cats = {
                    cast:     ['cast', 'actor', 'actors', 'stars'],
                    director: ['director', 'directors', 'directed by'],
                    writer:   ['writer', 'writers', 'screenplay', 'written by'],
                }[category] || [];
                return links
                    .filter((l) => l && l.category && cats.includes(String(l.category).toLowerCase()))
                    .map((l) => ({
                        name: l.name || '',
                        character: '',
                        photo: l.image || l.photo || '',
                        url: l.url || '',
                    }))
                    .filter((p) => p.name);
            }
            function mergePersons(...lists) {
                const seen = new Set();
                const out = [];
                lists.forEach((list) => list.forEach((p) => {
                    const key = p.name.toLowerCase();
                    if (seen.has(key)) {
                        // Merge missing fields from other source
                        const existing = out.find((x) => x.name.toLowerCase() === key);
                        if (existing) {
                            if (!existing.photo && p.photo) existing.photo = p.photo;
                            if (!existing.character && p.character) existing.character = p.character;
                            if (!existing.url && p.url) existing.url = p.url;
                        }
                        return;
                    }
                    seen.add(key);
                    out.push(p);
                }));
                return out;
            }
            function imdbLink(p) {
                if (p.url) {
                    if (p.url.includes('imdb.com') || p.url.includes('stremio.com/warning')) return p.url;
                }
                return `https://www.imdb.com/find/?q=${encodeURIComponent(p.name)}&s=nm`;
            }
            function personCardsHTML(people) {
                if (!people.length) return '';
                const hasAnyPhoto = people.some((p) => !!p.photo);
                // If NO photos available, fall back to comma-separated inline text
                if (!hasAnyPhoto) {
                    return `<p class="disney-cast-text">${people.slice(0, 30).map((p) => {
                        const safe = (p.name || '').replace(/</g, '&lt;');
                        return `<a href="${imdbLink(p)}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
                    }).join(', ')}</p>`;
                }
                return `<div class="disney-cast-list">${people.slice(0, 14).map((p) => {
                    const safe = (p.name || '').replace(/</g, '&lt;');
                    const initial = (p.name || '?').trim().charAt(0).toUpperCase();
                    const photoHTML = p.photo
                        ? `<img class="disney-cast-photo" src="${p.photo}" alt="" loading="lazy" />`
                        : `<div class="disney-cast-photo disney-cast-photo-placeholder">${initial}</div>`;
                    return `<a class="disney-cast-card" href="${imdbLink(p)}" target="_blank" rel="noopener noreferrer" title="${safe}">
                        ${photoHTML}
                        <span class="disney-cast-name">${safe}</span>
                    </a>`;
                }).join('')}</div>`;
            }

            const cast      = mergePersons(personList(details.cast),     personsFromLinks('cast'));
            const directors = mergePersons(personList(details.director), personsFromLinks('director'));
            const writers   = mergePersons(personList(details.writer),   personsFromLinks('writer'));

            // Genres can come from details.genres (most addons) OR from
            // links with category "Genre" (Cinemata fallback).
            let genres = Array.isArray(details.genres) ? details.genres.slice() : [];
            if (genres.length === 0 && Array.isArray(details.links)) {
                genres = details.links
                    .filter((l) => /^genres?$/i.test(l.category || ''))
                    .map((l) => l.name);
            }
            // Translate common English genre names to Portuguese when the UI
            // locale is pt-* (Cinemata is English-only; addons like TMDB-pt
            // would already return PT-BR genres so the map is a no-op there).
            const GENRE_PT = {
                'action': 'Ação', 'adventure': 'Aventura', 'animation': 'Animação',
                'biography': 'Biografia', 'comedy': 'Comédia', 'crime': 'Crime',
                'documentary': 'Documentário', 'drama': 'Drama', 'family': 'Família',
                'fantasy': 'Fantasia', 'film noir': 'Film Noir', 'game show': 'Game Show',
                'history': 'História', 'horror': 'Terror', 'music': 'Música',
                'musical': 'Musical', 'mystery': 'Mistério', 'news': 'Notícias',
                'reality-tv': 'Reality TV', 'romance': 'Romance',
                'sci-fi': 'Ficção Científica', 'science fiction': 'Ficção Científica',
                'short': 'Curta-Metragem', 'sport': 'Esporte', 'talk-show': 'Talk Show',
                'thriller': 'Suspense', 'tv movie': 'Filme para TV', 'war': 'Guerra',
                'western': 'Faroeste',
            };
            const userLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
            const wantsPt = userLang.startsWith('pt');
            if (wantsPt) {
                genres = genres.map((g) => GENRE_PT[String(g).toLowerCase()] || g);
            }

            // Format runtime here too for the card

            const formats = [];
            if (details.behaviorHints?.p2p) formats.push('P2P');
            const certification = details.certification || '';
            const language = (Array.isArray(details.language) ? details.language.join(', ') : details.language) || '';
            const awards = details.awards || '';

            body.innerHTML = `
                <div class="disney-detail-grid">
                    ${row('Lançamento', details.releaseInfo || (details.released ? String(new Date(details.released).getFullYear()) : ''))}
                    ${row('Duração', formatRuntime(details.runtime))}
                    ${row('Gêneros', genres.length ? genres.join(', ') : '')}
                    ${row('País', Array.isArray(details.country) ? details.country.join(', ') : (details.country || ''))}
                    ${row('Idioma original', language)}
                    ${row('Classificação', certification)}
                    ${row('IMDb', details.imdbRating ? `${details.imdbRating}/10` : '')}
                    ${row('Prêmios', awards)}
                </div>
                ${cast.length ? `
                    <div class="disney-detail-block">
                        <h4 class="disney-detail-block-title">Elenco</h4>
                        ${personCardsHTML(cast)}
                    </div>` : ''}
                ${directors.length ? `
                    <div class="disney-detail-block">
                        <h4 class="disney-detail-block-title">Direção</h4>
                        ${personCardsHTML(directors)}
                    </div>` : ''}
                ${writers.length ? `
                    <div class="disney-detail-block">
                        <h4 class="disney-detail-block-title">Roteiro</h4>
                        ${personCardsHTML(writers)}
                    </div>` : ''}`;
            return;
        }

        if (activeTab === 'extras') {
            const trailers = (details.trailerStreams || []).map((tr, i) => ({
                kind: 'trailer',
                title: tr.title || `Trailer ${i + 1}`,
                meta: 'Trailer',
                href: tr.deepLinks?.player || tr.url || '',
                stream: true,
            }));
            // Special episodes (season 0) → Extras
            const specials = (Array.isArray(details.videos) ? details.videos : [])
                .filter((v) => (v.season || 0) === 0)
                .map((v) => ({
                    kind: 'special',
                    title: v.title || v.name || 'Especial',
                    meta: v.released ? new Date(v.released).getFullYear().toString() : 'Especial',
                    href: v.deepLinks?.metaDetailsStreams || v.deepLinks?.player || '',
                    stream: true,
                }));
            const items = [...trailers, ...specials];

            if (items.length === 0) {
                body.innerHTML = `<div class="disney-empty">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 17l7-5-7-5z"/></svg>
                    <span>Nenhum extra disponível</span>
                </div>`;
                return;
            }
            body.innerHTML = `<div class="disney-extras-list">${items.map((it) => `
                <div class="disney-extra-card" data-url="${it.href}" data-kind="${it.kind}">
                    <div class="disney-extra-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
                    <div class="disney-extra-info">
                        <span class="disney-extra-title">${(it.title || '').replace(/</g, '&lt;')}</span>
                        <span class="disney-extra-meta">${it.meta}</span>
                    </div>
                </div>`).join('')}</div>`;
            body.querySelectorAll('.disney-extra-card').forEach((c) => {
                c.addEventListener('click', () => {
                    const url = c.getAttribute('data-url');
                    if (!url) return;
                    // Specials are episodes → open streams popup
                    if (c.getAttribute('data-kind') === 'special') {
                        setStreamsRequested(true);
                        window.location.replace(url);
                    } else {
                        window.location.href = url;
                    }
                });
            });
            return;
        }

        if (activeTab === 'suggestions') {
            const detailsContent = document.querySelector('[class*="metadetails-content"]');
            const fiber = detailsContent ? getReactFiber(detailsContent) : null;
            const md = fiber ? getMetaDetailsData(fiber) : null;
            let items = [];
            const cats = md?.metaItem?.suggestedStreamCatalogs || md?.suggestedStreamCatalogs
                || md?.suggestedCatalogs || md?.metaItem?.suggestedCatalogs || [];
            if (Array.isArray(cats)) {
                cats.forEach((c) => {
                    if (c?.content?.type === 'Ready' && Array.isArray(c.content.content)) {
                        c.content.content.forEach((it) => { if (items.length < 18) items.push(it); });
                    }
                });
            }
            if (items.length === 0) {
                body.innerHTML = `<div class="disney-empty">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    <span>Nenhuma sugestão disponível</span>
                </div>`;
                return;
            }
            body.innerHTML = `<div class="disney-suggestions-grid">${items.map((it) => {
                const p = it.poster || it.background || '';
                const href = it.deepLinks?.metaDetailsStreams || it.deepLinks?.metaDetailsVideos || '#';
                return `<a class="disney-suggestion-card" href="${href}">
                    <img class="disney-suggestion-poster" src="${p}" alt="${(it.name || '').replace(/"/g, '&quot;')}" loading="lazy" />
                </a>`;
            }).join('')}</div>`;
            return;
        }
    }

    function buildSideCard(metaItem, libraryItem, container) {
        const details = metaItem?.content?.content;
        if (!details) return;
        const isSeries = details.type === 'series'
            || (Array.isArray(details.videos) && details.videos.length > 1);

        // Tab order: Detalhes first, then Episódios (series only), Extras
        const tabs = [];
        tabs.push({ id: 'details',  label: 'Detalhes' });
        if (isSeries) tabs.push({ id: 'episodes', label: 'Episódios' });
        tabs.push({ id: 'extras',   label: 'Extras' });

        // Default tab: series → Episódios, movie → Detalhes
        // (Reset if the meta switched or our cached tab no longer exists)
        const metaId = details.id || details.name;
        if (lastCardMetaId !== metaId || !tabs.find((t) => t.id === activeTab)) {
            lastCardMetaId = metaId;
            activeTab = isSeries ? 'episodes' : 'details';
        }

        const tabsHTML = tabs.map((t) =>
            `<button type="button" class="disney-tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
        ).join('');

        let card = container.querySelector('.disney-side-card');
        if (!card) {
            card = document.createElement('aside');
            card.className = 'disney-side-card';
            container.appendChild(card);
        }
        // Only rebuild header if tabs changed
        const currentTabSig = Array.from(card.querySelectorAll('.disney-tab-btn'))
            .map((b) => b.getAttribute('data-tab')).join(',');
        const newTabSig = tabs.map((t) => t.id).join(',');

        if (currentTabSig !== newTabSig) {
            card.innerHTML = `
                <div class="disney-tabs-bar">${tabsHTML}</div>
                <div class="disney-tab-body"></div>`;
            card.querySelectorAll('.disney-tab-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    activeTab = btn.getAttribute('data-tab');
                    card.querySelectorAll('.disney-tab-btn').forEach((b) =>
                        b.classList.toggle('active', b === btn));
                    renderTabContent(metaItem, libraryItem);
                });
            });
            renderTabContent(metaItem, libraryItem);
        } else {
            // Update active highlight only
            card.querySelectorAll('.disney-tab-btn').forEach((b) =>
                b.classList.toggle('active', b.getAttribute('data-tab') === activeTab));
        }
    }

    // ============================================================
    // Streaming-provider icons (bottom-right of preview)
    // ============================================================
    function injectProviderIcons(metaItem, streams, previewEl) {
        if (!previewEl) return;
        const existing = previewEl.querySelector('.disney-provider-icons');
        const list = (streams?.content?.type === 'Ready') ? streams.content.content : [];
        const providers = detectProviders(list);
        if (providers.length === 0) { if (existing) existing.remove(); return; }

        const name = metaItem?.content?.content?.name || '';
        const html = `<div class="disney-provider-icons">${providers.map((p) => `
            <a class="disney-provider-icon" href="${p.url}${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer" title="${p.name}">
                <img src="${p.icon}" alt="${p.name}" />
            </a>`).join('')}</div>`;

        if (existing) {
            existing.outerHTML = html;
        } else {
            previewEl.insertAdjacentHTML('beforeend', html);
        }
    }

    // ============================================================
    // Streams modal: show native streams-list as centered popup with backdrop +
    // a close button injected INSIDE streams-list so it's always positioned right.
    // ============================================================
    function navigateToVideosUrl(metaItem) {
        const detailsUrl = metaItem?.content?.content?.deepLinks?.metaDetailsVideos;
        if (detailsUrl) {
            window.location.href = detailsUrl;
            return;
        }
        const hash = window.location.hash || '';
        const stripped = hash.replace(/\/[^/]+$/, '');
        if (stripped && stripped !== hash) {
            window.location.hash = stripped;
        } else {
            window.history.back();
        }
    }

    function closeStreamsModal(metaItem) {
        setStreamsRequested(false);
        // O popup sai JUNTO com o fundo. Antes só o fundo era removido aqui e o
        // card ficava até o runner (400ms) perceber a troca de rota e limpá-lo —
        // dava aquele segundo de card solto no ar, sem o escurecido atrás.
        document.querySelectorAll('.disney-streams-backdrop, .disney-streams-popup')
            .forEach((el) => el.remove());
        // ASSISTIR used location.replace() to swap the preview URL → streams URL
        // (no history push). So we CAN'T history.back() here — that would go to
        // whatever was before /detail (Home), closing the whole detail page.
        // Instead: replace the streams URL with the preview URL (strip last segment).
        const hash = window.location.hash || '';
        if (isStreamsUrlHash(hash)) {
            const stripped = stripLastSegment(hash);
            if (stripped) {
                const newHref = window.location.pathname + window.location.search + stripped;
                window.location.replace(newHref);
                return;
            }
        }
        // Fallback: explicit navigation if the URL shape was unexpected
        navigateToVideosUrl(metaItem);
    }

    // ============================================================
    // Diagnóstico do tempo das fontes
    // ============================================================
    // Cliques sintéticos deram resultados contraditórios (ora o card era lento
    // e o CONTINUAR rápido, ora o inverso), porque o segundo acesso à mesma URL
    // já vem quente. Este registro grava a linha do tempo REAL do uso: cada
    // navegação para uma URL de streams e cada transição de estado por addon,
    // com carimbo de tempo. Leitura: localStorage['cu:timeline'].
    const timeline = [];
    let tNav = 0;
    let ultimoEstado = '';
    function anota(evento, extra) {
        timeline.push(Object.assign({ t: Date.now(), dt: tNav ? Date.now() - tNav : 0, evento }, extra || {}));
        while (timeline.length > 120) timeline.shift();
        try { localStorage.setItem('cu:timeline', JSON.stringify(timeline)); } catch (_) {}
    }
    window.addEventListener('hashchange', () => {
        const h = window.location.hash || '';
        if (isStreamsUrlHash(h)) { tNav = Date.now(); ultimoEstado = '';
            if (!emRetry) retries = 0;
            anota('abriu-streams', { url: h.slice(0, 60), origem: window.__cuOrigem || '?' }); }
    });
    function anotaEstado(flat) {
        if (!tNav) return;
        const estado = (flat.status || []).map((x) => x.nome + '=' + x.tipo + (x.n || 0)).join(' | ');
        if (estado && estado !== ultimoEstado) { ultimoEstado = estado; anota('estado', { estado }); }

    }

    // ============================================================
    // Destravar as fontes
    // ============================================================
    // Medido com o app em uso: quando o modal fica em "Carregando fontes...",
    // um fetch DIRETO ao mesmo endpoint do addon, feito de dentro da própria
    // página, volta em 2ms com as 18 fontes — enquanto o modelo do stremio-core
    // segue em `Loading` por 4s, 14s ou indefinidamente. Ou seja: não é rede,
    // não é o addon, e não é qual botão foi clicado (os dois rodam o mesmo
    // código). É o pedido do core que fica pendurado.
    //
    // O que destrava é renavegar — que é o que você faz à mão ao fechar e
    // reabrir. Aqui isso vira automático: passa pela URL de preview e volta
    // para a de streams, o que faz o core refazer o pedido. Duas tentativas no
    // máximo, para nunca virar laço.
    let retryTimer = null;
    let retries = 0;

    function agendaRetry(flat) {
        const h = window.location.hash || '';
        const travado = streamsRequested && isStreamsUrlHash(h)
            && flat.loading && flat.items.length === 0;

        if (!travado) { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } return; }
        if (retryTimer || retries >= 2) return;

        retryTimer = setTimeout(() => {
            retryTimer = null;
            const atual = window.location.hash || '';
            if (!streamsRequested || !isStreamsUrlHash(atual)) return;
            const preview = stripLastSegment(atual);
            if (!preview) return;

            retries += 1;
            anota('retry', { tentativa: retries });

            emRetry = true;
            const base = window.location.pathname + window.location.search;
            window.location.replace(base + preview);
            setTimeout(() => {
                window.location.replace(base + atual);
                // libera o guard só depois que o hashchange de volta passou
                setTimeout(() => { emRetry = false; tNav = Date.now(); ultimoEstado = ''; }, 60);
            }, 150);
        }, 4000);
    }

    // streams is an ARRAY of per-addon groups: [{addon, content:{type,content:[...]}}, ...]
    // (NOT a single object with content.type/content). Flatten into one list + track loading.
    function flattenStreams(streams) {
        if (!Array.isArray(streams)) return { items: [], loading: true, anyAddon: false, status: [] };
        let anyLoading = false;
        const items = [];
        // Status por addon: sem isso, "Nenhuma fonte disponível" some com a
        // causa. Um addon pode ter respondido erro, outro ter vindo vazio, e a
        // tela mostrava a mesma frase nos dois casos.
        const status = [];
        streams.forEach((g) => {
            if (!g || !g.content) return;
            const nome = g.addon?.manifest?.name || 'Addon';
            const tipo = g.content.type;
            if (tipo === 'Loading') anyLoading = true;
            if (tipo === 'Ready' && Array.isArray(g.content.content)) {
                g.content.content.forEach((s) => {
                    items.push(Object.assign({}, s, { addon: g.addon || s.addon }));
                });
                status.push({ nome, tipo, n: g.content.content.length });
            } else {
                status.push({ nome, tipo, n: 0 });
            }
        });
        return { items, loading: anyLoading, anyAddon: streams.length > 0, status };
    }

    function syncStreamsModal(metaItem, streams) {
        const isOpen = document.body.classList.contains('cu-streams-open');
        let backdrop = document.querySelector('.disney-streams-backdrop');
        let popup = document.querySelector('.disney-streams-popup');

        if (!isOpen) {
            if (backdrop) backdrop.remove();
            if (popup) popup.remove();
            return;
        }

        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'disney-streams-backdrop';
            backdrop.addEventListener('click', () => closeStreamsModal(metaItem));
            document.body.appendChild(backdrop);
        }

        if (!popup) {
            popup = document.createElement('div');
            popup.className = 'disney-streams-popup';
            document.body.appendChild(popup);
        }

        const flat = flattenStreams(streams);
        anotaEstado(flat);
        agendaRetry(flat);
        const sig = (flat.loading ? 'L' : 'R') + ':' + flat.items.length + ':' + (flat.anyAddon ? 'A' : 'N')
            + ':' + (flat.status || []).map((x) => x.nome + x.tipo + x.n).join('|');
        if (popup.dataset.cuSig !== sig) {
            popup.dataset.cuSig = sig;

            let bodyHTML = '';
            if (!flat.anyAddon) {
                bodyHTML = `<div class="disney-streams-loading">Aguardando addons...</div>`;
            } else if (flat.loading && flat.items.length === 0) {
                // Depois de um tempo sem nada, mostra QUEM ainda está pendente
                // em vez de um "Carregando..." que nunca sai do lugar.
                const linhas = (flat.status || []).map((x) => {
                    const rotulo = x.tipo === 'Err' ? 'não respondeu'
                        : x.tipo === 'Loading' ? 'buscando…'
                        : 'nenhum resultado';
                    return `<li><span>${String(x.nome).replace(/</g, '&lt;')}</span><em>${rotulo}</em></li>`;
                }).join('');
                bodyHTML = `<div class="disney-streams-loading">
                        <p>Carregando fontes...</p>
                        ${linhas ? `<ul class="disney-streams-status">${linhas}</ul>` : ''}
                    </div>`;
            } else if (flat.items.length === 0) {
                const linhas = (flat.status || []).map((x) => {
                    const rotulo = x.tipo === 'Err' ? 'não respondeu'
                        : x.tipo === 'Loading' ? 'ainda buscando'
                        : 'nenhum resultado';
                    return `<li><span>${String(x.nome).replace(/</g, '&lt;')}</span><em>${rotulo}</em></li>`;
                }).join('');
                bodyHTML = `<div class="disney-streams-empty">
                        <p>Nenhuma fonte disponível</p>
                        ${linhas ? `<ul class="disney-streams-status">${linhas}</ul>` : ''}
                    </div>`;
            } else {
                bodyHTML = flat.items.map((s, i) => {
                    const title = (s.title || s.name || 'Sem título').replace(/</g, '&lt;');
                    const desc = (s.description || '').replace(/</g, '&lt;');
                    const url = s.deepLinks?.player || s.url || '';
                    const logo = s.addon?.manifest?.logo || '';
                    const iconHTML = logo
                        ? `<img class="disney-stream-icon-img" src="${logo}" alt="" />`
                        : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                    return `<div class="disney-stream-item" data-idx="${i}">
                        <div class="disney-stream-icon">${iconHTML}</div>
                        <div class="disney-stream-info">
                            <span class="disney-stream-title">${title}</span>
                            ${desc ? `<span class="disney-stream-desc">${desc}</span>` : ''}
                        </div>
                        <svg class="disney-stream-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>`;
                }).join('');
                if (flat.loading) {
                    bodyHTML += `<div class="disney-streams-loading-more">Carregando mais fontes...</div>`;
                }
            }

            const titleStr = (metaItem?.content?.content?.name || 'Selecionar fonte').replace(/</g, '&lt;');
            popup.innerHTML = `
                <div class="disney-streams-popup-header">
                    <span class="disney-streams-popup-title">${titleStr}</span>
                    <button type="button" class="disney-streams-close-inline" aria-label="Fechar">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                </div>
                <div class="disney-streams-popup-body">${bodyHTML}</div>`;

            popup.querySelector('.disney-streams-close-inline')
                .addEventListener('click', () => closeStreamsModal(metaItem));
            popup.querySelectorAll('.disney-stream-item').forEach((item) => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.getAttribute('data-idx'), 10);
                    const s = flat.items[idx];
                    const url = s?.deepLinks?.player || s?.url || '';
                    if (url) {
                        // Tear down chrome BEFORE navigating so the player
                        // screen never sees the backdrop/popup covering the video
                        setStreamsRequested(false);
                        cleanupModalChrome();
                        window.location.href = url;
                    }
                });
            });
        }

        if (!document.body.dataset.cuEsc) {
            document.body.dataset.cuEsc = '1';
            document.addEventListener('keydown', function onEsc(e) {
                if (e.key === 'Escape' && document.body.classList.contains('cu-streams-open')) {
                    closeStreamsModal(metaItem);
                }
            });
        }
    }

    // ============================================================
    // Main runner
    // ============================================================
    let currentMetaId = '';

    function handleDetailsPage() {
        const detailsContent = document.querySelector('[class*="metadetails-content"]');
        if (!detailsContent) {
            currentMetaId = '';
            // Cleanup global modal state
            document.querySelectorAll('.disney-streams-backdrop, .disney-streams-close, .disney-side-card')
                .forEach((el) => el.remove());
            return;
        }

        const fiber = getReactFiber(detailsContent);
        if (!fiber) return;

        const md = getMetaDetailsData(fiber);
        const metaItem = md?.metaItem;
        const libraryItem = md?.libraryItem;
        const streams = md?.streams;
        if (!metaItem || metaItem.content?.type !== 'Ready') return;

        const details = metaItem.content.content;
        const metaId = details.id || details.name;

        const previewEl = detailsContent.querySelector('[class*="meta-preview"]');
        if (!previewEl) return;

        // Always clean up native preview UI we replace
        hideNativeMetaPreview(previewEl);

        // Numa SÉRIE, a duração que o Stremio mostra é a de um episódio médio —
        // um número que não descreve a obra e que, pior, eu tinha espalhado como
        // se fosse a duração de cada episódio. Aqui ele vira a contagem de
        // episódios já lançados, que é o que se quer saber de uma série.
        // Em filme, segue sendo duração, só reformatada para "Xh Ymin".
        const runtimeEl = previewEl.querySelector('[class*="runtime-label"]');
        if (runtimeEl) {
            const dd = metaItem?.content?.content;
            const ehSerie = dd?.type === 'series' || Array.isArray(dd?.videos) && dd.videos.length > 0;

            if (ehSerie) {
                const agora = Date.now();
                const lancados = (dd.videos || []).filter((v) =>
                    (v.season || 0) > 0 && (!v.released || new Date(v.released).getTime() <= agora)
                ).length;
                if (lancados > 0) {
                    const novo = lancados + (lancados === 1 ? ' episódio' : ' episódios');
                    if (runtimeEl.textContent.trim() !== novo) runtimeEl.textContent = novo;
                }
            } else {
                const txt = runtimeEl.textContent.trim();
                const novo = formatRuntime(txt);
                if (novo && novo !== txt) runtimeEl.textContent = novo;
            }
        }

        // Buttons rebuild when play target, library state, or watched state changes
        // (so the +/− and eye/eye-off icons reflect the new state after a click).
        const detailsForSig = metaItem.content.content;
        const inLibSig = !!detailsForSig.inLibrary || !!(libraryItem && libraryItem._id && !libraryItem.removed);
        const watchedSig = !!detailsForSig.watched;
        const playSig = JSON.stringify({
            p: getPlayButtonInfo(metaItem, libraryItem) || {},
            l: inLibSig,
            w: watchedSig,
        });
        lastDd = detailsForSig;
        // Com o modal de fontes aberto a rota vira a de streams e o
        // getPlayButtonInfo muda, o que reconstruía a fileira inteira e fazia
        // os botões dançarem atrás do modal. Congela enquanto está aberto.
        const congelado = document.body.classList.contains('cu-streams-open')
            && !!previewEl.querySelector('.disney-buttons-row');
        if (!congelado && (previewEl.dataset.cuPlaySig !== playSig || !previewEl.querySelector('.disney-buttons-row'))) {
            previewEl.dataset.cuPlaySig = playSig;
            injectButtons(metaItem, libraryItem, previewEl);
        }

        // Side card with tabs (always show, persistent across re-renders)
        buildSideCard(metaItem, libraryItem, detailsContent);

        // Provider icons (bottom-right)
        injectProviderIcons(metaItem, streams, previewEl);


        currentMetaId = metaId;
    }

    // Runner próprio: o slug do Trakt chega depois da primeira pintura (o proxy
    // precisa perguntar à API), então o link se corrige na volta seguinte.
    function syncRateButton() {
        const btn = document.querySelector('.disney-rate-btn');
        if (!btn) return;
        const rate = ratingTarget(lastDd);
        if (!rate) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        if (btn.href !== rate.url) btn.href = rate.url;
        // Nenhuma nota é exibida: o botão é uma porta, não um indicador.
        btn.classList.remove('cu-tem-nota');
        btn.querySelector('.cu-rate-nota')?.remove();
        btn.title = rate.label;
    }

    // O modal de fontes NÃO pode depender do handleDetailsPage: aquela função
    // tem vários `return` antecipados (sem previewEl, metaItem ainda não
    // 'Ready'…) e, ao clicar num episódio, cai justamente num desses estados —
    // o modal ficava preso em "Carregando fontes..." até você fechar e reabrir.
    // Como runner próprio, ele acompanha o modelo a cada volta do loop.
    function syncStreamsRunner() {
        const dc = document.querySelector('[class*="metadetails-content"]');
        if (!dc) { syncStreamsModal(null, null); return; }
        const fiber = getReactFiber(dc);
        const md = fiber ? getMetaDetailsData(fiber) : null;
        syncStreamsModal(md?.metaItem || null, md?.streams);
    }

    // Compartilhado com o 05-discover.js: o painel do Explorar precisa exatamente
    // do mesmo comportamento de biblioteca/assistido e do mesmo link de avaliar.
    window.__cu.triggerNativeAction = triggerNativeAction;
    window.__cu.showToast = showToast;
    window.__cu.tmdbFor = tmdbFor;

    // ============================================================
    // Marcar episódio como visto
    // ============================================================
    // O estado de cada episódio vem do modelo (lastDd.videos). A lista nativa
    // serve só para uma coisa: dela sai a FUNÇÃO de marcar, que mora acima na
    // árvore de fibers. Ela existe em qualquer temporada, então isso continua
    // valendo mesmo quando os episódios na tela são de outra.

    const CHECK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

    // `onMarkVideoAsWatched` NÃO está nas props do vídeo — está três níveis
    // acima na árvore de fibers (medido). Era esse o bug: o código procurava
    // só nas props do próprio vídeo, não achava nada e caía no toast de erro.
    //
    // A função nativa é:
    //   (video, watched) => dispatch({MetaDetails: {MarkVideoAsWatched: [video, !watched]}})
    // ou seja, ela mesma inverte — recebe o estado ATUAL, não o desejado.
    function achaMarcador() {
        const el = document.querySelector('[class*="video-container"]');
        let f = el ? getReactFiber(el) : null;
        let nivel = 0;
        while (f && nivel < 40) {
            const p = f.memoizedProps;
            if (p && typeof p.onMarkVideoAsWatched === 'function') return p.onMarkVideoAsWatched;
            f = f.return;
            nivel += 1;
        }
        return null;
    }

    function syncEpisodiosVistos() {
        const cards = document.querySelectorAll('.disney-episode-card');
        if (!cards.length) return;

        // O estado vem do MODELO (lastDd.videos), não da lista nativa. A lista
        // nativa só monta a temporada em que você parou — medido: com a T3 na
        // tela, os `video-container` ainda eram os da T4 —, então ao voltar uma
        // temporada nenhum id batia e o botão simplesmente não aparecia. O
        // modelo tem `watched` de TODAS as temporadas.
        const porId = new Map();
        (lastDd?.videos || []).forEach((v) => { if (v.id) porId.set(v.id, v); });
        if (!porId.size) return;

        cards.forEach((card) => {
            if (card.classList.contains('cu-ep-bloqueado')) return;

            const href = card.getAttribute('data-href') || '';
            const id = decodeURIComponent(href.split('/').pop() || '');
            const v = porId.get(id);
            if (!v) return;

            card.classList.toggle('cu-ep-visto', !!v.watched);

            let btn = card.querySelector('.cu-ep-check');
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cu-ep-check';
                btn.innerHTML = CHECK;
                btn.addEventListener('click', (e) => {
                    // sem isto o clique borbulha e abre as fontes do episódio
                    e.stopPropagation();
                    e.preventDefault();

                    // relê na hora: o modelo é substituído a cada render
                    const atual = (lastDd?.videos || []).find((x) => x.id === id);
                    if (!atual) { showToast('Não achei esse episódio no modelo'); return; }

                    const fn = achaMarcador();
                    if (typeof fn !== 'function') { showToast('Não foi possível alterar o episódio'); return; }

                    // A função nativa inverte sozinha: recebe o estado ATUAL.
                    fn(atual, !!atual.watched);
                    showToast(atual.watched ? 'Episódio marcado como não visto' : 'Episódio marcado como visto');
                });
                card.querySelector('.cu-ep-acoes')?.prepend(btn);
            }
            btn.title = v.watched ? 'Marcar como não visto' : 'Marcar como visto';

            const alvo = card.querySelector('.cu-ep-acoes');
            if (alvo && btn.parentElement !== alvo) alvo.prepend(btn);
        });
    }

    // Avaliar o episódio: leva à página daquele episódio no Trakt. Não mostra
    // nota (não temos como lê-la) — é só o caminho de ida.
    function syncNotasEpisodios() {
        const cards = document.querySelectorAll('.disney-episode-card');
        if (!cards.length) return;
        const t = window.__cu.trakt;
        if (!t) return;

        const path = (window.location.hash || '').split('?')[0].replace(/^#\/?/, '').split('/');
        const imdb = (decodeURIComponent(path[2] || '').match(/tt\d+/) || [])[0];
        if (!imdb) return;

        cards.forEach((card) => {
            const a = card.querySelector('.cu-ep-nota');
            if (!a) return;
            const temporada = parseInt(card.dataset.temporada, 10);
            const episodio = parseInt(card.dataset.episodio, 10);
            if (!Number.isFinite(temporada) || !Number.isFinite(episodio)) { a.style.display = 'none'; return; }

            const url = t.url(lastDd, 'series', imdb, temporada, episodio);
            if (a.href !== url) a.href = url;
            if (a.textContent !== '★') a.textContent = '★';
            a.title = `Avaliar T${temporada}:E${episodio} no Trakt`;

            if (!a.dataset.cuLigado) {
                a.dataset.cuLigado = '1';
                a.addEventListener('click', (e) => {
                    // O card inteiro é clicável e abre as fontes; o clique aqui
                    // não pode disparar isso junto.
                    e.stopPropagation();
                    e.preventDefault();
                    abreFora(a.getAttribute('href'));
                });
            }
        });
    }

    // Gancho de inspeção: dá acesso ao mesmo objeto de detalhes que os runners
    // usam, sem ter que redescobri-lo pela árvore de fibers.
    window.__cu.debug = Object.assign(window.__cu.debug || {}, { detalhes: () => lastDd });

    window.__cu.register(syncEpisodiosVistos);
    window.__cu.register(syncNotasEpisodios);
    window.__cu.register(syncDuracoes);
    window.__cu.register(handleDetailsPage);
    window.__cu.register(syncStreamsRunner);
    window.__cu.register(syncRateButton);
})();
