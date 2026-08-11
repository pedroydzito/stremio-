/* -------- 07-biblioteca.js --------
   Selo de "está na biblioteca" nos cards, ao lado do selo de assistido.

   O Stremio já desenha o olho de assistido no canto superior esquerdo do
   pôster, mas não diz nada sobre a biblioteca — e como a biblioteca aqui é
   usada como lista de "quero ver", saber disso de relance importa mais que o
   assistido.

   De onde vem: a MESMA API que o app usa (api.strem.io/datastoreGet), com a
   chave de sessão do próprio perfil. O localStorage['library'] parecia o
   caminho óbvio, mas guarda só um punhado de itens recentes — medido: 11 de
   211 —, então o selo aparecia em quase nenhum card. A lista completa é
   buscada uma vez e reaproveitada; o localStorage entra como reforço, para
   refletir na hora o que você acabou de adicionar ou remover.

   Posição: se o card também tem o olho de assistido, o selo de biblioteca vai
   ao LADO dele; se não tem, ocupa o lugar do canto. */

(function () {
    const LIVRO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
        + 'stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4z"/>'
        + '<path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H15a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20z"/></svg>';

    let doServidor = new Set();
    let naBiblioteca = new Set();
    let assinatura = '';

    // `temp` é o item que o app cria só para guardar progresso de algo que você
    // assistiu sem adicionar — não conta como estar na biblioteca.
    const contaComoBiblioteca = (it) => !!it && !it.removed && !it.temp;

    function recombina(locais) {
        const novo = new Set(doServidor);
        // O local manda sobre o servidor: é o mais recente.
        Object.keys(locais).forEach((id) => {
            if (contaComoBiblioteca(locais[id])) novo.add(id);
            else novo.delete(id);
        });
        naBiblioteca = novo;
    }

    let locaisAtuais = {};

    function releLocal() {
        let bruto;
        try { bruto = localStorage.getItem('library') || ''; } catch (_) { return; }
        if (bruto === assinatura) return;              // nada mudou: não refaz o Set
        assinatura = bruto;
        try {
            locaisAtuais = (JSON.parse(bruto || '{}') || {}).items || {};
            recombina(locaisAtuais);
        } catch (_) { /* mantém o anterior */ }
    }

    async function buscaDoServidor() {
        let chave;
        try { chave = (JSON.parse(localStorage.getItem('profile') || '{}').auth || {}).key; }
        catch (_) { return; }
        if (!chave) return;
        try {
            const r = await fetch('https://api.strem.io/api/datastoreGet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authKey: chave, collection: 'libraryItem', all: true }),
            });
            const j = await r.json();
            const novo = new Set();
            (j.result || []).forEach((it) => { if (contaComoBiblioteca(it)) novo.add(it._id); });
            doServidor = novo;
            recombina(locaisAtuais);
        } catch (_) { /* offline: fica com o que o localStorage souber */ }
    }

    const idDoCard = (el) => {
        const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '';
        const m = /tt\d+/.exec(decodeURIComponent(href));
        if (m) return m[0];
        const img = el.querySelector('img[class*="poster-image"]');
        const m2 = img ? /tt\d+/.exec(img.dataset.origPoster || img.src || '') : null;
        return m2 ? m2[0] : null;
    };

    function syncSelos() {
        releLocal();
        document.querySelectorAll('[class*="meta-item-container"]').forEach((card) => {
            const pc = card.querySelector('[class*="poster-container"]');
            if (!pc) return;

            // "Continuar assistindo" fica de fora, como os demais selos: aquela
            // fileira é sobre retomar, não sobre catalogar.
            if (card.closest('.custom-continue-watching-row')) {
                pc.querySelector('.cu-lib-selo')?.remove();
                return;
            }

            const id = idDoCard(card);
            let selo = pc.querySelector('.cu-lib-selo');

            if (!id || !naBiblioteca.has(id)) { if (selo) selo.remove(); return; }

            if (!selo) {
                selo = document.createElement('div');
                selo.className = 'cu-lib-selo';
                selo.innerHTML = LIVRO;
                selo.title = 'Na sua biblioteca';
                pc.appendChild(selo);
            }
            // Ao lado do olho quando ele existe; no lugar dele quando não.
            const temVisto = !!pc.querySelector('[class*="watched-icon-layer"]');
            selo.classList.toggle('cu-ao-lado', temVisto);
        });
    }

    window.__cu.register(syncSelos);
    buscaDoServidor();
    setInterval(buscaDoServidor, 5 * 60 * 1000);
})();
