/* -------- 02-navbar.js --------
   Clones the vertical-nav tabs into a centered container on the horizontal
   nav bar. Cache is persisted in sessionStorage so the tabs survive every
   route change (including direct-loading the Settings page).
   A MutationObserver fires syncTabs the instant React mounts a new nav bar,
   so the user never sees the "tabs disappear then return" flash. */

(function () {
    const { getReactFiber: _gf, findFiberProps: _ff, routeFromHref, currentRoute } = window.__cu.utils;

    // O Stremio desenha a casa do Painel preenchida, enquanto todos os outros
    // ícones da barra são vazados — ela puxava o olho sem motivo. Esta é a
    // única substituída; as demais vêm do próprio app.
    const CASA_VAZADA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M3.6 10.4 12 3.6l8.4 6.8"/>'
        + '<path d="M5.7 9.5V19a1.6 1.6 0 0 0 1.6 1.6h9.4a1.6 1.6 0 0 0 1.6-1.6V9.5"/></svg>';

    let cachedTabs = [];
    try {
        const saved = sessionStorage.getItem('stremio:cachedTabs');
        if (saved) cachedTabs = JSON.parse(saved);
    } catch (_) { /* ignore */ }

    function buildTabsInto(tabsContainer) {
        tabsContainer.innerHTML = '';
        cachedTabs.forEach((tab) => {
            const tabItem = document.createElement('a');
            tabItem.className = 'custom-tab-item';
            tabItem.href = tab.href;
            tabItem.dataset.route = tab.route;
            if (tab.label) tabItem.title = tab.label; // tooltip when icon-only
            if (tab.iconHTML) {
                const wrap = document.createElement('span');
                // A rota do Painel é a vazia: o href dele é "#/", então
                // routeFromHref devolve ''. Comparar com 'board' nunca casava.
                wrap.innerHTML = (tab.route === '' || tab.route === 'board') ? CASA_VAZADA : tab.iconHTML;
                const svg = wrap.querySelector('svg');
                if (svg) {
                    svg.setAttribute('class', 'tab-icon');
                    tabItem.appendChild(svg);
                }
            }
            if (tab.label) {
                const labelSpan = document.createElement('span');
                labelSpan.className = 'tab-label';
                // "Painel" descreve um lugar do app; "Início" descreve o que o
                // botão faz. Só o rótulo muda — a rota segue sendo a mesma.
                labelSpan.textContent = /^(painel|board)$/i.test(tab.label.trim()) ? 'Início' : tab.label;
                tabItem.appendChild(labelSpan);
            }
            tabsContainer.appendChild(tabItem);
        });
    }

    function syncTabs() {
        // Refresh cache whenever the vertical nav is reachable
        const verticalBar = document.querySelector(
            '[class*="vertical-nav-bar-container"] nav, [class*="vertical-nav-bar"] nav, nav[class*="vertical-nav-bar"]'
        );
        if (verticalBar) {
            const verticalTabs = Array.from(verticalBar.querySelectorAll('a'));
            if (verticalTabs.length > 0) {
                cachedTabs = verticalTabs.map((vTab) => {
                    const labelEl = vTab.querySelector('[class*="label"], span');
                    const svgEl = vTab.querySelector('svg');
                    return {
                        href: vTab.href || '#',
                        label: labelEl ? labelEl.textContent.trim() : '',
                        iconHTML: svgEl ? svgEl.outerHTML : '',
                        route: routeFromHref(vTab.getAttribute('href') || vTab.href || ''),
                    };
                });
                try { sessionStorage.setItem('stremio:cachedTabs', JSON.stringify(cachedTabs)); }
                catch (_) { /* ignore */ }
            }
        }
        if (cachedTabs.length === 0) return;

        const horizontalBars = document.querySelectorAll('[class*="horizontal-nav-bar-container"]');
        const route = currentRoute();
        horizontalBars.forEach((horizontalBar) => {
            let tabsContainer = horizontalBar.querySelector('.custom-tabs-container');
            if (!tabsContainer) {
                tabsContainer = document.createElement('div');
                tabsContainer.className = 'custom-tabs-container';
                horizontalBar.appendChild(tabsContainer);
            }
            if (tabsContainer.querySelectorAll('.custom-tab-item').length !== cachedTabs.length) {
                buildTabsInto(tabsContainer);
            }
            tabsContainer.querySelectorAll('.custom-tab-item').forEach((el) => {
                // `el.dataset.route && …` nunca era verdade para o Painel: a
                // rota dele é a string vazia, que é falsy. A aba ficava cinza
                // mesmo estando aberta.
                if ((el.dataset.route || '') === (route || '')) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            });
        });
    }

    // Set body.route-<name> + html.route-<name> so CSS can scope route-specific
    // rules (html is needed because <html> has its own bg color rule).
    // Só age quando a rota MUDA. Antes reescrevia as classes de <html> e <body>
    // a cada 400ms — medido, era 3,6ms dos ~7ms de custo total do laço, metade
    // do trabalho para não mudar nada em 99% das voltas.
    let rotaAplicada = null;
    function syncRouteClass(forcar) {
        const route = currentRoute();
        if (!forcar && route === rotaAplicada) return;
        rotaAplicada = route;
        [document.body, document.documentElement].forEach((el) => {
            // Classe genérica route-<nome> pra qualquer rota (route-calendar,
            // route-discover, route-addons…), pra o CSS poder se limitar a uma
            // tela sem depender de seletores genéricos demais.
            Array.from(el.classList)
                .filter((c) => c.startsWith('route-'))
                .forEach((c) => el.classList.remove(c));
            // O Painel tem rota vazia, então nunca ganhava classe nenhuma — e
            // sem ela o CSS não conseguia agir na tela dele no MESMO quadro da
            // navegação. `route-board` é o nome que faltava.
            el.classList.add(route ? 'route-' + route : 'route-board');

            // Aliases já usados pelos módulos existentes
            el.classList.toggle('route-player', route === 'player');
            // idem: a rota já se chamou 'detail' e hoje é 'metadetails'
            el.classList.toggle('route-metadetails', route === 'metadetails' || route === 'detail');
        });
    }

    // Hide the fullscreen button everywhere except the player. Stremio renders
    // it as a button-container inside the horizontal nav bar; walk the WHOLE
    // nav (not just menu-button siblings) since different routes nest it in
    // different wrappers (nav-right, controls-container, or direct child).
    function hideFullscreenButton() {
        if (currentRoute() === 'player') return;
        const navBars = document.querySelectorAll('[class*="horizontal-nav-bar-container"]');
        navBars.forEach((nav) => {
            nav.querySelectorAll('[class*="button-container"]').forEach((el) => {
                // O popup do menu do usuário é renderizado DENTRO da navbar e
                // cada item dele (Logout, Configurações, Addons, Ajuda) carrega
                // a classe button-container. Sem esta guarda o popup abre só com
                // avatar e e-mail — e como aqui o display:none vai inline com
                // !important, nenhuma regra de CSS consegue trazer de volta.
                if (el.closest('[class*="menu-container"]')) return;

                const cls = el.className || '';
                if (
                    !/menu-button/i.test(cls) &&
                    !/back-button/i.test(cls) &&
                    !/submit-button/i.test(cls) &&
                    !/search/i.test(cls) &&
                    !/icon-container/i.test(cls)
                ) {
                    el.style.setProperty('display', 'none', 'important');
                }
            });
        });
    }

    // A classe de rota precisa entrar no MESMO quadro da navegação. Enquanto
    // dependia só do loop de 400ms, o CSS escopado por rota (calendário,
    // explorar…) chegava atrasado: a tela pintava sem estilo e "consertava"
    // sozinha um instante depois. Um listener de hashchange resolve.
    // O realce da aba também precisa do hashchange. Sem isso ele só era
    // corrigido no laço de 400ms, e ao voltar do Explorar para o Painel a aba
    // "Explorar" seguia acesa por um instante depois de a tela já ter trocado.
    window.addEventListener('hashchange', () => {
        syncRouteClass(true);
        try { syncTabs(); } catch (_) { /* ignore */ }
    });
    syncRouteClass(true);

    window.__cu.register(syncTabs);
    window.__cu.register(syncRouteClass);
    window.__cu.register(hideFullscreenButton);

    // Search toggle: clicking the submit button while the bar is collapsed should
    // re-expand it (focus-within alone can't re-trigger after button already had focus).
    (function initSearchToggle() {
        function isExpanded(bar) {
            return bar.matches(':focus-within') || bar.classList.contains('search-expanded');
        }
        document.addEventListener('mousedown', function onSubmitDown(e) {
            const btn = e.target.closest('[class*="submit-button-container"]');
            const bar = btn && btn.closest('[class*="search-bar-container"]');
            if (!bar) return;
            if (!isExpanded(bar)) {
                e.preventDefault();
                e.stopPropagation();
                bar.classList.add('search-expanded');
                const input = bar.querySelector('input');
                if (input) requestAnimationFrame(() => input.focus());
            }
        }, true);
        // Remove search-expanded when clicking outside the bar
        document.addEventListener('mousedown', function onOutsideDown(e) {
            if (!e.target.closest('[class*="search-bar-container"]')) {
                document.querySelectorAll('[class*="search-bar-container"].search-expanded')
                    .forEach((el) => el.classList.remove('search-expanded'));
            }
        });
        // Also remove on Escape
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('[class*="search-bar-container"].search-expanded')
                    .forEach((el) => el.classList.remove('search-expanded'));
            }
        });
    })();

    // Instant rebuild when React mounts a new nav bar
    function containsNavBar(node) {
        if (!(node instanceof Element)) return false;
        if (node.matches?.('[class*="horizontal-nav-bar-container"]')) return true;
        return !!node.querySelector?.('[class*="horizontal-nav-bar-container"]');
    }
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (containsNavBar(node)) {
                    Promise.resolve().then(() => {
                        try { syncTabs(); } catch (_) {}
                    });
                    return;
                }
            }
        }
    });
    function start() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
            try { syncTabs(); } catch (_) {}
        } else {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        }
    }
    start();
})();
