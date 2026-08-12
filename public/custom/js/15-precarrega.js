/* -------- 15-precarrega.js --------
   Uma descida e volta ao topo, uma única vez por abertura do app.

   O Início monta as fileiras conforme você rola: até chegar perto delas, elas
   não existem. Isso atrapalhava as telas de serviço, que dependem de haver uma
   fileira nativa montada para servir de molde, e fazia a página parecer
   incompleta nos primeiros segundos.

   A ideia é sua: descer até o fim e voltar ao topo assim que o app abre. As
   descidas são instantâneas — é trabalho de bastidor, e cada parada dá ao app
   a chance de montar o que faltava. A SUBIDA é animada, em meio segundo: é a
   única parte que você vê, e um corte seco ali faria a página parecer que
   piscou.

   E uma cortina na cor do fundo cobre a tela durante as descidas, sumindo em
   meio segundo junto com a subida — também sugestão sua. Sem ela, o que se via
   no primeiro instante era o RODAPÉ da página, o que dá a impressão de o app
   ter aberto no lugar errado.

   Uma vez por ABERTURA, não por visita ao Início: o marcador vive em
   `sessionStorage`, que morre junto com a janela. Repetir isso a cada volta ao
   Início seria dar um tranco na tela sem motivo. */

(function () {
    const MARCA = 'cu:precarregado';
    try { if (sessionStorage.getItem(MARCA)) return; } catch (_) { /* segue */ }

    const PARADAS = 6;          // descidas até o fim
    const INTERVALO = 260;      // ms entre elas — tempo de o app montar a fileira
    const SUBIDA = 500;         // ms da volta ao topo
    const SEGURANCA = 8000;     // ms até a cortina sair de qualquer jeito

    let rodando = false;
    let cortina = null;

    // A cortina nasce no primeiro quadro em que há o que rolar, ANTES da
    // primeira descida — se nascesse depois, o rodapé apareceria por um
    // instante, que é justamente o que ela existe para evitar.
    function abreCortina() {
        if (cortina) return;
        cortina = document.createElement('div');
        cortina.className = 'cu-cortina';
        document.body.appendChild(cortina);
        // Rede lenta, erro no meio do caminho, qualquer imprevisto: a cortina
        // não pode ficar tapando o app para sempre.
        setTimeout(fechaCortina, SEGURANCA);
    }

    function fechaCortina() {
        if (!cortina) return;
        const alvo = cortina;
        cortina = null;
        alvo.classList.add('cu-cortina-saindo');
        setTimeout(() => alvo.remove(), SUBIDA + 120);
    }

    function conteudo() {
        return document.querySelector('[class*="board-content"]:not([class*="container"])');
    }

    function percorre() {
        const c = conteudo();
        if (!c) return;

        rodando = true;
        abreCortina();
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
        // A cortina sai JUNTO com a subida: as duas coisas levam o mesmo tempo,
        // então o conteúdo se revela já em movimento em vez de aparecer parado.
        fechaCortina();

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
