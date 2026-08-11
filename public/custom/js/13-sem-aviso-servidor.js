/* -------- 13-sem-aviso-servidor.js --------
   Some com o aviso "Using streaming server at http://127.0.0.1:11470".

   De onde ele vem: o app é aberto com o endereço do servidor no PRÓPRIO
   endereço da página —

       #/?streamingServerUrl=http%3A%2F%2F127.0.0.1%3A11470

   — e o Stremio mostra o aviso toda vez que lê esse parâmetro. Como ele fica
   grudado na rota inicial, voltar para a home relê o parâmetro e o aviso
   aparece de novo. Era por isso que só acontecia ao VOLTAR, nunca ao navegar
   para frente.

   A correção é na raiz: assim que o endereço já estiver guardado nas
   preferências (prova de que o app o aplicou), o parâmetro sai da barra de
   endereço com `replaceState` — sem navegar, sem recarregar e sem mexer na
   configuração do servidor.

   O `replaceState` não dispara `hashchange`, então nada no app é notificado:
   para ele, a rota continua sendo a mesma. */

(function () {
    function jaAplicado() {
        try {
            const guardado = localStorage.getItem('streaming_server_urls');
            return !!guardado && /11470|streamingServerUrl/i.test(guardado + localStorage.getItem('profile'));
        } catch (_) { return false; }
    }

    function limpa() {
        const hash = window.location.hash || '';
        if (!/streamingServerUrl=/i.test(hash)) return;
        if (!jaAplicado()) return;                 // ainda não aplicou: não tirar

        const limpo = hash.split('?')[0] || '#/';
        try {
            history.replaceState(history.state, '', window.location.pathname + window.location.search + limpo);
        } catch (_) { /* ignore */ }
    }

    // Também esconde o aviso caso ele já esteja na tela quando limpamos o
    // endereço — o parâmetro sai, mas o que já apareceu continua lá.
    function escondeAviso() {
        document.querySelectorAll('[class*="toast"], [class*="notification"]').forEach((el) => {
            const txt = (el.textContent || '');
            if (/streaming server at/i.test(txt) || /servidor de streaming em/i.test(txt)) {
                el.style.setProperty('display', 'none', 'important');
            }
        });
    }

    window.__cu.register(function () {
        limpa();
        escondeAviso();
    });
})();
