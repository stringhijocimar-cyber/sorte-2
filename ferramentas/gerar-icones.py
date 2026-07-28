#!/usr/bin/env python3
"""
Gera os recursos de ícone do Android a partir de icone-maskable.png.

Estratégia deliberada:

  - camada de fundo  = cor sólida #0F1E2E (a mesma tinta naval do app)
  - camada da frente = a arte de icone-maskable.png, sem redimensionar o
    conteúdo, apenas reamostrada para a densidade

O Android recorta o ícone adaptativo em círculo, quadrado arredondado ou
"squircle", conforme o fabricante. Como o fundo é a mesma cor do disco da
arte, qualquer recorte produz o mesmo resultado visual. O conteúdo (os três
discos, a faixa do acaso, a barra âmbar) ocupa o terço central da arte, bem
dentro dos 72dp centrais que o Android garante visíveis.

Os ícones legados (aparelhos anteriores ao Android 8) são compostos aqui:
quadrado arredondado para ic_launcher, círculo para ic_launcher_round.
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
ARTE = RAIZ / "icone-maskable.png"
RES = RAIZ / "android/app/src/main/res"
NAVAL = (15, 30, 46, 255)  # #0F1E2E

# densidade: (legado 48dp, camada da frente 108dp)
DENSIDADES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def achatar(arte, lado):
    """Arte sobre o fundo naval, sem transparência sobrando."""
    fundo = Image.new("RGBA", (lado, lado), NAVAL)
    fundo.alpha_composite(arte.resize((lado, lado), Image.LANCZOS))
    return fundo


def recortar(imagem, forma):
    lado = imagem.size[0]
    mascara = Image.new("L", (lado, lado), 0)
    pincel = ImageDraw.Draw(mascara)
    if forma == "circulo":
        pincel.ellipse((0, 0, lado - 1, lado - 1), fill=255)
    else:
        pincel.rounded_rectangle(
            (0, 0, lado - 1, lado - 1), radius=int(lado * 0.22), fill=255
        )
    saida = imagem.copy()
    saida.putalpha(mascara)
    return saida


def main():
    arte = Image.open(ARTE).convert("RGBA")

    for densidade, (legado, frente) in DENSIDADES.items():
        pasta = RES / f"mipmap-{densidade}"
        pasta.mkdir(parents=True, exist_ok=True)

        cheio = achatar(arte, legado)
        recortar(cheio, "arredondado").save(pasta / "ic_launcher.png")
        recortar(cheio, "circulo").save(pasta / "ic_launcher_round.png")

        # A camada da frente do ícone adaptativo mantém a transparência:
        # quem preenche o entorno é a camada de fundo.
        arte.resize((frente, frente), Image.LANCZOS).save(
            pasta / "ic_launcher_foreground.png"
        )
        print(f"mipmap-{densidade}: legado {legado}px, frente {frente}px")

    # A splash é uma cor chapada; o ícone entra pela API de splash do Android
    # em densidades geradas a partir da mesma arte. Nenhum texto, nenhuma
    # animação — o app abre e some.
    for tamanho, densidade in ((108, "mdpi"), (162, "hdpi"), (216, "xhdpi"),
                               (324, "xxhdpi"), (432, "xxxhdpi")):
        pasta = RES / f"drawable-{densidade}"
        pasta.mkdir(parents=True, exist_ok=True)
        arte.resize((tamanho, tamanho), Image.LANCZOS).save(pasta / "splash_icone.png")
    print("splash_icone gerado em cinco densidades")


if __name__ == "__main__":
    main()
