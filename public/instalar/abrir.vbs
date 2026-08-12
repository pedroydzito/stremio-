' Stremio+ - casca do atalho.
'
' Existe por um motivo so: chamar o PowerShell direto pelo atalho pisca uma
' janela preta de console antes do app aparecer. O wscript executa sem console
' nenhum, entao o unico jeito de nao piscar e passar por aqui.
'
' O 0 no Run e o "sem janela"; o False e "nao espere terminar" - quem espera o
' Stremio fechar, para derrubar o servidor depois, e o proprio abrir.ps1.

Set sh = CreateObject("WScript.Shell")
base = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\StremioMais\"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & base & "abrir.ps1""", 0, False
