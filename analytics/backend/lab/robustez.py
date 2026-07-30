"""Matriz de estabilidade (§17) e testes de robustez (§18).

O que este módulo responde: **o resultado depende de uma configuração muito
específica?** Uma estratégia que só funciona numa janela, ou que desaparece
quando um parâmetro muda 5%, ou cujo retorno inteiro vem de um único concurso
excepcional, não é robusta — é garimpo com aparência de método.

Três instrumentos, e o que cada um pega:

* **Matriz de estabilidade** — recortes antigos, intermediários e recentes,
  janelas curtas e longas. Pega a estratégia que funciona só num pedaço.
* **Perturbação de parâmetros** — ±5%, ±10%, ±20%. Pega o resultado que existe
  por causa de um número mágico.
* **Exclusão de extremos** — remove o melhor e o pior concurso. Pega o retorno
  que depende de um prêmio isolado, que é o caso mais comum e mais enganoso.

Os três alimentam o Índice de Risco de Sobreajuste, que sem eles cobra metade
do peso por "não medido" — porque não medido não é o mesmo que estável.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence

from .backtest import Concurso, Estrategia, avaliar_periodo
from .loterias import Modalidade
from .overfitting import RiscoSobreajuste
from .overfitting import calcular as calcular_risco


@dataclass(frozen=True)
class Recorte:
    """Um pedaço do histórico com nome. O nome vai para o relatório."""

    nome: str
    concursos: tuple[Concurso, ...]
    anteriores: tuple[Concurso, ...] = ()

    def __post_init__(self) -> None:
        if not self.concursos:
            raise ValueError(f"recorte {self.nome!r} está vazio")


@dataclass(frozen=True)
class LinhaDaMatriz:
    recorte: str
    n_concursos: int
    custo: float
    retorno: float
    roi: float
    percentil_vs_aleatorio: float
    p_valor: float
    conclusao: str


@dataclass(frozen=True)
class Matriz:
    linhas: tuple[LinhaDaMatriz, ...]

    @property
    def rois(self) -> tuple[float, ...]:
        return tuple(l.roi for l in self.linhas)

    @property
    def robusta(self) -> bool:
        """Robusta é funcionar em TODOS os recortes, não em um.

        A definição é deliberadamente severa: o §17 diz que uma estratégia não
        deve ser classificada como robusta caso funcione apenas numa janela
        específica. Com um único recorte, não há como afirmar robustez — e o
        método devolve False em vez de dar o benefício da dúvida.
        """
        if len(self.linhas) < 2:
            return False
        return all(l.percentil_vs_aleatorio > 50 for l in self.linhas)

    def leitura(self) -> str:
        if len(self.linhas) < 2:
            return ("Um recorte só: não há como afirmar estabilidade. "
                    "Rode em períodos antigos, intermediários e recentes.")
        acima = sum(1 for l in self.linhas if l.percentil_vs_aleatorio > 50)
        base = (f"{acima} de {len(self.linhas)} recortes acima da mediana do acaso; "
                f"ROI de {min(self.rois):.2%} a {max(self.rois):.2%}.")
        if self.robusta:
            return base + (" Consistente em todos os recortes — o que ainda não "
                           "significa vantagem, apenas ausência de dependência "
                           "de uma janela específica.")
        return base + (" NÃO é robusta: o desempenho não se sustenta em todos os "
                       "recortes, então depende da janela escolhida.")


def recortes_por_terco(concursos: Sequence[Concurso],
                       treino_minimo: int = 10) -> list[Recorte]:
    """Divide o histórico em antigo, intermediário e recente.

    Cada recorte recebe como "anteriores" tudo o que o precede, para a
    estratégia continuar vendo apenas o passado — a trava anti-vazamento vale
    aqui também.
    """
    ordenados = sorted(concursos, key=lambda c: c.numero)
    n = len(ordenados)
    if n < treino_minimo * 2:
        raise ValueError(
            f"histórico curto demais: {n} concursos para recortes de "
            f"treino mínimo {treino_minimo}")

    corte = max(treino_minimo, n // 4)
    resto = ordenados[corte:]
    tamanho = len(resto) // 3
    if tamanho < 1:
        raise ValueError("histórico não permite três recortes")

    nomes = ("antigo", "intermediário", "recente")
    saida: list[Recorte] = []
    for i, nome in enumerate(nomes):
        inicio = corte + i * tamanho
        fim = corte + (i + 1) * tamanho if i < 2 else n
        saida.append(Recorte(nome=nome,
                             concursos=tuple(ordenados[inicio:fim]),
                             anteriores=tuple(ordenados[:inicio])))
    return saida


def recortes_por_janela(concursos: Sequence[Concurso], tamanhos: Sequence[int],
                        treino_minimo: int = 10) -> list[Recorte]:
    """Janelas curtas e longas terminando no fim do histórico.

    O §17 pede janelas de tamanhos diferentes porque uma estratégia pode
    parecer boa em amostra pequena por pura variância.
    """
    ordenados = sorted(concursos, key=lambda c: c.numero)
    saida: list[Recorte] = []
    for tamanho in sorted(tamanhos):
        if tamanho < 1 or len(ordenados) - tamanho < treino_minimo:
            continue
        saida.append(Recorte(
            nome=f"últimos {tamanho}",
            concursos=tuple(ordenados[-tamanho:]),
            anteriores=tuple(ordenados[:-tamanho])))
    if not saida:
        raise ValueError("nenhuma janela cabe no histórico informado")
    return saida


def matriz_estabilidade(
    m: Modalidade,
    estrategia: Estrategia,
    recortes: Sequence[Recorte],
    jogos_por_concurso: int = 1,
    n_simulacoes: int = 500,
    semente: int = 20260728,
) -> Matriz:
    """Avalia a mesma estratégia em cada recorte, contra o acaso em cada um.

    A comparação é feita **dentro** de cada recorte: comparar o ROI de um
    período com carteiras aleatórias de outro misturaria mudança de estratégia
    com mudança de época.
    """
    if not recortes:
        raise ValueError("nenhum recorte informado")

    linhas: list[LinhaDaMatriz] = []
    for i, r in enumerate(recortes):
        a = avaliar_periodo(
            m, estrategia, r.concursos, r.anteriores,
            jogos_por_concurso=jogos_por_concurso,
            n_simulacoes=n_simulacoes,
            # Semente distinta por recorte: reutilizar a mesma faria as
            # carteiras aleatórias serem as mesmas dezenas em todos os
            # recortes, e a comparação deixaria de ser independente.
            semente=semente + 1000 * (i + 1),
            periodo=r.nome)
        linhas.append(LinhaDaMatriz(
            recorte=r.nome, n_concursos=len(r.concursos),
            custo=a.metricas.custo_total, retorno=a.metricas.premio_bruto,
            roi=a.metricas.roi,
            percentil_vs_aleatorio=a.percentil_vs_aleatorio,
            p_valor=a.teste.p_valor,
            conclusao=("acima do acaso neste recorte"
                       if a.percentil_vs_aleatorio > 50
                       else "abaixo ou igual ao acaso neste recorte")))
    return Matriz(linhas=tuple(linhas))


# --------------------------------------------------------------------------- #
# Perturbação de parâmetros (§18)
# --------------------------------------------------------------------------- #

FATORES = (-0.20, -0.10, -0.05, 0.05, 0.10, 0.20)


@dataclass(frozen=True)
class Perturbacao:
    parametro: str
    fator: float
    valor: float
    roi: float


@dataclass(frozen=True)
class Sensibilidade:
    roi_base: float
    perturbacoes: tuple[Perturbacao, ...]

    @property
    def rois(self) -> tuple[float, ...]:
        return tuple(p.roi for p in self.perturbacoes)

    @property
    def pior(self) -> float:
        return min(self.rois) if self.rois else self.roi_base

    @property
    def amplitude(self) -> float:
        return (max(self.rois) - min(self.rois)) if self.rois else 0.0

    def leitura(self) -> str:
        if not self.perturbacoes:
            return "Nenhum parâmetro perturbado."
        return (f"ROI base {self.roi_base:.2%}; perturbando os parâmetros em até "
                f"20% o ROI varia de {min(self.rois):.2%} a {max(self.rois):.2%}. "
                + ("O resultado sobrevive à perturbação."
                   if self.pior >= 0 or self.roi_base < 0 else
                   "O resultado desaparece com um empurrão pequeno — sinal de que "
                   "foi encontrado por garimpo, não por sinal."))


def perturbar_parametros(
    parametros: dict[str, float],
    rodar: Callable[[dict[str, float]], float],
    fatores: Sequence[float] = FATORES,
) -> Sensibilidade:
    """Varia um parâmetro por vez e mede o ROI.

    Um por vez, e não todos juntos: variando tudo de uma vez não se sabe qual
    parâmetro carregava o resultado, e a informação útil se perde.

    ``rodar`` recebe o dicionário de parâmetros e devolve o ROI.
    """
    if not parametros:
        raise ValueError("nenhum parâmetro para perturbar")

    base = rodar(dict(parametros))
    saida: list[Perturbacao] = []
    for nome, valor in parametros.items():
        for fator in fatores:
            alterado = dict(parametros)
            novo = valor * (1 + fator)
            alterado[nome] = novo
            saida.append(Perturbacao(parametro=nome, fator=fator, valor=novo,
                                     roi=rodar(alterado)))
    return Sensibilidade(roi_base=base, perturbacoes=tuple(saida))


# --------------------------------------------------------------------------- #
# Exclusão de extremos (§18)
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class Concentracao:
    roi_completo: float
    roi_sem_melhor: float
    roi_sem_pior: float
    #: Fração do prêmio total que veio do melhor concurso.
    fracao_do_melhor: float

    @property
    def depende_de_um_concurso(self) -> bool:
        return self.fracao_do_melhor > 0.5

    def leitura(self) -> str:
        base = (f"O melhor concurso responde por {self.fracao_do_melhor:.1%} do "
                f"prêmio total. Sem ele, o ROI cai de {self.roi_completo:.2%} "
                f"para {self.roi_sem_melhor:.2%}.")
        if self.depende_de_um_concurso:
            return base + (" Mais da metade do retorno vem de um único concurso: "
                           "o resultado é um evento, não um padrão.")
        return base


def medir_concentracao(metricas_por_concurso: Sequence[tuple[float, float]]
                       ) -> Concentracao:
    """Mede quanto o retorno depende de poucos concursos.

    ``metricas_por_concurso`` é uma sequência de ``(custo, premio)``.

    O caso que isto pega é o mais comum e o mais enganoso de todos: a
    estratégia "funciona" porque acertou um prêmio grande uma vez.
    """
    if not metricas_por_concurso:
        raise ValueError("nenhum concurso para medir")

    custos = [c for c, _ in metricas_por_concurso]
    premios = [p for _, p in metricas_por_concurso]
    custo_total = sum(custos)
    premio_total = sum(premios)

    def roi(cs: Sequence[float], ps: Sequence[float]) -> float:
        total = sum(cs)
        return (sum(ps) - total) / total if total > 0 else 0.0

    completo = roi(custos, premios)
    if len(metricas_por_concurso) == 1:
        # Sem outro concurso, remover o único não produz medida; declaramos a
        # concentração como total, que é a verdade.
        return Concentracao(completo, 0.0, 0.0, 1.0 if premio_total > 0 else 0.0)

    i_melhor = max(range(len(premios)), key=lambda i: premios[i])
    i_pior = min(range(len(premios)), key=lambda i: premios[i])
    sem = lambda idx: (                                     # noqa: E731
        [c for i, c in enumerate(custos) if i != idx],
        [p for i, p in enumerate(premios) if i != idx],
    )
    return Concentracao(
        roi_completo=completo,
        roi_sem_melhor=roi(*sem(i_melhor)),
        roi_sem_pior=roi(*sem(i_pior)),
        fracao_do_melhor=(premios[i_melhor] / premio_total) if premio_total > 0 else 0.0,
    )


# --------------------------------------------------------------------------- #
# Ligação com o Índice de Risco de Sobreajuste
# --------------------------------------------------------------------------- #

def risco_medido(
    roi_desenvolvimento: float,
    roi_teste: float,
    n_parametros: int,
    n_filtros: int,
    matriz: Matriz | None = None,
    sensibilidade: Sensibilidade | None = None,
    concentracao: Concentracao | None = None,
) -> RiscoSobreajuste:
    """Calcula o índice de sobreajuste com o que os três instrumentos mediram.

    Existe para fechar o buraco de `overfitting.calcular()`: chamado sem
    janelas nem perturbações, ele cobra **metade** do peso de instabilidade e
    de sensibilidade por "não medido". Isso é o comportamento correto — mas
    deixa o índice preso num piso de 17,5 pontos que não diz nada sobre a
    estratégia. Passando a matriz, a sensibilidade e a concentração, os dois
    componentes deixam de ser suposição.

    Cada argumento é opcional de propósito: medir dois dos três já é melhor que
    nenhum, e o índice continua avisando o que ficou de fora.
    """
    return calcular_risco(
        roi_desenvolvimento=roi_desenvolvimento,
        roi_teste=roi_teste,
        n_parametros=n_parametros,
        n_filtros=n_filtros,
        rois_por_janela=matriz.rois if matriz is not None else (),
        rois_perturbados=sensibilidade.rois if sensibilidade is not None else (),
        fracao_do_premio_no_maior_concurso=(
            concentracao.fracao_do_melhor if concentracao is not None else 0.0),
    )
