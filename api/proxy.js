// Proxy da interface do Stremio+ — versão Vercel.
//
// É o mesmo papel que o `native-serve.js` fazia na máquina de cada um: buscar
// o HTML do web.stremio.com e injetar nosso CSS/JS antes de entregar. A
// diferença é onde roda. Com isto na nuvem, o app instalado aponta o
// `--webui-url` para cá, e uma atualização publicada aqui chega em todo mundo
// na próxima abertura — sem reinstalar nada e sem Node na máquina do usuário.
//
// O que continua local em cada computador: o player mpv, o servidor de
// streaming (127.0.0.1:11470), o ícone e o nome do app. Nada disso passa por
// aqui — daqui sai só a interface.

const https = require('https');
const zlib = require('zlib');
const { CSS, JS } = require('../arquivos');

const UPSTREAM = 'web.stremio.com';

// Service worker do stremio-web neutralizado: se ele continuasse ativo,
// serviria do cache um HTML antigo, SEM a nossa injeção — e uma atualização
// publicada aqui só apareceria depois de limpar o cache do app.
const SW_STUB = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((chaves) => Promise.all(chaves.map((k) => caches.delete(k))))
            .then(() => self.registration.unregister())
    );
    self.clients.claim();
});
`;

function injecao() {
    const marca = `<script>try{localStorage.setItem('__stremio_custom_ui','1')}catch(e){}</script>`;
    const css = CSS.map((f) => `<link rel="stylesheet" href="/custom/css/${f}">`).join('');
    const js = JS.map((f) => `<script src="/custom/js/${f}" defer></script>`).join('');
    return marca + css + js;
}

function decodifica(buffer, codificacao) {
    if (!codificacao) return buffer;
    const c = String(codificacao).toLowerCase();
    if (c === 'gzip') return zlib.gunzipSync(buffer);
    if (c === 'deflate') return zlib.inflateSync(buffer);
    if (c === 'br') return zlib.brotliDecompressSync(buffer);
    return buffer;
}

module.exports = (req, res) => {
    const url = req.url || '/';

    if (url === '/service-worker.js') {
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        return res.end(SW_STUB);
    }

    // O `/abrir` só existe na instalação local, onde há um processo capaz de
    // chamar o `open` do sistema. Aqui a resposta é explícita para o cliente
    // saber que precisa usar o caminho alternativo (copiar o link), em vez de
    // ficar esperando uma navegação que nunca vem.
    if (url.startsWith('/abrir')) {
        res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ erro: 'indisponivel-na-nuvem' }));
    }

    const cabecalhos = Object.assign({}, req.headers, {
        host: UPSTREAM,
        'accept-encoding': 'identity',
    });
    delete cabecalhos['x-forwarded-for'];
    delete cabecalhos['x-forwarded-host'];
    delete cabecalhos['x-forwarded-proto'];

    // Navegação de página não pode receber 304: o WebView reusaria o HTML em
    // cache, sem a injeção atual.
    const querHtml = String(req.headers.accept || '').includes('text/html');
    if (querHtml) {
        delete cabecalhos['if-none-match'];
        delete cabecalhos['if-modified-since'];
    }

    const pedido = https.request(
        { host: UPSTREAM, port: 443, method: req.method, path: url, headers: cabecalhos },
        (resposta) => {
            const tipo = String(resposta.headers['content-type'] || '');
            const ehHtml = tipo.includes('text/html');

            const saida = Object.assign({}, resposta.headers);
            delete saida['content-encoding'];
            delete saida['content-length'];
            delete saida['transfer-encoding'];
            delete saida['content-security-policy'];
            delete saida['content-security-policy-report-only'];
            delete saida['strict-transport-security'];

            if (!ehHtml) {
                res.writeHead(resposta.statusCode, saida);
                return resposta.pipe(res);
            }

            saida['cache-control'] = 'no-store, must-revalidate';
            delete saida['etag'];
            delete saida['last-modified'];
            delete saida['expires'];

            const partes = [];
            resposta.on('data', (c) => partes.push(c));
            resposta.on('end', () => {
                let corpo;
                try {
                    corpo = decodifica(Buffer.concat(partes), resposta.headers['content-encoding']).toString('utf8');
                } catch (e) {
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    return res.end('erro ao decodificar: ' + e.message);
                }
                const tags = injecao();
                corpo = corpo.includes('</head>') ? corpo.replace('</head>', tags + '</head>') : corpo + tags;
                res.writeHead(resposta.statusCode, saida);
                res.end(corpo);
            });
            resposta.on('error', () => { try { res.end(); } catch (_) { /* já fechou */ } });
        }
    );

    pedido.on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('erro no upstream: ' + e.message);
    });

    req.pipe(pedido);
};
