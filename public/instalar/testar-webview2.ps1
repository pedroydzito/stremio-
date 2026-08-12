# Stremio+ - TESTE, nao instalador.
#
# Abre o Stremio+ uma vez com uma variavel de ambiente que desliga, no motor do
# navegador, o bloqueio de paginas HTTPS acessando a rede local.
#
# Por que isso: no Windows o Stremio desenha a interface com WebView2, que e
# Chromium. O Chromium novo exige permissao para uma pagina https alcancar
# 127.0.0.1, e o servidor de streaming do Stremio nao responde o cabecalho que
# essa permissao pede. Dentro de um app nao ha onde pedir permissao ao usuario,
# entao a chamada simplesmente falha - e a interface conclui que nao existe
# servidor. No Mac o motor e WebKit, que nao tem essa regra: por isso so aparece
# no Windows.
#
# Nada aqui e permanente: a variavel vale so para este processo, e o atalho
# instalado continua como esta. Se o teste der certo, a correcao entra no
# instalador.
#
# Uso:
#   irm https://stremio-plus.vercel.app/instalar/testar-webview2.ps1 | iex

function Testar-StremioMais {
    param([string]$Url = "https://stremio-plus.vercel.app")

    $ErrorActionPreference = "Stop"
    $Url = $Url.TrimEnd('/')

    # ---- o Stremio precisa estar fechado --------------------------------
    # Aberto, o Windows so traz a janela existente para a frente e o processo
    # novo morre - junto com a variavel, sem testar nada.
    $vivo = Get-Process -Name "stremio" -ErrorAction SilentlyContinue
    if ($vivo) {
        Write-Host ""
        Write-Host "O Stremio esta aberto. Feche ele por completo - inclusive o icone"
        Write-Host "na bandeja, perto do relogio - e rode este comando de novo."
        Write-Host ""
        return
    }

    # ---- achar o executavel ---------------------------------------------
    function Caminho($pasta, $arquivo) {
        $base = [Environment]::GetFolderPath($pasta)
        if (-not $base) { return "" }
        return (Join-Path $base $arquivo)
    }

    $exe = @(
        "$env:LOCALAPPDATA\Programs\stremio\Stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-4\stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-5\stremio.exe",
        "${env:ProgramFiles}\Stremio\stremio.exe",
        "${env:ProgramFiles(x86)}\Stremio\stremio.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $exe) {
        # O atalho que o instalador criou ja sabe o caminho certo.
        $lnk = @(
            (Caminho 'Desktop' 'Stremio+.lnk'),
            (Caminho 'Programs' 'Stremio+.lnk'),
            (Caminho 'Programs' 'Stremio.lnk'),
            (Caminho 'CommonPrograms' 'Stremio.lnk')
        ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

        if ($lnk) {
            $sh = New-Object -ComObject WScript.Shell
            $exe = $sh.CreateShortcut($lnk).TargetPath
        }
    }

    if (-not $exe -or -not (Test-Path $exe)) {
        Write-Host "Nao encontrei o Stremio. Rode o instalador primeiro."
        return
    }

    # ---- as chaves do motor ---------------------------------------------
    # Sao quatro porque o nome mudou entre versoes do Chromium, e daqui eu nao
    # sei em qual o seu WebView2 esta. Desligar uma que nao existe e inofensivo.
    $desligar = @(
        'LocalNetworkAccessChecks',
        'BlockInsecurePrivateNetworkRequests',
        'PrivateNetworkAccessSendPreflights',
        'PrivateNetworkAccessRespectPreflightResults'
    ) -join ','

    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--disable-features=$desligar"

    $servidor = [System.Uri]::EscapeDataString("http://127.0.0.1:11470")
    $argumento = "--webui-url=`"$Url/#/?streamingServerUrl=$servidor`""

    Write-Host "> Stremio: $exe"
    Write-Host "> abrindo com o bloqueio desligado..."
    Start-Process -FilePath $exe -ArgumentList $argumento

    Write-Host ""
    Write-Host "Quando abrir, olhe a caixinha de diagnostico no canto:"
    Write-Host "  SERVIDOR DE STREAMING deve dizer 'responde (HTTP 200)'."
    Write-Host ""
    Write-Host "Se disser, achamos a causa. Se continuar FALHOU, o motivo e outro."
    Write-Host ""
}

Testar-StremioMais
