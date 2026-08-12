# Stremio+ - instalador para Windows.
#
# Cria um atalho "Stremio+" que abre o Stremio que voce ja tem instalado, com
# a interface vindo da nuvem. Nome e icone proprios; o app original continua
# intacto e pode ser usado normalmente.
#
# A PROVA DE ATUALIZACAO: no Windows o argumento vive no ATALHO, nao dentro do
# programa. Quando o Stremio se atualiza, o executavel continua no mesmo lugar
# e o atalho segue valendo - nao ha nada a refazer.
#
# Uso:
#   irm https://stremio-plus.vercel.app/instalar/instalar-windows.ps1 | iex
#
# Para apontar para outro deploy, defina a variavel antes de rodar:
#   $env:STREMIO_MAIS_URL = "https://outra-url.vercel.app"
#
# TUDO vive dentro de uma funcao, e isso e proposital. Este script e feito para
# chegar pelo `iex`, e ali o topo do arquivo nao e um script de verdade: um
# bloco `param()` vira atribuicao solta e quebra na primeira linha, e um `exit`
# fecharia a janela do PowerShell antes de voce ler o motivo. Dentro de uma
# funcao, os parametros valem, `return` so sai da funcao, e o
# ErrorActionPreference nao vaza para a sua sessao depois que termina.

function Instalar-StremioMais {
    param(
        [string]$Url = "https://stremio-plus.vercel.app",
        [string]$IconeUrl = ""
    )

    $ErrorActionPreference = "Stop"

    if ($env:STREMIO_MAIS_URL) { $Url = $env:STREMIO_MAIS_URL }
    $Url = $Url.TrimEnd('/')

    # O icone mora ao lado da interface, no mesmo lugar - quem trocar a URL leva
    # o icone junto, sem ter que lembrar de um segundo endereco.
    if (-not $IconeUrl) { $IconeUrl = "$Url/instalar/icone.ico" }

    function Escrever($texto) { Write-Host "> $texto" }

    # Join-Path com base vazia nao devolve erro, ele lanca - e uma pasta
    # especial que o Windows nao conhece volta como string vazia. Melhor sair
    # de mao vazia e ser filtrado adiante do que derrubar a instalacao.
    function Caminho($pasta, $arquivo) {
        $base = [Environment]::GetFolderPath($pasta)
        if (-not $base) { return "" }
        return (Join-Path $base $arquivo)
    }

    # ---- 1. achar o Stremio instalado ------------------------------------
    $candidatos = @(
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-4\stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-5\stremio.exe",
        "$env:LOCALAPPDATA\Programs\Stremio\stremio.exe",
        "${env:ProgramFiles}\Stremio\stremio.exe",
        "${env:ProgramFiles(x86)}\Stremio\stremio.exe"
    )
    $exe = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $exe) {
        # Nao achou nos lugares de sempre: pergunta ao registro onde o
        # desinstalador diz que o programa foi parar.
        $chaves = @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
        )
        $achado = Get-ItemProperty $chaves -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like '*Stremio*' -and $_.InstallLocation } |
            Select-Object -First 1
        if ($achado) {
            $tentativa = Join-Path $achado.InstallLocation "stremio.exe"
            if (Test-Path $tentativa) { $exe = $tentativa }
        }
    }

    if (-not $exe) {
        # Ultimo recurso: o atalho que ja existe aponta para onde quer que
        # esteja, mesmo que seja um lugar que eu nao conheca.
        # Select-Object em vez de [0]: com UM resultado o Where-Object devolve
        # a string crua, nao uma lista de um item - e [0] ali pega a primeira
        # LETRA do caminho. Foi o que aconteceu na primeira versao disto.
        $atalho = @(
            (Caminho 'Programs' 'Stremio.lnk'),
            (Caminho 'CommonPrograms' 'Stremio.lnk'),
            (Caminho 'Desktop' 'Stremio.lnk')
        ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

        if ($atalho) {
            $sh = New-Object -ComObject WScript.Shell
            $exe = $sh.CreateShortcut($atalho).TargetPath
        }
    }

    if (-not $exe -or -not (Test-Path $exe)) {
        Write-Host ""
        Write-Host "Nao encontrei o Stremio instalado nesta maquina."
        Write-Host "Instale o Stremio oficial primeiro: https://www.stremio.com/downloads"
        Write-Host "Depois rode este comando de novo."
        Write-Host ""
        return
    }
    Escrever "Stremio encontrado em: $exe"

    # ---- 2. guardar o icone num lugar estavel ----------------------------
    # O atalho aponta para o ARQUIVO do icone, entao ele nao pode ficar na
    # pasta de Downloads, que uma hora voce vai limpar.
    $destino = "$env:LOCALAPPDATA\StremioMais"
    New-Item -ItemType Directory -Force -Path $destino | Out-Null
    $instalado = Join-Path $destino "icone.ico"

    # Chegando pelo `iex` o script nao tem pasta, e $PSScriptRoot vem vazio -
    # Join-Path com caminho vazio nao devolve erro, ele lanca. Por isso o
    # caminho ao lado so e montado quando existe uma pasta de verdade.
    $aoLado = if ($PSScriptRoot) { Join-Path $PSScriptRoot "icone.ico" } else { "" }

    if ($aoLado -and (Test-Path $aoLado)) {
        Copy-Item $aoLado $instalado -Force
    } else {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $IconeUrl -OutFile $instalado -UseBasicParsing
        } catch {
            # E so o icone. Perder a aparencia nao justifica abortar a
            # instalacao inteira.
            Escrever "Nao consegui baixar o icone; fica o icone padrao do Stremio"
        }
    }

    if (Test-Path $instalado) {
        $icone = $instalado
        Escrever "Icone instalado"
    } else {
        $icone = $exe
    }

    # ---- 3. montar o argumento -------------------------------------------
    # O endereco do servidor de streaming vai codificado dentro da URL, do
    # mesmo jeito que o app faz por conta propria.
    $servidor = [System.Uri]::EscapeDataString("http://127.0.0.1:11470")
    $argumento = "--webui-url=`"$Url/#/?streamingServerUrl=$servidor`""

    # ---- 4. criar os atalhos ---------------------------------------------
    # Os caminhos vem do proprio Windows em vez de "$env:USERPROFILE\Desktop":
    # com o OneDrive ligado a area de trabalho fica dentro do OneDrive, e o
    # caminho montado na mao aponta para uma pasta que nao existe mais.
    $sh = New-Object -ComObject WScript.Shell
    $locais = @(
        (Caminho 'Desktop' 'Stremio+.lnk'),
        (Caminho 'Programs' 'Stremio+.lnk')
    ) | Where-Object { $_ }

    $criados = 0
    foreach ($caminho in $locais) {
        $pasta = Split-Path $caminho
        if (-not (Test-Path $pasta)) { continue }

        $atalho = $sh.CreateShortcut($caminho)
        $atalho.TargetPath = $exe
        $atalho.Arguments = $argumento
        $atalho.WorkingDirectory = Split-Path $exe
        $atalho.IconLocation = $icone
        $atalho.Description = "Stremio+ - interface personalizada"
        $atalho.Save()
        $criados += 1
        Escrever "Atalho criado: $caminho"
    }

    if ($criados -eq 0) {
        Write-Host ""
        Write-Host "Nao consegui criar o atalho em nenhuma pasta conhecida."
        Write-Host ""
        return
    }

    Write-Host ""
    Write-Host "Pronto! Abra o 'Stremio+' pela area de trabalho ou pelo menu Iniciar."
    Write-Host "Para fixar na barra de tarefas: botao direito no atalho > Fixar."
    Write-Host ""
    Write-Host "O Stremio original continua funcionando normalmente, sem alteracao."
    Write-Host ""
}

Instalar-StremioMais
