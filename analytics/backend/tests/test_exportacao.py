"""Testes de exportação.

O XLSX é escrito à mão e **lido de volta com openpyxl**: validar um formato
contra um leitor independente é a única forma de saber que ele abre em outro
programa. O PDF é verificado estruturalmente (cabeçalho, objetos, xref,
trailer) porque não havia biblioteca de leitura utilizável neste ambiente — e
isso está declarado, não escondido.
"""

from __future__ import annotations

import csv
import io
import zipfile

import pytest

from lab import exportacao as exp

JOGOS = [[6, 5, 4, 3, 2, 1], [10, 20, 30, 40, 50, 60], [7, 14, 21, 28, 35, 42]]


def relatorio(**troca) -> exp.Relatorio:
    base = dict(
        objetivo="Avaliar a estrategia contra carteiras aleatorias",
        modalidade="Mega-Sena",
        periodo="concursos 161 a 200",
        metodologia="Particao cronologica 60/20/20; 10.000 carteiras aleatorias",
        custos={"total": "R$ 700,00", "por concurso": "R$ 17,50"},
        resultados={"ROI": "-71,4%", "percentil": "42,1"},
        testes={"p-valor": "0,63", "IC 95%": "[-2,10; 1,04]", "efeito": "d=0,08"},
        limitacoes=["Rateio historico incompleto em 3 concursos"],
        conclusao="Sem evidencia de desempenho diferente do acaso",
        parametros={"semente": 20260728, "simulacoes": 10000},
    )
    base.update(troca)
    return exp.Relatorio(**base)


# --------------------------------------------------------------------------- #
# CSV
# --------------------------------------------------------------------------- #

def test_csv_tem_uma_coluna_por_dezena():
    """Dezenas numa célula só viram texto e não servem para ordenar."""
    texto = exp.jogos_para_csv(JOGOS, "megasena", 5.0)
    linhas = list(csv.reader(io.StringIO(texto)))
    assert linhas[0] == ["modalidade", "jogo", "d1", "d2", "d3", "d4", "d5", "d6", "custo"]
    assert linhas[1] == ["megasena", "1", "1", "2", "3", "4", "5", "6", "5.00"]
    assert len(linhas) == 4


def test_csv_ordena_as_dezenas():
    texto = exp.jogos_para_csv([[42, 7, 13, 2, 59, 31]], "megasena")
    linha = list(csv.reader(io.StringIO(texto)))[1]
    assert linha[2:8] == ["2", "7", "13", "31", "42", "59"]


def test_csv_com_jogos_de_tamanhos_diferentes():
    texto = exp.jogos_para_csv([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7]], "megasena")
    linhas = list(csv.reader(io.StringIO(texto)))
    assert "d7" in linhas[0]
    assert linhas[1][8] == ""          # o jogo de 6 dezenas fica com célula vazia


def test_csv_vazio_falha():
    with pytest.raises(ValueError):
        exp.jogos_para_csv([], "megasena")


def test_tabela_para_csv():
    texto = exp.tabela_para_csv(["a", "b"], [[1, 2], [3, 4]])
    assert texto == "a,b\n1,2\n3,4\n"


# --------------------------------------------------------------------------- #
# XLSX — verificado com openpyxl
# --------------------------------------------------------------------------- #

openpyxl = pytest.importorskip("openpyxl", reason="openpyxl ausente")


def abrir(dados: bytes):
    return openpyxl.load_workbook(io.BytesIO(dados))


def test_xlsx_abre_em_leitor_independente():
    livro = abrir(exp.jogos_para_xlsx(JOGOS, "megasena", 5.0))
    aba = livro["jogos"]
    assert [c.value for c in aba[1]] == [
        "modalidade", "jogo", "d1", "d2", "d3", "d4", "d5", "d6", "custo"]
    assert [c.value for c in aba[2]] == ["megasena", 1, 1, 2, 3, 4, 5, 6, 5.0]
    assert aba.max_row == 4


def test_xlsx_preserva_tipos():
    """Número gravado como texto quebra soma e ordenação na planilha."""
    dados = exp.planilha_xlsx({"t": (["texto", "inteiro", "real", "bool", "vazio"],
                                     [["abc", 42, 3.5, True, None]])})
    linha = list(abrir(dados)["t"][2])
    assert linha[0].value == "abc"
    assert linha[1].value == 42 and isinstance(linha[1].value, int)
    assert linha[2].value == pytest.approx(3.5)
    assert linha[3].value == "sim"
    assert linha[4].value is None


def test_xlsx_escapa_caracteres_de_xml():
    """Sem escape, um '&' no dado corrompe a planilha inteira."""
    dados = exp.planilha_xlsx({"t": (["c"], [["a & b < c > d \" e ' f"]])})
    assert abrir(dados)["t"]["A2"].value == "a & b < c > d \" e ' f"


def test_xlsx_aceita_acentos():
    dados = exp.planilha_xlsx({"t": (["descrição"], [["Lotofácil, +Milionária"]])})
    aba = abrir(dados)["t"]
    assert aba["A1"].value == "descrição"
    assert aba["A2"].value == "Lotofácil, +Milionária"


def test_xlsx_com_varias_abas():
    dados = exp.planilha_xlsx({
        "jogos": (["a"], [[1]]),
        "resumo": (["b"], [[2]]),
    })
    livro = abrir(dados)
    assert livro.sheetnames == ["jogos", "resumo"]
    assert livro["resumo"]["A2"].value == 2


def test_xlsx_e_um_zip_valido_com_as_partes_obrigatorias():
    dados = exp.jogos_para_xlsx(JOGOS, "megasena")
    with zipfile.ZipFile(io.BytesIO(dados)) as z:
        nomes = set(z.namelist())
        assert z.testzip() is None
    assert {"[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"} <= nomes


def test_xlsx_com_muitas_colunas_usa_referencia_correta():
    """Coluna 27 é AA; errar isso corrompe o arquivo sem aviso."""
    cabecalho = [f"c{i}" for i in range(30)]
    dados = exp.planilha_xlsx({"t": (cabecalho, [list(range(30))])})
    aba = abrir(dados)["t"]
    assert aba["AD1"].value == "c29"
    assert aba["AD2"].value == 29


def test_coluna_converte_indice_em_letra():
    assert [exp._coluna(i) for i in (0, 25, 26, 27, 51, 52)] == \
        ["A", "Z", "AA", "AB", "AZ", "BA"]


def test_xlsx_sem_aba_falha():
    with pytest.raises(ValueError):
        exp.planilha_xlsx({})


# --------------------------------------------------------------------------- #
# Relatório
# --------------------------------------------------------------------------- #

def test_relatorio_sem_limitacoes_e_recusado():
    """Um relatório de backtest sem limitações é o formato mais enganoso possível."""
    with pytest.raises(ValueError, match="limitações"):
        relatorio(limitacoes=[])


def test_markdown_tem_as_dez_secoes_e_o_aviso():
    texto = exp.relatorio_markdown(relatorio())
    for secao in ("1. Objetivo", "2. Modalidade", "3. Periodo", "4. Metodologia",
                  "5. Custos", "6. Resultados", "7. Testes estatisticos",
                  "8. Limitacoes", "9. Conclusao", "10. Parametros"):
        assert f"## {secao}" in texto
    assert "não garante resultado futuro" in texto


def test_markdown_traz_os_parametros_para_auditoria():
    texto = exp.relatorio_markdown(relatorio())
    assert "semente: 20260728" in texto
    assert "simulacoes: 10000" in texto


def test_pdf_tem_estrutura_valida():
    dados = exp.relatorio_pdf(relatorio())
    assert dados.startswith(b"%PDF-1.4")
    assert dados.rstrip().endswith(b"%%EOF")
    assert b"/Type /Catalog" in dados
    assert b"/Type /Pages" in dados
    assert b"/Type /Page " in dados
    assert b"xref" in dados and b"trailer" in dados and b"startxref" in dados


def test_pdf_contem_o_texto_do_relatorio():
    dados = exp.relatorio_pdf(relatorio())
    assert b"Relatorio de backtest" in dados
    assert b"8. Limitacoes" in dados
    assert b"Rateio historico incompleto" in dados


def test_pdf_pagina_quando_o_relatorio_e_longo():
    curto = exp.relatorio_pdf(relatorio())
    longo = exp.relatorio_pdf(
        relatorio(limitacoes=[f"limitacao {i}" for i in range(120)]))
    assert longo.count(b"/Type /Page ") > curto.count(b"/Type /Page ")
    assert b"/Count 1" not in longo


def test_pdf_escapa_parenteses_que_quebrariam_o_fluxo():
    """Parêntese sem escape encerra a string do PDF e corrompe o arquivo."""
    dados = exp.relatorio_pdf(relatorio(conclusao="Resultado (ver nota) e \\ barra"))
    assert rb"\(ver nota\)" in dados
    assert dados.rstrip().endswith(b"%%EOF")


def test_pdf_nao_quebra_com_acento():
    """Fora de latin-1 vira '?', em vez de corromper o arquivo."""
    dados = exp.relatorio_pdf(relatorio(conclusao="Lotofácil e +Milionária — resumo"))
    assert dados.startswith(b"%PDF")
    assert dados.rstrip().endswith(b"%%EOF")


def test_deslocamentos_do_xref_apontam_para_os_objetos():
    """xref errado é o defeito que faz o leitor recusar o arquivo inteiro."""
    dados = exp.relatorio_pdf(relatorio())
    inicio = int(dados.split(b"startxref\n")[1].split(b"\n")[0])
    assert dados[inicio:inicio + 4] == b"xref"
    corpo = dados[inicio:].split(b"\n")
    entradas = [l for l in corpo if l.endswith(b" n ") or l.endswith(b" n")]
    assert entradas, "nenhuma entrada de objeto no xref"
    for entrada in entradas:
        deslocamento = int(entrada.split()[0])
        assert dados[deslocamento:deslocamento + 40].split(b" ")[1] == b"0"
        assert b"obj" in dados[deslocamento:deslocamento + 40]
