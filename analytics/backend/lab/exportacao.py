"""Exportação: CSV, Excel e PDF (§23).

Implementado sobre a biblioteca padrão — `zipfile` para o XLSX, escrita direta
para o PDF. O motivo é o mesmo do núcleo estatístico: exportação é caminho de
saída de dados, e não vale acrescentar dependência com código nativo a um
módulo que só precisa escrever arquivo. Os testes conferem o XLSX lendo-o de
volta com `openpyxl`; escrever um formato sem validá-lo contra um leitor
independente seria confiar no próprio gerador.

O relatório carrega as dez seções que o §23 pede, incluindo **limitações** e o
aviso de que desempenho passado não garante resultado futuro. Elas não são
opcionais: um relatório de backtest sem a seção de limitações é o formato mais
fácil de interpretar errado que este sistema poderia produzir.
"""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Sequence
from xml.sax.saxutils import escape

AVISO_PADRAO = (
    "Desempenho passado não garante resultado futuro. Sorteios honestos são "
    "eventos independentes: nenhum método, filtro ou estratégia altera a "
    "probabilidade de acerto."
)


# --------------------------------------------------------------------------- #
# CSV
# --------------------------------------------------------------------------- #

def jogos_para_csv(jogos: Sequence[Sequence[int]], modalidade: str,
                   custo_unitario: float = 0.0) -> str:
    """CSV de jogos. Dezenas em colunas separadas, não numa célula só.

    Uma coluna por dezena permite ordenar e filtrar na planilha; "01 02 03"
    numa célula vira texto e não serve para nada além de olhar.
    """
    if not jogos:
        raise ValueError("nenhum jogo para exportar")
    largura = max(len(j) for j in jogos)
    buffer = io.StringIO()
    escritor = csv.writer(buffer, lineterminator="\n")
    escritor.writerow(
        ["modalidade", "jogo"] + [f"d{i + 1}" for i in range(largura)] + ["custo"])
    for i, jogo in enumerate(jogos, start=1):
        dezenas = list(sorted(jogo)) + [""] * (largura - len(jogo))
        escritor.writerow([modalidade, i, *dezenas, f"{custo_unitario:.2f}"])
    return buffer.getvalue()


def tabela_para_csv(cabecalho: Sequence[str], linhas: Sequence[Sequence[Any]]) -> str:
    buffer = io.StringIO()
    escritor = csv.writer(buffer, lineterminator="\n")
    escritor.writerow(cabecalho)
    escritor.writerows(linhas)
    return buffer.getvalue()


# --------------------------------------------------------------------------- #
# XLSX
# --------------------------------------------------------------------------- #

def _celula(referencia: str, valor: Any) -> str:
    if isinstance(valor, bool):          # antes de int: bool é subclasse de int
        return f'<c r="{referencia}" t="inlineStr"><is><t>{"sim" if valor else "não"}</t></is></c>'
    if isinstance(valor, (int, float)):
        return f'<c r="{referencia}"><v>{valor}</v></c>'
    if valor is None:
        return f'<c r="{referencia}"/>'
    return (f'<c r="{referencia}" t="inlineStr"><is><t xml:space="preserve">'
            f"{escape(str(valor))}</t></is></c>")


def _coluna(indice: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA."""
    letras = ""
    indice += 1
    while indice:
        indice, resto = divmod(indice - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def planilha_xlsx(abas: dict[str, tuple[Sequence[str], Sequence[Sequence[Any]]]]) -> bytes:
    """Gera um XLSX com uma ou mais abas.

    Usa *inline strings* em vez de tabela de strings compartilhadas: o arquivo
    fica maior, mas o gerador fica sem estado e não há como dessincronizar
    índice e conteúdo — o defeito clássico de XLSX escrito à mão.
    """
    if not abas:
        raise ValueError("nenhuma aba para exportar")

    nomes = list(abas)
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   + "".join(
                       f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" '
                       'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                       for i in range(len(nomes)))
                   + "</Types>")

        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" '
                   'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
                   'Target="xl/workbook.xml"/></Relationships>')

        z.writestr("xl/workbook.xml",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(
                       f'<sheet name="{escape(nome[:31])}" sheetId="{i + 1}" r:id="rId{i + 1}"/>'
                       for i, nome in enumerate(nomes))
                   + "</sheets></workbook>")

        z.writestr("xl/_rels/workbook.xml.rels",
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + "".join(
                       f'<Relationship Id="rId{i + 1}" '
                       'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
                       f'Target="worksheets/sheet{i + 1}.xml"/>'
                       for i in range(len(nomes)))
                   + "</Relationships>")

        for indice, nome in enumerate(nomes):
            cabecalho, linhas = abas[nome]
            partes = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                      "<sheetData>"]
            partes.append("<row r=\"1\">" + "".join(
                _celula(f"{_coluna(c)}1", v) for c, v in enumerate(cabecalho)) + "</row>")
            for r, linha in enumerate(linhas, start=2):
                partes.append(f'<row r="{r}">' + "".join(
                    _celula(f"{_coluna(c)}{r}", v) for c, v in enumerate(linha)) + "</row>")
            partes.append("</sheetData></worksheet>")
            z.writestr(f"xl/worksheets/sheet{indice + 1}.xml", "".join(partes))

    return saida.getvalue()


def jogos_para_xlsx(jogos: Sequence[Sequence[int]], modalidade: str,
                    custo_unitario: float = 0.0) -> bytes:
    if not jogos:
        raise ValueError("nenhum jogo para exportar")
    largura = max(len(j) for j in jogos)
    cabecalho = ["modalidade", "jogo"] + [f"d{i + 1}" for i in range(largura)] + ["custo"]
    linhas = []
    for i, jogo in enumerate(jogos, start=1):
        dezenas = list(sorted(jogo)) + [None] * (largura - len(jogo))
        linhas.append([modalidade, i, *dezenas, custo_unitario])
    return planilha_xlsx({"jogos": (cabecalho, linhas)})


# --------------------------------------------------------------------------- #
# Relatório
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class Relatorio:
    """As dez seções do §23. Nenhuma é opcional."""

    objetivo: str
    modalidade: str
    periodo: str
    metodologia: str
    custos: dict[str, Any]
    resultados: dict[str, Any]
    testes: dict[str, Any]
    limitacoes: list[str]
    conclusao: str
    parametros: dict[str, Any]
    gerado_em: datetime = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if not self.limitacoes:
            raise ValueError(
                "relatório sem seção de limitações: é o formato mais fácil de "
                "interpretar errado que este sistema poderia produzir"
            )
        if self.gerado_em is None:
            object.__setattr__(self, "gerado_em", datetime.now(timezone.utc))


def _linhas_do_relatorio(r: Relatorio) -> list[tuple[str, str]]:
    """(estilo, texto). Estilo: 'titulo', 'secao', 'texto', 'item'."""
    linhas: list[tuple[str, str]] = [
        ("titulo", "Relatorio de backtest - Loteria Analytics Brasil"),
        ("texto", f"Gerado em {r.gerado_em:%d/%m/%Y %H:%M UTC}"),
        ("secao", "1. Objetivo"), ("texto", r.objetivo),
        ("secao", "2. Modalidade"), ("texto", r.modalidade),
        ("secao", "3. Periodo"), ("texto", r.periodo),
        ("secao", "4. Metodologia"), ("texto", r.metodologia),
        ("secao", "5. Custos"),
    ]
    for chave, valor in r.custos.items():
        linhas.append(("item", f"{chave}: {valor}"))
    linhas.append(("secao", "6. Resultados"))
    for chave, valor in r.resultados.items():
        linhas.append(("item", f"{chave}: {valor}"))
    linhas.append(("secao", "7. Testes estatisticos"))
    for chave, valor in r.testes.items():
        linhas.append(("item", f"{chave}: {valor}"))
    linhas.append(("secao", "8. Limitacoes"))
    for item in r.limitacoes:
        linhas.append(("item", item))
    linhas.append(("secao", "9. Conclusao"))
    linhas.append(("texto", r.conclusao))
    linhas.append(("secao", "10. Parametros (auditoria)"))
    for chave, valor in r.parametros.items():
        linhas.append(("item", f"{chave}: {valor}"))
    linhas.append(("secao", "Aviso"))
    linhas.append(("texto", AVISO_PADRAO))
    return linhas


def relatorio_markdown(r: Relatorio) -> str:
    partes: list[str] = []
    for estilo, texto in _linhas_do_relatorio(r):
        if estilo == "titulo":
            partes.append(f"# {texto}\n")
        elif estilo == "secao":
            partes.append(f"\n## {texto}\n")
        elif estilo == "item":
            partes.append(f"- {texto}")
        else:
            partes.append(texto)
    return "\n".join(partes) + "\n"


# ---- PDF ------------------------------------------------------------------ #

def _texto_pdf(valor: str) -> str:
    """Escapa e transcodifica para WinAnsi.

    O PDF básico usa Helvetica com codificação WinAnsi (latin-1). Caracteres
    fora dela — inclusive acentos que não existem em latin-1 — viram '?' em vez
    de corromper o arquivo. Por isso o relatório é redigido sem acentuação nos
    rótulos: melhor um texto sem acento do que um PDF ilegível.
    """
    limpo = valor.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return limpo.encode("latin-1", errors="replace").decode("latin-1")


def relatorio_pdf(r: Relatorio, linhas_por_pagina: int = 46) -> bytes:
    """PDF simples, multipágina, escrito diretamente.

    Sem dependência de renderizador: o formato aqui é texto posicionado em
    Helvetica, que é o suficiente para um relatório tabular e não exige fonte
    embutida.
    """
    conteudo = _linhas_do_relatorio(r)
    paginas: list[list[tuple[str, str]]] = [
        conteudo[i:i + linhas_por_pagina]
        for i in range(0, len(conteudo), linhas_por_pagina)
    ] or [[]]

    objetos: list[bytes] = []

    def adicionar(corpo: bytes) -> int:
        objetos.append(corpo)
        return len(objetos)          # numeração 1-based

    # Reserva: 1=catálogo, 2=páginas, 3=fonte; as páginas vêm depois.
    id_catalogo, id_paginas, id_fonte = 1, 2, 3
    objetos.extend([b"", b"", b""])

    ids_paginas: list[int] = []
    for pagina in paginas:
        fluxo = ["BT", "/F1 11 Tf", "1 0 0 1 56 780 Tm", "14 TL"]
        for estilo, texto in pagina:
            tamanho = {"titulo": 16, "secao": 13}.get(estilo, 10)
            prefixo = "  " if estilo == "item" else ""
            fluxo.append(f"/F1 {tamanho} Tf")
            fluxo.append(f"({_texto_pdf(prefixo + texto)}) Tj")
            fluxo.append("T*")
        fluxo.append("ET")
        dados = "\n".join(fluxo).encode("latin-1")
        id_conteudo = adicionar(
            b"<< /Length " + str(len(dados)).encode() + b" >>\nstream\n" + dados + b"\nendstream")
        ids_paginas.append(adicionar(
            b"<< /Type /Page /Parent " + str(id_paginas).encode()
            + b" 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "
            + str(id_fonte).encode() + b" 0 R >> >> /Contents "
            + str(id_conteudo).encode() + b" 0 R >>"))

    objetos[id_catalogo - 1] = (
        b"<< /Type /Catalog /Pages " + str(id_paginas).encode() + b" 0 R >>")
    filhos = b" ".join(str(i).encode() + b" 0 R" for i in ids_paginas)
    objetos[id_paginas - 1] = (
        b"<< /Type /Pages /Kids [" + filhos + b"] /Count "
        + str(len(ids_paginas)).encode() + b" >>")
    objetos[id_fonte - 1] = (
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
        b"/Encoding /WinAnsiEncoding >>")

    saida = bytearray(b"%PDF-1.4\n")
    deslocamentos: list[int] = []
    for numero, corpo in enumerate(objetos, start=1):
        deslocamentos.append(len(saida))
        saida += str(numero).encode() + b" 0 obj\n" + corpo + b"\nendobj\n"

    inicio_xref = len(saida)
    saida += b"xref\n0 " + str(len(objetos) + 1).encode() + b"\n"
    saida += b"0000000000 65535 f \n"
    for deslocamento in deslocamentos:
        saida += f"{deslocamento:010d} 00000 n \n".encode()
    saida += (b"trailer\n<< /Size " + str(len(objetos) + 1).encode()
              + b" /Root " + str(id_catalogo).encode() + b" 0 R >>\nstartxref\n"
              + str(inicio_xref).encode() + b"\n%%EOF\n")
    return bytes(saida)
