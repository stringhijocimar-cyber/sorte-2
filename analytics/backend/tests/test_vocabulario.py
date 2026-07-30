"""Varredura de vocabulário proibido no repositório inteiro.

O §15 exige que o sistema não prometa capacidade de prever sorteios. Isso é
fácil de garantir no dia em que se escreve o código e fácil de perder seis
meses depois, quando alguém acrescenta um texto de interface com boa intenção.
Este teste é a trava: varre Python, TypeScript e documentação.

A checagem é **por frase, exigindo negação** — não por substring. Os termos
proibidos aparecem legitimamente dentro de negações ("não existe número
quente", "nenhum método aumenta a chance"), e uma busca ingênua reprovaria
justamente o texto correto. Há um teste de sanidade confirmando que a
verificação ainda pega uma promessa real.

vocabulario-proibido: este arquivo cita os termos por definição — é a lista.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]

#: Diretórios que não são nosso código.
IGNORAR = {"node_modules", "dist", ".git", "__pycache__", ".pytest_cache",
           "versions", "migracoes"}

EXTENSOES = {".py", ".ts", ".tsx", ".md", ".sql", ".html", ".json"}

#: Frases que prometem previsão ou vantagem. Em minúsculas, sem acento opcional.
PROIBIDAS = [
    "aumenta a chance",
    "aumenta as chances",
    "melhora a chance",
    "mais provável de ser sortead",
    "mais provaveis de sair",
    "número quente", "numero quente", "números quentes", "numeros quentes",
    "número frio", "numero frio", "números frios", "numeros frios",
    "está atrasado", "esta atrasado", "números atrasados vão sair",
    "vai sair", "vão sair",
    "número devido", "numero devido", "dezena devida",
    "método infalível", "metodo infalivel",
    "estratégia vencedora", "estrategia vencedora",
    "combinação vencedora", "combinacao vencedora",
    "prêmio garantido", "premio garantido",
    "lucro garantido", "ganho garantido",
    "prevê o próximo", "preve o proximo", "previsão do próximo",
    "aposte agora", "chance imperdível", "chance imperdivel",
    "oportunidade única de ganhar",
]

#: Marcas de negação ou de enquadramento crítico. Quando uma delas está na
#: mesma frase, o termo proibido está sendo negado ou citado, não afirmado.
NEGACOES = [
    "não", "nao", "nenhum", "nenhuma", "nem ", "sem ", "jamais",
    "proibid", "evita", "recusa", "impede", "engana", "enganos",
    "falso", "falsa", "mito", "ilusão", "ilusao", "apenas porque",
    "não é", "nao e", "vocabulário", "vocabulario", "termo",
    "linguagem", "mensagem", "afirma", "promete", "promessa",
]


def arquivos_do_projeto() -> list[Path]:
    saida = []
    for caminho in RAIZ.rglob("*"):
        if not caminho.is_file() or caminho.suffix not in EXTENSOES:
            continue
        if any(parte in IGNORAR for parte in caminho.parts):
            continue
        if caminho.name.startswith("package-lock"):
            continue
        saida.append(caminho)
    return saida


#: Marcador que um arquivo usa para se declarar isento: ele CITA os termos
#: proibidos em vez de afirmá-los (uma lista de vocabulário vedado, por
#: exemplo). A isenção é explícita e auditável — bem melhor que excluir
#: silenciosamente todos os testes, o que enfraqueceria a varredura.
ISENCAO = "vocabulario-proibido: este arquivo cita os termos"


def frases(texto: str) -> list[str]:
    """Quebra em frases, depois de normalizar o espaço em branco.

    Normalizar primeiro é essencial: prosa quebrada em duas linhas pelo editor
    separaria a negação do termo negado, e "Não tornam nenhuma / dezena mais
    provável de ser sorteada" seria lida como duas frases — a segunda delas uma
    promessa. Foi exatamente o que aconteceu na primeira versão deste teste.
    """
    limpo = re.sub(r"\s+", " ", texto.lower())
    bruto = re.split(r"[.;]|(?<=\w),\s", limpo)
    return [f.strip() for f in bruto if f.strip()]


def ocorrencias_afirmativas(texto: str) -> list[tuple[str, str]]:
    """(termo, frase) para cada termo proibido usado SEM negação."""
    achados = []
    for frase in frases(texto):
        for termo in PROIBIDAS:
            if termo in frase and not any(n in frase for n in NEGACOES):
                achados.append((termo, frase))
    return achados


# --------------------------------------------------------------------------- #

def test_isencoes_sao_poucas_e_declaradas():
    """Isenção é para quem CITA os termos, não para quem quer escapar.

    Se a lista crescer, a varredura perde valor — então o teste falha quando
    passa de um punhado, forçando a decisão a ser consciente.
    """
    isentos = [
        c.relative_to(RAIZ) for c in arquivos_do_projeto()
        if ISENCAO in c.read_text(encoding="utf-8", errors="ignore")
    ]
    assert len(isentos) <= 4, f"isenções demais: {isentos}"


def test_ha_arquivos_para_varrer():
    """Se a varredura não encontrar nada, ela passaria vazia e sem valor."""
    arquivos = arquivos_do_projeto()
    assert len(arquivos) > 20, f"só {len(arquivos)} arquivos varridos"
    assert any(a.suffix == ".tsx" for a in arquivos), "frontend não foi varrido"
    assert any(a.suffix == ".py" for a in arquivos), "backend não foi varrido"


def test_nenhuma_promessa_de_prever_ou_de_vantagem():
    problemas: list[str] = []
    for caminho in arquivos_do_projeto():
        try:
            texto = caminho.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if ISENCAO in texto:
            continue
        for termo, frase in ocorrencias_afirmativas(texto):
            relativo = caminho.relative_to(RAIZ)
            problemas.append(f"{relativo}: {termo!r} em {frase[:110]!r}")
    assert not problemas, "vocabulário proibido sem negação:\n" + "\n".join(problemas)


def test_a_varredura_pega_uma_promessa_real():
    """Sanidade: sem isto, o teste acima poderia passar por não checar nada."""
    ruim = "Este filtro aumenta a chance de acerto e revela o número quente"
    achados = ocorrencias_afirmativas(ruim)
    assert achados, "a varredura deixou passar uma promessa explícita"
    assert {t for t, _ in achados} >= {"aumenta a chance", "número quente"}


def test_a_varredura_aceita_o_termo_dentro_de_negacao():
    """O texto correto do sistema não pode ser reprovado."""
    bom = ("Nenhum método aumenta a chance de acerto. "
           "Não existe número quente: sorteios são independentes.")
    assert ocorrencias_afirmativas(bom) == []


def test_documentos_declaram_o_que_o_sistema_nao_faz():
    """A ausência de promessa não basta; a negação precisa estar escrita."""
    readme = (RAIZ / "README.md").read_text(encoding="utf-8").lower()
    assert "não prevê resultados" in readme
    assert "não garante prêmios" in readme
    assert "eventos independentes" in readme


def test_api_declara_a_limitacao_na_propria_descricao():
    """Quem integra pela API tem de ler isso sem abrir o README."""
    fonte = (RAIZ / "backend" / "lab" / "api.py").read_text(encoding="utf-8")
    assert "NÃO prevê resultados" in fonte
    assert "maiores de 18 anos" in fonte


def test_frontend_mostra_o_aviso_de_maioridade_e_de_limitacao():
    app = (RAIZ / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "18 anos" in app
    assert "não prevê resultados" in app.lower()
    assert "188" in app, "canal de ajuda ausente"
