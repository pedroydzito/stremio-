/* -------- 97-diagnostico.js --------
   TEMPORÁRIO. Existe para responder duas perguntas do Windows, e depois sai.

   Os sintomas — pedir login a cada abertura e insistir em instalar o servidor
   — se explicam pela mesma coisa se o armazenamento da página não sobreviver
   ao fechar do app. Só que essa é uma hipótese entre outras, e daqui eu não
   tenho como olhar a máquina.

   Então em vez de adivinhar, a página mede: grava um marcador com a hora,
   e na abertura seguinte diz se o marcador de antes ainda estava lá. Se
   estiver, o armazenamento persiste e a causa é outra. Se sumir, é ele.

   De quebra ainda pergunta ao servidor de streaming se ele responde, e mostra
   o motor do navegador — no Mac o Stremio usa WebKit e no Windows outro, e
   várias regras de rede diferem entre os dois. */

(function () {
    const CHAVE = 'cu:diag';

    function agora() {
        const d = new Date();
        return d.toLocaleString('pt-BR');
    }

    // Lida ANTES de gravar a visita atual: é o valor da abertura passada que
    // responde a pergunta, não o que estamos escrevendo agora.
    function visitaAnterior() {
        try {
            const cru = localStorage.getItem(CHAVE);
            if (!cru) return null;
            return JSON.parse(cru);
        } catch (_) { return null; }
    }

    function registraVisita(anterior) {
        try {
            localStorage.setItem(CHAVE, JSON.stringify({
                visitas: (anterior && anterior.visitas || 0) + 1,
                quando: agora(),
            }));
            return true;
        } catch (_) { return false; }
    }

    function testaEscrita() {
        try {
            const k = 'cu:diag:teste';
            localStorage.setItem(k, 'x');
            const ok = localStorage.getItem(k) === 'x';
            localStorage.removeItem(k);
            return ok ? 'funciona' : 'grava mas nao le de volta';
        } catch (e) { return 'BLOQUEADO (' + e.name + ')'; }
    }

    function chavesDoStremio() {
        try {
            const todas = Object.keys(localStorage);
            const perfil = localStorage.getItem('profile') || '';
            // O que interessa no perfil é se existe uma sessao guardada, e nao
            // o conteudo dela - a chave de autenticacao nao vai para a tela.
            const temAuth = /"auth"\s*:\s*\{/.test(perfil) && !/"auth"\s*:\s*null/.test(perfil);
            return {
                total: todas.length,
                temPerfil: !!perfil,
                temSessao: temAuth,
                nomes: todas.filter((n) => !n.startsWith('cu:')).slice(0, 12).join(', ') || '(nenhuma)',
            };
        } catch (e) {
            return { total: '?', temPerfil: false, temSessao: false, nomes: 'erro: ' + e.name };
        }
    }

    // Se o localStorage some mas o cookie e o IndexedDB ficam, o problema é
    // de UMA gaveta e tem conserto. Se some tudo, o app está abrindo numa
    // sessão nova a cada vez e a correção é outra - vale saber qual antes de
    // escrever qualquer código.
    function cookie() {
        try {
            const anterior = /cu:diagbolo=(\d+)/.exec(document.cookie || '');
            document.cookie = 'cu:diagbolo=' + Date.now() + '; max-age=31536000; path=/';
            const gravou = /cu:diagbolo=/.test(document.cookie || '');
            if (!gravou) return 'nao grava';
            return anterior ? 'SOBREVIVEU' : 'sumiu (ou e a primeira vez)';
        } catch (e) { return 'erro: ' + e.name; }
    }

    function indexado() {
        return new Promise((ok) => {
            if (!window.indexedDB) { ok('sem IndexedDB'); return; }
            let req;
            try { req = indexedDB.open('cu-diag', 1); } catch (e) { ok('erro: ' + e.name); return; }
            req.onupgradeneeded = () => req.result.createObjectStore('m');
            req.onerror = () => ok('erro ao abrir');
            req.onsuccess = () => {
                const db = req.result;
                let t;
                try { t = db.transaction('m', 'readwrite'); } catch (e) { ok('erro: ' + e.name); return; }
                const loja = t.objectStore('m');
                const leitura = loja.get('marca');
                leitura.onsuccess = () => {
                    const antes = leitura.result;
                    loja.put(Date.now(), 'marca');
                    ok(antes ? 'SOBREVIVEU' : 'sumiu (ou e a primeira vez)');
                };
                leitura.onerror = () => ok('erro na leitura');
            };
            setTimeout(() => ok('demorou demais'), 3000);
        });
    }

    function motor() {
        const ua = navigator.userAgent || '';
        if (/Edg\//.test(ua)) return 'WebView2 / Edge (Chromium)';
        if (/Chrome\//.test(ua)) return 'Chromium';
        if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'WebKit (Safari)';
        return 'desconhecido';
    }

    // O aviso de instalar o servidor vem justamente de uma chamada dessas
    // falhando. Aqui ela é feita na mão para que o ERRO apareça com nome, em
    // vez de virar só uma notificação genérica na tela.
    function testaServidor() {
        const controle = new AbortController();
        const prazo = setTimeout(() => controle.abort(), 4000);
        return fetch('http://127.0.0.1:11470/settings', { signal: controle.signal })
            .then((r) => {
                clearTimeout(prazo);
                return 'responde (HTTP ' + r.status + ')';
            })
            .catch((e) => {
                clearTimeout(prazo);
                return 'FALHOU: ' + e.name + ' - ' + (e.message || '');
            });
    }

    function caixa(linhas) {
        const el = document.createElement('div');
        el.className = 'cu-diag';
        el.innerHTML =
            '<div class="cu-diag-topo">diagnostico Stremio+ '
            + '<button class="cu-diag-copiar">copiar</button>'
            + '<button class="cu-diag-fechar">fechar</button></div>'
            + '<pre class="cu-diag-corpo"></pre>';
        el.querySelector('.cu-diag-corpo').textContent = linhas.join('\n');
        el.querySelector('.cu-diag-fechar').onclick = () => el.remove();
        el.querySelector('.cu-diag-copiar').onclick = () => {
            try { navigator.clipboard.writeText(linhas.join('\n')); } catch (_) { /* ignore */ }
        };
        document.body.appendChild(el);
    }

    function roda() {
        const anterior = visitaAnterior();
        const gravou = registraVisita(anterior);
        const chaves = chavesDoStremio();

        Promise.all([testaServidor(), indexado()]).then(([servidor, idb]) => {
            caixa([
                'ARMAZENAMENTO',
                '  escrita         : ' + testaEscrita(),
                '  gravou o marcador: ' + (gravou ? 'sim' : 'NAO'),
                '  abertura anterior: ' + (anterior
                    ? 'ENCONTRADA - visita #' + anterior.visitas + ' em ' + anterior.quando
                    : 'NAO ENCONTRADA  <-- o armazenamento nao sobreviveu'),
                '  cookie          : ' + cookie(),
                '  indexeddb       : ' + idb,
                '  chaves guardadas : ' + chaves.total,
                '  perfil salvo     : ' + (chaves.temPerfil ? 'sim' : 'NAO'),
                '  sessao (login)   : ' + (chaves.temSessao ? 'sim' : 'NAO'),
                '  nomes            : ' + chaves.nomes,
                '',
                'SERVIDOR DE STREAMING',
                '  ' + servidor,
                '',
                'AMBIENTE',
                '  motor    : ' + motor(),
                '  origem   : ' + window.location.origin,
                '  seguro   : ' + (window.isSecureContext ? 'sim (https)' : 'nao'),
                '  cookies  : ' + (navigator.cookieEnabled ? 'ligados' : 'DESLIGADOS'),
                '  agora    : ' + agora(),
            ]);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(roda, 1500));
    } else {
        setTimeout(roda, 1500);
    }
})();
