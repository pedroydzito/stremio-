/* -------- 08-calendario.js --------
   Reconstrói a lista lateral do calendário com os mesmos cards da tela de
   detalhes: miniatura, "Episódio X" e o nome do episódio embaixo.

   O que o Stremio entrega ali é só data, nome da série e "S4E2" — sem
   miniatura e sem o nome do episódio. O resto vem do Cinemeta, com cache: uma
   consulta por série, reaproveitada por todos os episódios dela.

   A data continua no cabeçalho de cada item e ganha o nome da série junto.
   Sem isso, dois lançamentos no mesmo dia ficariam indistinguíveis — o pedido
   era "Episódio X" no título, e é o que o card mostra; a série sobe uma linha
   em vez de sumir.

   As classes são as MESMAS dos cards de episódio (`disney-episode-*`), de
   propósito: o visual das miniaturas vazias, do cadeado e do relógio já está
   resolvido lá, e duplicar CSS seria criar dois lugares para consertar. */

(function () {
    const TRACO = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
    const CADEADO = `<svg viewBox="0 0 24 24" ${TRACO}><rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8.2 10.5V7.2a3.8 3.8 0 0 1 7.6 0v3.3"/></svg>`;
    const RELOGIO = `<svg viewBox="0 0 24 24" ${TRACO}><circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.1 2"/></svg>`;

    const CHAVE = 'cu:calMeta';
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch (_) { /* ignore */ }
    const pedidos = new Set();

    function pedeMeta(imdb) {
        if (!imdb || meta[imdb] || pedidos.has(imdb)) return;
        pedidos.add(imdb);
        fetch('https://v3-cinemeta.strem.io/meta/series/' + imdb + '.json')
            .then((r) => r.json())
            .then((j) => {
                const mapa = {};
                (j.meta?.videos || []).forEach((v) => {
                    if (v.season == null || v.episode == null) return;
                    mapa[v.season + ':' + v.episode] = {
                        nome: v.name || '',
                        thumb: v.thumbnail || '',
                        // Comparação por DIA, não por instante. O episódio que
                        // sai hoje tem hora de estreia — e até essa hora chegar
                        // ele aparecia bloqueado no dia em que estreou, que é
                        // justamente o dia em que se olha o calendário.
                        lancado: !v.released || new Date(v.released) <= fimDeHoje(),
                    };
                });
                meta[imdb] = mapa;
                try { localStorage.setItem(CHAVE, JSON.stringify(meta)); } catch (_) { /* ignore */ }
            })
            .catch(() => { pedidos.delete(imdb); });
    }

    // O último instante de hoje. Estreia em qualquer hora de hoje já conta.
    function fimDeHoje() {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        return d;
    }

    // "#/detail/series/tt10986410/tt10986410%3A4%3A1" → { imdb, temporada, episodio }
    function leEndereco(href) {
        const bruto = decodeURIComponent(href || '');
        const m = /(tt\d+):(\d+):(\d+)\s*$/.exec(bruto);
        if (!m) return null;
        return { imdb: m[1], temporada: +m[2], episodio: +m[3] };
    }

    function monta(link, dados, info) {
        const semNome = !info || !info.nome || /^(tba|tbd)$/i.test(info.nome.trim());
        // Não ter ido ao ar JÁ basta para bloquear — a tela de detalhes passou
        // a valer assim e esta ficou para trás. Enquanto exigia também que o
        // episódio não tivesse nome, os que já foram anunciados (com nome e
        // arte, e é o caso comum de quem acompanha uma série em exibição)
        // apareciam idênticos aos que já saíram, justamente na tela feita para
        // mostrar o que ainda vem.
        const bloqueado = info ? !info.lancado : false;
        const semArte = !bloqueado && (!info || !info.thumb);

        // Três casos, os mesmos da tela de detalhes:
        //   bloqueado COM arte → a arte fica, apagada, e o cadeado por cima:
        //     dá para reconhecer o episódio e ver que ainda não saiu
        //   bloqueado SEM arte → só o vão com o cadeado
        //   disponível         → a imagem normal
        const miniatura = (bloqueado && info && info.thumb)
            ? `<img class="disney-episode-thumb" src="${info.thumb}" alt="" loading="lazy" />
               <div class="cu-ep-cadeado">${CADEADO}</div>`
            : ((bloqueado || semArte || !info)
                ? `<div class="disney-episode-thumb disney-episode-thumb-vazia">${bloqueado ? CADEADO : RELOGIO}</div>`
                : `<img class="disney-episode-thumb" src="${info.thumb}" alt="" loading="lazy" />`);

        // Só a FALTA de nome vira "Ainda não disponível". O episódio que ainda
        // não saiu mas já tem nome mantém o nome: aqui ele é o conteúdo da
        // tela, e o cadeado já diz que não saiu.
        const segunda = semNome ? 'Ainda não disponível' : info.nome;

        link.innerHTML = `
            <div class="disney-episode-thumb-wrap">${miniatura}</div>
            <div class="disney-episode-info">
                <span class="disney-episode-title">Episódio ${dados.episodio}</span>
                <span class="disney-episode-overview">${String(segunda).replace(/</g, '&lt;')}</span>
            </div>`;
        link.classList.add('disney-episode-card', 'cu-cal-card');
        if (bloqueado) link.classList.add('cu-ep-bloqueado');

        // A imagem do metahub existe mesmo para episódios sem still: ela morre
        // no carregamento. Falhou, vira o mesmo vão de "sem arte".
        const img = link.querySelector('img.disney-episode-thumb');
        if (img) {
            img.addEventListener('error', () => {
                const wrap = img.closest('.disney-episode-thumb-wrap');
                if (!wrap || wrap.querySelector('.disney-episode-thumb-vazia')) return;
                const vazio = document.createElement('div');
                vazio.className = 'disney-episode-thumb disney-episode-thumb-vazia';
                vazio.innerHTML = RELOGIO;
                img.replaceWith(vazio);
            }, { once: true });
        }
    }

    // ---- semana começando no domingo ------------------------------------
    //
    // A grade é UMA grade só de 7 colunas (medido: `display: grid`, 36 células
    // irmãs), não uma pilha de linhas de semana — por isso dá para virar a
    // semana mexendo em uma coluna. O Stremio monta segunda→domingo porque o
    // app está em português; a ordem vem do idioma, não de uma preferência.
    //
    // Cada data precisa andar uma coluna para a direita. Em vez de fixar "+1",
    // que erraria no mês que começa num domingo, a coluna sai da própria
    // grade: o número de células vazias antes do dia 1 revela o dia da semana
    // dele, e daí sai a coluna certa na contagem que começa no domingo.
    const DIAS = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];

    function viraSemana() {
        const grade = document.querySelector('[class*="table"] [class*="grid"]');
        if (!grade) return;

        const celulas = Array.from(grade.children);
        if (!celulas.length) return;

        const temDia = (c) => /\d/.test((c.textContent || '').trim());
        const primeira = celulas.findIndex(temDia);
        if (primeira < 0) return;

        // primeira === quantidade de células vazias antes do dia 1.
        // Na contagem que começa na segunda, o dia 1 cai na coluna primeira+1;
        // na que começa no domingo, uma adiante (com o domingo voltando para 1).
        const coluna = ((primeira + 1) % 7) + 1;
        const alvo = celulas[primeira];
        if (alvo.style.gridColumnStart !== String(coluna)) {
            alvo.style.gridColumnStart = String(coluna);
        }
        // As vazias do começo não servem mais: quem abre a linha agora é a
        // coluna definida acima. Deixá-las visíveis empurraria tudo de volta.
        celulas.slice(0, primeira).forEach((c) => { c.style.display = 'none'; });

        // Cabeçalhos: "SEGUNDA-FEIRA" → "SEGUNDA", e domingo na frente.
        const cabecalhos = Array.from(document.querySelectorAll('[class*="table"] *'))
            .filter((e) => !e.children.length && /-feira|sábado|domingo/i.test(e.textContent || ''));
        if (cabecalhos.length === 7) {
            cabecalhos.forEach((e, i) => {
                const texto = DIAS[i];
                if (e.textContent.trim() !== texto) e.textContent = texto;
            });
        }
    }

    // Trocar de mês monta a grade de novo, na ordem do app: segunda→domingo. A
    // correção só chegava na volta seguinte do laço, até 400ms depois — daí o
    // "pisca e se ajeita". Não era lentidão de desenho, era espera.
    //
    // Aqui o clique nas setas cobre esse intervalo: a grade fica invisível (não
    // `display: none`, que zeraria a altura e faria a página pular) e volta
    // assim que a semana está certa. O laço continua valendo como rede.
    function cobreTroca() {
        const grade = document.querySelector('[class*="table"] [class*="grid"]');
        if (grade) grade.classList.add('cu-cal-trocando');

        let quadros = 0;
        const tenta = () => {
            quadros += 1;
            viraSemana();
            const g = document.querySelector('[class*="table"] [class*="grid"]');
            if (g) {
                const pronto = Array.from(g.children).some((c) => c.style.gridColumnStart);
                // 40 quadros ≈ 0,7s: se a grade não vier nesse tempo, é melhor
                // mostrá-la torta do que deixar a tela vazia.
                if (pronto || quadros > 40) { g.classList.remove('cu-cal-trocando'); return; }
            }
            requestAnimationFrame(tenta);
        };
        requestAnimationFrame(tenta);
    }

    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('route-calendar')) return;
        if (!e.target.closest('button, [class*="button"]')) return;
        cobreTroca();
    }, true);

    function sync() {
        if (!document.body.classList.contains('route-calendar')) return;
        viraSemana();
        const lista = document.querySelector('[class*="content"] > [class*="list"]');
        if (!lista) return;

        lista.querySelectorAll('[class*="item"]').forEach((item) => {
            const link = item.querySelector('a[href*="/detail/"]');
            if (!link) return;

            const dados = leEndereco(link.getAttribute('href'));
            if (!dados) return;

            const mapa = meta[dados.imdb];
            if (!mapa) { pedeMeta(dados.imdb); }
            const info = mapa ? mapa[dados.temporada + ':' + dados.episodio] : null;

            // Redesenha só quando o conteúdo muda: sem isto, o innerHTML seria
            // reescrito 2,5 vezes por segundo e a imagem piscaria sem parar.
            const assinatura = dados.imdb + '|' + dados.temporada + ':' + dados.episodio + '|' + (info ? info.nome + info.thumb : 'vazio');
            if (link.dataset.cuAssinatura === assinatura) return;
            link.dataset.cuAssinatura = assinatura;

            // O nome da série sobe para o cabeçalho, junto da data.
            const nomeSerie = (item.querySelector('[class*="name"]') || {}).textContent;
            const cabecalho = item.querySelector('[class*="heading"]');
            if (cabecalho && nomeSerie && !cabecalho.dataset.cuSerie) {
                cabecalho.dataset.cuSerie = '1';
                const marca = document.createElement('span');
                marca.className = 'cu-cal-serie';
                marca.textContent = nomeSerie.trim();
                cabecalho.appendChild(marca);
            }

            monta(link, dados, info);
        });
    }

    window.__cu.register(sync);
})();
