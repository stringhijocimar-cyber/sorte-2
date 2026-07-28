"""Backtest com separação temporal e comparação contra o aleatório.

O risco central de um backtest de loteria não é errar uma conta: é o
**vazamento de dados**. Uma estratégia que enxerga o concurso que vai prever
parece excelente e não vale nada. Por isso, aqui:

* a divisão é sempre cronológica, nunca embaralhada;
* a estratégia recebe apenas os concursos **estritamente anteriores** ao que
  será avaliado — a interface torna isso impossível de burlar por descuido,
  porque o concurso-alvo simplesmente não é passado para ela;
* o período de teste final fica isolado atrás de um sinalizador explícito.

A comparação contra carteiras aleatórias de mesmo tamanho, mesmo custo e
mesmos concursos é obrigatória: sem ela, um ROI de -70% parece ruim, quando na
verdade é o normal da modalidade.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Iterable, Sequence

from .estatistica import Resultado, percentil_na_distribuicao, teste_permutacao
from .financeiro import Metricas, ResultadoConcurso, avaliar
from .loterias import Modalidade


class VazamentoDeDados(RuntimeError):
    """A estratégia tentou olhar um concurso que ainda não deveria existir."""


@dataclass(frozen=True)
class Concurso:
    numero: int
    data: date
    dezenas: tuple[int, ...]
    #: ``acertos -> (ganhadores, premio_por_ganhador)``. Vazio quando o
    #: histórico importado não trouxe rateio.
    rateio: dict[int, tuple[int, float]] = field(default_factory=dict)

    def premio_para(self, acertos: int) -> float:
        if acertos not in self.rateio:
            return 0.0
        return self.rateio[acertos][1]


@dataclass(frozen=True)
class Particao:
    """Divisão cronológica do histórico. Nunca embaralhada."""

    desenvolvimento: tuple[Concurso, ...]
    validacao: tuple[Concurso, ...]
    teste: tuple[Concurso, ...]

    def __post_init__(self) -> None:
        blocos = [self.desenvolvimento, self.validacao, self.teste]
        numeros = [c.numero for bloco in blocos for c in bloco]
        if numeros != sorted(numeros):
            raise VazamentoDeDados(
                "a partição não está em ordem cronológica — isso indica "
                "embaralhamento e invalida o backtest"
            )

    def resumo(self) -> str:
        def faixa(b: Sequence[Concurso]) -> str:
            return f"{b[0].numero}–{b[-1].numero}" if b else "vazio"

        return (
            f"desenvolvimento {faixa(self.desenvolvimento)} ({len(self.desenvolvimento)}), "
            f"validação {faixa(self.validacao)} ({len(self.validacao)}), "
            f"teste {faixa(self.teste)} ({len(self.teste)})"
        )


def particionar(
    concursos: Sequence[Concurso],
    fracao_desenvolvimento: float = 0.60,
    fracao_validacao: float = 0.20,
) -> Particao:
    """Divide cronologicamente em desenvolvimento, validação e teste."""
    if not concursos:
        raise ValueError("histórico vazio")
    if fracao_desenvolvimento <= 0 or fracao_validacao < 0:
        raise ValueError("frações devem ser positivas")
    if fracao_desenvolvimento + fracao_validacao >= 1.0:
        raise ValueError("não sobrou período de teste — some menos que 1,0")

    ordenados = sorted(concursos, key=lambda c: c.numero)
    if len(set(c.numero for c in ordenados)) != len(ordenados):
        raise ValueError("há concursos duplicados no histórico")

    n = len(ordenados)
    corte1 = int(n * fracao_desenvolvimento)
    corte2 = corte1 + int(n * fracao_validacao)
    return Particao(
        desenvolvimento=tuple(ordenados[:corte1]),
        validacao=tuple(ordenados[corte1:corte2]),
        teste=tuple(ordenados[corte2:]),
    )


#: Uma estratégia recebe (modalidade, histórico anterior, quantidade, rng) e
#: devolve as apostas para o próximo concurso. Ela **não** recebe o concurso
#: que será conferido — é isso que impede vazamento.
Estrategia = Callable[[Modalidade, Sequence[Concurso], int, random.Random], list[list[int]]]


def aleatoria_uniforme(
    m: Modalidade, historico: Sequence[Concurso], quantos: int, rng: random.Random
) -> list[list[int]]:
    """Referência obrigatória. Toda combinação válida é igualmente provável."""
    universo = list(m.dezenas_validas())
    return [sorted(rng.sample(universo, m.aposta_minima)) for _ in range(quantos)]


@dataclass(frozen=True)
class Avaliacao:
    periodo: str
    metricas: Metricas
    #: Percentil da estratégia dentro da distribuição de carteiras aleatórias.
    percentil_vs_aleatorio: float
    teste: Resultado
    n_simulacoes: int
    semente: int

    def leitura(self) -> str:
        return (
            f"[{self.periodo}] {self.metricas.leitura()} "
            f"Contra {self.n_simulacoes} carteiras aleatórias de mesmo tamanho e "
            f"custo, ficou no percentil {self.percentil_vs_aleatorio:.1f}. "
            f"{self.teste.leitura}"
        )


def _apostar(
    m: Modalidade,
    estrategia: Estrategia,
    concursos: Sequence[Concurso],
    anteriores: Sequence[Concurso],
    jogos_por_concurso: int,
    rng: random.Random,
) -> list[ResultadoConcurso]:
    """Percorre os concursos apostando com o que era conhecido antes de cada um."""
    historico = list(anteriores)
    saida: list[ResultadoConcurso] = []
    for alvo in concursos:
        apostas = estrategia(m, tuple(historico), jogos_por_concurso, rng)
        if len(apostas) != jogos_por_concurso:
            raise ValueError(
                f"a estratégia devolveu {len(apostas)} jogos, esperava {jogos_por_concurso}"
            )
        custo = 0.0
        premio = 0.0
        sorteadas = set(alvo.dezenas)
        for aposta in apostas:
            m.validar_aposta(aposta)
            custo += m.preco(alvo.data, len(aposta))
            premio += alvo.premio_para(len(sorteadas & set(aposta)))
        saida.append(ResultadoConcurso(alvo.numero, custo, premio))
        historico.append(alvo)          # só agora o alvo vira passado
    return saida


def avaliar_periodo(
    m: Modalidade,
    estrategia: Estrategia,
    concursos: Sequence[Concurso],
    anteriores: Sequence[Concurso] = (),
    jogos_por_concurso: int = 1,
    n_simulacoes: int = 10_000,
    semente: int = 20260728,
    periodo: str = "período",
) -> Avaliacao:
    """Roda a estratégia e a compara com ``n_simulacoes`` carteiras aleatórias.

    A semente é registrada no resultado: um backtest que não pode ser repetido
    não pode ser auditado.
    """
    if not concursos:
        raise ValueError("nenhum concurso no período")
    if n_simulacoes < 1:
        raise ValueError("são necessárias simulações para a comparação")

    rng = random.Random(semente)
    reais = _apostar(m, estrategia, concursos, anteriores, jogos_por_concurso, rng)
    metricas = avaliar(reais)

    rois: list[float] = []
    for i in range(n_simulacoes):
        rng_i = random.Random(semente + 1 + i)
        base = _apostar(m, aleatoria_uniforme, concursos, anteriores,
                        jogos_por_concurso, rng_i)
        rois.append(avaliar(base).roi)

    percentil = percentil_na_distribuicao(metricas.roi, rois)
    teste = teste_permutacao(
        [r.liquido for r in reais],
        [x for x in rois],
        permutacoes=min(10_000, max(1_000, n_simulacoes)),
        semente=semente,
    )
    return Avaliacao(periodo, metricas, percentil, teste, n_simulacoes, semente)


@dataclass(frozen=True)
class JanelaWalkForward:
    treino_ate: int
    testou_de: int
    testou_ate: int
    metricas: Metricas


def walk_forward(
    m: Modalidade,
    estrategia: Estrategia,
    concursos: Sequence[Concurso],
    tamanho_treino: int,
    tamanho_teste: int,
    expansiva: bool = True,
    jogos_por_concurso: int = 1,
    semente: int = 20260728,
) -> list[JanelaWalkForward]:
    """Validação temporal progressiva.

    ``expansiva`` mantém todo o passado no treino; caso contrário a janela é
    móvel e esquece o começo. As duas são legítimas — a móvel responde "a
    estratégia sobrevive a mudanças de regime?", a expansiva usa mais dados.
    """
    ordenados = sorted(concursos, key=lambda c: c.numero)
    if tamanho_treino < 1 or tamanho_teste < 1:
        raise ValueError("tamanhos de treino e teste devem ser positivos")
    if len(ordenados) < tamanho_treino + tamanho_teste:
        raise ValueError("histórico curto demais para essa configuração de janela")

    janelas: list[JanelaWalkForward] = []
    inicio_teste = tamanho_treino
    while inicio_teste + tamanho_teste <= len(ordenados):
        inicio_treino = 0 if expansiva else inicio_teste - tamanho_treino
        treino = ordenados[inicio_treino:inicio_teste]
        teste = ordenados[inicio_teste:inicio_teste + tamanho_teste]
        rng = random.Random(semente + inicio_teste)
        resultados = _apostar(m, estrategia, teste, treino, jogos_por_concurso, rng)
        janelas.append(JanelaWalkForward(
            treino_ate=treino[-1].numero,
            testou_de=teste[0].numero,
            testou_ate=teste[-1].numero,
            metricas=avaliar(resultados),
        ))
        inicio_teste += tamanho_teste
    return janelas
