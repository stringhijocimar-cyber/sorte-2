#!/usr/bin/env python3
"""
Confere que todo XML do projeto Android é bem-formado.

    python3 ferramentas/conferir-xml-android.py

Por que existe: a v26 falhou depois de os 546 testes do motor, os 45 da
interface e as 34 conferências de ícone passarem. A causa foi um comentário
assim, em colors.xml:

    <!-- Teal do pacote premium, o mesmo --acaso do tema escuro. -->

XML proíbe hífen duplo dentro de comentário, e o Android trata isso como erro
de compilação. O arquivo é do projeto nativo, então nada na suíte olhava para
ele — a primeira coisa a reclamar foi o Gradle, quarenta segundos adentro de
uma compilação de release, com a mensagem enterrada em duzentas linhas de
stack trace de Java.

A conferência é boba de propósito: manda o parser do próprio Python ler cada
arquivo. Ele usa expat, que recusa exatamente o que o aapt2 recusa — hífen
duplo em comentário, tag sem fechar, "&" solto, atributo sem aspas. Custa
milissegundos e roda a cada push, no lugar de custar uma build.

Não valida esquema nem nomes de recurso: isso é trabalho do Android SDK, que
não está disponível aqui. Aqui é só sintaxe — que é onde o erro real esteve.
"""
import sys
from pathlib import Path
from xml.parsers.expat import ExpatError
import xml.dom.minidom

RAIZ = Path(__file__).resolve().parent.parent
ANDROID = RAIZ / "android"

#: Saída de compilação e dependências: são gerados, não versionados.
IGNORAR = {"build", ".gradle", "node_modules", "captures"}


def arquivos():
    for caminho in sorted(ANDROID.rglob("*.xml")):
        if IGNORAR & set(caminho.relative_to(ANDROID).parts):
            continue
        yield caminho


def main():
    if not ANDROID.is_dir():
        sys.exit(f"não achei {ANDROID}")

    falhas = []
    total = 0
    for caminho in arquivos():
        total += 1
        try:
            xml.dom.minidom.parse(str(caminho))
        except (ExpatError, ValueError) as erro:
            falhas.append((caminho, erro))

    if not total:
        sys.exit(f"nenhum XML encontrado em {ANDROID} — o caminho mudou?")

    for caminho, erro in falhas:
        relativo = caminho.relative_to(RAIZ)
        print(f"::error file={relativo}::{erro}")
        # A mensagem do expat dá linha e coluna, mas não mostra o texto. Sem
        # ver a linha, "invalid token" não diz nada a quem lê o log.
        linha = getattr(erro, "lineno", None)
        if linha:
            try:
                conteudo = caminho.read_text(encoding="utf-8").splitlines()
                if 0 < linha <= len(conteudo):
                    print(f"  {relativo}:{linha}: {conteudo[linha - 1].strip()}")
            except OSError:
                pass

    if falhas:
        print(f"\n{len(falhas)} de {total} arquivos XML estão malformados.")
        print('Lembrete: "--" é proibido dentro de comentário XML.')
        return 1

    print(f"{total} arquivos XML do Android: todos bem-formados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
