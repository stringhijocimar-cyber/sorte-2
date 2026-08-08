#!/usr/bin/env python3
"""
Gera os PNGs do ícone a partir de icone.svg.

    python3 ferramentas/gerar-pngs-do-icone.py

Por que existe: o `icone.svg` é a fonte da marca — é ele que o app desenha no
cabeçalho. Os PNGs (manifest do navegador e ícones do Android) eram arte
separada, desenhada uma vez e nunca mais tocada. Quando o trevo mudou, o ícone
do celular continuou o antigo, porque nada ligava um ao outro. Agora liga.

A rasterização é feita pelo Chromium headless, e não por uma biblioteca de SVG:
é o mesmo motor que desenha o ícone dentro do app, então o PNG sai idêntico ao
que o usuário vê no cabeçalho — sem diferença de gradiente ou de arredondamento
de curva entre uma renderização e outra.

Três saídas, com recortes diferentes de propósito:

  icone-512.png / icone-192.png  o trevo sobre o fundo naval, ocupando a área
                                 quase toda — é o ícone que o navegador mostra
  icone-maskable.png             o mesmo, com o trevo reduzido a 60% e centrado.
                                 O Android recorta o ícone adaptativo em
                                 círculo, quadrado ou "squircle" conforme o
                                 fabricante, e só garante o círculo central. Um
                                 trevo em tamanho cheio perderia as pontas das
                                 folhas em qualquer aparelho que recorte redondo.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SVG = RAIZ / "icone.svg"
NAVAL = (15, 30, 46, 255)  # #0F1E2E, a mesma de ic_launcher_background

#: Fração do lado que a arte ocupa. O maskable é menor porque o Android corta.
OCUPACAO_NORMAL = 0.88
OCUPACAO_MASCARAVEL = 0.60

CANDIDATOS_CHROME = [
    os.environ.get("LOTOLAB_CHROME"),
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "google-chrome", "chromium", "chromium-browser",
]


def achar_chrome():
    for c in CANDIDATOS_CHROME:
        if not c:
            continue
        if Path(c).exists() or shutil.which(c):
            return c
    sys.exit("Chromium não encontrado. Informe o caminho em LOTOLAB_CHROME.")


def rasterizar(lado):
    """Desenha o SVG em `lado`×`lado` com fundo transparente."""
    chrome = achar_chrome()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # O SVG é embutido numa página sem margem: o screenshot da janela vira
        # exatamente a arte, sem faixa branca nas bordas.
        pagina = tmp / "pagina.html"
        pagina.write_text(
            "<style>html,body{margin:0;padding:0;background:transparent}"
            f"svg{{display:block;width:{lado}px;height:{lado}px}}</style>"
            + SVG.read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        saida = tmp / "saida.png"
        subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--no-sandbox",
             "--hide-scrollbars", "--default-background-color=00000000",
             f"--screenshot={saida}", f"--window-size={lado},{lado}",
             f"--user-data-dir={tmp / 'perfil'}", pagina.as_uri()],
            check=True, capture_output=True,
        )
        return Image.open(saida).convert("RGBA").copy()


def compor(lado, ocupacao, fundo_naval=True):
    """Arte centrada, ocupando `ocupacao` do lado.

    Com `fundo_naval=False` o entorno fica transparente. É o que a camada da
    frente do ícone adaptativo do Android precisa: quem pinta o fundo é
    `ic_launcher_background`, e — mais importante — o ícone monocromático do
    Android 13 usa o canal alfa desta mesma imagem. Uma camada da frente opaca
    viraria um quadrado chapado no tema do usuário.

    Centrar a `viewBox` do SVG não centra o desenho: o trevo é mais alto do que
    largo e o caule desce por baixo, então a `viewBox` tem folga desigual em
    volta da tinta. Aqui a arte é recortada no que ela de fato pinta — a caixa
    do canal alfa — e é essa caixa que vai ao centro. É a diferença entre um
    ícone que parece torto no lançador e um que parece assentado.
    """
    bruta = rasterizar(1024)
    caixa = bruta.getbbox()          # o que realmente foi pintado
    if caixa:
        bruta = bruta.crop(caixa)

    alvo = int(round(lado * ocupacao))
    largura, altura = bruta.size
    escala = alvo / max(largura, altura)   # cabe no alvo sem distorcer
    arte = bruta.resize(
        (max(1, round(largura * escala)), max(1, round(altura * escala))),
        Image.LANCZOS)

    tela = Image.new("RGBA", (lado, lado), NAVAL if fundo_naval else (0, 0, 0, 0))
    canto = ((lado - arte.size[0]) // 2, (lado - arte.size[1]) // 2)
    tela.alpha_composite(arte, canto)
    return tela


def main():
    if not SVG.exists():
        sys.exit(f"não achei {SVG}")

    for lado in (512, 192):
        destino = RAIZ / f"icone-{lado}.png"
        compor(lado, OCUPACAO_NORMAL).save(destino)
        print(f"{destino.name}: {lado}×{lado}, arte a {OCUPACAO_NORMAL:.0%}")

    destino = RAIZ / "icone-maskable.png"
    compor(512, OCUPACAO_MASCARAVEL).save(destino)
    print(f"{destino.name}: 512×512, arte a {OCUPACAO_MASCARAVEL:.0%} "
          "(o Android recorta o entorno)")

    destino = RAIZ / "icone-frente.png"
    compor(512, OCUPACAO_MASCARAVEL, fundo_naval=False).save(destino)
    print(f"{destino.name}: 512×512, fundo transparente — camada da frente do "
          "ícone adaptativo e do ícone monocromático")

    print("\nAgora rode: python3 ferramentas/gerar-icones.py")
    print("e copie para www/:  cp icone-192.png icone-512.png icone-maskable.png "
          "icone.svg www/")


if __name__ == "__main__":
    main()
