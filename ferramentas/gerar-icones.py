#!/usr/bin/env python3
"""
Gera os recursos de ícone do Android a partir dos PNGs do trevo.

Rode antes: `python3 ferramentas/gerar-pngs-do-icone.py`, que produz os PNGs
a partir de `icone.svg` — a fonte da marca.

Duas artes entram aqui, e a diferença entre elas importa:

  icone-512.png    trevo grande sobre fundo naval, opaco. Vira os ícones
                   legados (Android 7 e anteriores), que o sistema NÃO recorta:
                   se a arte fosse pequena, o ícone ficaria perdido no meio.
  icone-frente.png trevo menor, fundo transparente. Vira a camada da frente do
                   ícone adaptativo e a splash. Precisa ser transparente por
                   dois motivos: quem pinta o fundo é `ic_launcher_background`,
                   e o ícone monocromático do Android 13 usa o canal alfa desta
                   imagem — uma arte opaca viraria um quadrado chapado no tema
                   do usuário.

O Android recorta o ícone adaptativo em círculo, quadrado arredondado ou
"squircle", conforme o fabricante, e só garante o círculo central. Por isso o
trevo da camada da frente ocupa 60% do lado: nenhuma ponta de folha se perde,
em recorte nenhum.

Os ícones legados são compostos aqui: quadrado arredondado para ic_launcher,
círculo para ic_launcher_round.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
ARTE_CHEIA = RAIZ / "icone-512.png"     # opaca, para os ícones legados
ARTE_FRENTE = RAIZ / "icone-frente.png"  # transparente, para o adaptativo
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
    faltando = [p.name for p in (ARTE_CHEIA, ARTE_FRENTE) if not p.exists()]
    if faltando:
        sys.exit("faltam " + ", ".join(faltando)
                 + " — rode antes: python3 ferramentas/gerar-pngs-do-icone.py")

    cheia = Image.open(ARTE_CHEIA).convert("RGBA")
    frente_arte = Image.open(ARTE_FRENTE).convert("RGBA")

    for densidade, (legado, frente) in DENSIDADES.items():
        pasta = RES / f"mipmap-{densidade}"
        pasta.mkdir(parents=True, exist_ok=True)

        cheio = achatar(cheia, legado)
        recortar(cheio, "arredondado").save(pasta / "ic_launcher.png")
        recortar(cheio, "circulo").save(pasta / "ic_launcher_round.png")

        # A camada da frente do ícone adaptativo mantém a transparência:
        # quem preenche o entorno é a camada de fundo.
        frente_arte.resize((frente, frente), Image.LANCZOS).save(
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
        frente_arte.resize((tamanho, tamanho), Image.LANCZOS).save(
            pasta / "splash_icone.png")
    print("splash_icone gerado em cinco densidades")


if __name__ == "__main__":
    main()
