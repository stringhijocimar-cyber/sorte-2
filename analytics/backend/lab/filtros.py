"""Filtros estruturais de combinações (§9.6 a §9.13).

Todo filtro deste módulo é **estrutural**, não preditivo. Nenhum deles torna
uma dezena individualmente mais provável; o que fazem é restringir o conjunto
de combinações que o gerador aceita. Por isso cada `Filtro` carrega um campo
``aviso`` obrigatório, e há um teste que falha se algum filtro for criado sem
ele — o aviso não é decoração, é parte do contrato.

Um efeito colateral que o usuário precisa entender, e que a interface deve
mostrar: restringir combinações **reduz** a chance de acerto do conjunto, se a
restrição excluir a combinação sorteada. Filtro não é vantagem; é preferência.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Sequence

from .loterias import Modalidade

AVISO_PADRAO = (
    "Filtro estrutural: restringe quais combinações o gerador aceita. "
    "Não torna nenhuma dezena mais provável de ser sorteada."
)


@dataclass(frozen=True)
class Contexto:
    """O que um filtro pode consultar além da própria combinação."""

    modalidade: Modalidade
    #: Dezenas do concurso imediatamente anterior, quando conhecido.
    concurso_anterior: tuple[int, ...] = ()


@dataclass(frozen=True)
class Filtro:
    id: str
    nome: str
    descricao: str
    #: Obrigatório. Ver o teste ``test_todo_filtro_declara_aviso``.
    aviso: str
    aceita: Callable[[Sequence[int], Contexto], bool] = field(repr=False)

    def __post_init__(self) -> None:
        if not self.aviso.strip():
            raise ValueError(f"filtro {self.id!r} sem aviso — o aviso é parte do contrato")


# --------------------------------------------------------------------------- #
# Utilidades numéricas
# --------------------------------------------------------------------------- #

def primos_ate(n: int) -> set[int]:
    """Crivo de Eratóstenes."""
    if n < 2:
        return set()
    marcado = bytearray([1]) * (n + 1)
    marcado[0] = marcado[1] = 0
    p = 2
    while p * p <= n:
        if marcado[p]:
            for m in range(p * p, n + 1, p):
                marcado[m] = 0
        p += 1
    return {i for i in range(2, n + 1) if marcado[i]}


def fibonacci_ate(n: int) -> set[int]:
    """Fibonacci dentro do universo. 1 aparece uma vez, não duas."""
    saida: set[int] = set()
    a, b = 1, 2
    while a <= n:
        saida.add(a)
        a, b = b, a + b
    return saida


def sequencias_consecutivas(dezenas: Sequence[int]) -> list[int]:
    """Comprimento de cada corrida de números consecutivos (só as com 2+)."""
    ordenado = sorted(dezenas)
    corridas: list[int] = []
    atual = 1
    for anterior, seguinte in zip(ordenado, ordenado[1:]):
        if seguinte - anterior == 1:
            atual += 1
        else:
            if atual > 1:
                corridas.append(atual)
            atual = 1
    if atual > 1:
        corridas.append(atual)
    return corridas


# --------------------------------------------------------------------------- #
# Fábricas de filtros
# --------------------------------------------------------------------------- #

def paridade(pares_min: int, pares_max: int) -> Filtro:
    """§9.6 — quantidade de dezenas pares dentro de um intervalo."""
    if pares_min > pares_max or pares_min < 0:
        raise ValueError("intervalo de pares inválido")
    return Filtro(
        id="paridade",
        nome=f"Pares entre {pares_min} e {pares_max}",
        descricao="Restringe quantas dezenas pares a combinação pode ter.",
        aviso=(
            AVISO_PADRAO + " Distribuições equilibradas são as mais frequentes "
            "apenas porque são as mais numerosas — não porque sejam favorecidas."
        ),
        aceita=lambda d, ctx: pares_min <= sum(1 for x in d if x % 2 == 0) <= pares_max,
    )


def soma(minimo: float, maximo: float) -> Filtro:
    """§9.8 — soma das dezenas dentro de um intervalo."""
    if minimo > maximo:
        raise ValueError("intervalo de soma inválido")
    return Filtro(
        id="soma",
        nome=f"Soma entre {minimo:g} e {maximo:g}",
        descricao="Restringe a soma das dezenas da combinação.",
        aviso=(
            AVISO_PADRAO + " Somas centrais são mais comuns por haver mais "
            "combinações com essa soma, e não por tendência do sorteio."
        ),
        aceita=lambda d, ctx: minimo <= sum(d) <= maximo,
    )


def consecutivos(maximo_por_sequencia: int) -> Filtro:
    """§9.9 — limita o comprimento da maior sequência consecutiva."""
    if maximo_por_sequencia < 1:
        raise ValueError("o limite precisa ser ao menos 1")
    return Filtro(
        id="consecutivos",
        nome=f"No máximo {maximo_por_sequencia} consecutivos",
        descricao="Limita o tamanho da maior corrida de números seguidos.",
        aviso=(
            AVISO_PADRAO + " Combinações com números consecutivos são "
            "matematicamente tão válidas quanto qualquer outra e saem sorteadas."
        ),
        aceita=lambda d, ctx: max(sequencias_consecutivas(d), default=1) <= maximo_por_sequencia,
    )


def exigir_consecutivos(minimo: int = 2) -> Filtro:
    """§9.9 — o oposto: exige ao menos uma sequência."""
    return Filtro(
        id="exigir_consecutivos",
        nome=f"Ao menos {minimo} consecutivos",
        descricao="Exige que a combinação contenha uma corrida de números seguidos.",
        aviso=AVISO_PADRAO,
        aceita=lambda d, ctx: max(sequencias_consecutivas(d), default=1) >= minimo,
    )


def primos(minimo: int, maximo: int) -> Filtro:
    """§9.12 — quantidade de números primos."""
    if minimo > maximo or minimo < 0:
        raise ValueError("intervalo de primos inválido")
    return Filtro(
        id="primos",
        nome=f"Primos entre {minimo} e {maximo}",
        descricao="Restringe quantas dezenas primas a combinação pode ter.",
        aviso=AVISO_PADRAO + " Primalidade é propriedade do número, não do sorteio.",
        aceita=lambda d, ctx: minimo <= sum(
            1 for x in d if x in primos_ate(ctx.modalidade.numero_maximo)
        ) <= maximo,
    )


def fibonacci(minimo: int, maximo: int) -> Filtro:
    """§9.11 — quantidade de números de Fibonacci.

    A especificação pede que este filtro seja identificado como estrutural e
    **sem evidência preditiva**. O aviso diz isso literalmente.
    """
    if minimo > maximo or minimo < 0:
        raise ValueError("intervalo de Fibonacci inválido")
    return Filtro(
        id="fibonacci",
        nome=f"Fibonacci entre {minimo} e {maximo}",
        descricao="Restringe quantas dezenas pertencem à sequência de Fibonacci.",
        aviso=(
            "Filtro estrutural sem nenhuma evidência preditiva. A sequência de "
            "Fibonacci não tem relação com sorteios; este filtro existe apenas "
            "porque foi pedido, e não muda probabilidade alguma."
        ),
        aceita=lambda d, ctx: minimo <= sum(
            1 for x in d if x in fibonacci_ate(ctx.modalidade.numero_maximo)
        ) <= maximo,
    )


def multiplos(base: int, minimo: int, maximo: int) -> Filtro:
    """§9.13 — quantidade de múltiplos de ``base``."""
    if base < 1:
        raise ValueError("a base precisa ser positiva")
    if minimo > maximo or minimo < 0:
        raise ValueError("intervalo de múltiplos inválido")
    return Filtro(
        id=f"multiplos_{base}",
        nome=f"Múltiplos de {base} entre {minimo} e {maximo}",
        descricao=f"Restringe quantas dezenas são múltiplas de {base}.",
        aviso=AVISO_PADRAO,
        aceita=lambda d, ctx: minimo <= sum(
            1 for x in d if x != 0 and x % base == 0
        ) <= maximo,
    )


def repeticao_do_anterior(minimo: int, maximo: int) -> Filtro:
    """§9.10 — quantas dezenas se repetem do concurso anterior.

    Sem concurso anterior informado, o filtro **aceita tudo** em vez de rejeitar
    tudo: rejeitar silenciosamente produziria zero combinações e o usuário
    culparia o gerador.
    """
    if minimo > maximo or minimo < 0:
        raise ValueError("intervalo de repetição inválido")

    def aceita(d: Sequence[int], ctx: Contexto) -> bool:
        if not ctx.concurso_anterior:
            return True
        anteriores = set(ctx.concurso_anterior)
        return minimo <= sum(1 for x in d if x in anteriores) <= maximo

    return Filtro(
        id="repeticao_do_anterior",
        nome=f"Repete entre {minimo} e {maximo} do concurso anterior",
        descricao="Restringe quantas dezenas vêm do concurso imediatamente anterior.",
        aviso=(
            AVISO_PADRAO + " Sorteios são independentes: o concurso anterior não "
            "carrega informação sobre o próximo."
        ),
        aceita=aceita,
    )


def faixas(distribuicao: dict[tuple[int, int], tuple[int, int]]) -> Filtro:
    """§9.7 — distribuição por faixas do universo.

    ``distribuicao`` mapeia ``(inicio, fim)`` inclusivos para ``(min, max)``
    de dezenas naquela faixa.
    """
    if not distribuicao:
        raise ValueError("nenhuma faixa informada")
    for (ini, fim), (lo, hi) in distribuicao.items():
        if ini > fim:
            raise ValueError(f"faixa invertida: {ini}–{fim}")
        if lo > hi or lo < 0:
            raise ValueError(f"limites inválidos para a faixa {ini}–{fim}")

    def aceita(d: Sequence[int], ctx: Contexto) -> bool:
        for (ini, fim), (lo, hi) in distribuicao.items():
            quantos = sum(1 for x in d if ini <= x <= fim)
            if not lo <= quantos <= hi:
                return False
        return True

    rotulo = ", ".join(f"{i}–{f}: {lo}–{hi}" for (i, f), (lo, hi) in distribuicao.items())
    return Filtro(
        id="faixas",
        nome=f"Distribuição por faixas ({rotulo})",
        descricao="Controla quantas dezenas caem em cada faixa do universo.",
        aviso=AVISO_PADRAO,
        aceita=aceita,
    )


#: Quantas combinações o filtro deixa passar, estimado por amostragem. Serve
#: para a interface avisar ANTES de gerar que a restrição é apertada demais.
def taxa_de_aceitacao(
    filtros: Sequence[Filtro], ctx: Contexto, tamanho: int, amostras: int = 2_000,
    semente: int | None = None,
) -> float:
    import random

    rng = random.Random(semente)
    universo = list(ctx.modalidade.dezenas_validas())
    aceitas = 0
    for _ in range(amostras):
        combinacao = sorted(rng.sample(universo, tamanho))
        if all(f.aceita(combinacao, ctx) for f in filtros):
            aceitas += 1
    return aceitas / amostras
