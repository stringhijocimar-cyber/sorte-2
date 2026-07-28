"""Testes do gerador e dos filtros estruturais (§8 e §9).

Dois contratos que estes testes travam:

* **Todo filtro declara um aviso.** Sem ele, o construtor levanta. O aviso é o
  que impede a interface de apresentar filtro como vantagem.
* **O gerador nunca completa o lote violando os filtros.** Se as restrições
  forem apertadas demais, ele entrega menos e diz por quê.
"""

from __future__ import annotations

import pytest

from lab import filtros, gerador, loterias
from lab.gerador import RestricaoImpossivel
from lab.loterias import FormatoInvalido

MEGA = loterias.modalidade("megasena")
FACIL = loterias.modalidade("lotofacil")
CTX = filtros.Contexto(modalidade=MEGA)


# --------------------------------------------------------------------------- #
# Utilidades numéricas
# --------------------------------------------------------------------------- #

def test_primos_ate():
    assert filtros.primos_ate(30) == {2, 3, 5, 7, 11, 13, 17, 19, 23, 29}
    assert filtros.primos_ate(1) == set()


def test_fibonacci_ate():
    assert filtros.fibonacci_ate(60) == {1, 2, 3, 5, 8, 13, 21, 34, 55}


def test_sequencias_consecutivas():
    assert filtros.sequencias_consecutivas([1, 2, 3, 10, 20]) == [3]
    assert filtros.sequencias_consecutivas([1, 3, 5]) == []
    assert filtros.sequencias_consecutivas([1, 2, 5, 6, 7]) == [2, 3]
    assert filtros.sequencias_consecutivas([]) == []


# --------------------------------------------------------------------------- #
# Contrato dos filtros
# --------------------------------------------------------------------------- #

TODOS = [
    filtros.paridade(2, 4),
    filtros.soma(100, 200),
    filtros.consecutivos(2),
    filtros.exigir_consecutivos(2),
    filtros.primos(1, 3),
    filtros.fibonacci(0, 2),
    filtros.multiplos(3, 1, 3),
    filtros.repeticao_do_anterior(0, 2),
    filtros.faixas({(1, 30): (2, 4), (31, 60): (2, 4)}),
]


def test_todo_filtro_declara_aviso():
    """O aviso é parte do contrato, não enfeite."""
    for f in TODOS:
        assert f.aviso.strip(), f"filtro {f.id} sem aviso"
        assert f.nome and f.descricao


def test_filtro_sem_aviso_e_recusado_na_construcao():
    with pytest.raises(ValueError, match="sem aviso"):
        filtros.Filtro(id="x", nome="x", descricao="x", aviso="   ",
                       aceita=lambda d, c: True)


def test_fibonacci_declara_ausencia_de_evidencia_preditiva():
    """§9.11 exige que este filtro seja identificado como sem evidência."""
    assert "sem nenhuma evidência preditiva" in filtros.fibonacci(0, 2).aviso


NEGACOES = ("não", "nao", "nenhum", "nenhuma", "sem ", "apenas porque")


def _frases(texto: str) -> list[str]:
    partes = texto.lower().replace(";", ".").split(".")
    return [p.strip() for p in partes if p.strip()]


def test_avisos_nao_prometem_vantagem():
    """Checagem por frase, não por substring.

    Os termos proibidos aparecem legitimamente dentro de negações — "não torna
    nenhuma dezena mais provável de ser sorteada" é exatamente o que queremos
    ler. Uma busca por substring reprovaria o texto correto, então o teste
    exige que toda frase que contenha um termo proibido também negue.
    """
    proibidos = ["aumenta a chance", "mais provável de ser sorteada", "vantagem",
                 "número quente", "está atrasado", "vai sair", "garantido"]
    for f in TODOS:
        for frase in _frases(f.aviso + " " + f.descricao):
            for termo in proibidos:
                if termo in frase:
                    assert any(n in frase for n in NEGACOES), (
                        f"{f.id} afirma sem negar: {frase!r}"
                    )


def test_o_teste_de_promessa_pega_uma_promessa_de_verdade():
    """Sanidade do teste acima: ele precisa reprovar uma afirmação real."""
    ruim = filtros.Filtro(
        id="ruim", nome="ruim", descricao="Este filtro aumenta a chance de acerto",
        aviso="Use sempre", aceita=lambda d, c: True)
    frases = _frases(ruim.aviso + " " + ruim.descricao)
    culpadas = [fr for fr in frases if "aumenta a chance" in fr]
    assert culpadas
    assert not any(n in culpadas[0] for n in NEGACOES)


# --------------------------------------------------------------------------- #
# Comportamento de cada filtro
# --------------------------------------------------------------------------- #

def test_paridade():
    f = filtros.paridade(3, 3)
    assert f.aceita([2, 4, 6, 1, 3, 5], CTX)
    assert not f.aceita([2, 4, 6, 8, 1, 3], CTX)


def test_soma():
    f = filtros.soma(20, 30)
    assert f.aceita([1, 2, 3, 4, 5, 10], CTX)          # soma 25, dentro
    assert f.aceita([1, 2, 3, 4, 5, 6], CTX)           # soma 21, dentro
    assert not f.aceita([1, 2, 3, 4, 5, 20], CTX)      # soma 35, acima
    assert not f.aceita([1, 2, 3, 4, 5, 4], CTX)       # soma 19, abaixo
    assert not filtros.soma(100, 200).aceita([1, 2, 3, 4, 5, 6], CTX)


def test_consecutivos_limita_a_maior_corrida():
    f = filtros.consecutivos(2)
    assert f.aceita([1, 2, 10, 11, 20, 30], CTX)
    assert not f.aceita([1, 2, 3, 10, 20, 30], CTX)


def test_exigir_consecutivos():
    f = filtros.exigir_consecutivos(2)
    assert f.aceita([1, 2, 10, 20, 30, 40], CTX)
    assert not f.aceita([1, 3, 10, 20, 30, 40], CTX)


def test_primos():
    f = filtros.primos(2, 2)
    assert f.aceita([2, 3, 4, 6, 8, 10], CTX)
    assert not f.aceita([2, 3, 5, 6, 8, 10], CTX)


def test_multiplos_ignora_zero():
    """Na Lotomania o universo começa em 0, e 0 é múltiplo de tudo."""
    ctx = filtros.Contexto(modalidade=loterias.modalidade("lotomania"))
    f = filtros.multiplos(5, 0, 0)
    assert f.aceita([0, 1, 2, 3, 4], ctx), "zero não deve contar como múltiplo"


def test_repeticao_do_anterior():
    ctx = filtros.Contexto(modalidade=MEGA, concurso_anterior=(1, 2, 3, 4, 5, 6))
    f = filtros.repeticao_do_anterior(0, 1)
    assert f.aceita([1, 10, 20, 30, 40, 50], ctx)
    assert not f.aceita([1, 2, 3, 30, 40, 50], ctx)


def test_repeticao_sem_concurso_anterior_aceita_tudo():
    """Rejeitar tudo em silêncio faria o usuário culpar o gerador."""
    f = filtros.repeticao_do_anterior(0, 0)
    assert f.aceita([1, 2, 3, 4, 5, 6], CTX)


def test_faixas():
    f = filtros.faixas({(1, 30): (3, 3), (31, 60): (3, 3)})
    assert f.aceita([1, 2, 3, 31, 32, 33], CTX)
    assert not f.aceita([1, 2, 3, 4, 31, 32], CTX)


def test_intervalos_invalidos_falham():
    for chamada in (
        lambda: filtros.paridade(4, 2),
        lambda: filtros.soma(200, 100),
        lambda: filtros.consecutivos(0),
        lambda: filtros.primos(3, 1),
        lambda: filtros.fibonacci(3, 1),
        lambda: filtros.multiplos(0, 1, 2),
        lambda: filtros.repeticao_do_anterior(2, 1),
        lambda: filtros.faixas({}),
        lambda: filtros.faixas({(30, 1): (1, 2)}),
    ):
        with pytest.raises(ValueError):
            chamada()


def test_taxa_de_aceitacao_estima_aperto():
    solto = filtros.taxa_de_aceitacao([filtros.paridade(0, 6)], CTX, 6, 500, semente=1)
    apertado = filtros.taxa_de_aceitacao(
        [filtros.paridade(6, 6), filtros.primos(3, 3)], CTX, 6, 500, semente=1)
    assert solto == pytest.approx(1.0)
    assert apertado < 0.05


# --------------------------------------------------------------------------- #
# Gerador
# --------------------------------------------------------------------------- #

def test_gera_jogos_validos():
    lote = gerador.gerar(MEGA, 5, semente=1)
    assert len(lote.jogos) == 5
    for j in lote.jogos:
        MEGA.validar_aposta(list(j))
        assert list(j) == sorted(j)


def test_reprodutivel_com_a_mesma_semente():
    a = gerador.gerar(MEGA, 10, semente=123)
    b = gerador.gerar(MEGA, 10, semente=123)
    assert a.jogos == b.jogos
    assert a.semente == b.semente == 123


def test_semente_ausente_e_registrada_para_auditoria():
    lote = gerador.gerar(MEGA, 2)
    assert isinstance(lote.semente, int)
    repetido = gerador.gerar(MEGA, 2, semente=lote.semente)
    assert repetido.jogos == lote.jogos


def test_nao_repete_jogos_por_padrao():
    lote = gerador.gerar(FACIL, 30, semente=5)
    assert lote.distintos == len(lote.jogos)


def test_obrigatorios_aparecem_em_todos_os_jogos():
    lote = gerador.gerar(MEGA, 8, obrigatorios=[7, 13], semente=2)
    for j in lote.jogos:
        assert 7 in j and 13 in j


def test_excluidos_nao_aparecem():
    lote = gerador.gerar(MEGA, 20, excluidos=list(range(1, 31)), semente=3)
    for j in lote.jogos:
        assert all(d > 30 for d in j)


def test_obrigatorio_e_excluido_ao_mesmo_tempo_falha():
    with pytest.raises(RestricaoImpossivel, match="obrigatórias e excluídas"):
        gerador.gerar(MEGA, 1, obrigatorios=[5], excluidos=[5])


def test_obrigatorios_demais_falham():
    with pytest.raises(RestricaoImpossivel, match="não cabem"):
        gerador.gerar(MEGA, 1, obrigatorios=list(range(1, 9)))


def test_exclusao_excessiva_falha_com_explicacao():
    with pytest.raises(RestricaoImpossivel, match="exclua menos"):
        gerador.gerar(MEGA, 1, excluidos=list(range(1, 57)))


def test_obrigatorio_fora_do_universo_falha():
    with pytest.raises(FormatoInvalido):
        gerador.gerar(MEGA, 1, obrigatorios=[99])


def test_orcamento_corta_a_quantidade_e_avisa():
    """Orçamento é limite de segurança: corta, nunca sugere gastar até o teto."""
    lote = gerador.gerar(MEGA, 100, orcamento_maximo=20.0, semente=4)
    assert len(lote.jogos) == 4          # R$ 5,00 por aposta simples em 2026
    assert lote.custo_total == pytest.approx(20.0)
    assert any("comporta 4" in a for a in lote.avisos)
    assert lote.solicitados == 100
    assert not lote.completo


def test_orcamento_insuficiente_gera_zero_com_aviso():
    lote = gerador.gerar(MEGA, 5, orcamento_maximo=1.0)
    assert lote.jogos == ()
    assert any("não cobre uma aposta" in a for a in lote.avisos)


def test_orcamento_negativo_falha():
    with pytest.raises(ValueError):
        gerador.gerar(MEGA, 1, orcamento_maximo=-1)


def test_filtros_sao_respeitados():
    f = [filtros.paridade(3, 3), filtros.consecutivos(1)]
    lote = gerador.gerar(MEGA, 15, filtros=f, semente=6)
    ctx = filtros.Contexto(modalidade=MEGA)
    for j in lote.jogos:
        assert sum(1 for x in j if x % 2 == 0) == 3
        assert filtros.sequencias_consecutivas(j) == []
        assert all(x.aceita(j, ctx) for x in f)


def test_filtro_apertado_entrega_menos_e_nao_mente():
    """O contrato central: nunca completar o lote violando os filtros."""
    impossivel = filtros.Filtro(
        id="nunca", nome="nunca", descricao="rejeita tudo",
        aviso="teste", aceita=lambda d, c: False)
    lote = gerador.gerar(MEGA, 5, filtros=[impossivel], semente=7, tentativas_maximas=300)
    assert lote.jogos == ()
    assert not lote.completo
    assert lote.tentativas == 300
    assert any("deixaram passar" in a for a in lote.avisos)


def test_metricas_do_lote():
    lote = gerador.gerar(MEGA, 10, semente=8)
    assert lote.probabilidade_por_jogo == pytest.approx(1 / 50_063_860)
    assert lote.pares_possiveis == 1770          # C(60,2)
    assert lote.trincas_possiveis == 34220       # C(60,3)
    assert 0 < lote.pares_cobertos <= 10 * 15    # C(6,2)=15 por jogo
    assert lote.cobertura_pares == lote.pares_cobertos / 1770
    assert lote.custo_total == pytest.approx(10 * 5.00)
    assert lote.leitura()


def test_sobreposicao_media():
    assert gerador.sobreposicao_media([[1, 2, 3]]) == 0.0
    assert gerador.sobreposicao_media([[1, 2, 3], [3, 4, 5]]) == 1.0
    assert gerador.sobreposicao_media([[1, 2], [1, 2], [1, 2]]) == 2.0


def test_aposta_ampliada_custa_mais():
    simples = gerador.gerar(MEGA, 1, tamanho=6, semente=9)
    ampliada = gerador.gerar(MEGA, 1, tamanho=7, semente=9)
    assert ampliada.custo_total == pytest.approx(simples.custo_total * 7)
    assert len(ampliada.jogos[0]) == 7


def test_tamanho_invalido_falha():
    with pytest.raises(FormatoInvalido):
        gerador.gerar(MEGA, 1, tamanho=21)


def test_quantidade_invalida_falha():
    with pytest.raises(ValueError):
        gerador.gerar(MEGA, 0)


def test_lotofacil_tambem_funciona():
    lote = gerador.gerar(FACIL, 5, filtros=[filtros.paridade(7, 8)], semente=10)
    assert len(lote.jogos) == 5
    for j in lote.jogos:
        FACIL.validar_aposta(list(j))
        assert 7 <= sum(1 for x in j if x % 2 == 0) <= 8
