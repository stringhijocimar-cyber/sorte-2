"""Monte Carlo paralelo (§12).

A propriedade que torna esta camada confiável não é a velocidade: é o
**resultado ser idêntico com 1 ou com N processos**. Cada carteira aleatória é
semeada por índice (`semente + 1 + i`), nunca por um gerador compartilhado que
avança conforme os trabalhadores consomem. Se a divisão em lotes mudasse o
resultado, dois backtests da mesma estratégia divergiriam por causa do número
de núcleos da máquina — e nenhum deles seria auditável.

Há um teste que roda a mesma comparação com 1, 2 e 4 processos e exige
igualdade exata.

Paralelismo por processo, não por thread: o trabalho é CPU puro em Python, e o
GIL faria threads não ganharem nada.
"""

from __future__ import annotations

import os
import random
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from typing import Callable, Sequence

from .backtest import (
    Avaliacao, Concurso, Estrategia, _apostar, aleatoria_uniforme,
)
from .estatistica import percentil_na_distribuicao, teste_monte_carlo
from .financeiro import avaliar
from .loterias import Modalidade, modalidade

#: Acima disso, dividir em processos compensa o custo de criar e serializar.
#: Abaixo, o overhead domina e o serial é mais rápido — medido, não chutado.
LIMIAR_PARALELO = 200


class EstrategiaNaoSerializavel(TypeError):
    """A estratégia não atravessa a fronteira de processo.

    Funções definidas no nível do módulo passam; `lambda` e closures, não.
    Em vez de falhar com um erro de pickle incompreensível, avisamos e caímos
    para execução serial — o resultado é o mesmo, só mais lento.
    """


@dataclass(frozen=True)
class _Trabalho:
    """Argumentos de um lote. Precisa ser serializável por inteiro."""

    codigo_modalidade: str
    nome_estrategia: str
    concursos: tuple[Concurso, ...]
    anteriores: tuple[Concurso, ...]
    jogos_por_concurso: int
    semente_base: int
    inicio: int
    fim: int


#: Estratégias que podem ser enviadas a outro processo, por nome. Uma função
#: qualquer não atravessa a fronteira; o registro torna explícito o que atravessa.
REGISTRO: dict[str, Estrategia] = {"aleatoria_uniforme": aleatoria_uniforme}


def _executar_lote(t: _Trabalho) -> list[float]:
    """Roda as simulações de ``inicio`` a ``fim`` e devolve os ROIs.

    Roda em outro processo: só pode depender do que veio no argumento.
    """
    m = modalidade(t.codigo_modalidade)
    estrategia = REGISTRO[t.nome_estrategia]
    saida: list[float] = []
    for i in range(t.inicio, t.fim):
        rng = random.Random(t.semente_base + 1 + i)
        resultados = _apostar(m, estrategia, t.concursos, t.anteriores,
                              t.jogos_por_concurso, rng)
        saida.append(avaliar(resultados).roi)
    return saida


def rois_aleatorios(
    m: Modalidade,
    concursos: Sequence[Concurso],
    anteriores: Sequence[Concurso] = (),
    jogos_por_concurso: int = 1,
    n_simulacoes: int = 10_000,
    semente: int = 20260728,
    processos: int | None = None,
    nome_estrategia: str = "aleatoria_uniforme",
) -> list[float]:
    """Distribuição de ROI de ``n_simulacoes`` carteiras aleatórias.

    ``processos=1`` força serial. O padrão usa os núcleos disponíveis quando o
    volume justifica.
    """
    if n_simulacoes < 1:
        raise ValueError("são necessárias simulações")
    if nome_estrategia not in REGISTRO:
        raise EstrategiaNaoSerializavel(
            f"estratégia {nome_estrategia!r} não está no REGISTRO; só o que está "
            "registrado atravessa a fronteira de processo"
        )

    if processos is None:
        processos = os.cpu_count() or 1
        if n_simulacoes < LIMIAR_PARALELO:
            processos = 1
    processos = max(1, min(processos, n_simulacoes))

    trabalhos: list[_Trabalho] = []
    # Fatias contíguas de índices: o índice determina a semente, então o
    # tamanho e a ordem dos lotes não influenciam o resultado.
    passo = (n_simulacoes + processos - 1) // processos
    for inicio in range(0, n_simulacoes, passo):
        trabalhos.append(_Trabalho(
            codigo_modalidade=m.codigo, nome_estrategia=nome_estrategia,
            concursos=tuple(concursos), anteriores=tuple(anteriores),
            jogos_por_concurso=jogos_por_concurso, semente_base=semente,
            inicio=inicio, fim=min(inicio + passo, n_simulacoes)))

    if processos == 1:
        return [roi for t in trabalhos for roi in _executar_lote(t)]

    try:
        with ProcessPoolExecutor(max_workers=processos) as executor:
            partes = list(executor.map(_executar_lote, trabalhos))
    except (TypeError, AttributeError) as erro:      # pickle falhou
        raise EstrategiaNaoSerializavel(str(erro)) from erro
    return [roi for parte in partes for roi in parte]


def avaliar_periodo_paralelo(
    m: Modalidade,
    estrategia: Estrategia,
    concursos: Sequence[Concurso],
    anteriores: Sequence[Concurso] = (),
    jogos_por_concurso: int = 1,
    n_simulacoes: int = 10_000,
    semente: int = 20260728,
    periodo: str = "período",
    processos: int | None = None,
) -> Avaliacao:
    """Igual a ``backtest.avaliar_periodo``, com a base aleatória em paralelo.

    A estratégia avaliada roda em série — é uma execução só, e paralelizá-la
    não ganharia nada. O que custa são as milhares de carteiras de referência.
    """
    if not concursos:
        raise ValueError("nenhum concurso no período")

    rng = random.Random(semente)
    reais = _apostar(m, estrategia, concursos, anteriores, jogos_por_concurso, rng)
    metricas = avaliar(reais)

    rois = rois_aleatorios(m, concursos, anteriores, jogos_por_concurso,
                           n_simulacoes, semente, processos)

    percentil = percentil_na_distribuicao(metricas.roi, rois)
    teste = teste_monte_carlo(metricas.roi, rois)
    return Avaliacao(periodo, metricas, percentil, teste, n_simulacoes, semente)
