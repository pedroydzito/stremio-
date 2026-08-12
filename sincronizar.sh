#!/bin/bash
# Copia a personalização do runtime do Mac para este repositório, regenera a
# lista de módulos e mostra o que mudou.
#
# Antes disto eu editava em ~/Library/Application Support/StremioCustomUI/custom
# (que é de onde o app do Mac lê, e portanto onde dá para testar na hora) e
# depois copiava à mão para cá. Copiar à mão erra: um arquivo esquecido no meio
# do caminho não dá erro nenhum, só um comportamento que não bate com o código.
#
# A lista é regenerada SEMPRE, e não só quando parece necessário: ela é o que
# define a ordem de carga, e um módulo novo que não entra nela simplesmente não
# é servido — sem aviso.
#
# Uso:
#   ./sincronizar.sh            copia, regenera e mostra o diff
#   ./sincronizar.sh --publica  faz isso e ainda comita e envia

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME="${STREMIO_RUNTIME:-$HOME/Library/Application Support/StremioCustomUI/custom}"
PUBLICA=0
[ "${1:-}" = "--publica" ] && PUBLICA=1

if [ ! -d "$RUNTIME" ]; then
    echo "Não achei o runtime em:"
    echo "  $RUNTIME"
    echo "Se ele está em outro lugar, defina STREMIO_RUNTIME."
    exit 1
fi

# --- 1. sintaxe antes de copiar ------------------------------------------
# Um módulo com erro de sintaxe derruba TODA a personalização, não só ele: o
# navegador para de avaliar o arquivo e nada dali roda. Já aconteceu, e o app
# ficou minutos assim. Por isso a checagem vem antes da cópia, não depois.
erros=0
for f in "$RUNTIME"/js/*.js; do
    node --check "$f" >/dev/null 2>&1 || { echo "ERRO DE SINTAXE: $(basename "$f")"; erros=1; }
done
[ "$erros" = "1" ] && { echo; echo "Nada foi copiado."; exit 1; }
echo "✓ sintaxe: $(ls "$RUNTIME"/js/*.js | wc -l | tr -d ' ') módulos"

# --- 1b. nada pode ser perdido na cópia ----------------------------------
# A cópia é de mão única: runtime → repositório, com --delete. Editar aqui e
# rodar isto APAGA a edição sem perguntar — foi o que aconteceu na primeira vez
# que rodei este script, e o único aviso foi um "nada mudou" logo depois, que
# parece sucesso.
#
# O runtime é a fonte da verdade porque é de onde o app do Mac lê: é lá que dá
# para testar antes de publicar. Editar no repositório é o caminho errado.
#
# A checagem é sobre PERDA, não sobre "tem mudança pendente": só barra o arquivo
# que (a) difere do runtime, e portanto será sobrescrito, E (b) difere do último
# commit, e portanto não existe em lugar nenhum além dali. Sincronizar duas
# vezes seguidas sem publicar não pode virar um bloqueio.
cd "$REPO"
perdidos=""
for destino in "$REPO"/public/custom/*/*; do
    [ -f "$destino" ] || continue
    rel="${destino#$REPO/}"
    origem="$RUNTIME/${rel#public/custom/}"
    cmp -s "$destino" "$origem" 2>/dev/null && continue      # igual: nada a perder
    git diff --quiet HEAD -- "$rel" 2>/dev/null && continue  # igual ao commit: recuperável
    perdidos="$perdidos  $rel\n"
done

if [ -n "$perdidos" ]; then
    echo
    echo "Estes arquivos do repositório seriam sobrescritos, e a versão deles"
    echo "não está comitada nem existe no runtime:"
    echo
    printf "$perdidos"
    echo "Edite no runtime, não aqui:"
    echo "  $RUNTIME"
    echo
    echo "Se a versão daqui é a certa, leve-a para o runtime antes de sincronizar."
    exit 1
fi

# --- 2. copiar -----------------------------------------------------------
# --delete para os dois lados ficarem iguais de verdade: sem ele, um módulo
# apagado no runtime continuaria sendo publicado daqui.
rsync -a --delete \
    --exclude '.DS_Store' \
    "$RUNTIME/css/" "$REPO/public/custom/css/"
rsync -a --delete \
    --exclude '.DS_Store' \
    "$RUNTIME/js/" "$REPO/public/custom/js/"
rsync -a --delete \
    --exclude '.DS_Store' \
    "$RUNTIME/img/" "$REPO/public/custom/img/"
echo "✓ copiado do runtime"

# --- 3. lista ------------------------------------------------------------
(cd "$REPO" && npm run lista --silent)

# --- 4. o que mudou ------------------------------------------------------
cd "$REPO"
if git diff --quiet && git diff --cached --quiet; then
    echo "✓ nada mudou"
    exit 0
fi
echo
git diff --stat | tail -20

if [ "$PUBLICA" = "1" ]; then
    echo
    git add -A
    git commit -q -m "Atualiza a personalização

$(git diff --cached --stat | tail -5)"
    git push -q origin main
    echo "✓ publicado"
else
    echo
    echo "Para publicar:  ./sincronizar.sh --publica"
fi
