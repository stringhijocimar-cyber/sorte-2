"""Registro das modalidades das Loterias CAIXA.

Uma modalidade é descrita por dados, não por código: acrescentar uma nova é
acrescentar uma entrada aqui. As três estruturas diferentes (dezenas simples,
dezenas com complemento, e colunas independentes) são distinguidas por
``formato``, porque Super Sete e +Milionária não cabem no molde das demais.

Preços mudam ao longo do tempo. Guardamos a tabela histórica e resolvemos o
preço pela data do concurso — um backtest que aplique o preço de hoje a um
concurso de 2010 produz um custo errado, e portanto um ROI errado.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date
from math import comb


class FormatoInvalido(ValueError):
    """A aposta não respeita a estrutura da modalidade."""


@dataclass(frozen=True)
class FaixaPremio:
    """Uma faixa de premiação: quantos acertos ela exige."""

    acertos: int
    descricao: str


@dataclass(frozen=True)
class Modalidade:
    codigo: str
    nome: str
    #: ``dezenas``   — escolhe N de um universo contínuo (Mega, Quina, ...)
    #: ``colunas``   — escolhe um valor por coluna (Super Sete)
    #: ``composta``  — dezenas mais um conjunto complementar (+Milionária, Dia de Sorte)
    formato: str
    numero_minimo: int
    numero_maximo: int
    dezenas_sorteadas: int
    aposta_minima: int
    aposta_maxima: int
    #: ``(data_inicio, preco_da_aposta_minima)`` em ordem cronológica.
    precos: tuple[tuple[date, float], ...]
    faixas: tuple[FaixaPremio, ...]
    #: Só para ``composta``: universo e quantidade do complemento (trevos, mês).
    complemento_nome: str | None = None
    complemento_minimo: int = 0
    complemento_maximo: int = 0
    complemento_sorteados: int = 0
    complemento_aposta_minima: int = 0
    complemento_aposta_maxima: int = 0
    #: Só para ``colunas``: quantidade de colunas e dígitos por coluna.
    colunas: int = 0
    ativa: bool = True
    observacao: str = ""

    # ------------------------------------------------------------------ #
    @property
    def universo(self) -> int:
        return self.numero_maximo - self.numero_minimo + 1

    def dezenas_validas(self) -> range:
        return range(self.numero_minimo, self.numero_maximo + 1)

    def preco(self, quando: date, dezenas: int | None = None) -> float:
        """Preço de uma aposta de ``dezenas`` números na data ``quando``.

        O preço da aposta ampliada é o preço da aposta mínima multiplicado
        pelo número de apostas mínimas contidas nela — que é como a CAIXA
        cobra, e não uma aproximação nossa.
        """
        if not self.precos:
            raise FormatoInvalido(f"{self.codigo}: sem tabela de preços")
        datas = [d for d, _ in self.precos]
        i = bisect_right(datas, quando) - 1
        if i < 0:
            # Antes do primeiro preço conhecido: usa o mais antigo e quem
            # chamou decide se aceita. Melhor do que devolver zero em silêncio.
            i = 0
        base = self.precos[i][1]
        n = self.aposta_minima if dezenas is None else dezenas
        return base * self.apostas_equivalentes(n)

    def apostas_equivalentes(self, dezenas: int) -> int:
        """Quantas apostas mínimas cabem numa aposta de ``dezenas`` números."""
        if self.formato == "colunas":
            return 1
        self._checar_tamanho(dezenas)
        return comb(dezenas, self.aposta_minima)

    def combinacoes_possiveis(self) -> int:
        """Espaço amostral da modalidade — o denominador da probabilidade."""
        if self.formato == "colunas":
            return 10 ** self.colunas
        base = comb(self.universo, self.dezenas_sorteadas)
        if self.formato == "composta" and self.complemento_sorteados:
            comp_universo = self.complemento_maximo - self.complemento_minimo + 1
            base *= comb(comp_universo, self.complemento_sorteados)
        return base

    def probabilidade(self, acertos: int, dezenas: int | None = None) -> float:
        """Probabilidade hipergeométrica de fazer exatamente ``acertos``.

        Ignora o complemento (trevo/mês) de propósito: ele multiplica a faixa
        principal e é tratado à parte, para a conta não misturar dois sorteios
        independentes num número só.
        """
        n = self.aposta_minima if dezenas is None else dezenas
        self._checar_tamanho(n)
        k, N = self.dezenas_sorteadas, self.universo
        if acertos > min(k, n) or acertos < 0:
            return 0.0
        return comb(k, acertos) * comb(N - k, n - acertos) / comb(N, n)

    # ------------------------------------------------------------------ #
    def _checar_tamanho(self, dezenas: int) -> None:
        if not (self.aposta_minima <= dezenas <= self.aposta_maxima):
            raise FormatoInvalido(
                f"{self.codigo}: aposta de {dezenas} dezenas fora do intervalo "
                f"{self.aposta_minima}–{self.aposta_maxima}"
            )

    def validar_sorteio(self, dezenas: list[int]) -> None:
        """Valida um resultado importado antes de ele entrar no banco."""
        if self.formato == "colunas":
            if len(dezenas) != self.colunas:
                raise FormatoInvalido(
                    f"{self.codigo}: esperava {self.colunas} colunas, veio {len(dezenas)}"
                )
            if any(not 0 <= d <= 9 for d in dezenas):
                raise FormatoInvalido(f"{self.codigo}: dígito fora de 0–9")
            return
        if len(dezenas) != self.dezenas_sorteadas:
            raise FormatoInvalido(
                f"{self.codigo}: esperava {self.dezenas_sorteadas} dezenas, "
                f"veio {len(dezenas)}"
            )
        if len(set(dezenas)) != len(dezenas):
            raise FormatoInvalido(f"{self.codigo}: dezena repetida no sorteio")
        fora = [d for d in dezenas if not self.numero_minimo <= d <= self.numero_maximo]
        if fora:
            raise FormatoInvalido(
                f"{self.codigo}: dezenas fora de "
                f"{self.numero_minimo}–{self.numero_maximo}: {sorted(fora)}"
            )

    def validar_aposta(self, dezenas: list[int]) -> None:
        if self.formato == "colunas":
            if len(dezenas) != self.colunas:
                raise FormatoInvalido(f"{self.codigo}: aposta precisa de {self.colunas} colunas")
            if any(not 0 <= d <= 9 for d in dezenas):
                raise FormatoInvalido(f"{self.codigo}: dígito fora de 0–9")
            return
        self._checar_tamanho(len(dezenas))
        if len(set(dezenas)) != len(dezenas):
            raise FormatoInvalido(f"{self.codigo}: dezena repetida na aposta")
        fora = [d for d in dezenas if not self.numero_minimo <= d <= self.numero_maximo]
        if fora:
            raise FormatoInvalido(f"{self.codigo}: dezenas fora do universo: {sorted(fora)}")


def _f(*pares: tuple[int, str]) -> tuple[FaixaPremio, ...]:
    return tuple(FaixaPremio(a, d) for a, d in pares)


#: Preços e regras conferíveis no portal das Loterias CAIXA. Os preços são a
#: aposta mínima; a tabela é histórica para que o backtest use o valor vigente
#: no concurso, não o de hoje.
MODALIDADES: dict[str, Modalidade] = {
    "megasena": Modalidade(
        codigo="megasena", nome="Mega-Sena", formato="dezenas",
        numero_minimo=1, numero_maximo=60, dezenas_sorteadas=6,
        aposta_minima=6, aposta_maxima=20,
        precos=((date(2019, 1, 1), 3.50), (date(2022, 11, 6), 4.50), (date(2024, 5, 26), 5.00)),
        faixas=_f((6, "sena"), (5, "quina"), (4, "quadra")),
    ),
    "lotofacil": Modalidade(
        codigo="lotofacil", nome="Lotofácil", formato="dezenas",
        numero_minimo=1, numero_maximo=25, dezenas_sorteadas=15,
        aposta_minima=15, aposta_maxima=20,
        precos=((date(2019, 1, 1), 2.00), (date(2022, 11, 6), 2.50), (date(2024, 5, 26), 3.00)),
        faixas=_f((15, "15 acertos"), (14, "14 acertos"), (13, "13 acertos"),
                  (12, "12 acertos"), (11, "11 acertos")),
    ),
    "quina": Modalidade(
        codigo="quina", nome="Quina", formato="dezenas",
        numero_minimo=1, numero_maximo=80, dezenas_sorteadas=5,
        aposta_minima=5, aposta_maxima=15,
        precos=((date(2019, 1, 1), 1.50), (date(2022, 11, 6), 2.00), (date(2024, 5, 26), 2.50)),
        faixas=_f((5, "quina"), (4, "quadra"), (3, "terno"), (2, "duque")),
    ),
    "duplasena": Modalidade(
        codigo="duplasena", nome="Dupla Sena", formato="dezenas",
        numero_minimo=1, numero_maximo=50, dezenas_sorteadas=6,
        aposta_minima=6, aposta_maxima=15,
        precos=((date(2019, 1, 1), 2.00), (date(2022, 11, 6), 2.50)),
        faixas=_f((6, "sena"), (5, "quina"), (4, "quadra"), (3, "terno")),
        observacao="Dois sorteios por concurso; o histórico guarda os dois.",
    ),
    "timemania": Modalidade(
        codigo="timemania", nome="Timemania", formato="dezenas",
        numero_minimo=1, numero_maximo=80, dezenas_sorteadas=7,
        aposta_minima=10, aposta_maxima=10,
        precos=((date(2019, 1, 1), 3.00), (date(2022, 11, 6), 3.50)),
        faixas=_f((7, "7 acertos"), (6, "6 acertos"), (5, "5 acertos"),
                  (4, "4 acertos"), (3, "3 acertos")),
        observacao="Aposta fixa de 10 dezenas; há ainda o Time do Coração.",
    ),
    "diadesorte": Modalidade(
        codigo="diadesorte", nome="Dia de Sorte", formato="composta",
        numero_minimo=1, numero_maximo=31, dezenas_sorteadas=7,
        aposta_minima=7, aposta_maxima=15,
        precos=((date(2019, 1, 1), 2.00), (date(2022, 11, 6), 2.50)),
        faixas=_f((7, "7 acertos"), (6, "6 acertos"), (5, "5 acertos"), (4, "4 acertos")),
        complemento_nome="mês de sorte", complemento_minimo=1, complemento_maximo=12,
        complemento_sorteados=1, complemento_aposta_minima=1, complemento_aposta_maxima=1,
    ),
    "lotomania": Modalidade(
        codigo="lotomania", nome="Lotomania", formato="dezenas",
        numero_minimo=0, numero_maximo=99, dezenas_sorteadas=20,
        aposta_minima=50, aposta_maxima=50,
        precos=((date(2019, 1, 1), 2.00), (date(2022, 11, 6), 2.50), (date(2024, 5, 26), 3.00)),
        faixas=_f((20, "20 acertos"), (19, "19 acertos"), (18, "18 acertos"),
                  (17, "17 acertos"), (16, "16 acertos"), (15, "15 acertos"),
                  (0, "nenhum acerto")),
        observacao="Aposta fixa de 50 dezenas; premia também zero acerto.",
    ),
    "supersete": Modalidade(
        codigo="supersete", nome="Super Sete", formato="colunas",
        numero_minimo=0, numero_maximo=9, dezenas_sorteadas=7,
        aposta_minima=7, aposta_maxima=7, colunas=7,
        precos=((date(2020, 10, 1), 2.00), (date(2022, 11, 6), 2.50)),
        faixas=_f((7, "7 colunas"), (6, "6 colunas"), (5, "5 colunas"), (4, "4 colunas"),
                  (3, "3 colunas")),
        observacao="Um dígito 0–9 por coluna; as colunas são independentes.",
    ),
    "maismilionaria": Modalidade(
        codigo="maismilionaria", nome="+Milionária", formato="composta",
        numero_minimo=1, numero_maximo=50, dezenas_sorteadas=6,
        aposta_minima=6, aposta_maxima=12,
        precos=((date(2022, 5, 28), 6.00),),
        faixas=_f((6, "6 acertos"), (5, "5 acertos"), (4, "4 acertos"),
                  (3, "3 acertos"), (2, "2 acertos")),
        complemento_nome="trevos", complemento_minimo=1, complemento_maximo=6,
        complemento_sorteados=2, complemento_aposta_minima=2, complemento_aposta_maxima=6,
    ),
}


def modalidade(codigo: str) -> Modalidade:
    try:
        return MODALIDADES[codigo]
    except KeyError as erro:
        conhecidas = ", ".join(sorted(MODALIDADES))
        raise KeyError(f"modalidade desconhecida: {codigo!r}. Conhecidas: {conhecidas}") from erro
