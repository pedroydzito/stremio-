/* -------- 11-rolagem-flutuante.js --------
   Barra de rolagem flutuante no Painel.

   A barra nativa reserva 10px de largura, e era por isso que o destaque de
   ponta a ponta parava antes da borda. Tentei duas saídas antes desta:
   `overflow: overlay` (o WebKit desta versão ignora e cai em `auto`) e esticar
   o destaque por baixo dela (a caixa chegava à borda, mas `overflow-x: hidden`
   recortava a pintura em 1247 — verificado com teste de acerto).

   O que sobra é o caminho direto: esconder a nativa, que devolve os 10px ao
   conteúdo, e desenhar uma no lugar. Ela flutua por cima, aparece ao rolar e
   some sozinha — e continua arrastável, senão seria só um enfeite.

   Vale só para o contêiner do Painel. As outras telas seguem com a barra
   nativa: ali ela não atrapalha nada. */

(function () {
    const SUMIR_APOS = 900;   // ms de quietude até desaparecer

    let alvo = null;          // contêiner que rola
    let trilho = null;
    let polegar = null;
    let sumir = null;
    let arrastando = null;

    function cria(cont) {
        trilho = document.createElement('div');
        trilho.className = 'cu-rolagem-trilho';
        polegar = document.createElement('div');
        polegar.className = 'cu-rolagem-polegar';
        trilho.appendChild(polegar);
        // Vai no pai posicionado, não dentro do contêiner que rola: dentro,
        // ela rolaria junto com o conteúdo.
        (cont.parentElement || document.body).appendChild(trilho);

        polegar.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const b = polegar.getBoundingClientRect();
            arrastando = { deslocamento: e.clientY - b.top };
            polegar.setPointerCapture(e.pointerId);
            trilho.classList.add('visivel', 'arrastando');
        });
        polegar.addEventListener('pointermove', (e) => {
            if (!arrastando || !alvo) return;
            const t = trilho.getBoundingClientRect();
            const altura = polegar.offsetHeight;
            const y = Math.max(0, Math.min(t.height - altura, e.clientY - t.top - arrastando.deslocamento));
            const proporcao = y / Math.max(1, t.height - altura);
            alvo.scrollTop = proporcao * (alvo.scrollHeight - alvo.clientHeight);
        });
        const soltar = (e) => {
            if (!arrastando) return;
            arrastando = null;
            try { polegar.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            trilho.classList.remove('arrastando');
            agendaSumir();
        };
        polegar.addEventListener('pointerup', soltar);
        polegar.addEventListener('pointercancel', soltar);
    }

    function agendaSumir() {
        clearTimeout(sumir);
        sumir = setTimeout(() => {
            if (!arrastando && trilho) trilho.classList.remove('visivel');
        }, SUMIR_APOS);
    }

    function desenha() {
        if (!alvo || !trilho) return;
        const total = alvo.scrollHeight;
        const visivel = alvo.clientHeight;
        if (total - visivel < 2) { trilho.style.display = 'none'; return; }
        trilho.style.display = '';

        const t = trilho.getBoundingClientRect();
        // Um mínimo de 28px: proporcional puro vira um traço invisível em
        // páginas longas.
        const altura = Math.max(28, Math.round((visivel / total) * t.height));
        const andar = (alvo.scrollTop / (total - visivel)) * (t.height - altura);
        polegar.style.height = altura + 'px';
        polegar.style.transform = 'translateY(' + Math.round(andar) + 'px)';
    }

    function aoRolar() {
        if (trilho) trilho.classList.add('visivel');
        desenha();
        agendaSumir();
    }

    function sync() {
        const noPainel = !window.__cu.utils.currentRoute();
        const cont = noPainel
            ? document.querySelector('[class*="board-content"]:not([class*="container"])')
            : null;

        if (!cont) {
            if (trilho) { trilho.remove(); trilho = null; polegar = null; }
            if (alvo) { alvo.removeEventListener('scroll', aoRolar); alvo.classList.remove('cu-sem-barra'); alvo = null; }
            return;
        }
        if (cont === alvo) { desenha(); return; }

        if (alvo) { alvo.removeEventListener('scroll', aoRolar); alvo.classList.remove('cu-sem-barra'); }
        if (trilho) { trilho.remove(); }
        alvo = cont;
        alvo.classList.add('cu-sem-barra');
        alvo.addEventListener('scroll', aoRolar, { passive: true });
        cria(alvo);
        desenha();
    }

    window.__cu.register(sync);
    window.addEventListener('resize', desenha);
})();
