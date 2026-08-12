/* -------- 15-precarrega.js --------
   Uma descida e volta ao topo, uma única vez por abertura do app.

   O Início monta as fileiras conforme você rola: até chegar perto delas, elas
   não existem. Isso atrapalhava as telas de serviço, que dependem de haver uma
   fileira nativa montada para servir de molde, e fazia a página parecer
   incompleta nos primeiros segundos.

   A ideia é sua: descer até o fim e voltar ao topo assim que o app abre. O
   trajeto acontece em um punhado de quadros, cada parada dando ao app a chance
   de montar o que faltava. Ao terminar, a página volta exatamente para onde
   estava — o topo — e ninguém vê o percurso.

   Uma vez por ABERTURA, não por visita ao Início: o marcador vive em
   `sessionStorage`, que morre junto com a janela. Repetir isso a cada volta ao
   Início seria dar um tranco na tela sem motivo. */

(function () {
    const MARCA = 'cu:precarregado';
    try { if (sessionStorage.getItem(MARCA)) return; } catch (_) { /* segue */ }

    const PARADAS = 6;          // descidas até o fim
    const INTERVALO = 260;      // ms entre elas — tempo de o app montar a fileira

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
            // De volta ao topo sem rolagem suave: o percurso é trabalho de
            // bastidor, e animá-lo seria mostrar justamente o que não interessa.
            const suave = alvo.style.scrollBehavior;
            alvo.style.scrollBehavior = 'auto';
            alvo.scrollTop = 0;
            requestAnimationFrame(() => { alvo.style.scrollBehavior = suave; });
            rodando = false;
        };
        descer();
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
