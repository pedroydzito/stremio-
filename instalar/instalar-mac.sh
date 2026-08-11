#!/bin/bash
# Instalador do Stremio+ — versão em nuvem.
#
# O que ele faz, uma vez só:
#   1. clona o Stremio.app instalado para ~/Applications/Stremio+.app
#   2. troca nome e ícone
#   3. faz o app abrir apontando a interface para a URL do Stremio+
#
# O que ele NÃO faz mais (e é a diferença para a versão antiga):
#   · não precisa de Node.js
#   · não sobe servidor nenhum na sua máquina
#   · não precisa manter pasta de CSS/JS atualizada — isso vive na nuvem
#
# Uso:  ./instalar-mac.sh https://SEU-PROJETO.vercel.app
set -euo pipefail

URL="${1:-}"
[ -z "$URL" ] && { echo "Uso: $0 https://SEU-PROJETO.vercel.app"; exit 1; }
URL="${URL%/}"

ORIGEM="/Applications/Stremio.app"
DESTINO="$HOME/Applications/Stremio+.app"
[ -d "$ORIGEM" ] || { echo "Não achei o Stremio em $ORIGEM. Instale o Stremio oficial primeiro."; exit 1; }

echo "› clonando o app"
rm -rf "$DESTINO"
mkdir -p "$HOME/Applications"
# -c usa clonefile do APFS: cópia instantânea, sem duplicar espaço em disco
cp -Rc "$ORIGEM" "$DESTINO" 2>/dev/null || cp -R "$ORIGEM" "$DESTINO"

BIN="$DESTINO/Contents/MacOS/Stremio"
[ -x "$BIN" ] || { echo "Executável não encontrado no bundle."; exit 1; }

echo "› renomeando para Stremio+"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Stremio+" "$DESTINO/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Stremio+" "$DESTINO/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Stremio+" "$DESTINO/Contents/Info.plist"

echo "› apontando a interface para $URL"
mv "$BIN" "$DESTINO/Contents/MacOS/Stremio-original"
cat > "$BIN" <<LANCADOR
#!/bin/bash
# A interface vem da nuvem; o player, o servidor de streaming e a integração
# com o sistema continuam nativos, aqui na máquina.
SERVIDOR="http://127.0.0.1:11470"
exec "\$(dirname "\$0")/Stremio-original" \\
  --webui-url="$URL/#/?streamingServerUrl=\$(printf '%s' "\$SERVIDOR" | sed 's|:|%3A|g; s|/|%2F|g')" "\$@"
LANCADOR
chmod +x "$BIN"

# A assinatura quebra ao mexer no bundle; ad-hoc basta para rodar localmente.
echo "› reassinando"
codesign --force --deep --sign - "$DESTINO" >/dev/null 2>&1 || echo "  (aviso: não consegui reassinar; o app ainda deve abrir)"

echo
echo "Pronto. Abra o Stremio+ em ~/Applications."
echo "Para colocar no Dock: abra o app, clique com o botão direito no ícone → Opções → Manter no Dock."
