/* -------- 15-precarrega.js --------
   Uma descida e volta ao topo, uma única vez por abertura do app.

   O Início monta as fileiras conforme você rola: até chegar perto delas, elas
   não existem. Isso atrapalhava as telas de serviço, que dependem de haver uma
   fileira nativa montada para servir de molde, e fazia a página parecer
   incompleta nos primeiros segundos.

   A ideia é sua: descer até o fim e voltar ao topo assim que o app abre. As
   descidas são instantâneas — é trabalho de bastidor, e cada parada dá ao app
   a chance de montar o que faltava. A SUBIDA é animada, em meio
   segundo: é a única parte que você vê, e um corte seco ali faria a página
   parecer que piscou.

   Uma vez por ABERTURA, não por visita ao Início: o marcador vive em
   `sessionStorage`, que morre junto com a janela. Repetir isso a cada volta ao
   Início seria dar um tranco na tela sem motivo. */

(function () {
    const MARCA = 'cu:precarregado';
    try { if (sessionStorage.getItem(MARCA)) return; } catch (_) { /* segue */ }

    const PARADAS = 6;          // descidas até o fim
    const INTERVALO = 260;      // ms entre elas — tempo de o app montar a fileira
    const SUBIDA = 500;         // ms da volta ao topo

    let rodando = false;

    function conteudo() {
        return document.querySelector('[class*="board-content"]:not([class*="container"])');
    }

    function percorre() {
        const c = conteudo();
        if (!c) return;

        rodando = true;
        try { sessionStorage.setItem(MARCA, '1'); } catch (_) { /* ignore */ }

        let passo = 0;
        const descer = () => {
            const alvo = conteudo();
            if (!alvo) { rodando = false; return; }

            if (passo < PARADAS) {
                alvo.scrollTop = alvo.scrollHeight;
                passo += 1;
                setTimeout(descer, INTERVALO);
                return;
            }
            sobe(alvo);
        };
        descer();
    }

    // Volta ao topo em ~1s. Feito à mão em vez de `scroll-behavior: smooth`
    // porque ali a duração é decidida pelo navegador — e o que se quer aqui é
    // um tempo específico, longo o bastante para ler como movimento.
    function sobe(alvo) {
        const inicio = alvo.scrollTop;
        if (inicio <= 0) { rodando = false; return; }

        const t0 = performance.now();
        // Saída suave: parte rápido e freia perto do topo.
        const curva = (t) => 1 - Math.pow(1 - t, 3);

        const passo = (agora) => {
            const t = Math.min(1, (agora - t0) / SUBIDA);
            alvo.scrollTop = inicio * (1 - curva(t));
            if (t < 1) requestAnimationFrame(passo);
            else { alvo.scrollTop = 0; rodando = false; }
        };
        requestAnimationFrame(passo);
    }

    window.__cu.register(function () {
        if (rodando) return;
        try { if (sessionStorage.getItem(MARCA)) return; } catch (_) { /* segue */ }
        if (window.__cu.utils.currentRoute()) return;          // só no Início

        // Espera haver o que rolar: antes disso não há fileira para montar.
        const c = conteudo();
        if (!c || c.scrollHeight - c.clientHeight < 200) return;
        percorre();
    });
})();
