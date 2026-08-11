#!/bin/bash
# Stremio+ — instalador para macOS.
#
# Faz três coisas, uma vez só:
#   1. cria o Stremio+ a partir do Stremio que você já tem instalado
#   2. troca o nome e o ícone
#   3. faz a interface vir da nuvem, para receber atualizações sozinho
#
# À PROVA DE ATUALIZAÇÃO DO STREMIO: o Stremio+ guarda de qual versão ele foi
# feito. Quando o Stremio oficial se atualiza, ele percebe na próxima abertura e
# se refaz sozinho a partir da versão nova — sem você fazer nada.
#
# Uso:  ./instalar-mac.sh [https://sua-url.vercel.app]
set -euo pipefail

URL_PADRAO="https://stremio-plus.vercel.app"
URL="${1:-$URL_PADRAO}"
URL="${URL%/}"

ORIGEM="/Applications/Stremio.app"
DESTINO="$HOME/Applications/Stremio+.app"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$ORIGEM" ]; then
    echo "Não encontrei o Stremio em $ORIGEM."
    echo "Instale o Stremio oficial primeiro: https://www.stremio.com/downloads"
    exit 1
fi

versao_de() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || echo "?"; }
VERSAO="$(versao_de "$ORIGEM")"

echo "› criando o Stremio+ a partir do Stremio $VERSAO"
rm -rf "$DESTINO"
mkdir -p "$HOME/Applications"
# -c usa clonefile do APFS: cópia instantânea que não duplica espaço em disco
cp -Rc "$ORIGEM" "$DESTINO" 2>/dev/null || cp -R "$ORIGEM" "$DESTINO"

BIN="$DESTINO/Contents/MacOS/Stremio"
[ -x "$BIN" ] || { echo "O executável não veio no pacote. Reinstale o Stremio oficial."; exit 1; }

echo "› renomeando para Stremio+"
PLIST="$DESTINO/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Stremio+" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Stremio+" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Stremio+" "$PLIST"

if [ -f "$AQUI/icone.png" ]; then
    echo "› trocando o ícone"
    TMP="$(mktemp -d)/icone.iconset"; mkdir -p "$TMP"
    for t in 16 32 64 128 256 512 1024; do
        sips -z $t $t "$AQUI/icone.png" --out "$TMP/icon_${t}x${t}.png" >/dev/null 2>&1 || true
    done
    # o macOS espera estes nomes exatos; os @2x são os dobros
    mv "$TMP/icon_64x64.png"     "$TMP/icon_32x32@2x.png"   2>/dev/null || true
    mv "$TMP/icon_1024x1024.png" "$TMP/icon_512x512@2x.png" 2>/dev/null || true
    NOME_ICNS="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$PLIST" 2>/dev/null || echo icon)"
    NOME_ICNS="${NOME_ICNS%.icns}"
    iconutil -c icns "$TMP" -o "$DESTINO/Contents/Resources/${NOME_ICNS}.icns" 2>/dev/null \
        && echo "  ok" || echo "  (não consegui gerar o ícone; o resto segue)"
fi

echo "› apontando a interface para $URL"
mkdir -p "$DESTINO/Contents/Resources/stremio-mais"
cp "$AQUI/instalar-mac.sh" "$DESTINO/Contents/Resources/stremio-mais/instalar.sh" 2>/dev/null || true
[ -f "$AQUI/icone.png" ] && cp "$AQUI/icone.png" "$DESTINO/Contents/Resources/stremio-mais/icone.png"
echo "$URL"    > "$DESTINO/Contents/Resources/stremio-mais/url"
echo "$VERSAO" > "$DESTINO/Contents/Resources/stremio-mais/versao"

mv "$BIN" "$DESTINO/Contents/MacOS/Stremio-original"
cat > "$BIN" <<'LANCADOR'
#!/bin/bash
# Abre o Stremio apontando a interface para a nuvem — e, antes disso, confere
# se o Stremio oficial se atualizou. Se sim, refaz o Stremio+ a partir da
# versão nova, para nunca ficar preso numa versão velha do app.
AQUI="$(cd "$(dirname "$0")" && pwd)"
DADOS="$AQUI/../Resources/stremio-mais"
URL="$(cat "$DADOS/url" 2>/dev/null)"
OFICIAL="/Applications/Stremio.app"

versao_de() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || echo "?"; }

if [ -d "$OFICIAL" ] && [ -f "$DADOS/versao" ] && [ -f "$DADOS/instalar.sh" ]; then
    NOVA="$(versao_de "$OFICIAL")"
    ANTIGA="$(cat "$DADOS/versao")"
    if [ "$NOVA" != "$ANTIGA" ] && [ "$NOVA" != "?" ]; then
        # Refaz numa cópia dos scripts: o instalador apaga este pacote inteiro,
        # e um script não sobrevive ao próprio diretório ser removido.
        TMP="$(mktemp -d)"
        cp "$DADOS/instalar.sh" "$TMP/" 2>/dev/null
        cp "$DADOS/icone.png"   "$TMP/" 2>/dev/null || true
        chmod +x "$TMP/instalar.sh"
        "$TMP/instalar.sh" "$URL" >/dev/null 2>&1 && { open -a "$HOME/Applications/Stremio+.app"; exit 0; }
    fi
fi

SERVIDOR="http://127.0.0.1:11470"
exec "$AQUI/Stremio-original" \
  --webui-url="$URL/#/?streamingServerUrl=$(printf '%s' "$SERVIDOR" | sed 's|:|%3A|g; s|/|%2F|g')" "$@"
LANCADOR
chmod +x "$BIN"

# Mexer no pacote invalida a assinatura; a ad-hoc basta para rodar localmente.
echo "› reassinando"
codesign --force --deep --sign - "$DESTINO" >/dev/null 2>&1 || echo "  (aviso: sem assinatura; o app ainda abre)"

# Faz o Finder reler nome e ícone
touch "$DESTINO"; killall Finder 2>/dev/null || true

echo
echo "Pronto! O Stremio+ está em ~/Applications."
echo "Abra, e depois clique com o botão direito no ícone do Dock → Opções → Manter no Dock."
