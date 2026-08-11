/* -------- 06-trakt.js --------
   Links para o Trakt. Só isso.

   Não há nota nenhuma sendo lida aqui, e não dá para haver: qualquer leitura
   programática do Trakt exige um Client ID, e registrar app de API é recurso
   VIP. Os caminhos por fora também fecham — o addon "Trakt Sync & Rate" pede o
   SEU Client ID, a página pública do perfil virou SPA sem dados no HTML, e não
   existe endpoint sem chave. Então o app não mostra notas; ele leva você ao
   lugar certo para avaliar.

   COMO O ENDEREÇO É MONTADO
   A documentação do Trakt (Website Media Links) diz que, tendo só um id
   externo como o do IMDb, é preciso consultar a API para obter o slug. Sem
   API, resta derivar o slug de título+ano, que é a mesma regra que o Trakt usa
   para gerá-los:

       Severance (2022)               → severance-2022
       Spider-Man: No Way Home (2021) → spider-man-no-way-home-2021

   E com o slug o episódio também é alcançável:

       /shows/<slug>/seasons/<t>/episodes/<e>

   AVISO HONESTO: não consegui verificar os slugs. O site do Trakt é SPA e
   responde 200 tanto para um slug real quanto para um inventado (testei com um
   controle negativo), então não há como conferir de fora. A regra acerta a
   grande maioria; títulos ambíguos, refilmagens e nomes traduzidos podem cair
   errado. Se algum errar, me diga qual e eu abro uma exceção aqui. */

(function () {
    // Restos das integrações anteriores (Letterboxd/Serializd/Trakt via API).
    ['cu:lbCache', 'cu:lbCache2', 'cu:lbNotas', 'cu:lbSync'].forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) { /* ignore */ }
    });

    // Exceções conhecidas: imdb -> slug do Trakt, para quando a regra errar.
    const EXCECOES = {};

    function slugifica(nome, ano) {
        const base = String(nome || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acentos
            .replace(/['’]/g, '')                          // apóstrofo some, não vira hífen
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (!base) return '';
        return ano ? base + '-' + ano : base;
    }

    // "2022–", "2019-2023", "2021" → 2022 / 2019 / 2021
    function anoDe(dd) {
        const bruto = dd?.releaseInfo || dd?.year || '';
        const m = /\d{4}/.exec(String(bruto));
        if (m) return m[0];
        if (dd?.released) {
            const d = new Date(dd.released);
            if (!isNaN(d)) return String(d.getFullYear());
        }
        return '';
    }

    // Série e filme NÃO seguem a mesma regra de slug — medido no site:
    //   /shows/severance-2022  → 404      /shows/severance   → certo
    //   /movies/<titulo>-<ano>            → funciona
    // O Trakt só acrescenta o ano quando há conflito de nome, e nos filmes isso
    // é a regra e nas séries a exceção. Então o ano entra só em filme.
    function url(dd, tipo, imdb, temporada, episodio) {
        const ano = tipo === 'movie' ? anoDe(dd) : '';
        const slug = (imdb && EXCECOES[imdb]) || slugifica(dd?.name, ano);

        // Sem título não há slug possível: cai na busca do site, que resolve
        // com um clique a mais em vez de com um link quebrado.
        if (!slug) {
            const termo = dd?.name || imdb || '';
            return 'https://trakt.tv/search?query=' + encodeURIComponent(termo);
        }

        if (tipo === 'movie') return 'https://trakt.tv/movies/' + slug;

        const base = 'https://trakt.tv/shows/' + slug;
        if (temporada != null && episodio != null) {
            // Endereço no formato ANTIGO de propósito: o próprio Trakt o
            // reescreve para o novo (verificado seguindo o redirecionamento:
            //   /shows/severance/seasons/1/episodes/2
            //   → app.trakt.tv/shows/severance?view=episode&season=1&episode=2)
            // Deixar a tradução com eles evita ter que persegui-la se o site
            // mudar de esquema outra vez.
            return base + '/seasons/' + temporada + '/episodes/' + episodio;
        }
        return base;
    }

    window.__cu.trakt = { url, slugifica, anoDe };
})();
