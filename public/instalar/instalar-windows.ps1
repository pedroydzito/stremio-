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
# Uso (PowerShell):
#   .\instalar-windows.ps1
#   .\instalar-windows.ps1 -Url "https://outra-url.vercel.app"

param(
    [string]$Url = "https://stremio-plus.vercel.app",
    [string]$IconeUrl = ""
)

$ErrorActionPreference = "Stop"
$Url = $Url.TrimEnd('/')
# O icone mora ao lado da interface, no mesmo lugar - quem trocar a URL leva o
# icone junto, sem ter que lembrar de um segundo endereco.
if (-not $IconeUrl) { $IconeUrl = "$Url/instalar/icone.ico" }

function Escrever($texto) { Write-Host "> $texto" }

# ---- 1. achar o Stremio instalado ---------------------------------------
$candidatos = @(
    "$env:LOCALAPPDATA\Programs\LNV\Stremio-4\stremio.exe",
    "$env:LOCALAPPDATA\Programs\Stremio\stremio.exe",
    "${env:ProgramFiles}\Stremio\stremio.exe",
    "${env:ProgramFiles(x86)}\Stremio\stremio.exe"
)
$exe = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
    # Nao achou nos lugares de sempre: procura pelo atalho ja existente, que
    # aponta para onde quer que o instalador tenha colocado.
    $atalhos = @(
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Stremio.lnk",
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Stremio.lnk",
        "$env:USERPROFILE\Desktop\Stremio.lnk"
    ) | Where-Object { Test-Path $_ }

    if ($atalhos) {
        $sh = New-Object -ComObject WScript.Shell
        $exe = $sh.CreateShortcut($atalhos[0]).TargetPath
    }
}

if (-not $exe -or -not (Test-Path $exe)) {
    Write-Host "Nao encontrei o Stremio instalado."
    Write-Host "Instale o Stremio oficial primeiro: https://www.stremio.com/downloads"
    exit 1
}
Escrever "Stremio encontrado em: $exe"

# ---- 2. guardar o icone num lugar estavel -------------------------------
# O atalho aponta para o arquivo do icone, entao ele nao pode ficar na pasta
# de Downloads, que voce provavelmente vai limpar.
$destino = "$env:LOCALAPPDATA\StremioMais"
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$instalado = Join-Path $destino "icone.ico"
$aoLado = Join-Path $PSScriptRoot "icone.ico"

if (Test-Path $aoLado) {
    Copy-Item $aoLado $instalado -Force
} else {
    # Rodou o script sozinho, sem o resto da pasta: busca o icone no repositorio.
    # E so o icone que falta, entao vale a pena tentar antes de desistir dele.
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $IconeUrl -OutFile $instalado -UseBasicParsing
    } catch {
        Escrever "Nao consegui baixar o icone; fica o icone padrao do Stremio"
    }
}

if (Test-Path $instalado) {
    $icone = $instalado
    Escrever "Icone instalado"
} else {
    $icone = $exe          # sem o arquivo, fica o icone do proprio Stremio
}

# ---- 3. montar o argumento ----------------------------------------------
# O endereco do servidor de streaming vai codificado dentro da URL, do mesmo
# jeito que o app faz por conta propria.
$servidor = [System.Uri]::EscapeDataString("http://127.0.0.1:11470")
$argumento = "--webui-url=`"$Url/#/?streamingServerUrl=$servidor`""

# ---- 4. criar os atalhos -------------------------------------------------
$sh = New-Object -ComObject WScript.Shell
$locais = @(
    "$env:USERPROFILE\Desktop\Stremio+.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Stremio+.lnk"
)

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
    Escrever "Atalho criado: $caminho"
}

Write-Host ""
Write-Host "Pronto! Abra o 'Stremio+' pela area de trabalho ou pelo menu Iniciar."
Write-Host "Para fixar na barra de tarefas: clique com o botao direito no atalho > Fixar."
Write-Host ""
Write-Host "O Stremio original continua funcionando normalmente, sem alteracao."
