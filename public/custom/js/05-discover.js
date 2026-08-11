/* -------- 05-discover.js --------
   Painel de preview da tela Explorar: "Ver detalhes" + os mesmos botões de
   avaliar, biblioteca e assistido da tela de detalhes.

   O painel expõe nas próprias props do React `inLibrary`, `watched`,
   `toggleInLibrary` e `toggleWatched` — então as ações chamam essas funções
   direto, em vez de simular clique em botão nativo. Isso também dá o ESTADO,
   que é o que faltava: os ícones agora alternam (mais/menos, olho/olho cortado)
   e as mensagens são as mesmas da tela de detalhes. */

(function () {
    const { getReactFiber, findFiberProps } = window.__cu.utils;

    const ICONS = {
        detalhes: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
        estrela: '<svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
        mais: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
        olho: '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
        menos: '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>',
        olhoCortado: '<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>',
    };

    // O item selecionado não está na URL — o tipo e o id do IMDb saem do próprio
    // deep link do painel (ex.: #/detail/movie/tt10872600/tt10872600).
    //
    // O endereço vem do MESMO construtor usado na tela de detalhes (06-trakt.js),
    // para não existirem duas regras de slug que precisem ser corrigidas em
    // dobro — era o que estava acontecendo: esta tela tinha ficado no Letterboxd.
    function rateTarget(href, props) {
        const path = (href || '').replace(/^#\/?/, '').split('/');
        const type = path[1];
        const imdb = (decodeURIComponent(path[2] || '').match(/tt\d+/) || [])[0];
        const t = window.__cu.trakt;
        if (!t || (type !== 'movie' && type !== 'series')) return null;
        const nome = props?.name || props?.metaItem?.name || '';
        if (!nome && !imdb) return null;
        return {
            url: t.url({ name: nome, releaseInfo: props?.releaseInfo || props?.metaItem?.releaseInfo, released: props?.released }, type, imdb),
            label: 'Avaliar no Trakt',
        };
    }

    // Abrir no navegador do sistema: `target="_blank"` não funciona nesta shell
    // (window.open devolve null), então o pedido vai para o /abrir. Servida pela
    // nuvem, essa rota não existe — o link então vai para a área de
    // transferência. Mesmo comportamento do botão da tela de detalhes.
    function abreFora(url) {
        if (!url) return;
        fetch('/abrir?url=' + encodeURIComponent(url))
            .then((r) => { if (!r.ok) throw new Error(String(r.status)); })
            .catch(() => navigator.clipboard.writeText(url)
                .then(() => window.__cu.showToast && window.__cu.showToast('Link copiado — cole no navegador'))
                .catch(() => {}));
    }

    function syncPanelActions() {
        const panel = document.querySelector('[class*="meta-preview-container"]');
        if (!panel) return;
        const info = panel.querySelector('[class*="meta-info-container"]');
        if (!info) return;

        const fiber = getReactFiber(panel);
        const props = fiber ? findFiberProps(fiber, (p) => p.toggleInLibrary || p.deepLinks || p.metaItem) : null;
        const dl = props?.deepLinks || props?.metaItem?.deepLinks;
        const href = dl?.metaDetailsVideos || dl?.metaDetailsStreams || null;
        const name = props?.name || props?.metaItem?.name || '';

        let row = info.querySelector('.cu-panel-actions');
        if (!href) { if (row) row.remove(); return; }

        if (!row) {
            row = document.createElement('div');
            row.className = 'cu-panel-actions';

            const detalhes = document.createElement('a');
            detalhes.className = 'cu-details-btn';
            detalhes.innerHTML = ICONS.detalhes + '<span>Ver detalhes</span>';
            row.appendChild(detalhes);

            const avaliar = document.createElement('a');
            avaliar.className = 'disney-action-btn cu-panel-rate';
            avaliar.rel = 'noopener noreferrer';
            avaliar.addEventListener('click', (e) => {
                e.preventDefault();
                abreFora(avaliar.getAttribute('href'));
            });
            avaliar.innerHTML = ICONS.estrela;
            row.appendChild(avaliar);

            const lib = document.createElement('button');
            lib.type = 'button';
            lib.className = 'disney-action-btn';
            lib.title = 'Adicionar à Biblioteca';
            lib.innerHTML = ICONS.mais;
            lib.addEventListener('click', () => {
                const cur = row.__props || {};
                if (typeof cur.toggleInLibrary === 'function') {
                    cur.toggleInLibrary();
                    window.__cu.showToast(cur.inLibrary ? 'Removido da Biblioteca' : 'Adicionado à Biblioteca');
                } else {
                    const ok = window.__cu.triggerNativeAction(panel, 'library');
                    window.__cu.showToast(ok ? 'Biblioteca atualizada' : 'Não foi possível alterar a biblioteca');
                }
            });
            row.appendChild(lib);

            const visto = document.createElement('button');
            visto.type = 'button';
            visto.className = 'disney-action-btn';
            visto.title = 'Marcar como Assistido';
            visto.innerHTML = ICONS.olho;
            visto.addEventListener('click', () => {
                const cur = row.__props || {};
                if (typeof cur.toggleWatched === 'function') {
                    cur.toggleWatched();
                    window.__cu.showToast(cur.watched ? 'Marcado como Não Assistido' : 'Marcado como Assistido');
                } else {
                    const ok = window.__cu.triggerNativeAction(panel, 'watched');
                    window.__cu.showToast(ok ? 'Status atualizado' : 'Não foi possível alterar o status');
                }
            });
            row.appendChild(visto);

            info.appendChild(row);
        }

        // Props sempre frescas: os handlers leem daqui em vez de capturar o
        // valor do momento em que o botão foi criado.
        row.__props = props || {};

        // Ícones e rótulos refletindo o estado, como na tela de detalhes
        const btns = row.querySelectorAll('.disney-action-btn');
        const libBtn = btns[1], vistoBtn = btns[2];
        if (libBtn) {
            const dentro = !!props?.inLibrary;
            const html = dentro ? ICONS.menos : ICONS.mais;
            if (libBtn.innerHTML !== html) libBtn.innerHTML = html;
            libBtn.title = dentro ? 'Remover da Biblioteca' : 'Adicionar à Biblioteca';
        }
        if (vistoBtn) {
            const visto = !!props?.watched;
            const html = visto ? ICONS.olhoCortado : ICONS.olho;
            if (vistoBtn.innerHTML !== html) vistoBtn.innerHTML = html;
            vistoBtn.title = visto ? 'Marcar como Não Assistido' : 'Marcar como Assistido';
        }

        const det = row.querySelector('.cu-details-btn');
        if (det.getAttribute('href') !== href) det.setAttribute('href', href);

        const rate = rateTarget(href, props);
        const rateBtn = row.querySelector('.cu-panel-rate');
        if (!rate) { rateBtn.style.display = 'none'; }
        else {
            rateBtn.style.display = '';
            if (rateBtn.href !== rate.url) rateBtn.href = rate.url;
            rateBtn.title = rate.label;
        }
    }

    // ---- série: contagem de episódios no lugar da duração ----------------
    //
    // Mesmo raciocínio da tela de detalhes: a "duração" de uma série é a de um
    // episódio médio, que não descreve a obra. Aqui o painel do Explorar não
    // traz os vídeos junto, então o número vem do Cinemeta (que responde com
    // Access-Control-Allow-Origin: *), com cache — um pedido por série, uma vez.
    const CHAVE_EPS = 'cu:epsPorSerie';
    let epsCache = {};
    try { epsCache = JSON.parse(localStorage.getItem(CHAVE_EPS) || '{}'); } catch (_) { /* ignore */ }
    const epsPedidos = new Set();

    function episodiosDe(imdb) {
        if (imdb in epsCache) return epsCache[imdb];
        if (epsPedidos.has(imdb)) return undefined;
        epsPedidos.add(imdb);
        fetch('https://v3-cinemeta.strem.io/meta/series/' + imdb + '.json')
            .then((r) => r.json())
            .then((j) => {
                const agora = Date.now();
                const n = (j.meta?.videos || []).filter((v) =>
                    (v.season || 0) > 0 && (!v.released || new Date(v.released).getTime() <= agora)
                ).length;
                epsCache[imdb] = n || null;
                try { localStorage.setItem(CHAVE_EPS, JSON.stringify(epsCache)); } catch (_) { /* ignore */ }
            })
            .catch(() => { epsCache[imdb] = null; });
        return undefined;
    }

    function syncContagemEpisodios() {
        const painel = document.querySelector('[class*="meta-preview-container"]');
        if (!painel) return;
        const rot = painel.querySelector('[class*="runtime-label"]');
        if (!rot) return;

        const link = painel.querySelector('a[href*="/detail/"], a[href*="/metadetails/"]')
            || document.querySelector('[class*="meta-item-container"].selected a');
        const href = link ? (link.getAttribute('href') || '') : '';
        const ehSerie = /\/(detail|metadetails)\/series\//.test(decodeURIComponent(href));
        if (!ehSerie) return;

        const imdb = (decodeURIComponent(href).match(/tt\d+/) || [])[0];
        if (!imdb) return;

        const n = episodiosDe(imdb);
        if (!n) return;
        const novo = n + (n === 1 ? ' episódio' : ' episódios');
        if (rot.textContent.trim() !== novo) rot.textContent = novo;
    }

    window.__cu.register(syncPanelActions);
    window.__cu.register(syncContagemEpisodios);
})();
