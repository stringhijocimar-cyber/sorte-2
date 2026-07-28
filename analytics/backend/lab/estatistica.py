"""Núcleo estatístico.

Regra desta camada, e a razão de ela existir separada: **nenhuma função aqui
devolve um p-valor sozinho**. Todo resultado carrega estimativa, intervalo de
confiança, tamanho de efeito, tamanho de amostra e uma leitura em português.
P-valor solto é o principal produtor de conclusão errada em análise de loteria,
porque com centenas de filtros testados algum sempre atinge 0,05.

Implementado em Python puro para o pacote rodar sem dependência científica.
Os testes conferem cada função contra o SciPy, quando ele está instalado.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from math import comb, erf, exp, isfinite, lgamma, log, sqrt
from typing import Callable, Sequence

# --------------------------------------------------------------------------- #
# Resultado
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Resultado:
    """O que um teste devolve. Nunca só o p-valor."""

    nome: str
    estimativa: float
    ic_inferior: float
    ic_superior: float
    p_valor: float
    tamanho_efeito: float
    nome_efeito: str
    n: int
    confianca: float = 0.95
    hipoteses_testadas: int = 1
    leitura: str = ""

    @property
    def significativo(self) -> bool:
        """Significativo a 5%. Não confunda com 'importante' nem com 'real'."""
        return self.p_valor < 0.05

    def resumo(self) -> str:
        pct = int(self.confianca * 100)
        return (
            f"{self.nome}: {self.estimativa:.6g} "
            f"(IC{pct}% {self.ic_inferior:.6g}–{self.ic_superior:.6g}); "
            f"{self.nome_efeito}={self.tamanho_efeito:.4g}; "
            f"p={self.p_valor:.4g}; n={self.n}"
        )


# --------------------------------------------------------------------------- #
# Distribuições — Python puro
# --------------------------------------------------------------------------- #


def phi(x: float) -> float:
    """Função de distribuição acumulada da normal padrão."""
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def z_critico(confianca: float = 0.95) -> float:
    """Quantil normal bilateral. Bissecção: exato o bastante e sem dependência."""
    if not 0.0 < confianca < 1.0:
        raise ValueError("confiança deve estar em (0, 1)")
    alvo = 1.0 - (1.0 - confianca) / 2.0
    baixo, alto = 0.0, 40.0
    for _ in range(200):
        meio = (baixo + alto) / 2.0
        if phi(meio) < alvo:
            baixo = meio
        else:
            alto = meio
    return (baixo + alto) / 2.0


def _log_binom_pmf(k: int, n: int, p: float) -> float:
    if p <= 0.0:
        return 0.0 if k == 0 else -float("inf")
    if p >= 1.0:
        return 0.0 if k == n else -float("inf")
    return (
        lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)
        + k * log(p) + (n - k) * log1p_neg(p)
    )


def log1p_neg(p: float) -> float:
    """log(1 - p) com precisão para p pequeno."""
    from math import log1p

    return log1p(-p)


def binom_pmf(k: int, n: int, p: float) -> float:
    lg = _log_binom_pmf(k, n, p)
    return exp(lg) if isfinite(lg) else 0.0


def qui2_sf(x: float, gl: int) -> float:
    """P(X > x) para qui-quadrado com ``gl`` graus de liberdade.

    Série de Taylor da gama incompleta regularizada para x moderado, fração
    continuada de Lentz para a cauda. Cobre a faixa que aparece na prática.
    """
    if x <= 0:
        return 1.0
    if gl <= 0:
        raise ValueError("graus de liberdade devem ser positivos")
    a, z = gl / 2.0, x / 2.0
    if z < a + 1.0:
        # série
        termo = 1.0 / a
        soma = termo
        n = 0
        while n < 10_000:
            n += 1
            termo *= z / (a + n)
            soma += termo
            if abs(termo) < abs(soma) * 1e-16:
                break
        p = soma * exp(-z + a * log(z) - lgamma(a))
        return max(0.0, min(1.0, 1.0 - p))
    # fração continuada (Lentz modificado)
    minimo = 1e-300
    b = z + 1.0 - a
    c = 1.0 / minimo
    d = 1.0 / b
    h = d
    for i in range(1, 10_000):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < minimo:
            d = minimo
        c = b + an / c
        if abs(c) < minimo:
            c = minimo
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-16:
            break
    q = exp(-z + a * log(z) - lgamma(a)) * h
    return max(0.0, min(1.0, q))


# --------------------------------------------------------------------------- #
# Testes
# --------------------------------------------------------------------------- #


def wilson(sucessos: int, n: int, confianca: float = 0.95) -> tuple[float, float]:
    """Intervalo de Wilson para uma proporção.

    Preferido ao intervalo de Wald porque a proporção aqui costuma ser
    minúscula (acertar a sena é ~2e-8) e o Wald produz limites negativos,
    que seriam absurdos e passariam despercebidos num painel.
    """
    if n <= 0:
        return (0.0, 0.0)
    z = z_critico(confianca)
    p = sucessos / n
    denominador = 1.0 + z * z / n
    centro = (p + z * z / (2 * n)) / denominador
    metade = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominador
    return (max(0.0, centro - metade), min(1.0, centro + metade))


def teste_binomial(sucessos: int, n: int, p0: float, confianca: float = 0.95) -> Resultado:
    """Teste binomial exato, bilateral pelo método da densidade.

    O tamanho de efeito é o h de Cohen, e não a diferença bruta de proporções:
    com proporções muito pequenas, uma diferença absoluta minúscula pode ser
    uma diferença relativa enorme, e o h enxerga isso.
    """
    if n <= 0:
        raise ValueError("n deve ser positivo")
    if not 0.0 <= p0 <= 1.0:
        raise ValueError("p0 deve estar em [0, 1]")

    observado = binom_pmf(sucessos, n, p0)
    tolerancia = observado * (1.0 + 1e-7)
    p_valor = sum(
        pmf for k in range(n + 1) if (pmf := binom_pmf(k, n, p0)) <= tolerancia
    )
    p_valor = max(0.0, min(1.0, p_valor))

    p_hat = sucessos / n
    lo, hi = wilson(sucessos, n, confianca)
    from math import asin

    h = 2 * asin(sqrt(min(1.0, p_hat))) - 2 * asin(sqrt(min(1.0, p0)))
    return Resultado(
        nome="teste binomial exato",
        estimativa=p_hat, ic_inferior=lo, ic_superior=hi,
        p_valor=p_valor, tamanho_efeito=h, nome_efeito="h de Cohen",
        n=n, confianca=confianca,
        leitura=_ler_proporcao(p_hat, p0, p_valor, lo, hi),
    )


def teste_qui2_uniformidade(contagens: Sequence[int], confianca: float = 0.95) -> Resultado:
    """Qui-quadrado de aderência à uniforme.

    Usado para responder "as dezenas saem com a mesma frequência?". Um p alto
    aqui é o resultado esperado e **não** é prova de que a loteria é honesta —
    é apenas ausência de evidência contra, com o poder que a amostra permite.
    """
    contagens = list(contagens)
    if len(contagens) < 2:
        raise ValueError("são necessárias ao menos duas categorias")
    if any(c < 0 for c in contagens):
        raise ValueError("contagem negativa")
    total = sum(contagens)
    if total == 0:
        raise ValueError("nenhuma observação")

    categorias = len(contagens)
    esperado = total / categorias
    qui2 = sum((c - esperado) ** 2 / esperado for c in contagens)
    gl = categorias - 1
    p = qui2_sf(qui2, gl)
    # V de Cramér: com uma linha, reduz-se a sqrt(qui2 / (n * (k-1))).
    v = sqrt(qui2 / (total * gl)) if total and gl else 0.0
    # IC do qui-quadrado não é informativo; reportamos a faixa da estatística
    # sob a hipótese nula, que é o que permite julgar o valor observado.
    return Resultado(
        nome="qui-quadrado de uniformidade",
        estimativa=qui2, ic_inferior=0.0, ic_superior=float(gl + 2 * sqrt(2 * gl)),
        p_valor=p, tamanho_efeito=v, nome_efeito="V de Cramér",
        n=total, confianca=confianca,
        leitura=(
            "Sem evidência de que alguma categoria saia mais que as outras."
            if p >= 0.05 else
            "As contagens se afastaram do uniforme mais do que o esperado. "
            "Antes de concluir algo, verifique quantas hipóteses foram testadas."
        ),
    )


def bootstrap_media(
    amostra: Sequence[float],
    reamostragens: int = 10_000,
    confianca: float = 0.95,
    semente: int | None = None,
) -> Resultado:
    """IC percentílico por bootstrap para a média.

    Serve para ROI e retorno por concurso, cujas distribuições são
    assimétricas e de cauda pesada — a média mais desvio-padrão mente ali.
    """
    dados = [float(x) for x in amostra]
    n = len(dados)
    if n == 0:
        raise ValueError("amostra vazia")
    media = sum(dados) / n
    if n == 1:
        return Resultado(
            nome="bootstrap da média", estimativa=media, ic_inferior=media,
            ic_superior=media, p_valor=float("nan"), tamanho_efeito=0.0,
            nome_efeito="d de Cohen", n=1, confianca=confianca,
            leitura="Uma observação só: não há dispersão a estimar.",
        )

    rng = random.Random(semente)
    medias = []
    for _ in range(reamostragens):
        s = 0.0
        for _ in range(n):
            s += dados[rng.randrange(n)]
        medias.append(s / n)
    medias.sort()
    alfa = (1.0 - confianca) / 2.0
    lo = medias[max(0, int(alfa * reamostragens) - 1)]
    hi = medias[min(reamostragens - 1, int((1 - alfa) * reamostragens))]

    variancia = sum((x - media) ** 2 for x in dados) / (n - 1)
    dp = sqrt(variancia)
    d = media / dp if dp > 0 else 0.0
    return Resultado(
        nome="bootstrap da média", estimativa=media, ic_inferior=lo, ic_superior=hi,
        p_valor=float("nan"), tamanho_efeito=d, nome_efeito="d de Cohen",
        n=n, confianca=confianca,
        leitura=(
            f"Média {media:.6g}; o intervalo {'inclui' if lo <= 0 <= hi else 'não inclui'} zero."
        ),
    )


def teste_permutacao(
    grupo_a: Sequence[float],
    grupo_b: Sequence[float],
    permutacoes: int = 10_000,
    confianca: float = 0.95,
    semente: int | None = None,
) -> Resultado:
    """Permutação bilateral sobre a diferença de médias.

    É o teste natural para "esta estratégia difere do aleatório?": não supõe
    normalidade, e a hipótese nula — os rótulos são intercambiáveis — é
    exatamente o que queremos falsear.

    O p-valor usa a correção de Davison–Hinkley ((r+1)/(m+1)), que impede o
    resultado impossível p = 0.
    """
    a = [float(x) for x in grupo_a]
    b = [float(x) for x in grupo_b]
    if not a or not b:
        raise ValueError("os dois grupos precisam ter observações")

    media_a = sum(a) / len(a)
    media_b = sum(b) / len(b)
    observada = media_a - media_b

    juntos = a + b
    na = len(a)
    rng = random.Random(semente)
    extremos = 0
    for _ in range(permutacoes):
        rng.shuffle(juntos)
        ma = sum(juntos[:na]) / na
        mb = sum(juntos[na:]) / (len(juntos) - na)
        if abs(ma - mb) >= abs(observada) - 1e-12:
            extremos += 1
    p = (extremos + 1) / (permutacoes + 1)

    n_total = len(a) + len(b)
    if len(a) > 1 and len(b) > 1:
        va = sum((x - media_a) ** 2 for x in a) / (len(a) - 1)
        vb = sum((x - media_b) ** 2 for x in b) / (len(b) - 1)
        dp = sqrt(((len(a) - 1) * va + (len(b) - 1) * vb) / (n_total - 2))
        d = (observada / dp) if dp > 0 else 0.0
        erro = dp * sqrt(1 / len(a) + 1 / len(b))
    else:
        d, erro = 0.0, 0.0
    z = z_critico(confianca)
    return Resultado(
        nome="teste de permutação", estimativa=observada,
        ic_inferior=observada - z * erro, ic_superior=observada + z * erro,
        p_valor=p, tamanho_efeito=d, nome_efeito="d de Cohen",
        n=n_total, confianca=confianca,
        leitura=(
            "Diferença compatível com acaso." if p >= 0.05 else
            "Diferença maior que o acaso produziria neste recorte; "
            "confira a correção para múltiplos testes antes de concluir."
        ),
    )


def percentil_na_distribuicao(valor: float, distribuicao: Sequence[float]) -> float:
    """Em que percentil ``valor`` cai dentro de ``distribuicao``.

    É como o app responde "onde a estratégia ficou entre 10.000 carteiras
    aleatórias" — mais legível para o usuário do que um p-valor.
    """
    d = sorted(float(x) for x in distribuicao)
    if not d:
        raise ValueError("distribuição vazia")
    abaixo = sum(1 for x in d if x < valor)
    iguais = sum(1 for x in d if x == valor)
    return (abaixo + 0.5 * iguais) / len(d) * 100.0


def _ler_proporcao(p_hat: float, p0: float, p: float, lo: float, hi: float) -> str:
    if p >= 0.05:
        return (
            f"Observado {p_hat:.4g} contra {p0:.4g} esperado. O intervalo inclui o "
            f"valor esperado — sem evidência de diferença."
        )
    direcao = "acima" if p_hat > p0 else "abaixo"
    return (
        f"Observado {p_hat:.4g}, {direcao} dos {p0:.4g} esperados "
        f"(IC {lo:.4g}–{hi:.4g}). Verifique quantas hipóteses foram testadas "
        f"antes de tratar isso como achado."
    )
