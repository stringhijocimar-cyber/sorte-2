"""Importação de resultados oficiais.

Decisões de projeto, e o porquê de cada uma:

* **Importação incremental.** Descobre o último concurso já importado e busca
  só o que falta. Reimportar dez mil concursos a cada execução é desperdício e
  ainda multiplica a chance de bater no limite da fonte.
* **Validação antes da gravação.** Um resultado com dezena repetida ou fora do
  universo é recusado na porta. Dado ruim que entra no banco contamina todo
  backtest daí em diante, e o estrago só aparece meses depois.
* **Fonte alternativa declarada.** A origem e a data de cada importação ficam
  gravadas na linha. Sem isso, quando duas fontes divergem, não há como saber
  qual está no banco.
* **Sem scraping frágil.** O cliente HTTP é injetado; a camada não sabe de
  onde vem o JSON. Isso torna a importação testável sem rede e permite trocar
  a fonte sem reescrever a validação.

Este módulo é a fronteira do sistema com o mundo. Ele não decide nada sobre
estratégia — só entrega dados que já podem ser confiados.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Callable, Iterable, Protocol, Sequence

from .loterias import FormatoInvalido, Modalidade, modalidade

#: Endpoint público de resultados da CAIXA. Mantido em constante porque muda
#: de tempos em tempos e não deve estar espalhado pelo código.
BASE_CAIXA = "https://servicebus2.caixa.gov.br/portaldeloterias/api"

#: Nome da modalidade na URL da CAIXA, que difere do nosso código interno.
CAMINHO_CAIXA = {
    "megasena": "megasena", "lotofacil": "lotofacil", "quina": "quina",
    "duplasena": "duplasena", "timemania": "timemania",
    "diadesorte": "diadesorte", "lotomania": "lotomania",
    "supersete": "supersete", "maismilionaria": "maismilionaria",
}


class ErroDeImportacao(RuntimeError):
    """A fonte respondeu, mas o conteúdo não serve."""


class FonteIndisponivel(RuntimeError):
    """Nenhuma fonte respondeu. O sistema segue com o que já tem no banco."""


@dataclass(frozen=True)
class ConcursoImportado:
    modalidade: str
    concurso: int
    data: date
    dezenas: tuple[int, ...]
    acumulado: bool = False
    premio_estimado: float = 0.0
    arrecadacao: float = 0.0
    #: ``acertos -> (ganhadores, premio_por_ganhador)``
    rateio: dict[int, tuple[int, float]] = field(default_factory=dict)
    origem: str = "desconhecida"
    importado_em: datetime = field(default_factory=datetime.utcnow)


class ClienteHTTP(Protocol):
    """Contrato mínimo. Qualquer coisa que devolva JSON serve."""

    def obter_json(self, url: str) -> dict: ...


# --------------------------------------------------------------------------- #
# Conversão e validação
# --------------------------------------------------------------------------- #

def _data_br(texto: str) -> date:
    for formato in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto.strip(), formato).date()
        except ValueError:
            continue
    raise ErroDeImportacao(f"data em formato desconhecido: {texto!r}")


def _numero(valor) -> float:
    """Converte '1.234.567,89' e 1234567.89 para float."""
    if isinstance(valor, (int, float)):
        return float(valor)
    if valor in (None, ""):
        return 0.0
    texto = str(valor).strip().replace("R$", "").strip()
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError as erro:
        raise ErroDeImportacao(f"valor numérico inválido: {valor!r}") from erro


def converter_caixa(codigo: str, bruto: dict) -> ConcursoImportado:
    """Traduz a resposta da CAIXA para o nosso formato, validando na entrada."""
    m = modalidade(codigo)
    try:
        numero = int(bruto["numero"])
        dia = _data_br(str(bruto["dataApuracao"]))
        cruas = bruto.get("listaDezenas") or bruto.get("dezenasSorteadasOrdemSorteio") or []
    except (KeyError, TypeError, ValueError) as erro:
        raise ErroDeImportacao(f"resposta sem os campos esperados: {erro}") from erro

    try:
        dezenas = [int(d) for d in cruas]
    except (TypeError, ValueError) as erro:
        raise ErroDeImportacao(f"dezenas não numéricas: {cruas!r}") from erro

    m.validar_sorteio(dezenas)          # levanta FormatoInvalido se não servir

    rateio: dict[int, tuple[int, float]] = {}
    for faixa in bruto.get("listaRateioPremio") or []:
        try:
            acertos = _acertos_da_faixa(m, faixa)
            if acertos is None:
                continue
            rateio[acertos] = (
                int(faixa.get("numeroDeGanhadores") or 0),
                _numero(faixa.get("valorPremio")),
            )
        except (TypeError, ValueError):
            continue                    # faixa malformada não invalida o concurso

    return ConcursoImportado(
        modalidade=codigo,
        concurso=numero,
        data=dia,
        dezenas=tuple(sorted(dezenas)) if m.formato != "colunas" else tuple(dezenas),
        acumulado=bool(bruto.get("acumulado", False)),
        premio_estimado=_numero(bruto.get("valorEstimadoProximoConcurso")),
        arrecadacao=_numero(bruto.get("valorArrecadado")),
        rateio=rateio,
        origem="caixa",
    )


def _acertos_da_faixa(m: Modalidade, faixa: dict) -> int | None:
    """Extrai o número de acertos da descrição da faixa.

    A CAIXA descreve as faixas em texto ("6 acertos", "Quina"). Preferimos a
    contagem numérica quando ela existe e caímos no nome da faixa da própria
    modalidade quando não — em vez de adivinhar por posição, que quebra sempre
    que a ordem muda.
    """
    descricao = str(faixa.get("descricaoFaixa") or "").strip().lower()
    for token in descricao.split():
        if token.isdigit():
            return int(token)
    for f in m.faixas:
        if f.descricao.lower() in descricao:
            return f.acertos
    return None


# --------------------------------------------------------------------------- #
# Importação incremental
# --------------------------------------------------------------------------- #

@dataclass
class Relatorio:
    modalidade: str
    importados: list[ConcursoImportado] = field(default_factory=list)
    ignorados_duplicados: int = 0
    recusados: list[tuple[int, str]] = field(default_factory=list)
    origem: str = ""

    def leitura(self) -> str:
        partes = [f"{self.modalidade}: {len(self.importados)} concurso(s) novo(s)"]
        if self.ignorados_duplicados:
            partes.append(f"{self.ignorados_duplicados} já existente(s)")
        if self.recusados:
            partes.append(f"{len(self.recusados)} recusado(s) na validação")
        if self.origem:
            partes.append(f"origem: {self.origem}")
        return "; ".join(partes)


def importar_incremental(
    codigo: str,
    cliente: ClienteHTTP,
    ultimo_importado: int = 0,
    limite: int | None = None,
    fontes_alternativas: Sequence[Callable[[str, int], dict]] = (),
) -> Relatorio:
    """Busca só o que falta, a partir de ``ultimo_importado``.

    Se a fonte principal falhar em um concurso, tenta as alternativas na ordem
    antes de desistir. Uma falha isolada não aborta a importação inteira: o
    concurso vai para ``recusados`` e o processo continua.
    """
    m = modalidade(codigo)
    caminho = CAMINHO_CAIXA.get(codigo)
    if caminho is None:
        raise KeyError(f"sem caminho de importação para {codigo!r}")

    relatorio = Relatorio(modalidade=codigo, origem="caixa")

    try:
        ultimo_disponivel = _ultimo_concurso(caminho, cliente)
    except Exception as erro:                       # noqa: BLE001 — a fronteira absorve
        raise FonteIndisponivel(
            f"não foi possível descobrir o último concurso de {codigo}: {erro}"
        ) from erro

    alvo_final = ultimo_disponivel
    if limite is not None:
        alvo_final = min(alvo_final, ultimo_importado + limite)

    for numero in range(ultimo_importado + 1, alvo_final + 1):
        bruto = None
        for tentar in (_buscar_caixa(caminho, cliente), *fontes_alternativas):
            try:
                bruto = tentar(codigo, numero) if callable(tentar) else None
                if bruto:
                    break
            except Exception:                       # noqa: BLE001
                continue
        if not bruto:
            relatorio.recusados.append((numero, "nenhuma fonte respondeu"))
            continue
        try:
            relatorio.importados.append(converter_caixa(codigo, bruto))
        except (ErroDeImportacao, FormatoInvalido) as erro:
            relatorio.recusados.append((numero, str(erro)))
    return relatorio


def _buscar_caixa(caminho: str, cliente: ClienteHTTP):
    def buscar(codigo: str, numero: int) -> dict:
        return cliente.obter_json(f"{BASE_CAIXA}/{caminho}/{numero}")

    return buscar


def _ultimo_concurso(caminho: str, cliente: ClienteHTTP) -> int:
    dados = cliente.obter_json(f"{BASE_CAIXA}/{caminho}")
    return int(dados["numero"])


def deduplicar(
    novos: Iterable[ConcursoImportado], ja_existentes: Iterable[int]
) -> tuple[list[ConcursoImportado], int]:
    """Remove concursos já presentes e duplicatas dentro do próprio lote."""
    vistos = set(ja_existentes)
    saida, descartados = [], 0
    for c in novos:
        if c.concurso in vistos:
            descartados += 1
            continue
        vistos.add(c.concurso)
        saida.append(c)
    return saida, descartados


# --------------------------------------------------------------------------- #
# Importação manual
# --------------------------------------------------------------------------- #

def importar_csv(codigo: str, conteudo: str) -> Relatorio:
    """Importa de CSV. Colunas: ``concurso,data,dezenas`` (dezenas separadas
    por espaço, hífen ou ponto e vírgula).

    Existe como caminho de contingência: quando a fonte oficial está fora do ar
    por dias, o usuário ainda consegue alimentar o histórico à mão.
    """
    m = modalidade(codigo)
    relatorio = Relatorio(modalidade=codigo, origem="csv")
    leitor = csv.DictReader(io.StringIO(conteudo))
    if not leitor.fieldnames:
        raise ErroDeImportacao("CSV sem cabeçalho")

    faltando = {"concurso", "data", "dezenas"} - {c.strip().lower() for c in leitor.fieldnames}
    if faltando:
        raise ErroDeImportacao(f"CSV sem as colunas: {', '.join(sorted(faltando))}")

    for linha_num, linha in enumerate(leitor, start=2):
        chaves = {k.strip().lower(): (v or "").strip() for k, v in linha.items() if k}
        try:
            numero = int(chaves["concurso"])
            dia = _data_br(chaves["data"])
            cru = chaves["dezenas"].replace(";", " ").replace("-", " ").replace(",", " ")
            dezenas = [int(x) for x in cru.split()]
            m.validar_sorteio(dezenas)
        except (KeyError, ValueError, FormatoInvalido, ErroDeImportacao) as erro:
            relatorio.recusados.append((linha_num, str(erro)))
            continue
        relatorio.importados.append(ConcursoImportado(
            modalidade=codigo, concurso=numero, data=dia,
            dezenas=tuple(sorted(dezenas)) if m.formato != "colunas" else tuple(dezenas),
            origem="csv",
        ))
    return relatorio
