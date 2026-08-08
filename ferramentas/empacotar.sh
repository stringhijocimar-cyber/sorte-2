#!/bin/sh
# Empacota o app num .zip para download.
#
# Existe porque o GitHub serve .html como text/plain: clicar no link mostra o
# código na tela em vez de baixar o arquivo. Com .zip o navegador baixa sempre,
# e o Android descompacta sem app extra.
set -e
cd "$(dirname "$0")/.."
node ferramentas/gerar-completo.mjs
cp lotolab-completo.html LotoLab.html
rm -f LotoLab-app.zip
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile("LotoLab-app.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=9)
z.write("LotoLab.html")
z.writestr("COMO-USAR.txt", """LotoLab — como abrir

1. Descompacte este arquivo (o Android faz isso sozinho: toque no zip e
   escolha extrair).
2. Toque em LotoLab.html. Ele abre no navegador.
3. Opcional: no menu do navegador, "Adicionar a tela inicial". Vira app.

Funciona sem internet. Ja vem com 4.399 concursos das 8 loterias.

O app NAO preve resultados e NAO aumenta a chance de acerto. Sorteios honestos
sao eventos independentes. O que ele faz e medir, comparar com o acaso, e
mostrar quando um achado e apenas ruido.
""")
z.close()
PY
rm -f LotoLab.html
ls -la LotoLab-app.zip
