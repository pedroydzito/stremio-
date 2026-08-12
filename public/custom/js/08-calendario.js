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

    const CHAVE = 'cu:calMeta2';
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
                        // A DATA, não o julgamento. Guardar "já lançou" foi um
                        // erro: o valor era calculado no dia em que a série foi
                        // buscada e ficava congelado no disco — o episódio que
                        // estreou hoje continuava marcado como bloqueado porque
                        // ontem ele era. Guardando a data, a conta é refeita a
                        // cada abertura.
                        estreia: v.released || '',
                    };
                });
                meta[imdb] = mapa;
                try { localStorage.setItem(CHAVE, JSON.stringify(meta)); } catch (_) { /* ignore */ }
            })
            .catch(() => { pedidos.delete(imdb); });
    }

    // Estreia em qualquer hora de HOJE já conta como disponível. Calculado na
    // hora de desenhar, nunca guardado.
    function jaEstreou(quando) {
        if (!quando) return true;
        return new Date(quando) <= fimDeHoje();
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
        const bloqueado = info ? !jaEstreou(info.estreia) : false;
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

    // A semana volta a começar na SEGUNDA, que é a ordem que o app monta
    // sozinho — então aqui não se mexe mais em coluna nenhuma. Ficou só a
    // limpeza dos nomes: "SEGUNDA-FEIRA" é longo e o "-feira" não distingue
    // nada quando os sete estão lado a lado.
    const DIAS = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'];

    function arrumaCabecalhos() {
        const cabecalhos = Array.from(document.querySelectorAll('[class*="table"] *'))
            .filter((e) => !e.children.length && /-feira|sábado|domingo/i.test(e.textContent || ''));
        if (cabecalhos.length !== 7) return;
        cabecalhos.forEach((e, i) => {
            if (e.textContent.trim() !== DIAS[i]) e.textContent = DIAS[i];
        });
    }

    // ---- "Hoje" no lugar da data, sem o realce ----------------------------
    //
    // A lista lateral marca o dia de hoje com um bloco branco que cobre a linha
    // e engole o texto dentro dele. Tentei apagar esse realce por CSS e não
    // peguei: a classe é gerada e não bate com nenhum padrão que eu chutasse.
    // Aqui a régua é o ESTILO CALCULADO — se o fundo é claro, ele sai. Isso não
    // depende de adivinhar nome de classe.
    //
    // E a data de hoje vira "Hoje": é a informação que se procura ali, e amanhã
    // ela volta a ser uma data como as outras, sozinha.
    function marcaHoje() {
        const lista = document.querySelector('[class*="content"] > [class*="list"]');
        if (!lista) return;

        const hoje = new Date();
        const dia = String(hoje.getDate());
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');

        lista.querySelectorAll('*').forEach((el) => {
            if (el.children.length) return;
            const txt = (el.textContent || '').trim();
            const m = /^(\d{1,2})\/(\d{2})$/.exec(txt);
            if (!m) return;

            const ehHoje = m[1] === dia && m[2] === mes;
            if (ehHoje && txt !== 'Hoje') {
                el.dataset.cuData = txt;
                el.textContent = 'Hoje';
            }

            // Um fundo claro em qualquer altura acima do rótulo é o realce.
            let pai = el;
            for (let n = 0; n < 3 && pai; n += 1) {
                const fundo = getComputedStyle(pai).backgroundColor || '';
                const rgb = fundo.match(/\d+/g);
                const claro = rgb && +rgb[0] > 180 && +rgb[1] > 180 && +rgb[2] > 180
                    && (rgb[3] === undefined || parseFloat(rgb[3]) > 0.2);
                if (claro) {
                    pai.style.setProperty('background-color', 'transparent', 'important');
                    pai.style.setProperty('color', 'inherit', 'important');
                }
                pai = pai.parentElement;
            }
        });
    }

    // O laço de 400ms é lento demais para isto: trocar de mês remonta a lista,
    // e o realce branco do app fica visível até a volta seguinte — quase um
    // segundo. Um observador reage à remontagem no mesmo quadro.
    //
    // Ele observa o CONTÊINER da lista e não a lista em si: ao trocar de mês o
    // app substitui a lista inteira, e um observador preso ao elemento antigo
    // morreria junto com ele.
    let observador = null;
    let agendado = false;

    function observa() {
        const alvo = document.querySelector('[class*="content"]');
        if (!alvo || observador?.alvo === alvo) return;

        if (observador) observador.obs.disconnect();
        const obs = new MutationObserver(() => {
            if (agendado) return;
            agendado = true;
            requestAnimationFrame(() => {
                agendado = false;
                try { marcaHoje(); } catch (_) { /* segue */ }
            });
        });
        obs.observe(alvo, { childList: true, subtree: true });
        observador = { alvo, obs };
    }

    // ---- capas da grade -------------------------------------------------
    //
    // A grade não diz nada sobre disponibilidade: 5, 12, 19 e 26 são capas
    // idênticas, e as três últimas são de episódios que ainda não existem. O
    // que separa um do outro é a data da própria célula — não preciso saber de
    // que episódio se trata, só se aquele dia já chegou.
    function marcaCelulas() {
        const grade = document.querySelector('[class*="table"] [class*="grid"]');
        if (!grade) return;

        const rotulo = document.querySelector('[class*="table"]')?.textContent || '';
        const ano = (/(\d{4})/.exec(rotulo) || [])[1];
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);

        Array.from(grade.children).forEach((celula) => {
            const num = celula.querySelector('[class*="heading"] [class*="day"]');
            const dia = parseInt((num?.textContent || '').trim(), 10);
            if (!Number.isFinite(dia)) return;

            // O mês vem do dia 1 da própria grade: ler o nome do mês e traduzir
            // daria um segundo lugar para errar.
            const mesRef = celula.closest('[class*="calendar"]');
            void mesRef;
            const data = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
            if (ano && +ano !== hoje.getFullYear()) {
                data.setFullYear(+ano);
            }

            // Só o mês visível é comparável desta forma; nos meses vizinhos a
            // conta erraria, então a marcação vale pelo dia dentro do mês
            // exibido, que é o que a grade mostra.
            const futuro = data > hoje;
            celula.classList.toggle('cu-cal-futuro', futuro);
        });
    }

    function sync() {
        if (!document.body.classList.contains('route-calendar')) {
            if (observador) { observador.obs.disconnect(); observador = null; }
            return;
        }
        observa();
        arrumaCabecalhos();
        marcaHoje();
        marcaCelulas();
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
