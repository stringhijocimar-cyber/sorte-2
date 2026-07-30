"""Correção para múltiplos testes.

Este módulo existe por causa de um problema concreto: um sistema que oferece
dezenas de filtros combináveis testa, na prática, centenas de hipóteses. A 5%,
uma em vinte "descobertas" é falsa por construção. Sem correção, a plataforma
viraria uma máquina de produzir estratégias falsamente significativas.

Todas as funções devolvem os p-valores brutos ao lado dos ajustados: esconder
o bruto impede auditoria; mostrar só o bruto engana.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class Ajuste:
    metodo: str
    rotulos: tuple[str, ...]
    brutos: tuple[float, ...]
    ajustados: tuple[float, ...]
    rejeitados: tuple[bool, ...]
    alfa: float

    @property
    def n_hipoteses(self) -> int:
        return len(self.brutos)

    @property
    def n_significativos_antes(self) -> int:
        return sum(1 for p in self.brutos if p < self.alfa)

    @property
    def n_significativos_depois(self) -> int:
        return sum(self.rejeitados)

    @property
    def perdidos(self) -> tuple[str, ...]:
        """Quem era significativo antes da correção e deixou de ser.

        É a informação mais importante do módulo: são exatamente as
        "descobertas" que o usuário levaria embora se a correção não existisse.
        """
        return tuple(
            r for r, bruto, rej in zip(self.rotulos, self.brutos, self.rejeitados)
            if bruto < self.alfa and not rej
        )

    def leitura(self) -> str:
        if self.n_hipoteses == 1:
            return "Uma hipótese testada: correção não se aplica."
        base = (
            f"{self.n_hipoteses} hipóteses testadas. "
            f"{self.n_significativos_antes} significativa(s) antes da correção "
            f"({self.metodo}), {self.n_significativos_depois} depois."
        )
        if self.perdidos:
            return base + (
                f" Deixaram de ser significativas: {', '.join(self.perdidos)}. "
                "Isso é o esperado quando se testa muita coisa — não é falha do teste."
            )
        return base


def _validar(p_valores: Sequence[float], rotulos: Sequence[str] | None) -> tuple[list[float], list[str]]:
    ps = [float(p) for p in p_valores]
    if not ps:
        raise ValueError("nenhum p-valor informado")
    for p in ps:
        if not 0.0 <= p <= 1.0:
            raise ValueError(f"p-valor fora de [0, 1]: {p}")
    if rotulos is None:
        nomes = [f"hipótese {i + 1}" for i in range(len(ps))]
    else:
        nomes = list(rotulos)
        if len(nomes) != len(ps):
            raise ValueError("rótulos e p-valores têm tamanhos diferentes")
    return ps, nomes


def bonferroni(p_valores: Sequence[float], alfa: float = 0.05,
               rotulos: Sequence[str] | None = None) -> Ajuste:
    """Bonferroni: multiplica cada p pelo número de hipóteses.

    O mais conservador. Controla a chance de **qualquer** falso positivo, ao
    custo de perder achados verdadeiros.
    """
    ps, nomes = _validar(p_valores, rotulos)
    m = len(ps)
    ajustados = [min(1.0, p * m) for p in ps]
    return Ajuste("Bonferroni", tuple(nomes), tuple(ps), tuple(ajustados),
                  tuple(p < alfa for p in ajustados), alfa)


def holm(p_valores: Sequence[float], alfa: float = 0.05,
         rotulos: Sequence[str] | None = None) -> Ajuste:
    """Holm-Bonferroni: mesmo controle do Bonferroni, uniformemente mais potente.

    Não há razão para preferir Bonferroni a este quando o objetivo é controlar
    falso positivo em família — Holm domina.
    """
    ps, nomes = _validar(p_valores, rotulos)
    m = len(ps)
    ordem = sorted(range(m), key=lambda i: ps[i])
    ajustados = [0.0] * m
    corrente = 0.0
    for posicao, i in enumerate(ordem):
        valor = (m - posicao) * ps[i]
        corrente = max(corrente, min(1.0, valor))  # monotonicidade
        ajustados[i] = corrente
    return Ajuste("Holm-Bonferroni", tuple(nomes), tuple(ps), tuple(ajustados),
                  tuple(p < alfa for p in ajustados), alfa)


def benjamini_hochberg(p_valores: Sequence[float], alfa: float = 0.05,
                       rotulos: Sequence[str] | None = None) -> Ajuste:
    """Benjamini-Hochberg: controla a taxa de falsas descobertas (FDR).

    Aceita alguns falsos positivos em troca de potência. É a escolha adequada
    para varredura exploratória de filtros — desde que o usuário entenda que
    "significativo sob FDR 5%" quer dizer "espera-se que 5% destes achados
    sejam falsos", e não "há 95% de chance de este achado ser verdadeiro".
    """
    ps, nomes = _validar(p_valores, rotulos)
    m = len(ps)
    ordem = sorted(range(m), key=lambda i: ps[i])
    ajustados = [0.0] * m
    corrente = 1.0
    for posicao in range(m - 1, -1, -1):     # do maior p para o menor
        i = ordem[posicao]
        valor = ps[i] * m / (posicao + 1)
        corrente = min(corrente, min(1.0, valor))
        ajustados[i] = corrente
    return Ajuste("Benjamini-Hochberg (FDR)", tuple(nomes), tuple(ps), tuple(ajustados),
                  tuple(p < alfa for p in ajustados), alfa)


METODOS = {
    "bonferroni": bonferroni,
    "holm": holm,
    "bh": benjamini_hochberg,
    "fdr": benjamini_hochberg,
}


def corrigir(metodo: str, p_valores: Sequence[float], alfa: float = 0.05,
             rotulos: Sequence[str] | None = None) -> Ajuste:
    try:
        fn = METODOS[metodo.lower()]
    except KeyError as erro:
        raise KeyError(
            f"método desconhecido: {metodo!r}. Use: {', '.join(sorted(METODOS))}"
        ) from erro
    return fn(p_valores, alfa, rotulos)
