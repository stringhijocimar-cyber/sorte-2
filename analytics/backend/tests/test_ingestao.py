"""Testes da fronteira de importação — sem rede.

O cliente HTTP é injetado, então toda a validação é exercitada com respostas
controladas, inclusive as malformadas. Dado ruim precisa parar aqui.
"""

from __future__ import annotations

from datetime import date

import pytest

from lab import ingestao
from lab.loterias import FormatoInvalido


class ClienteFalso:
    """Devolve respostas planejadas e conta as chamadas."""

    def __init__(self, ultimo: int, por_concurso: dict[int, dict] | None = None,
                 falhar_em: set[int] | None = None):
        self.ultimo = ultimo
        self.por_concurso = por_concurso or {}
        self.falhar_em = falhar_em or set()
        self.chamadas: list[str] = []

    def obter_json(self, url: str) -> dict:
        self.chamadas.append(url)
        cauda = url.rstrip("/").split("/")[-1]
        if not cauda.isdigit():
            return {"numero": self.ultimo}
        numero = int(cauda)
        if numero in self.falhar_em:
            raise RuntimeError("502 na fonte")
        return self.por_concurso.get(numero) or resposta(numero)


def resposta(numero: int, dezenas=("01", "02", "03", "04", "05", "06")) -> dict:
    return {
        "numero": numero,
        "dataApuracao": "05/03/2024",
        "listaDezenas": list(dezenas),
        "acumulado": False,
        "valorArrecadado": "12.345.678,90",
        "valorEstimadoProximoConcurso": "50.000.000,00",
        "listaRateioPremio": [
            {"descricaoFaixa": "6 acertos", "numeroDeGanhadores": 1, "valorPremio": "40.000.000,00"},
            {"descricaoFaixa": "5 acertos", "numeroDeGanhadores": 60, "valorPremio": "50.000,00"},
        ],
    }


# --------------------------------------------------------------------------- #
# Conversão
# --------------------------------------------------------------------------- #

def test_converte_resposta_valida():
    c = ingestao.converter_caixa("megasena", resposta(2700))
    assert c.concurso == 2700
    assert c.data == date(2024, 3, 5)
    assert c.dezenas == (1, 2, 3, 4, 5, 6)
    assert c.arrecadacao == pytest.approx(12_345_678.90)
    assert c.premio_estimado == pytest.approx(50_000_000.0)
    assert c.rateio[6] == (1, 40_000_000.0)
    assert c.origem == "caixa"


def test_dezenas_saem_ordenadas():
    c = ingestao.converter_caixa("megasena", resposta(1, ("42", "07", "13", "59", "02", "31")))
    assert c.dezenas == (2, 7, 13, 31, 42, 59)


def test_recusa_dezena_fora_do_universo():
    with pytest.raises(FormatoInvalido):
        ingestao.converter_caixa("megasena", resposta(1, ("01", "02", "03", "04", "05", "61")))


def test_recusa_dezena_repetida():
    with pytest.raises(FormatoInvalido):
        ingestao.converter_caixa("megasena", resposta(1, ("01", "01", "03", "04", "05", "06")))


def test_recusa_quantidade_errada_de_dezenas():
    with pytest.raises(FormatoInvalido):
        ingestao.converter_caixa("megasena", resposta(1, ("01", "02", "03", "04", "05")))


def test_recusa_resposta_sem_campos():
    with pytest.raises(ingestao.ErroDeImportacao):
        ingestao.converter_caixa("megasena", {"numero": 1})


def test_recusa_dezenas_nao_numericas():
    with pytest.raises(ingestao.ErroDeImportacao):
        ingestao.converter_caixa("megasena", resposta(1, ("a", "b", "c", "d", "e", "f")))


def test_faixa_malformada_nao_invalida_o_concurso():
    """Rateio é acessório: perder uma faixa não pode custar o concurso inteiro."""
    bruto = resposta(10)
    bruto["listaRateioPremio"].append({"descricaoFaixa": None, "valorPremio": "xx"})
    c = ingestao.converter_caixa("megasena", bruto)
    assert c.concurso == 10
    assert 6 in c.rateio


def test_numero_no_formato_brasileiro():
    assert ingestao._numero("1.234.567,89") == pytest.approx(1_234_567.89)
    assert ingestao._numero("R$ 50,00") == pytest.approx(50.0)
    assert ingestao._numero(42) == 42.0
    assert ingestao._numero(None) == 0.0


def test_supersete_mantem_a_ordem_das_colunas():
    """Ordenar as colunas do Super Sete destruiria o resultado."""
    bruto = resposta(1, ("3", "0", "9", "1", "5", "5", "2"))
    c = ingestao.converter_caixa("supersete", bruto)
    assert c.dezenas == (3, 0, 9, 1, 5, 5, 2)


# --------------------------------------------------------------------------- #
# Incremental
# --------------------------------------------------------------------------- #

def test_importa_apenas_o_que_falta():
    cliente = ClienteFalso(ultimo=105)
    r = ingestao.importar_incremental("megasena", cliente, ultimo_importado=100)
    assert [c.concurso for c in r.importados] == [101, 102, 103, 104, 105]
    assert not r.recusados


def test_nada_a_fazer_quando_esta_em_dia():
    cliente = ClienteFalso(ultimo=100)
    r = ingestao.importar_incremental("megasena", cliente, ultimo_importado=100)
    assert r.importados == []


def test_limite_respeitado():
    cliente = ClienteFalso(ultimo=1000)
    r = ingestao.importar_incremental("megasena", cliente, ultimo_importado=0, limite=3)
    assert [c.concurso for c in r.importados] == [1, 2, 3]


def test_falha_isolada_nao_aborta_a_importacao():
    """Um concurso quebrado não pode custar os outros dezenove."""
    cliente = ClienteFalso(ultimo=5, falhar_em={3})
    r = ingestao.importar_incremental("megasena", cliente, ultimo_importado=0)
    assert [c.concurso for c in r.importados] == [1, 2, 4, 5]
    assert r.recusados == [(3, "nenhuma fonte respondeu")]
    assert "recusado" in r.leitura()


def test_concurso_invalido_vai_para_recusados_e_nao_para_o_banco():
    ruim = resposta(2, ("01", "02", "03", "04", "05", "99"))
    cliente = ClienteFalso(ultimo=3, por_concurso={2: ruim})
    r = ingestao.importar_incremental("megasena", cliente, ultimo_importado=0)
    assert [c.concurso for c in r.importados] == [1, 3]
    assert r.recusados[0][0] == 2


def test_fonte_indisponivel_e_explicita():
    class Morto:
        def obter_json(self, url):
            raise RuntimeError("timeout")

    with pytest.raises(ingestao.FonteIndisponivel):
        ingestao.importar_incremental("megasena", Morto())


def test_fonte_alternativa_cobre_a_principal():
    cliente = ClienteFalso(ultimo=3, falhar_em={2})

    def reserva(codigo: str, numero: int) -> dict:
        return resposta(numero)

    r = ingestao.importar_incremental("megasena", cliente, 0, fontes_alternativas=[reserva])
    assert [c.concurso for c in r.importados] == [1, 2, 3]
    assert not r.recusados


def test_modalidade_sem_caminho_falha():
    with pytest.raises(KeyError):
        ingestao.importar_incremental("inexistente", ClienteFalso(1))


# --------------------------------------------------------------------------- #
# Deduplicação
# --------------------------------------------------------------------------- #

def test_deduplica_contra_o_banco_e_dentro_do_lote():
    c = [ingestao.converter_caixa("megasena", resposta(n)) for n in (1, 2, 2, 3)]
    novos, descartados = ingestao.deduplicar(c, ja_existentes=[1])
    assert [x.concurso for x in novos] == [2, 3]
    assert descartados == 2


# --------------------------------------------------------------------------- #
# CSV
# --------------------------------------------------------------------------- #

CSV_OK = """concurso,data,dezenas
2700,05/03/2024,01 02 03 04 05 06
2701,07/03/2024,10-20-30-40-50-60
"""


def test_importa_csv():
    r = ingestao.importar_csv("megasena", CSV_OK)
    assert [c.concurso for c in r.importados] == [2700, 2701]
    assert r.importados[1].dezenas == (10, 20, 30, 40, 50, 60)
    assert r.origem == "csv"


def test_csv_sem_cabecalho_correto_falha():
    with pytest.raises(ingestao.ErroDeImportacao, match="colunas"):
        ingestao.importar_csv("megasena", "a,b,c\n1,2,3\n")


def test_csv_com_linha_ruim_reporta_a_linha():
    ruim = CSV_OK + "2702,09/03/2024,01 02 03\n"
    r = ingestao.importar_csv("megasena", ruim)
    assert len(r.importados) == 2
    assert r.recusados[0][0] == 4        # número da linha no arquivo
