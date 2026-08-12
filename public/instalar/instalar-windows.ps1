# Stremio+ - instalador para Windows.
#
# Cria um atalho "Stremio+" que abre o Stremio que voce ja tem instalado, com
# a interface personalizada. Nome e icone proprios; o app original continua
# intacto e pode ser usado normalmente.
#
# POR QUE TEM UM SERVIDOR LOCAL NO MEIO
#
# A interface ja veio direto da nuvem, por https, e no Windows isso nao
# funciona. O motivo e o motor: no Mac o Stremio desenha com WebKit, aqui com
# WebView2, que e Chromium - e o Chromium novo exige permissao para uma pagina
# https falar com 127.0.0.1. O servidor de streaming do Stremio nao responde o
# cabecalho que essa permissao pede, e dentro de um app nao ha onde pedir
# permissao ao usuario: a chamada falha calada, a interface conclui que nao ha
# servidor, e o login nao dura de uma abertura para a outra.
#
# Servindo a pagina de 127.0.0.1, ela deixa de ser "remota" e nada disso se
# aplica. O que continua na nuvem e o CSS e o JS da personalizacao - ou seja,
# as atualizacoes seguem chegando sozinhas.
#
# A PROVA DE ATUALIZACAO: nada e escrito dentro da pasta do Stremio. O atalho
# aponta para arquivos em LOCALAPPDATA, e o Stremio pode se atualizar a vontade.
#
# Uso (PowerShell):
#   irm https://stremio-plus.vercel.app/instalar/instalar-windows.ps1 | iex
#
# TUDO vive dentro de uma funcao de proposito: chegando por `iex`, um bloco
# param() no topo vira atribuicao solta e quebra na primeira linha, e um `exit`
# fecharia a janela do PowerShell antes de dar tempo de ler o motivo.

function Instalar-StremioMais {
    param(
        [string]$Url = "https://stremio-plus.vercel.app"
    )

    $ErrorActionPreference = "Stop"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    if ($env:STREMIO_MAIS_URL) { $Url = $env:STREMIO_MAIS_URL }
    $Url = $Url.TrimEnd('/')

    function Escrever($texto) { Write-Host "> $texto" }

    # Join-Path com base vazia nao devolve erro, ele lanca - e uma pasta
    # especial que o Windows nao conhece volta como string vazia.
    function Caminho($pasta, $arquivo) {
        $base = [Environment]::GetFolderPath($pasta)
        if (-not $base) { return "" }
        return (Join-Path $base $arquivo)
    }

    # ---- 1. achar o Stremio instalado ------------------------------------
    $exe = @(
        "$env:LOCALAPPDATA\Programs\stremio\Stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-4\stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-5\stremio.exe",
        "${env:ProgramFiles}\Stremio\stremio.exe",
        "${env:ProgramFiles(x86)}\Stremio\stremio.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

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
        # Select-Object em vez de [0]: com UM resultado o Where-Object devolve a
        # string crua, e [0] ali pega a primeira LETRA do caminho.
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

    # ---- 2. a pasta do Stremio+ ------------------------------------------
    # Fora da pasta do Stremio de proposito: la dentro, uma atualizacao do app
    # levaria tudo junto.
    $destino = "$env:LOCALAPPDATA\StremioMais"
    New-Item -ItemType Directory -Force -Path $destino | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $destino "webui") | Out-Null

    Set-Content -Path (Join-Path $destino "stremio.txt") -Value $exe
    Set-Content -Path (Join-Path $destino "custom.txt")  -Value $Url

    # ---- 3. baixar as pecas ----------------------------------------------
    # Se o script foi baixado com a pasta ao lado, usa o que ja esta em disco;
    # senao busca cada peca. Chegando por `iex` nao ha pasta, e $PSScriptRoot
    # vem vazio - Join-Path com caminho vazio lanca, por isso o teste antes.
    $daPasta = if ($PSScriptRoot) { $PSScriptRoot } else { "" }

    foreach ($peca in @("servidor.ps1", "abrir.ps1", "abrir.vbs", "icone.ico")) {
        $alvo = Join-Path $destino $peca
        $lado = if ($daPasta) { Join-Path $daPasta $peca } else { "" }

        if ($lado -and (Test-Path $lado)) {
            Copy-Item $lado $alvo -Force
        } else {
            try {
                Invoke-WebRequest -Uri "$Url/instalar/$peca" -OutFile $alvo -UseBasicParsing
            } catch {
                if ($peca -eq "icone.ico") {
                    # So a aparencia. Nao vale abortar a instalacao por isso.
                    Escrever "nao consegui baixar o icone; fica o icone do Stremio"
                } else {
                    Write-Host ""
                    Write-Host "Falhou ao baixar $peca de $Url/instalar/$peca"
                    Write-Host "  $($_.Exception.Message)"
                    Write-Host ""
                    return
                }
            }
        }
    }
    Escrever "Arquivos instalados em: $destino"

    $icone = Join-Path $destino "icone.ico"
    if (-not (Test-Path $icone)) { $icone = $exe }

    # ---- 4. criar os atalhos ---------------------------------------------
    # O atalho chama o wscript, nao o PowerShell: chamando o PowerShell direto,
    # uma janela preta de console pisca antes do app aparecer.
    $sh = New-Object -ComObject WScript.Shell
    $wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
    $vbs = Join-Path $destino "abrir.vbs"

    # Os caminhos vem do proprio Windows em vez de "$env:USERPROFILE\Desktop":
    # com o OneDrive ligado a area de trabalho fica dentro do OneDrive.
    $locais = @(
        (Caminho 'Desktop' 'Stremio+.lnk'),
        (Caminho 'Programs' 'Stremio+.lnk')
    ) | Where-Object { $_ }

    $criados = 0
    foreach ($caminho in $locais) {
        $pasta = Split-Path $caminho
        if (-not (Test-Path $pasta)) { continue }

        $atalho = $sh.CreateShortcut($caminho)
        $atalho.TargetPath = $wscript
        $atalho.Arguments = "`"$vbs`""
        $atalho.WorkingDirectory = $destino
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
    Write-Host "A primeira abertura demora um pouco: a interface esta sendo baixada"
    Write-Host "para $destino\webui. Da segunda em diante ela sai do disco."
    Write-Host ""
    Write-Host "O Stremio original continua funcionando normalmente, sem alteracao."
    Write-Host ""
}

Instalar-StremioMais
