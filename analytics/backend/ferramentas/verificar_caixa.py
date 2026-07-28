#!/usr/bin/env python3
"""Confere a importação contra a API real das Loterias CAIXA.

Existe porque este é o item nº 1 da lista de pendências do CHECKLIST: toda a
ingestão foi testada com respostas controladas, e o formato real pode divergir
do que foi assumido. Nenhum teste automatizado do repositório toca a rede — de
propósito, para a suíte rodar em qualquer lugar — então esta verificação fica
aqui, explícita e manual.

    python3 ferramentas/verificar_caixa.py                # todas as modalidades
    python3 ferramentas/verificar_caixa.py megasena quina # só algumas
    python3 ferramentas/verificar_caixa.py --json         # saída para script

O que ele faz, por modalidade:

1. Busca o último concurso publicado.
2. Passa a resposta CRUA pelo mesmo `converter_caixa()` que o sistema usa.
3. Valida o resultado com as regras da modalidade.
4. Compara os campos recebidos com os que o conversor espera, e **nomeia os
   que faltaram ou apareceram a mais** — a informação que permite corrigir o
   conversor em minutos quando a CAIXA muda o contrato.

Sai com código 1 se qualquer modalidade falhar, para servir em automação.

Este script NÃO grava nada no banco. Verificar e importar são coisas
diferentes, e misturá-las faria uma verificação malsucedida sujar os dados.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lab import ingestao  # noqa: E402
from lab.loterias import MODALIDADES, FormatoInvalido  # noqa: E402

#: Campos que `converter_caixa()` lê. Se algum sumir da resposta, o conversor
#: quebra — e é isto que a verificação precisa apontar por nome.
CAMPOS_ESSENCIAIS = {"numero", "dataApuracao"}
CAMPOS_DEZENAS = {"listaDezenas", "dezenasSorteadasOrdemSorteio"}
CAMPOS_OPCIONAIS = {"acumulado", "valorArrecadado",
                    "valorEstimadoProximoConcurso", "listaRateioPremio"}

TEMPO_LIMITE = 30


class ClienteHTTP:
    """Cliente mínimo. O contrato exigido por `importar_incremental`."""

    def __init__(self, tempo_limite: int = TEMPO_LIMITE):
        self.tempo_limite = tempo_limite

    def obter_json(self, url: str) -> dict:
        pedido = urllib.request.Request(
            url,
            headers={
                # Sem User-Agent de navegador o portal costuma recusar.
                "User-Agent": "Mozilla/5.0 (compatible; LoteriaAnalytics/0.1)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(pedido, timeout=self.tempo_limite) as resposta:
            return json.loads(resposta.read().decode("utf-8"))


def verificar(codigo: str, cliente: ClienteHTTP) -> dict[str, Any]:
    caminho = ingestao.CAMINHO_CAIXA.get(codigo)
    if caminho is None:
        return {"modalidade": codigo, "ok": False,
                "erro": "sem caminho de importação configurado"}

    url = f"{ingestao.BASE_CAIXA}/{caminho}"
    try:
        bruto = cliente.obter_json(url)
    except urllib.error.HTTPError as erro:
        return {"modalidade": codigo, "ok": False,
                "erro": f"HTTP {erro.code} em {url}"}
    except Exception as erro:  # noqa: BLE001 — a fronteira absorve tudo
        return {"modalidade": codigo, "ok": False,
                "erro": f"{type(erro).__name__}: {erro}"}

    recebidos = set(bruto) if isinstance(bruto, dict) else set()
    faltando = sorted(CAMPOS_ESSENCIAIS - recebidos)
    if not (CAMPOS_DEZENAS & recebidos):
        faltando.append("listaDezenas (ou dezenasSorteadasOrdemSorteio)")

    relatorio: dict[str, Any] = {
        "modalidade": codigo,
        "url": url,
        "campos_faltando": faltando,
        "campos_opcionais_ausentes": sorted(CAMPOS_OPCIONAIS - recebidos),
        "campos_novos": sorted(recebidos - CAMPOS_ESSENCIAIS
                               - CAMPOS_DEZENAS - CAMPOS_OPCIONAIS),
    }

    try:
        concurso = ingestao.converter_caixa(codigo, bruto)
    except (ingestao.ErroDeImportacao, FormatoInvalido) as erro:
        relatorio.update(ok=False, erro=f"{type(erro).__name__}: {erro}")
        return relatorio

    relatorio.update(
        ok=True,
        concurso=concurso.concurso,
        data=concurso.data.isoformat(),
        dezenas=list(concurso.dezenas),
        faixas_de_rateio=sorted(concurso.rateio),
        arrecadacao=concurso.arrecadacao,
        rateio_ausente=not concurso.rateio,
    )
    return relatorio


def imprimir(relatorio: dict[str, Any]) -> None:
    nome = MODALIDADES[relatorio["modalidade"]].nome if \
        relatorio["modalidade"] in MODALIDADES else relatorio["modalidade"]
    if not relatorio.get("ok"):
        print(f"  FALHA  {nome}: {relatorio.get('erro')}")
        if relatorio.get("campos_faltando"):
            print(f"         campos ausentes na resposta: "
                  f"{', '.join(relatorio['campos_faltando'])}")
        return

    dezenas = " ".join(f"{d:02d}" for d in relatorio["dezenas"])
    print(f"  ok     {nome}: concurso {relatorio['concurso']} "
          f"({relatorio['data']}) — {dezenas}")
    if relatorio["rateio_ausente"]:
        # Não é falha: o backtest trata prêmio ausente como zero, nunca estima.
        print("         atenção: a resposta não trouxe rateio; no backtest "
              "essas faixas valem zero")
    elif relatorio["faixas_de_rateio"]:
        print(f"         faixas de rateio: {relatorio['faixas_de_rateio']}")
    if relatorio["campos_novos"]:
        print(f"         campos novos (ignorados hoje): "
              f"{', '.join(relatorio['campos_novos'])}")


def main() -> int:
    analisador = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    analisador.add_argument("modalidades", nargs="*",
                            help="códigos a verificar (padrão: todos)")
    analisador.add_argument("--json", action="store_true",
                            help="imprime o relatório completo em JSON")
    analisador.add_argument("--tempo-limite", type=int, default=TEMPO_LIMITE)
    args = analisador.parse_args()

    alvos = args.modalidades or list(MODALIDADES)
    desconhecidas = [c for c in alvos if c not in MODALIDADES]
    if desconhecidas:
        print(f"modalidade desconhecida: {', '.join(desconhecidas)}", file=sys.stderr)
        print(f"conhecidas: {', '.join(sorted(MODALIDADES))}", file=sys.stderr)
        return 2

    cliente = ClienteHTTP(args.tempo_limite)
    if not args.json:
        print(f"Conferindo {len(alvos)} modalidade(s) contra {ingestao.BASE_CAIXA}\n")

    relatorios = []
    for codigo in alvos:
        r = verificar(codigo, cliente)
        relatorios.append(r)
        if not args.json:
            imprimir(r)

    if args.json:
        print(json.dumps(relatorios, ensure_ascii=False, indent=2))
        return 0 if all(r.get("ok") for r in relatorios) else 1

    falhas = [r for r in relatorios if not r.get("ok")]
    print()
    if falhas:
        print(f"{len(falhas)} de {len(relatorios)} modalidade(s) falharam.")
        print("Se o motivo for campo ausente ou renomeado, o ajuste fica em "
              "lab/ingestao.py: converter_caixa().")
        return 1
    print(f"Todas as {len(relatorios)} modalidades foram importadas e validadas "
          "com sucesso contra a API real.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
