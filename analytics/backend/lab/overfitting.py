"""Índice de Risco de Sobreajuste (0–100).

AVISO EXPLÍCITO, e ele também aparece na interface: este índice **não é uma
medida científica reconhecida**. É uma heurística composta, criada para este
sistema, cuja fórmula está inteiramente aberta abaixo. Serve para ordenar
estratégias por suspeita, não para aprovar ou reprovar nenhuma.

O motivo de existir: a degradação entre desenvolvimento e teste é o sintoma
mais confiável de sobreajuste, mas isolada ela engana — uma estratégia simples
pode degradar por azar, e uma estratégia com trinta parâmetros pode não
degradar num teste curto. Combinar os sinais é menos ruim do que olhar um só.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

FAIXAS = ((25, "baixo"), (50, "moderado"), (75, "alto"), (100, "crítico"))

#: Pesos da composição. Somam 100 e estão aqui, e não espalhados no código,
#: para que alterá-los seja uma decisão visível e versionável.
PESOS = {
    "degradacao": 35,      # cai muito do desenvolvimento para o teste
    "complexidade": 20,    # muitos parâmetros e filtros
    "instabilidade": 20,   # varia muito entre janelas temporais
    "sensibilidade": 15,   # muda muito com perturbação pequena dos parâmetros
    "concentracao": 10,    # o resultado depende de pouquíssimos concursos
}


@dataclass(frozen=True)
class RiscoSobreajuste:
    indice: float
    classificacao: str
    componentes: dict[str, float]
    n_janelas: int
    leitura: str

    def detalhamento(self) -> str:
        partes = ", ".join(
            f"{k}={v:.0f}/{PESOS[k]}" for k, v in sorted(self.componentes.items())
        )
        return f"{self.indice:.0f}/100 ({self.classificacao}) — {partes}"


def _limitar(x: float, minimo: float = 0.0, maximo: float = 1.0) -> float:
    return max(minimo, min(maximo, x))


def calcular(
    roi_desenvolvimento: float,
    roi_teste: float,
    n_parametros: int,
    n_filtros: int,
    rois_por_janela: Sequence[float] = (),
    rois_perturbados: Sequence[float] = (),
    fracao_do_premio_no_maior_concurso: float = 0.0,
) -> RiscoSobreajuste:
    """Compõe o índice.

    ``rois_perturbados`` são os ROIs obtidos ao mexer os parâmetros em ±5%,
    ±10% e ±20%: se o resultado desaparece com um empurrãozinho, ele foi
    encontrado por garimpo, não por sinal.

    ``fracao_do_premio_no_maior_concurso`` captura a estratégia que "funciona"
    porque acertou um prêmio grande uma vez — o caso mais comum e mais
    enganoso de todos.
    """
    if n_parametros < 0 or n_filtros < 0:
        raise ValueError("contagens não podem ser negativas")

    componentes: dict[str, float] = {}

    # 1. Degradação: quanto do desempenho sumiu fora da amostra.
    if roi_desenvolvimento > 0:
        queda = (roi_desenvolvimento - roi_teste) / abs(roi_desenvolvimento)
    else:
        # Sem desempenho no desenvolvimento não há do que cair. Piorar ainda
        # mais no teste é ruído, não sobreajuste.
        queda = 0.0
    componentes["degradacao"] = _limitar(queda) * PESOS["degradacao"]

    # 2. Complexidade: satura em 12 graus de liberdade somados.
    componentes["complexidade"] = _limitar((n_parametros + n_filtros) / 12.0) * PESOS["complexidade"]

    # 3. Instabilidade entre janelas: dispersão relativa dos ROIs.
    if len(rois_por_janela) >= 2:
        media = sum(rois_por_janela) / len(rois_por_janela)
        var = sum((r - media) ** 2 for r in rois_por_janela) / (len(rois_por_janela) - 1)
        dp = var ** 0.5
        escala = max(abs(media), 0.05)      # evita estourar quando a média é ~0
        componentes["instabilidade"] = _limitar(dp / escala / 2.0) * PESOS["instabilidade"]
    else:
        # Sem janelas não dá para afirmar estabilidade: cobra-se metade do peso,
        # porque "não medido" não é o mesmo que "estável".
        componentes["instabilidade"] = PESOS["instabilidade"] * 0.5

    # 4. Sensibilidade à perturbação dos parâmetros.
    if rois_perturbados:
        pior = min(rois_perturbados)
        if roi_teste > 0:
            perda = (roi_teste - pior) / abs(roi_teste)
        else:
            perda = 0.0
        componentes["sensibilidade"] = _limitar(perda) * PESOS["sensibilidade"]
    else:
        componentes["sensibilidade"] = PESOS["sensibilidade"] * 0.5

    # 5. Concentração do ganho em poucos concursos.
    componentes["concentracao"] = (
        _limitar(fracao_do_premio_no_maior_concurso) * PESOS["concentracao"]
    )

    indice = sum(componentes.values())
    classificacao = next(nome for teto, nome in FAIXAS if indice <= teto)
    return RiscoSobreajuste(
        indice=indice,
        classificacao=classificacao,
        componentes=componentes,
        n_janelas=len(rois_por_janela),
        leitura=_ler(indice, classificacao, componentes, len(rois_por_janela)),
    )


def _ler(indice: float, classificacao: str, comp: dict[str, float], janelas: int) -> str:
    maior = max(comp, key=lambda k: comp[k])
    explicacao = {
        "degradacao": "o desempenho caiu bastante do desenvolvimento para o teste",
        "complexidade": "há muitos parâmetros e filtros para o tamanho do histórico",
        "instabilidade": "o resultado varia muito de uma janela temporal para outra",
        "sensibilidade": "pequenas mudanças nos parâmetros derrubam o resultado",
        "concentracao": "o retorno depende de pouquíssimos concursos",
    }[maior]
    base = f"Risco {classificacao} ({indice:.0f}/100). O que mais pesou: {explicacao}."
    if janelas < 2:
        base += (
            " Sem janelas temporais suficientes, a estabilidade não pôde ser medida "
            "e foi cobrada pela metade — rode o walk-forward para reduzir a incerteza."
        )
    return base + " Este índice é uma heurística deste sistema, não uma medida oficial."
