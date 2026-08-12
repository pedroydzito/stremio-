/* -------- 14-titulos.js --------
   Renomeia as fileiras do Início e esconde as que não interessam.

   Os catálogos chegam nomeados pelos addons, no formato "<Catálogo> - <Tipo>":
   "Populares - Filme", "Em destaque - Série". Fica repetitivo e com o tipo no
   fim, onde ele menos ajuda a varrer a página com os olhos. Aqui vira
   "Filmes populares", "Séries em destaque" — o tipo na frente, que é por onde
   se procura.

   A tradução é por PADRÃO, não por lista fixa de títulos: qualquer catálogo
   novo que chegue no mesmo formato entra sem eu mexer aqui. O que não tiver
   correspondência fica como está, em vez de virar um nome inventado. */

(function () {
    const SUFIXOS = [
        [/^popular(es)?$/i, 'populares'],
        [/^(em destaque|destaque|featured)$/i, 'em destaque'],
        [/^(tend[êe]ncias?|trending)$/i, 'do momento'],
        [/^(ano|year)$/i, 'do ano'],
    ];

    // Fileiras que não acrescentam nada ao Início.
    const REMOVER = /^(idioma|language|[úu]ltimos lan[çc]amentos|latest|novidades)$/i;

    // As coleções (Marvel, DC) chegam como "<Catálogo> - Marvel", com o nome do
    // catálogo em inglês. Aqui o tipo sai — dentro da tela da Marvel, repetir
    // "Marvel" em toda fileira não informa nada — e o catálogo ganha nome em
    // português.
    //
    // Catálogo que eu não tenha traduzido mantém o nome original, só sem o
    // sufixo: é melhor ler "Batman Collection" do que um palpite errado, e o
    // addon pode acrescentar listas a qualquer momento.
    const COLECOES = {
        marvel: {
            'mcu chronologically order': 'UCM em ordem cronológica',
            'mcu release order': 'UCM em ordem de lançamento',
            'x-men': 'X-Men',
            'movies': 'Filmes',
            'series': 'Séries',
            'animations': 'Animações',
        },
        dc: {
            'chronological order': 'Em ordem cronológica',
            'release order': 'Em ordem de lançamento',
            'movies': 'Filmes',
            'dceu movies': 'Filmes do DCEU',
            'series': 'Séries',
            'dc modern series': 'Séries modernas',
            'animations': 'Animações',
            'batman animations': 'Animações do Batman',
            'superman animations': 'Animações do Superman',
            'batman collection': 'Coleção Batman',
            'superman collection': 'Coleção Superman',
        },
    };

    const ehFilme = (t) => /^(filmes?|movies?)$/i.test(t);
    const ehSerie = (t) => /^(s[ée]ries?|shows?)$/i.test(t);

    function sync() {
        if (window.__cu.utils.currentRoute()) return;

        document.querySelectorAll('[class*="meta-row-container"]').forEach((fileira) => {
            if (fileira.closest('.cu-cat-area')) return;         // as nossas já nascem nomeadas
            if (fileira.classList.contains('custom-continue-watching-row')) return;

            // O título fica no elemento INTERNO. Escrever no contêiner
            // destruiria a tipografia — foi assim que quebrei o "Continuar
            // assistindo" uma vez.
            const alvo = fileira.querySelector('[class*="title-container"] [class*="title"]')
                || fileira.querySelector('[class*="title"]');
            if (!alvo) return;

            // Normaliza espaços antes de comparar: um dos catálogos vem com
            // espaço duplo ("Prime  Video") e outro escapou da renomeação por
            // ter espaço invisível em volta do nome.
            const original = (alvo.dataset.cuOriginal || alvo.textContent)
                .replace(/[\s\u00a0]+/g, ' ').trim();
            const m = /^(.+?)\s+-\s+(.+)$/.exec(original);
            if (!m) return;

            const prefixo = m[1].trim();
            const tipo = m[2].trim();

            // Coleção: o nome útil é o do CATÁLOGO, que aqui é o prefixo.
            // Marca a fileira com a coleção a que ela pertence. O 09-servicos
            // lia isso do TÍTULO, e o título é justamente o que este módulo
            // reescreve — tirando o sufixo que identificava a coleção. Ler um
            // texto que o vizinho reescreve é frágil por natureza; uma marca no
            // elemento não depende de quem passou primeiro.
            const ehColecao = !ehFilme(tipo) && !ehSerie(tipo);
            if (ehColecao) fileira.dataset.cuColecao = tipo.replace(/\s+/g, ' ').trim().toLowerCase();

            const colecao = COLECOES[tipo.toLowerCase()];
            if (colecao) {
                if (!alvo.dataset.cuOriginal) alvo.dataset.cuOriginal = original;
                const nome = colecao[prefixo.toLowerCase()] || prefixo;
                if (alvo.textContent.trim() !== nome) {
                    alvo.textContent = nome;
                    alvo.setAttribute('title', nome);
                }
                return;
            }

            if (ehColecao) {
                // Coleção sem tradução: fica o nome do catálogo, sem o sufixo.
                if (!alvo.dataset.cuOriginal) alvo.dataset.cuOriginal = original;
                if (alvo.textContent.trim() !== prefixo) {
                    alvo.textContent = prefixo;
                    alvo.setAttribute('title', prefixo);
                }
                return;
            }

            // Guarda o nome de origem: sem isso, uma segunda passada leria o
            // título já reescrito e não encontraria mais o padrão.
            if (!alvo.dataset.cuOriginal) alvo.dataset.cuOriginal = original;

            if (REMOVER.test(prefixo)) {
                fileira.classList.add('cu-fileira-removida');
                return;
            }
            fileira.classList.remove('cu-fileira-removida');

            const par = SUFIXOS.find(([re]) => re.test(prefixo));
            if (!par) return;

            const novo = (ehFilme(tipo) ? 'Filmes ' : 'Séries ') + par[1];
            if (alvo.textContent.trim() !== novo) {
                alvo.textContent = novo;
                alvo.setAttribute('title', novo);
            }
        });
    }

    window.__cu.register(sync);
})();
