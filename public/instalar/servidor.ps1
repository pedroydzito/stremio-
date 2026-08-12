# Stremio+ - servidor local da interface (Windows).
#
# POR QUE ISTO EXISTE
#
# A interface vinha direto da Vercel, por https. No Mac funciona; no Windows
# nao, e a causa e o motor: la o Stremio desenha com WebKit, aqui com WebView2,
# que e Chromium. O Chromium novo exige permissao para uma pagina https falar
# com 127.0.0.1 - e o servidor de streaming do Stremio nao responde o cabecalho
# que essa permissao pede. Dentro de um app nao ha onde pedir permissao, entao
# a chamada falha calada e a interface conclui que nao existe servidor.
#
# A saida e a pagina deixar de ser "remota": servida daqui, de 127.0.0.1, ela
# fala com o servidor de streaming sem atravessar nenhuma dessas regras. E a
# mesma arquitetura que ja roda no Mac.
#
# COMO SE MANTEM ATUALIZADO
#
# O HTML e os arquivos do Stremio sao baixados de web.stremio.com na primeira
# vez que cada um e pedido, e ficam guardados na pasta - da segunda em diante
# saem do disco. O CSS e o JS da personalizacao NAO sao copiados: as tags
# apontam para a Vercel, entao o que eu publico continua chegando sozinho.
#
# Um servidor de HTTP escrito na mao parece exagero, mas o pronto do Windows
# (HttpListener) exige registrar a URL como administrador. Socket cru nao exige
# nada - e o que se perde e so keep-alive, que aqui nao faz falta.

param(
    [int]$Porta = 11471,
    [string]$Pasta = "",
    [string]$Custom = "https://stremio-plus.vercel.app",
    [string]$Origem = "https://web.stremio.com"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = Join-Path $env:LOCALAPPDATA "StremioMais"
if (-not $Pasta) { $Pasta = Join-Path $base "webui" }

# Quem instalou apontando para outro deploy deixou o endereco anotado; sem isso
# o servidor iria buscar a personalizacao no lugar errado.
$anotado = Join-Path $base "custom.txt"
if ((Test-Path $anotado) -and -not $PSBoundParameters.ContainsKey('Custom')) {
    $lido = (Get-Content $anotado -Raw).Trim()
    if ($lido) { $Custom = $lido }
}
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$Custom = $Custom.TrimEnd('/')
$Origem = $Origem.TrimEnd('/')

$TIPOS = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.wasm' = 'application/wasm'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.ttf'  = 'font/ttf'
    '.map'  = 'application/json; charset=utf-8'
}

function Tipo($caminho) {
    $ext = [IO.Path]::GetExtension($caminho).ToLower()
    if ($TIPOS.ContainsKey($ext)) { return $TIPOS[$ext] }
    return 'application/octet-stream'
}

# ---- as tags da personalizacao ------------------------------------------
# A ordem alfabetica da lista e o que define a ordem de carga; por isso ela vem
# pronta da Vercel em vez de ser adivinhada aqui.
function MontaTags {
    $tags = "<script>try{localStorage.setItem('__stremio_custom_ui','1')}catch(e){}</script>"
    try {
        $lista = Invoke-RestMethod -Uri "$Custom/custom/lista.json" -UseBasicParsing -TimeoutSec 10
        foreach ($f in $lista.css) { $tags += "<link rel=""stylesheet"" href=""$Custom/custom/css/$f"">" }
        foreach ($f in $lista.js)  { $tags += "<script src=""$Custom/custom/js/$f"" defer></script>" }
    } catch {
        Write-Host "aviso: nao consegui ler a lista de modulos ($($_.Exception.Message))"
    }
    return $tags
}

# ---- disco, com a origem como reserva ------------------------------------
function PegaArquivo($rota) {
    $rel = $rota.TrimStart('/')
    if (-not $rel) { $rel = 'index.html' }
    # Sem "..": a rota vem de fora, e ela nao pode escolher arquivo fora da pasta.
    if ($rel -match '\.\.') { return $null }

    $destino = Join-Path $Pasta ($rel -replace '/', '\')
    if (Test-Path $destino) { return [IO.File]::ReadAllBytes($destino) }

    try {
        $resp = Invoke-WebRequest -Uri "$Origem/$rel" -UseBasicParsing -TimeoutSec 30
    } catch {
        return $null
    }
    $bytes = $resp.Content
    if ($bytes -isnot [byte[]]) { $bytes = [Text.Encoding]::UTF8.GetBytes([string]$bytes) }

    New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
    [IO.File]::WriteAllBytes($destino, $bytes)
    Write-Host "  baixado: /$rel ($($bytes.Length) bytes)"
    return $bytes
}

# O HTML e injetado na hora de servir, nunca no arquivo guardado: assim mexer na
# personalizacao nao exige apagar o cache, e o original fica intacto.
function MontaIndex($tags) {
    $bytes = PegaArquivo '/index.html'
    if (-not $bytes) { return $null }
    $html = [Text.Encoding]::UTF8.GetString($bytes)

    # "//www.gstatic.com/..." herda o esquema da pagina. Como aqui a pagina e
    # http, isso viraria uma busca em http num servidor que so atende https.
    $html = $html -replace '(?i)(src|href)="//', '$1="https://'

    if ($html -match '(?i)</head>') { $html = $html -replace '(?i)</head>', "$tags</head>" }
    else { $html = $tags + $html }
    return [Text.Encoding]::UTF8.GetBytes($html)
}

# O service worker que substitui o do Stremio: em vez de guardar arquivos, ele
# joga fora o que existia e se desregistra.
$SW_TOCO = @'
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .then(() => self.registration.unregister())
    );
});
'@

# ---- resposta ------------------------------------------------------------
function Responde($fluxo, $codigo, $tipo, [byte[]]$corpo, $cache) {
    $cab = "HTTP/1.1 $codigo`r`n"
    $cab += "Content-Type: $tipo`r`n"
    $cab += "Content-Length: $($corpo.Length)`r`n"
    $cab += "Cache-Control: $cache`r`n"
    $cab += "Connection: close`r`n`r`n"
    $b = [Text.Encoding]::ASCII.GetBytes($cab)
    $fluxo.Write($b, 0, $b.Length)
    if ($corpo.Length) { $fluxo.Write($corpo, 0, $corpo.Length) }
    $fluxo.Flush()
}

# ---- laco ----------------------------------------------------------------
$ouvinte = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Porta)
try {
    $ouvinte.Start()
} catch {
    Write-Host "Nao consegui abrir a porta ${Porta}: $($_.Exception.Message)"
    exit 1
}

$tags = MontaTags
Write-Host "Stremio+ servindo em http://127.0.0.1:$Porta/"
Write-Host "  cache : $Pasta"
Write-Host "  origem: $Origem"

while ($true) {
    $cliente = $ouvinte.AcceptTcpClient()
    try {
        $cliente.ReceiveTimeout = 15000
        $cliente.SendTimeout = 60000
        $fluxo = $cliente.GetStream()

        # So a primeira linha interessa; o resto dos cabecalhos e descartado.
        $buf = New-Object byte[] 8192
        $lidos = $fluxo.Read($buf, 0, $buf.Length)
        if ($lidos -le 0) { continue }
        $pedido = [Text.Encoding]::ASCII.GetString($buf, 0, $lidos)
        $primeira = ($pedido -split "`r`n")[0]
        $partes = $primeira -split ' '
        if ($partes.Count -lt 2) { continue }

        $rota = $partes[1]
        $rota = ($rota -split '\?')[0]
        $rota = ($rota -split '#')[0]

        if ($rota -eq '/service-worker.js') {
            # O service worker do Stremio guarda o HTML e passa a responder no
            # lugar do servidor - o que anularia o no-store e faria a pagina
            # continuar sendo a antiga depois de eu publicar. No lugar dele vai
            # um que se desregistra e apaga o que ja tinha guardado.
            Responde $fluxo '200 OK' 'text/javascript; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($SW_TOCO)) 'no-store'
        } elseif ($rota -eq '/' -or $rota -eq '/index.html') {
            $corpo = MontaIndex $tags
            if ($corpo) { Responde $fluxo '200 OK' 'text/html; charset=utf-8' $corpo 'no-store, must-revalidate' }
            else { Responde $fluxo '502 Bad Gateway' 'text/plain' ([Text.Encoding]::UTF8.GetBytes('sem index')) 'no-store' }
        } else {
            $corpo = PegaArquivo $rota
            if ($corpo) { Responde $fluxo '200 OK' (Tipo $rota) $corpo 'public, max-age=86400' }
            else { Responde $fluxo '404 Not Found' 'text/plain' ([Text.Encoding]::UTF8.GetBytes('')) 'no-store' }
        }
    } catch {
        # Aba fechada no meio do download derruba a conexao. Isso e rotina, e
        # nao pode derrubar o servidor junto.
    } finally {
        try { $cliente.Close() } catch { }
    }
}
