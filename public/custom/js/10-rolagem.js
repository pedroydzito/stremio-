/* -------- 10-rolagem.js --------
   Rolagem mais macia com a roda do mouse.

   O sistema entrega a roda em degraus fixos e grandes: cada clique da roda é um
   salto seco, e é por isso que a página parece dura. O trackpad é outra
   história — o macOS já manda dezenas de eventos pequenos com inércia própria,
   e mexer nisso só pioraria.

   Então a suavização é seletiva: entra apenas quando o evento tem cara de roda
   de mouse (degrau grande, ou o navegador dizendo que a unidade é "linha") e
   sai da frente em qualquer outro caso.

   Para desligar: localStorage.setItem('cu:rolagemSuave', '0') e reabrir. */

(function () {
    try { if (localStorage.getItem('cu:rolagemSuave') === '0') return; } catch (_) { /* segue */ }

    const DURACAO = 380;        // ms até assentar
    const DEGRAU_MINIMO = 45;   // abaixo disso é trackpad: não encostar

    const animacoes = new WeakMap();

    // Curva de saída: rápido no começo, freando no fim.
    const suavizar = (t) => 1 - Math.pow(1 - t, 3);

    function rolavel(no) {
        while (no && no !== document.body && no !== document.documentElement) {
            if (no.nodeType === 1) {
                const cs = getComputedStyle(no);
                const podeY = /(auto|scroll|overlay)/.test(cs.overflowY);
                if (podeY && no.scrollHeight - no.clientHeight > 2) return no;
            }
            no = no.parentElement;
        }
        const doc = document.scrollingElement || document.documentElement;
        return (doc.scrollHeight - doc.clientHeight > 2) ? doc : null;
    }

    function anima(alvo, destino) {
        const anterior = animacoes.get(alvo);
        if (anterior) cancelAnimationFrame(anterior.id);

        const inicio = alvo.scrollTop;
        const distancia = destino - inicio;
        if (!distancia) return;

        const t0 = performance.now();
        const passo = (agora) => {
            const t = Math.min(1, (agora - t0) / DURACAO);
            alvo.scrollTop = inicio + distancia * suavizar(t);
            if (t < 1) {
                animacoes.set(alvo, { id: requestAnimationFrame(passo), destino });
            } else {
                animacoes.delete(alvo);
            }
        };
        animacoes.set(alvo, { id: requestAnimationFrame(passo), destino });
    }

    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;      // zoom, atalhos
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;           // rolagem lateral

        // deltaMode 1 = o navegador conta em LINHAS, o que só acontece com roda.
        const ehRoda = e.deltaMode === 1 || Math.abs(e.deltaY) >= DEGRAU_MINIMO;
        if (!ehRoda) return;                                            // trackpad: passa direto

        const alvo = rolavel(e.target);
        if (!alvo) return;

        const limite = alvo.scrollHeight - alvo.clientHeight;
        const atual = animacoes.get(alvo);
        // Girar de novo antes de assentar soma ao destino em vez de recomeçar —
        // é o que faz dois cliques seguidos andarem o dobro, como se espera.
        const base = atual ? atual.destino : alvo.scrollTop;
        const passo = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        const destino = Math.max(0, Math.min(limite, base + passo));

        // Já no fim: deixa o navegador cuidar (e não engolir o gesto).
        if (destino === alvo.scrollTop) return;

        e.preventDefault();
        anima(alvo, destino);
    }, { passive: false });
})();
