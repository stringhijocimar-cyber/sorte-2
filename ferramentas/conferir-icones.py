#!/usr/bin/env python3
"""
Confere os ícones gerados. Sai com código 1 se algo estiver errado.

    python3 ferramentas/conferir-icones.py

Não compara pixel a pixel com uma renderização nova: o Chromium não garante
saída idêntica entre versões, e um teste que falha por causa disso ensina a
ignorar falha. O que este script confere são propriedades que, quando quebram,
quebram de verdade no aparelho — e que quebraram, ou quase, nesta base:

  * a camada da frente do ícone adaptativo precisa ter transparência. O Android
    13 monta o ícone monocromático a partir do canal alfa dela; uma arte opaca
    vira um quadrado chapado no tema do usuário.
  * o desenho da camada da frente precisa caber no círculo central de 72dp em
    108dp. Fora dele, o recorte do fabricante come pedaço da arte — e cada
    fabricante recorta de um jeito.
  * os ícones legados precisam ser opacos. Eles não têm camada de fundo por
    baixo; buraco neles é buraco na tela do usuário.
  * todas as densidades precisam existir. Faltando uma, o Android estica a mais
    próxima e o ícone sai borrado justamente no aparelho de quem tem a tela boa.
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops

RAIZ = Path(__file__).resolve().parent.parent
RES = RAIZ / "android/app/src/main/res"
DENSIDADES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]
NAVAL = (15, 30, 46)  # #0F1E2E, a cor de ic_launcher_background

problemas: list[str] = []
conferidos = 0


def confere(descricao: str, condicao: bool, detalhe: str = "") -> None:
    global conferidos
    conferidos += 1
    if condicao:
        print(f"  ok   {descricao}" + (f" — {detalhe}" if detalhe else ""))
    else:
        problemas.append(f"{descricao}" + (f" — {detalhe}" if detalhe else ""))
        print(f"  FALHA {descricao}" + (f" — {detalhe}" if detalhe else ""))


def opaca(imagem: Image.Image) -> bool:
    return imagem.getchannel("A").getextrema()[0] == 255


def mascara_da_tinta(imagem: Image.Image, fundo: tuple[int, int, int] | None) -> Image.Image:
    """Preto e branco: branco onde há desenho.

    Numa arte transparente, desenho é onde o alfa não é zero. Numa arte opaca
    não há alfa que ajude — o fundo naval preenche tudo —, então desenho é o
    que difere da cor de fundo.
    """
    if fundo is None:
        return imagem.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    rgb = imagem.convert("RGB")
    chapado = Image.new("RGB", rgb.size, fundo)
    dif = ImageChops.difference(rgb, chapado).convert("L")
    return dif.point(lambda v: 255 if v > 12 else 0)


def raio_da_tinta(imagem: Image.Image, fundo: tuple[int, int, int] | None = None) -> float:
    """Distância do centro ao pixel PINTADO mais distante, em frações do lado.

    Medir pelos cantos da caixa delimitadora superestimaria: o trevo é redondo
    e não pinta nada nos cantos da própria caixa. A diferença não é acadêmica —
    pelos cantos, um desenho perfeitamente seguro de raio 0,30 apareceria como
    0,42 e o teste reprovaria arte correta.
    """
    mascara = mascara_da_tinta(imagem, fundo)
    #: Reduzido para varrer rápido. BOX + limiar > 0 mantém qualquer bloco que
    #: contenha tinta, então a medida erra para o lado seguro.
    amostra = 128
    pequena = mascara.resize((amostra, amostra), Image.BOX).point(
        lambda v: 255 if v > 0 else 0)
    pixels = pequena.load()
    centro = (amostra - 1) / 2
    maior = 0.0
    for y in range(amostra):
        for x in range(amostra):
            if pixels[x, y]:
                d = math.hypot(x - centro, y - centro)
                if d > maior:
                    maior = d
    #: +1 bloco de folga, porque a redução borra a borda em até meio bloco.
    return (maior + 1) / amostra


print("Ícones do navegador")
for nome, lado in (("icone-192.png", 192), ("icone-512.png", 512),
                   ("icone-maskable.png", 512)):
    caminho = RAIZ / nome
    if not caminho.exists():
        confere(f"{nome} existe", False)
        continue
    im = Image.open(caminho).convert("RGBA")
    confere(f"{nome} tem {lado}×{lado}", im.size == (lado, lado), f"{im.size}")
    confere(f"{nome} é opaco", opaca(im))

masc = RAIZ / "icone-maskable.png"
if masc.exists():
    # 0,5 seria o raio do círculo inscrito. O Android garante os 72dp centrais
    # de 108dp, ou seja um círculo de raio 72/108/2 = 0,333 do lado.
    r = raio_da_tinta(Image.open(masc).convert("RGBA"), fundo=NAVAL)
    confere("o desenho do maskable cabe na área garantida do Android",
            r <= 0.334, f"raio da tinta {r:.3f} do lado (limite 0,333)")

print("\nCamada da frente do ícone adaptativo")
frente = RAIZ / "icone-frente.png"
if not frente.exists():
    confere("icone-frente.png existe", False,
            "rode: python3 ferramentas/gerar-pngs-do-icone.py")
else:
    im = Image.open(frente).convert("RGBA")
    minimo, maximo = im.getchannel("A").getextrema()
    confere("tem transparência (o ícone monocromático depende dela)", minimo == 0)
    confere("e tem desenho de verdade, não é uma imagem vazia", maximo > 0)

print("\nRecursos do Android")
for densidade in DENSIDADES:
    pasta = RES / f"mipmap-{densidade}"
    for arquivo in ("ic_launcher.png", "ic_launcher_round.png",
                    "ic_launcher_foreground.png"):
        caminho = pasta / arquivo
        if not caminho.exists():
            confere(f"mipmap-{densidade}/{arquivo} existe", False)
            continue
        im = Image.open(caminho).convert("RGBA")
        if arquivo == "ic_launcher_foreground.png":
            confere(f"mipmap-{densidade}: a camada da frente é transparente",
                    im.getchannel("A").getextrema()[0] == 0)
            r = raio_da_tinta(im)
            confere(f"mipmap-{densidade}: o desenho cabe no recorte garantido",
                    r <= 0.334, f"raio {r:.3f}")
        else:
            # Legados são recortados em círculo/quadrado arredondado, então têm
            # canto transparente de propósito. O que não pode é buraco no meio.
            lado = im.size[0]
            centro = im.crop((lado // 4, lado // 4, 3 * lado // 4, 3 * lado // 4))
            confere(f"mipmap-{densidade}/{arquivo} não tem buraco no meio",
                    centro.getchannel("A").getextrema()[0] == 255)
    for arquivo in ("splash_icone.png",):
        confere(f"drawable-{densidade}/{arquivo} existe",
                (RES / f"drawable-{densidade}" / arquivo).exists())

print("\n" + "─" * 60)
if problemas:
    print(f"  {conferidos - len(problemas)} ok, {len(problemas)} com problema")
    print("─" * 60)
    sys.exit(1)
print(f"  {conferidos} conferências, nenhum problema")
print("─" * 60)
