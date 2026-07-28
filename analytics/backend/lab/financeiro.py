"""Métricas financeiras de uma carteira de apostas.

Duas decisões que mudam o número mostrado ao usuário:

1. O custo usa o preço vigente **na data do concurso**, não o de hoje. Aplicar
   o preço atual a um histórico de dez anos infla o custo e afunda o ROI.
2. A perda máxima acumulada (*drawdown*) é medida sobre o resultado acumulado,
   não sobre o gasto. Em loteria o acumulado é quase sempre decrescente, e é
   justamente o tamanho dessa queda que o apostador precisa enxergar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import sqrt
from typing import Sequence


@dataclass(frozen=True)
class ResultadoConcurso:
    """O que aconteceu com a carteira em um concurso."""

    concurso: int
    custo: float
    premio: float

    @property
    def liquido(self) -> float:
        return self.premio - self.custo


@dataclass(frozen=True)
class Metricas:
    n_concursos: int
    custo_total: float
    premio_bruto: float
    resultado_liquido: float
    roi: float
    taxa_recuperacao: float
    perda_maxima: float
    concursos_sem_premio: int
    maior_sequencia_sem_premio: int
    retorno_medio: float
    retorno_mediano: float
    volatilidade: float
    maior_premio: float
    curva_acumulada: tuple[float, ...] = field(repr=False, default=())

    def leitura(self) -> str:
        return (
            f"{self.n_concursos} concursos, custo {self.custo_total:.2f}, "
            f"prêmio {self.premio_bruto:.2f}, líquido {self.resultado_liquido:.2f} "
            f"(ROI {self.roi * 100:.2f}%). Recuperou {self.taxa_recuperacao * 100:.2f}% "
            f"do valor gasto. Pior queda acumulada: {self.perda_maxima:.2f}. "
            f"{self.concursos_sem_premio} concursos sem prêmio, maior sequência "
            f"de {self.maior_sequencia_sem_premio}."
        )


def _mediana(valores: Sequence[float]) -> float:
    v = sorted(valores)
    n = len(v)
    if n == 0:
        return 0.0
    meio = n // 2
    return v[meio] if n % 2 else (v[meio - 1] + v[meio]) / 2.0


def avaliar(resultados: Sequence[ResultadoConcurso]) -> Metricas:
    """Consolida a carteira. Não julga a estratégia — só mede o que aconteceu."""
    if not resultados:
        raise ValueError("nenhum concurso para avaliar")

    custo = sum(r.custo for r in resultados)
    premio = sum(r.premio for r in resultados)
    liquido = premio - custo
    liquidos = [r.liquido for r in resultados]

    # Curva acumulada e maior queda a partir de um pico.
    acumulado, pico, drawdown = 0.0, 0.0, 0.0
    curva: list[float] = []
    for valor in liquidos:
        acumulado += valor
        curva.append(acumulado)
        pico = max(pico, acumulado)
        drawdown = max(drawdown, pico - acumulado)

    sem_premio = sum(1 for r in resultados if r.premio <= 0)
    maior_seca, seca = 0, 0
    for r in resultados:
        seca = seca + 1 if r.premio <= 0 else 0
        maior_seca = max(maior_seca, seca)

    n = len(resultados)
    media = sum(liquidos) / n
    if n > 1:
        variancia = sum((x - media) ** 2 for x in liquidos) / (n - 1)
        volatilidade = sqrt(variancia)
    else:
        volatilidade = 0.0

    return Metricas(
        n_concursos=n,
        custo_total=custo,
        premio_bruto=premio,
        resultado_liquido=liquido,
        roi=(liquido / custo) if custo > 0 else 0.0,
        taxa_recuperacao=(premio / custo) if custo > 0 else 0.0,
        perda_maxima=drawdown,
        concursos_sem_premio=sem_premio,
        maior_sequencia_sem_premio=maior_seca,
        retorno_medio=media,
        retorno_mediano=_mediana(liquidos),
        volatilidade=volatilidade,
        maior_premio=max(r.premio for r in resultados),
        curva_acumulada=tuple(curva),
    )
