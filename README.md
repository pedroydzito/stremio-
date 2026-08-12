# Stremio+

Interface personalizada do Stremio, servida pela Vercel.

Continua sendo o **Stremio instalado** — player mpv, servidor de streaming e
integração com o sistema seguem nativos. O que muda é de onde a interface é
baixada: em vez de `web.stremio.com`, o app aponta para este projeto, que serve
a mesma página com o nosso CSS e JS injetados.

O ganho prático: publique aqui e todo mundo recebe na próxima abertura, sem
reinstalar nada e sem precisar de Node na máquina de ninguém.

## Como funciona

```
Stremio.app  --webui-url=https://…vercel.app
      │
      ▼
api/proxy.js ──► busca o HTML de web.stremio.com
      │          injeta <link> e <script> de /custom
      ▼
   interface personalizada     (player e servidor continuam locais)
```

- `api/proxy.js` — o proxy e a injeção
- `public/custom/css`, `public/custom/js` — os módulos, carregados em ordem
  alfabética (daí os prefixos `00-`, `01-`…)
- `arquivos.js` — a lista dos módulos, **gerada**; veja abaixo
- `vercel.json` — `/custom/*` sai como arquivo estático, o resto vai ao proxy

## Publicar

```bash
npm i -g vercel
vercel --prod
```

## Instalar na máquina

**macOS** — uma vez só:

```bash
./public/instalar/instalar-mac.sh https://SEU-PROJETO.vercel.app
```

Clona o `Stremio.app`, renomeia para Stremio+, e faz o app abrir apontando para
a URL. Depois disso, atualizações chegam sozinhas.

**Windows** — no PowerShell, sem baixar nada antes:

```powershell
irm https://SEU-PROJETO.vercel.app/instalar/instalar-windows.ps1 | iex
```

Cria um atalho "Stremio+" na área de trabalho e no menu Iniciar. O original
continua funcionando, e nada é escrito dentro da pasta do Stremio — lá dentro,
uma atualização do app levaria tudo junto.

No Windows a interface **não** pode vir direto da nuvem, e a razão é o motor: no
Mac o Stremio desenha com WebKit, no Windows com WebView2, que é Chromium. O
Chromium novo exige permissão para uma página https falar com 127.0.0.1 —
permissão que o servidor de streaming não responde e que, dentro de um app, não
tem onde ser pedida. A chamada falha calada: a interface conclui que não há
servidor, e o login não dura de uma abertura para a outra.

Por isso a instalação do Windows monta um servidor local:

```
atalho → wscript → abrir.ps1 ─┬─► servidor.ps1  (127.0.0.1:11471)
                              │        └─ webui/ ← baixa de web.stremio.com o
                              │                    que faltar, uma vez cada
                              └─► Stremio.exe --webui-url=http://127.0.0.1:11471/…
```

Servida de 127.0.0.1, a página deixa de ser remota e nada daquilo se aplica. O
CSS e o JS continuam vindo da Vercel — publicar segue chegando sozinho; só o
HTML e os arquivos do próprio Stremio passam pelo disco.

O `wscript` no meio existe só para não piscar um console preto antes do app.

## Mexer no visual

Edite os arquivos em `public/custom/`. Ao **adicionar ou remover** um módulo,
regenere a lista antes de publicar:

```bash
npm run lista
```

A lista é gerada e versionada em vez de lida em tempo de execução: a função da
Vercel só enxerga o que foi empacotado com ela, e ler diretório em runtime é o
tipo de coisa que funciona no teste e falha no deploy.

## Duas coisas que não dá para fazer daqui

**Ícone e nome do app.** São propriedade do bundle instalado; nenhuma URL
remota muda isso. É por esse motivo que o instalador continua existindo — mas
ele roda uma vez e some do caminho.

**Abrir links no navegador.** Na instalação local havia uma rota `/abrir` que
chamava o `open` do sistema, porque nesta shell `target="_blank"` não funciona
(`window.open` devolve `null`). Uma função em nuvem não abre navegador no
computador de ninguém, então aqui ela responde `501` e o app copia o link para
a área de transferência — um `Cmd+V` resolve.

## Celular

Não há como. Os apps de Android e iOS são nativos e não expõem `--webui-url`.
O mais perto é abrir esta URL no navegador do celular e adicionar à tela de
início: o visual vem junto, mas a reprodução é do navegador, não do app.
