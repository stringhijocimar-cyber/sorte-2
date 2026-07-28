"""Testes do verificador da API da CAIXA — sem tocar a rede.

O script existe para ser rodado à mão contra a API real, mas a lógica que
decide "isto está certo" precisa de teste automatizado como qualquer outra:
um verificador que aprova resposta quebrada é pior que não ter verificador.
"""

from __future__ import annotations

import sys
import urllib.error
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ferramentas"))
import verificar_caixa as vc  # noqa: E402


class ClienteFalso:
    def __init__(self, resposta=None, erro: Exception | None = None):
        self.resposta = resposta
        self.erro = erro
        self.urls: list[str] = []

    def obter_json(self, url: str):
        self.urls.append(url)
        if self.erro is not None:
            raise self.erro
        return self.resposta


def resposta_boa(**troca):
    base = {
        "numero": 2801,
        "dataApuracao": "05/03/2024",
        "listaDezenas": ["01", "02", "03", "04", "05", "06"],
        "acumulado": False,
        "valorArrecadado": "12.345.678,90",
        "valorEstimadoProximoConcurso": "50.000.000,00",
        "listaRateioPremio": [
            {"descricaoFaixa": "6 acertos", "numeroDeGanhadores": 1,
             "valorPremio": "40.000.000,00"},
        ],
    }
    base.update(troca)
    return base


def test_resposta_valida_e_aprovada():
    r = vc.verificar("megasena", ClienteFalso(resposta_boa()))
    assert r["ok"] is True
    assert r["concurso"] == 2801
    assert r["dezenas"] == [1, 2, 3, 4, 5, 6]
    assert r["campos_faltando"] == []
    assert r["faixas_de_rateio"] == [6]


def test_usa_a_url_da_modalidade():
    cliente = ClienteFalso(resposta_boa())
    vc.verificar("lotofacil", cliente)
    assert cliente.urls == [f"{vc.ingestao.BASE_CAIXA}/lotofacil"]


def test_campo_essencial_ausente_e_nomeado():
    """É esta informação que permite corrigir o conversor em minutos."""
    sem_data = resposta_boa()
    del sem_data["dataApuracao"]
    r = vc.verificar("megasena", ClienteFalso(sem_data))
    assert r["ok"] is False
    assert "dataApuracao" in r["campos_faltando"]


def test_dezenas_renomeadas_sao_detectadas():
    sem_dezenas = resposta_boa()
    del sem_dezenas["listaDezenas"]
    r = vc.verificar("megasena", ClienteFalso(sem_dezenas))
    assert r["ok"] is False
    assert any("listaDezenas" in c for c in r["campos_faltando"])


def test_campo_alternativo_de_dezenas_e_aceito():
    alternativo = resposta_boa()
    del alternativo["listaDezenas"]
    alternativo["dezenasSorteadasOrdemSorteio"] = ["06", "05", "04", "03", "02", "01"]
    r = vc.verificar("megasena", ClienteFalso(alternativo))
    assert r["ok"] is True
    assert r["dezenas"] == [1, 2, 3, 4, 5, 6]


def test_campos_novos_sao_reportados_sem_reprovar():
    """Campo novo na resposta não é erro; é aviso de contrato mudando."""
    com_novo = resposta_boa(campoInedito="x")
    r = vc.verificar("megasena", ClienteFalso(com_novo))
    assert r["ok"] is True
    assert "campoInedito" in r["campos_novos"]


def test_dezena_invalida_reprova():
    ruim = resposta_boa(listaDezenas=["01", "02", "03", "04", "05", "99"])
    r = vc.verificar("megasena", ClienteFalso(ruim))
    assert r["ok"] is False
    assert "FormatoInvalido" in r["erro"]


def test_rateio_ausente_e_sinalizado_sem_reprovar():
    """Prêmio ausente vale zero no backtest; precisa aparecer, não reprovar."""
    sem_rateio = resposta_boa()
    del sem_rateio["listaRateioPremio"]
    r = vc.verificar("megasena", ClienteFalso(sem_rateio))
    assert r["ok"] is True
    assert r["rateio_ausente"] is True
    assert "listaRateioPremio" in r["campos_opcionais_ausentes"]


def test_erro_http_e_reportado_com_o_codigo():
    erro = urllib.error.HTTPError("u", 503, "indisponível", None, None)
    r = vc.verificar("megasena", ClienteFalso(erro=erro))
    assert r["ok"] is False
    assert "HTTP 503" in r["erro"]


def test_falha_de_rede_nao_derruba_o_script():
    r = vc.verificar("megasena", ClienteFalso(erro=OSError("sem rota")))
    assert r["ok"] is False
    assert "OSError" in r["erro"]


def test_modalidade_sem_caminho_configurado():
    r = vc.verificar("inexistente", ClienteFalso(resposta_boa()))
    assert r["ok"] is False
    assert "caminho" in r["erro"]


def test_todas_as_modalidades_tem_caminho_configurado():
    """Uma modalidade registrada e sem caminho seria descoberta só em produção."""
    from lab.loterias import MODALIDADES

    faltando = [c for c in MODALIDADES if c not in vc.ingestao.CAMINHO_CAIXA]
    assert faltando == [], f"sem caminho de importação: {faltando}"


def test_imprimir_nao_quebra_em_nenhum_caso(capsys):
    for r in (vc.verificar("megasena", ClienteFalso(resposta_boa())),
              vc.verificar("megasena", ClienteFalso(erro=OSError("x")))):
        vc.imprimir(r)
    assert capsys.readouterr().out
