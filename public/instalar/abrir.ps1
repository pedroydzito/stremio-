# Stremio+ - o que o atalho executa.
#
# Sobe o servidor local da interface, espera a porta responder, abre o Stremio
# apontando para ela, e derruba o servidor quando o Stremio fecha.
#
# A espera pela porta nao e frescura: sem ela o Stremio abre antes de haver o
# que servir, mostra tela de erro e nao tenta de novo sozinho.

param(
    [int]$Porta = 11471,
    [string]$Url = ""
)

$ErrorActionPreference = "Stop"
$base = Join-Path $env:LOCALAPPDATA "StremioMais"
$servidor = Join-Path $base "servidor.ps1"
$registro = Join-Path $base "stremio.txt"
$log = Join-Path $base "abrir.log"

function Anota($t) {
    try { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t" | Add-Content $log } catch { }
}

# Log curto: isto roda toda vez que o app abre.
try {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 262144) {
        Get-Content $log -Tail 200 | Set-Content $log
    }
} catch { }

# ---- 1. onde esta o Stremio ---------------------------------------------
# O instalador ja descobriu e anotou. A busca aqui e so para o caso de o
# Stremio ter sido reinstalado em outro lugar depois.
$exe = ""
if (Test-Path $registro) { $exe = (Get-Content $registro -Raw).Trim() }

if (-not $exe -or -not (Test-Path $exe)) {
    $exe = @(
        "$env:LOCALAPPDATA\Programs\stremio\Stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-4\stremio.exe",
        "$env:LOCALAPPDATA\Programs\LNV\Stremio-5\stremio.exe",
        "${env:ProgramFiles}\Stremio\stremio.exe",
        "${env:ProgramFiles(x86)}\Stremio\stremio.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($exe) { Set-Content -Path $registro -Value $exe }
}

if (-not $exe -or -not (Test-Path $exe)) {
    Anota "Stremio nao encontrado"
    [void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
    [Windows.Forms.MessageBox]::Show(
        "Nao encontrei o Stremio instalado. Rode o instalador do Stremio+ de novo.",
        "Stremio+") | Out-Null
    exit 1
}

# ---- 2. o servidor da interface -----------------------------------------
function PortaViva($p) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $p)
        $c.Close()
        return $true
    } catch { return $false }
}

$processo = $null
if (PortaViva $Porta) {
    # Ja tem alguem servindo - provavelmente uma janela anterior do Stremio+.
    # Nesse caso o servidor nao e nosso, e por isso nao sera derrubado no fim.
    Anota "porta $Porta ja estava ocupada; reaproveitando"
} else {
    Anota "subindo o servidor na porta $Porta"
    $processo = Start-Process -PassThru -WindowStyle Hidden -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", "`"$servidor`"", "-Porta", "$Porta"
        )

    $pronto = $false
    foreach ($i in 1..60) {
        Start-Sleep -Milliseconds 250
        if ($processo.HasExited) { break }
        if (PortaViva $Porta) { $pronto = $true; break }
    }

    if (-not $pronto) {
        Anota "o servidor nao respondeu"
        [void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
        [Windows.Forms.MessageBox]::Show(
            "O servidor da interface nao subiu na porta $Porta.`n`nVeja o log em:`n$log",
            "Stremio+") | Out-Null
        try { $processo.Kill() } catch { }
        exit 1
    }
}

# ---- 3. o Stremio --------------------------------------------------------
if (-not $Url) { $Url = "http://127.0.0.1:$Porta" }
$streaming = [System.Uri]::EscapeDataString("http://127.0.0.1:11470")
$argumento = "--webui-url=`"$Url/#/?streamingServerUrl=$streaming`""

Anota "abrindo $exe $argumento"
Start-Process -FilePath $exe -ArgumentList $argumento -Wait

# ---- 4. limpeza ----------------------------------------------------------
# So derruba o servidor se foi este processo que o subiu: com duas janelas
# abertas, fechar uma nao pode deixar a outra sem interface.
if ($processo -and -not $processo.HasExited) {
    Anota "Stremio fechou; derrubando o servidor"
    try { $processo.Kill() } catch { }
}
