"""Testes do backtest, das modalidades e do índice de sobreajuste.

O teste mais importante deste arquivo é ``test_estrategia_nao_ve_o_futuro``:
ele instala uma estratégia trapaceira que tenta apostar nas dezenas do
concurso que será conferido. Se o desenho da interface permitisse isso, ela
acertaria tudo. Como o concurso-alvo não é passado para a estratégia, ela não
tem como trapacear — e o teste trava esse contrato.
"""

from __future__ import annotations

import random
from datetime import date

import pytest

from lab import backtest as bt
from lab import financeiro, loterias, overfitting


def concursos_falsos(n: int, modalidade: str = "megasena", semente: int = 42):
    m = loterias.modalidade(modalidade)
    rng = random.Random(semente)
    universo = list(m.dezenas_validas())
    saida = []
    for i in range(1, n + 1):
        dezenas = tuple(sorted(rng.sample(universo, m.dezenas_sorteadas)))
        saida.append(bt.Concurso(
            numero=i,
            data=date(2020, 1, 1) + __import__("datetime").timedelta(days=3 * i),
            dezenas=dezenas,
            rateio={6: (1, 40_000_000.0), 5: (60, 50_000.0), 4: (4_000, 900.0)},
        ))
    return saida


# --------------------------------------------------------------------------- #
# Modalidades
# --------------------------------------------------------------------------- #

def test_todas_as_nove_modalidades_registradas():
    esperadas = {"megasena", "lotofacil", "quina", "duplasena", "timemania",
                 "diadesorte", "lotomania", "supersete", "maismilionaria"}
    assert esperadas <= set(loterias.MODALIDADES)


def test_probabilidade_da_sena_e_a_oficial():
    m = loterias.modalidade("megasena")
    assert m.combinacoes_possiveis() == 50_063_860
    assert m.probabilidade(6) == pytest.approx(1 / 50_063_860, rel=1e-12)


def test_probabilidade_da_lotofacil_e_a_oficial():
    m = loterias.modalidade("lotofacil")
    assert m.combinacoes_possiveis() == 3_268_760
    assert m.probabilidade(15) == pytest.approx(1 / 3_268_760, rel=1e-12)


def test_probabilidades_de_uma_modalidade_somam_um():
    m = loterias.modalidade("quina")
    total = sum(m.probabilidade(a) for a in range(0, m.dezenas_sorteadas + 1))
    assert total == pytest.approx(1.0, rel=1e-12)


def test_aposta_ampliada_custa_o_numero_de_apostas_simples():
    m = loterias.modalidade("megasena")
    quando = date(2025, 1, 1)
    assert m.apostas_equivalentes(7) == 7          # C(7,6)
    assert m.preco(quando, 7) == pytest.approx(m.preco(quando, 6) * 7)


def test_preco_respeita_a_data_do_concurso():
    """Aplicar o preço de hoje ao passado inflaria o custo e afundaria o ROI."""
    m = loterias.modalidade("megasena")
    assert m.preco(date(2021, 6, 1)) == pytest.approx(3.50)
    assert m.preco(date(2023, 6, 1)) == pytest.approx(4.50)
    assert m.preco(date(2025, 6, 1)) == pytest.approx(5.00)


def test_validacao_de_sorteio_recusa_lixo():
    m = loterias.modalidade("megasena")
    m.validar_sorteio([1, 2, 3, 4, 5, 6])
    with pytest.raises(loterias.FormatoInvalido):
        m.validar_sorteio([1, 2, 3, 4, 5])            # faltou dezena
    with pytest.raises(loterias.FormatoInvalido):
        m.validar_sorteio([1, 1, 3, 4, 5, 6])         # repetida
    with pytest.raises(loterias.FormatoInvalido):
        m.validar_sorteio([1, 2, 3, 4, 5, 61])        # fora do universo


def test_lotomania_comeca_no_zero():
    m = loterias.modalidade("lotomania")
    assert m.numero_minimo == 0 and m.universo == 100
    m.validar_sorteio(list(range(20)))


def test_supersete_usa_colunas():
    m = loterias.modalidade("supersete")
    assert m.combinacoes_possiveis() == 10 ** 7
    m.validar_sorteio([0, 9, 3, 3, 1, 7, 5])
    with pytest.raises(loterias.FormatoInvalido):
        m.validar_sorteio([0, 9, 3, 3, 1, 7])         # coluna faltando


def test_modalidade_desconhecida_falha_com_lista():
    with pytest.raises(KeyError, match="Conhecidas"):
        loterias.modalidade("raspadinha")


# --------------------------------------------------------------------------- #
# Particionamento e vazamento
# --------------------------------------------------------------------------- #

def test_particao_e_cronologica_e_nao_se_sobrepoe():
    p = bt.particionar(concursos_falsos(100))
    assert len(p.desenvolvimento) == 60
    assert len(p.validacao) == 20
    assert len(p.teste) == 20
    assert p.desenvolvimento[-1].numero < p.validacao[0].numero
    assert p.validacao[-1].numero < p.teste[0].numero


def test_particao_embaralhada_e_recusada():
    concursos = concursos_falsos(30)
    fora_de_ordem = (concursos[5], concursos[1])
    with pytest.raises(bt.VazamentoDeDados):
        bt.Particao(desenvolvimento=fora_de_ordem, validacao=(), teste=())


def test_particao_sem_teste_e_recusada():
    with pytest.raises(ValueError):
        bt.particionar(concursos_falsos(50), 0.9, 0.1)


def test_particao_recusa_duplicados():
    c = concursos_falsos(10)
    with pytest.raises(ValueError, match="duplicados"):
        bt.particionar(list(c) + [c[0]])


def test_estrategia_nao_ve_o_futuro():
    """O contrato central: a estratégia recebe só o passado estrito.

    Esta estratégia tenta trapacear apostando nas dezenas do concurso mais
    recente que enxerga. Se o alvo estivesse no histórico entregue a ela, ela
    acertaria 6 em 6 sempre. O teste garante que isso é impossível.
    """
    m = loterias.modalidade("megasena")
    concursos = concursos_falsos(40)
    vistos: list[tuple[int, ...]] = []

    def trapaceira(mod, historico, quantos, rng):
        vistos.append(tuple(c.numero for c in historico))
        if historico:
            return [list(historico[-1].dezenas) for _ in range(quantos)]
        return bt.aleatoria_uniforme(mod, historico, quantos, rng)

    alvos = concursos[30:]
    resultados = bt._apostar(m, trapaceira, alvos, concursos[:30], 1, random.Random(1))

    for chamada, alvo in zip(vistos, alvos):
        assert alvo.numero not in chamada, "o alvo vazou para dentro da estratégia"
        assert max(chamada) < alvo.numero, "a estratégia viu um concurso do futuro"

    # E, de fato, copiar o concurso anterior não faz acertar o seguinte.
    assert sum(r.premio for r in resultados) >= 0.0


def test_custo_usa_o_preco_do_concurso_nao_o_de_hoje():
    m = loterias.modalidade("megasena")
    antigo = bt.Concurso(1, date(2021, 1, 5), (1, 2, 3, 4, 5, 6), {})
    novo = bt.Concurso(2, date(2025, 1, 5), (1, 2, 3, 4, 5, 6), {})
    r = bt._apostar(m, bt.aleatoria_uniforme, [antigo, novo], [], 1, random.Random(1))
    assert r[0].custo == pytest.approx(3.50)
    assert r[1].custo == pytest.approx(5.00)


# --------------------------------------------------------------------------- #
# Avaliação e walk-forward
# --------------------------------------------------------------------------- #

def test_avaliacao_compara_com_aleatorio_e_registra_semente():
    m = loterias.modalidade("megasena")
    concursos = concursos_falsos(30)
    a = bt.avaliar_periodo(m, bt.aleatoria_uniforme, concursos[20:], concursos[:20],
                           jogos_por_concurso=2, n_simulacoes=200, semente=7)
    assert a.n_simulacoes == 200
    assert a.semente == 7
    assert 0.0 <= a.percentil_vs_aleatorio <= 100.0
    assert a.metricas.n_concursos == 10
    assert a.teste.leitura
    assert a.leitura()


def test_avaliacao_e_reproduzivel_com_a_mesma_semente():
    """Backtest que não repete não pode ser auditado."""
    m = loterias.modalidade("megasena")
    c = concursos_falsos(24)
    args = dict(anteriores=c[:16], jogos_por_concurso=1, n_simulacoes=100, semente=99)
    a = bt.avaliar_periodo(m, bt.aleatoria_uniforme, c[16:], **args)
    b = bt.avaliar_periodo(m, bt.aleatoria_uniforme, c[16:], **args)
    assert a.metricas.custo_total == b.metricas.custo_total
    assert a.metricas.roi == b.metricas.roi
    assert a.percentil_vs_aleatorio == b.percentil_vs_aleatorio


def test_aleatorio_fica_perto_do_meio_da_propria_distribuicao():
    """Sanidade: a referência não pode se destacar contra ela mesma."""
    m = loterias.modalidade("lotofacil")
    c = concursos_falsos(40, "lotofacil", semente=5)
    a = bt.avaliar_periodo(m, bt.aleatoria_uniforme, c[30:], c[:30],
                           n_simulacoes=400, semente=3)
    assert 1.0 < a.percentil_vs_aleatorio < 99.0


def test_walk_forward_expansiva_avanca_sem_sobrepor():
    m = loterias.modalidade("megasena")
    c = concursos_falsos(50)
    janelas = bt.walk_forward(m, bt.aleatoria_uniforme, c, tamanho_treino=20,
                              tamanho_teste=10, expansiva=True)
    assert len(janelas) == 3
    for anterior, seguinte in zip(janelas, janelas[1:]):
        assert anterior.testou_ate < seguinte.testou_de
        assert anterior.treino_ate < seguinte.treino_ate
    for j in janelas:
        assert j.treino_ate < j.testou_de, "treino invadiu o teste"


def test_walk_forward_movel_esquece_o_comeco():
    m = loterias.modalidade("megasena")
    c = concursos_falsos(50)
    movel = bt.walk_forward(m, bt.aleatoria_uniforme, c, 20, 10, expansiva=False)
    assert len(movel) == 3
    for j in movel:
        assert j.treino_ate < j.testou_de


def test_walk_forward_recusa_historico_curto():
    m = loterias.modalidade("megasena")
    with pytest.raises(ValueError):
        bt.walk_forward(m, bt.aleatoria_uniforme, concursos_falsos(10), 20, 10)


def test_estrategia_com_quantidade_errada_falha_alto():
    m = loterias.modalidade("megasena")
    c = concursos_falsos(12)

    def preguicosa(mod, historico, quantos, rng):
        return bt.aleatoria_uniforme(mod, historico, 1, rng)

    with pytest.raises(ValueError, match="esperava"):
        bt._apostar(m, preguicosa, c[10:], c[:10], 3, random.Random(1))


# --------------------------------------------------------------------------- #
# Métricas financeiras
# --------------------------------------------------------------------------- #

def test_metricas_de_carteira_conhecida():
    r = [
        financeiro.ResultadoConcurso(1, 10.0, 0.0),
        financeiro.ResultadoConcurso(2, 10.0, 0.0),
        financeiro.ResultadoConcurso(3, 10.0, 100.0),
        financeiro.ResultadoConcurso(4, 10.0, 0.0),
    ]
    m = financeiro.avaliar(r)
    assert m.custo_total == 40.0
    assert m.premio_bruto == 100.0
    assert m.resultado_liquido == 60.0
    assert m.roi == pytest.approx(1.5)
    assert m.taxa_recuperacao == pytest.approx(2.5)
    assert m.concursos_sem_premio == 3
    assert m.maior_sequencia_sem_premio == 2
    assert m.maior_premio == 100.0
    assert m.curva_acumulada == (-10.0, -20.0, 70.0, 60.0)


def test_perda_maxima_mede_queda_a_partir_do_pico():
    r = [
        financeiro.ResultadoConcurso(1, 0.0, 100.0),   # acumulado +100
        financeiro.ResultadoConcurso(2, 30.0, 0.0),    # +70
        financeiro.ResultadoConcurso(3, 50.0, 0.0),    # +20
        financeiro.ResultadoConcurso(4, 0.0, 10.0),    # +30
    ]
    assert financeiro.avaliar(r).perda_maxima == pytest.approx(80.0)


def test_carteira_vazia_falha():
    with pytest.raises(ValueError):
        financeiro.avaliar([])


# --------------------------------------------------------------------------- #
# Índice de sobreajuste
# --------------------------------------------------------------------------- #

def test_indice_fica_entre_zero_e_cem():
    for kwargs in (
        dict(roi_desenvolvimento=0.5, roi_teste=-0.9, n_parametros=20, n_filtros=20),
        dict(roi_desenvolvimento=-0.5, roi_teste=-0.5, n_parametros=0, n_filtros=0),
        dict(roi_desenvolvimento=0.0, roi_teste=0.0, n_parametros=3, n_filtros=1),
    ):
        r = overfitting.calcular(**kwargs)
        assert 0.0 <= r.indice <= 100.0
        assert r.classificacao in {"baixo", "moderado", "alto", "crítico"}


def test_degradacao_grande_eleva_o_risco():
    estavel = overfitting.calcular(0.2, 0.19, 2, 1, [0.2, 0.19, 0.21], [0.18, 0.2])
    quebrado = overfitting.calcular(0.2, -0.8, 2, 1, [0.2, 0.19, 0.21], [0.18, 0.2])
    assert quebrado.indice > estavel.indice
    assert quebrado.componentes["degradacao"] > estavel.componentes["degradacao"]


def test_instabilidade_entre_janelas_eleva_o_risco():
    estavel = overfitting.calcular(0.1, 0.1, 2, 1, [0.10, 0.11, 0.09, 0.10])
    instavel = overfitting.calcular(0.1, 0.1, 2, 1, [0.9, -0.8, 0.7, -0.6])
    assert instavel.componentes["instabilidade"] > estavel.componentes["instabilidade"]


def test_sem_janelas_cobra_metade_do_peso_e_avisa():
    r = overfitting.calcular(0.1, 0.1, 1, 1)
    assert r.componentes["instabilidade"] == pytest.approx(overfitting.PESOS["instabilidade"] / 2)
    assert "não pôde ser medida" in r.leitura


def test_leitura_declara_que_nao_e_medida_oficial():
    r = overfitting.calcular(0.3, 0.05, 8, 6, [0.3, 0.1])
    assert "não uma medida oficial" in r.leitura
    assert "heurística" in r.leitura
    assert r.detalhamento()


def test_pesos_somam_cem():
    assert sum(overfitting.PESOS.values()) == 100
