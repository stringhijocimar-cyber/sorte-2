"""Gerador de jogos configurável (§8).

Entrega, junto com os jogos, as métricas que a especificação exige na tela:
quantidade gerada, custo, probabilidade, combinações distintas, sobreposição e
cobertura de pares/trincas.

Duas decisões que evitam engano:

**O gerador nunca mente sobre ter conseguido.** Se as restrições forem
apertadas demais, ele devolve menos jogos do que o pedido e diz quantas
tentativas fez. Preencher o resto com combinações que violam os filtros — ou
travar em laço infinito — seria pior.

**O orçamento é limite de segurança, não meta.** Ele corta a geração; nunca
sugere gastar até o teto. A especificação foi explícita nisso (§8), e é a
diferença entre uma ferramenta e um incentivo.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from itertools import combinations
from typing import Sequence

from .filtros import Contexto, Filtro
from .loterias import FormatoInvalido, Modalidade


class RestricaoImpossivel(ValueError):
    """A configuração não admite nenhuma combinação — detectado antes de gerar."""


@dataclass(frozen=True)
class Lote:
    jogos: tuple[tuple[int, ...], ...]
    modalidade: str
    custo_total: float
    #: Probabilidade de acertar a faixa principal com UM jogo.
    probabilidade_por_jogo: float
    distintos: int
    sobreposicao_media: float
    pares_cobertos: int
    pares_possiveis: int
    trincas_cobertas: int
    trincas_possiveis: int
    tentativas: int
    solicitados: int
    semente: int
    avisos: tuple[str, ...] = ()

    @property
    def completo(self) -> bool:
        return len(self.jogos) == self.solicitados

    @property
    def cobertura_pares(self) -> float:
        return self.pares_cobertos / self.pares_possiveis if self.pares_possiveis else 0.0

    def leitura(self) -> str:
        base = (
            f"{len(self.jogos)} jogo(s) de {self.modalidade}, "
            f"custo {self.custo_total:.2f}. "
            f"Probabilidade por jogo: 1 em {1 / self.probabilidade_por_jogo:,.0f}. "
            f"Sobreposição média entre jogos: {self.sobreposicao_media:.2f} dezena(s). "
            f"Cobre {self.pares_cobertos} de {self.pares_possiveis} pares "
            f"({self.cobertura_pares * 100:.1f}%)."
        ).replace(",", ".")
        if not self.completo:
            base += (
                f" ATENÇÃO: foram pedidos {self.solicitados} jogos e só "
                f"{len(self.jogos)} passaram nos filtros em {self.tentativas} tentativas."
            )
        return base


def sobreposicao_media(jogos: Sequence[Sequence[int]]) -> float:
    if len(jogos) < 2:
        return 0.0
    total = pares = 0
    for i in range(len(jogos)):
        conjunto = set(jogos[i])
        for k in range(i + 1, len(jogos)):
            total += len(conjunto & set(jogos[k]))
            pares += 1
    return total / pares


def _subconjuntos_cobertos(jogos: Sequence[Sequence[int]], tamanho: int) -> int:
    vistos: set[tuple[int, ...]] = set()
    for jogo in jogos:
        for sub in combinations(sorted(jogo), tamanho):
            vistos.add(sub)
    return len(vistos)


def gerar(
    modalidade: Modalidade,
    quantidade: int,
    tamanho: int | None = None,
    filtros: Sequence[Filtro] = (),
    obrigatorios: Sequence[int] = (),
    excluidos: Sequence[int] = (),
    concurso_anterior: Sequence[int] = (),
    orcamento_maximo: float | None = None,
    permitir_repetidos: bool = False,
    semente: int | None = None,
    tentativas_maximas: int | None = None,
) -> Lote:
    """Gera um lote respeitando filtros, números obrigatórios e excluídos.

    ``orcamento_maximo`` é limite de segurança: corta a quantidade, nunca a
    sugere. ``permitir_repetidos`` é falso por padrão porque pagar duas vezes
    pelo mesmo jogo não amplia cobertura nenhuma.
    """
    tamanho = tamanho or modalidade.aposta_minima
    modalidade._checar_tamanho(tamanho)
    if quantidade < 1:
        raise ValueError("quantidade deve ser positiva")

    obrigatorios = sorted(set(obrigatorios))
    excluidos = set(excluidos)
    avisos: list[str] = []

    # ---- viabilidade, antes de gastar tempo gerando -----------------------
    fora = [d for d in obrigatorios if d not in modalidade.dezenas_validas()]
    if fora:
        raise FormatoInvalido(f"dezenas obrigatórias fora do universo: {fora}")
    conflito = sorted(set(obrigatorios) & excluidos)
    if conflito:
        raise RestricaoImpossivel(
            f"dezenas ao mesmo tempo obrigatórias e excluídas: {conflito}"
        )
    if len(obrigatorios) > tamanho:
        raise RestricaoImpossivel(
            f"{len(obrigatorios)} dezenas obrigatórias não cabem em um jogo de {tamanho}"
        )
    disponiveis = [d for d in modalidade.dezenas_validas()
                   if d not in excluidos and d not in set(obrigatorios)]
    faltam = tamanho - len(obrigatorios)
    if len(disponiveis) < faltam:
        raise RestricaoImpossivel(
            f"sobram {len(disponiveis)} dezenas para preencher {faltam} posições — "
            "exclua menos dezenas ou reduza o tamanho do jogo"
        )

    # ---- orçamento como teto ---------------------------------------------
    preco_unitario = modalidade.preco(__import__("datetime").date.today(), tamanho)
    solicitados = quantidade
    if orcamento_maximo is not None:
        if orcamento_maximo < 0:
            raise ValueError("orçamento não pode ser negativo")
        cabem = int(orcamento_maximo // preco_unitario)
        if cabem < quantidade:
            avisos.append(
                f"Orçamento de {orcamento_maximo:.2f} comporta {cabem} jogo(s) a "
                f"{preco_unitario:.2f} cada; foram pedidos {quantidade}."
            )
            quantidade = cabem
        if quantidade == 0:
            avisos.append("Nenhum jogo gerado: o orçamento não cobre uma aposta.")

    ctx = Contexto(modalidade=modalidade, concurso_anterior=tuple(concurso_anterior))
    semente_usada = semente if semente is not None else random.randrange(2**31)
    rng = random.Random(semente_usada)

    # Teto de tentativas proporcional ao pedido, para não travar sob filtro
    # apertado. 400 por jogo cobre com folga taxas de aceitação ~1%.
    teto = tentativas_maximas if tentativas_maximas is not None else max(2_000, quantidade * 400)

    jogos: list[tuple[int, ...]] = []
    vistos: set[tuple[int, ...]] = set()
    tentativas = 0
    while len(jogos) < quantidade and tentativas < teto:
        tentativas += 1
        combinacao = tuple(sorted(obrigatorios + rng.sample(disponiveis, faltam)))
        if not permitir_repetidos and combinacao in vistos:
            continue
        if not all(f.aceita(combinacao, ctx) for f in filtros):
            continue
        vistos.add(combinacao)
        jogos.append(combinacao)

    if len(jogos) < quantidade:
        avisos.append(
            f"Os filtros deixaram passar {len(jogos)} de {quantidade} jogos em "
            f"{tentativas} tentativas. Afrouxe alguma restrição — o gerador não "
            "completa o lote com combinações que violem os filtros."
        )

    return Lote(
        jogos=tuple(jogos),
        modalidade=modalidade.codigo,
        custo_total=len(jogos) * preco_unitario,
        probabilidade_por_jogo=modalidade.probabilidade(modalidade.dezenas_sorteadas, tamanho),
        distintos=len({j for j in jogos}),
        sobreposicao_media=sobreposicao_media(jogos),
        pares_cobertos=_subconjuntos_cobertos(jogos, 2),
        pares_possiveis=len(list(combinations(modalidade.dezenas_validas(), 2))),
        trincas_cobertas=_subconjuntos_cobertos(jogos, 3),
        trincas_possiveis=len(list(combinations(modalidade.dezenas_validas(), 3))),
        tentativas=tentativas,
        solicitados=solicitados,
        semente=semente_usada,
        avisos=tuple(avisos),
    )
