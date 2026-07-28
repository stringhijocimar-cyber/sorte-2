"""O núcleo estatístico é conferido contra o SciPy.

O pacote roda sem SciPy de propósito, mas uma implementação própria de
distribuição só merece confiança se bater com uma referência independente.
Quando o SciPy está instalado, estes testes comparam número a número; quando
não está, eles são pulados e o restante continua valendo.
"""

from __future__ import annotations

import math

import pytest

from lab import estatistica as est
from lab import multiplos

scipy_stats = pytest.importorskip("scipy.stats", reason="SciPy ausente")


# --------------------------------------------------------------------------- #
# Distribuições contra o SciPy
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("x", [-3.5, -1.0, 0.0, 0.5, 1.96, 4.0])
def test_phi_bate_com_scipy(x):
    assert est.phi(x) == pytest.approx(scipy_stats.norm.cdf(x), abs=1e-12)


@pytest.mark.parametrize("conf", [0.80, 0.90, 0.95, 0.99])
def test_z_critico_bate_com_scipy(conf):
    esperado = scipy_stats.norm.ppf(1 - (1 - conf) / 2)
    assert est.z_critico(conf) == pytest.approx(esperado, abs=1e-9)


@pytest.mark.parametrize("k,n,p", [(0, 10, 0.3), (3, 10, 0.3), (10, 10, 0.3),
                                   (1, 500, 0.002), (17, 60, 0.25)])
def test_binom_pmf_bate_com_scipy(k, n, p):
    assert est.binom_pmf(k, n, p) == pytest.approx(scipy_stats.binom.pmf(k, n, p), rel=1e-10)


@pytest.mark.parametrize("x,gl", [(0.5, 1), (3.84, 1), (10.0, 5), (59.0, 59),
                                  (100.0, 59), (250.0, 79), (1.0, 79)])
def test_qui2_sf_bate_com_scipy(x, gl):
    assert est.qui2_sf(x, gl) == pytest.approx(scipy_stats.chi2.sf(x, gl), rel=1e-9, abs=1e-15)


@pytest.mark.parametrize("k,n,p0", [(3, 10, 0.5), (0, 20, 0.1), (7, 20, 0.5), (12, 40, 0.25)])
def test_teste_binomial_bate_com_scipy(k, n, p0):
    nosso = est.teste_binomial(k, n, p0)
    referencia = scipy_stats.binomtest(k, n, p0, alternative="two-sided").pvalue
    assert nosso.p_valor == pytest.approx(referencia, rel=1e-9)


def test_wilson_bate_com_scipy():
    lo, hi = est.wilson(12, 100, 0.95)
    ref_lo, ref_hi = scipy_stats.binomtest(12, 100).proportion_ci(0.95, method="wilson")
    assert lo == pytest.approx(ref_lo, abs=1e-9)
    assert hi == pytest.approx(ref_hi, abs=1e-9)


def test_qui2_uniformidade_bate_com_scipy():
    contagens = [18, 22, 25, 19, 16, 20]
    nosso = est.teste_qui2_uniformidade(contagens)
    stat, p = scipy_stats.chisquare(contagens)
    assert nosso.estimativa == pytest.approx(stat, rel=1e-12)
    assert nosso.p_valor == pytest.approx(p, rel=1e-9)


# --------------------------------------------------------------------------- #
# Contratos que a camada precisa cumprir
# --------------------------------------------------------------------------- #

def test_nenhum_resultado_sai_sem_ic_e_efeito():
    """A regra da camada: p-valor nunca viaja sozinho."""
    resultados = [
        est.teste_binomial(5, 50, 0.1),
        est.teste_qui2_uniformidade([10, 12, 9, 11]),
        est.bootstrap_media([1.0, -2.0, 3.5, 0.5], reamostragens=500, semente=1),
        est.teste_permutacao([1, 2, 3], [2, 3, 4], permutacoes=500, semente=1),
    ]
    for r in resultados:
        assert r.ic_inferior <= r.ic_superior
        assert r.nome_efeito, "todo resultado precisa nomear seu tamanho de efeito"
        assert r.leitura, "todo resultado precisa de leitura em português"
        assert r.n > 0
        assert r.resumo()


def test_wilson_nunca_sai_do_intervalo_valido():
    """O motivo de não usarmos Wald: probabilidade negativa em painel."""
    for sucessos, n in [(0, 10), (0, 100_000), (1, 100_000), (10, 10)]:
        lo, hi = est.wilson(sucessos, n)
        assert 0.0 <= lo <= hi <= 1.0


def test_permutacao_nunca_devolve_p_zero():
    """Correção de Davison–Hinkley: p = 0 é impossível e enganaria o usuário."""
    r = est.teste_permutacao([100.0] * 20, [0.0] * 20, permutacoes=200, semente=7)
    assert r.p_valor > 0.0
    assert r.p_valor == pytest.approx(1 / 201, rel=1e-9)


def test_permutacao_nao_acha_diferenca_onde_nao_ha():
    a = [1.0, 2.0, 3.0, 4.0, 5.0] * 4
    r = est.teste_permutacao(a, list(a), permutacoes=2_000, semente=3)
    assert r.p_valor > 0.5
    assert r.estimativa == pytest.approx(0.0, abs=1e-12)


def test_bootstrap_cobre_a_media_verdadeira():
    dados = [float(x) for x in range(100)]
    r = est.bootstrap_media(dados, reamostragens=3_000, semente=11)
    assert r.ic_inferior <= 49.5 <= r.ic_superior


def test_percentil_na_distribuicao():
    dist = list(range(100))
    assert est.percentil_na_distribuicao(-1, dist) == pytest.approx(0.0)
    assert est.percentil_na_distribuicao(1000, dist) == pytest.approx(100.0)
    assert est.percentil_na_distribuicao(49.5, dist) == pytest.approx(50.0)


def test_entradas_invalidas_falham_alto():
    with pytest.raises(ValueError):
        est.teste_binomial(1, 0, 0.5)
    with pytest.raises(ValueError):
        est.teste_binomial(1, 10, 1.5)
    with pytest.raises(ValueError):
        est.teste_qui2_uniformidade([5])
    with pytest.raises(ValueError):
        est.bootstrap_media([])
    with pytest.raises(ValueError):
        est.teste_permutacao([], [1.0])


# --------------------------------------------------------------------------- #
# Correção para múltiplos testes
# --------------------------------------------------------------------------- #

PS = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216]


def test_bonferroni_bate_com_statsmodels_ou_conta_manual():
    a = multiplos.bonferroni(PS)
    for bruto, ajustado in zip(PS, a.ajustados):
        assert ajustado == pytest.approx(min(1.0, bruto * len(PS)), rel=1e-12)


def test_holm_e_bh_batem_com_statsmodels():
    sm = pytest.importorskip("statsmodels.stats.multitest", reason="statsmodels ausente")
    for metodo, nosso in (("holm", multiplos.holm(PS)), ("fdr_bh", multiplos.benjamini_hochberg(PS))):
        _, ajustados_ref, _, _ = sm.multipletests(PS, alpha=0.05, method=metodo)
        for nosso_p, ref in zip(nosso.ajustados, ajustados_ref):
            assert nosso_p == pytest.approx(ref, rel=1e-9)


def test_ajustados_sao_monotonos():
    """Ordenar por p bruto e por p ajustado tem de dar a mesma ordem."""
    for ajuste in (multiplos.holm(PS), multiplos.benjamini_hochberg(PS)):
        pares = sorted(zip(ajuste.brutos, ajuste.ajustados))
        anteriores = [p for _, p in pares]
        assert anteriores == sorted(anteriores)


def test_holm_nunca_e_menos_potente_que_bonferroni():
    holm = multiplos.holm(PS)
    bonf = multiplos.bonferroni(PS)
    assert holm.n_significativos_depois >= bonf.n_significativos_depois
    for h, b in zip(holm.ajustados, bonf.ajustados):
        assert h <= b + 1e-12


def test_bh_e_mais_potente_que_holm():
    assert (multiplos.benjamini_hochberg(PS).n_significativos_depois
            >= multiplos.holm(PS).n_significativos_depois)


def test_relata_quem_perdeu_a_significancia():
    """O achado mais importante do módulo é o que some após a correção."""
    a = multiplos.bonferroni(PS, rotulos=[f"filtro {i}" for i in range(len(PS))])
    assert a.n_significativos_antes > a.n_significativos_depois
    assert a.perdidos
    assert "Deixaram de ser significativas" in a.leitura()


def test_uma_hipotese_nao_e_corrigida():
    a = multiplos.holm([0.04])
    assert a.ajustados[0] == pytest.approx(0.04)
    assert "correção não se aplica" in a.leitura()


def test_metodo_desconhecido_falha():
    with pytest.raises(KeyError):
        multiplos.corrigir("inventado", PS)


# --------------------------------------------------------------------------- #
# Monte Carlo — substituiu a permutação de unidades incompatíveis
# --------------------------------------------------------------------------- #

def test_monte_carlo_no_centro_do_nulo_nao_e_significativo():
    nulo = [scipy_stats.norm.ppf((i + 0.5) / 1000) for i in range(1000)]
    r = est.teste_monte_carlo(0.0, nulo)
    assert r.p_valor > 0.9
    assert r.ic_inferior < 0.0 < r.ic_superior
    assert abs(r.tamanho_efeito) < 0.1
    assert "compatível com acaso" in r.leitura


def test_monte_carlo_no_extremo_e_significativo():
    nulo = [scipy_stats.norm.ppf((i + 0.5) / 1000) for i in range(1000)]
    r = est.teste_monte_carlo(10.0, nulo)
    assert r.p_valor < 0.01
    assert r.tamanho_efeito > 5
    assert r.estimativa == 10.0


def test_monte_carlo_nunca_devolve_p_zero():
    """Com amostra finita, p = 0 é impossível — e enganaria o usuário."""
    r = est.teste_monte_carlo(1e9, [0.0] * 500)
    assert r.p_valor > 0
    assert r.p_valor == pytest.approx(2 / 501, rel=1e-9)


def test_monte_carlo_e_bilateral():
    nulo = list(range(1000))
    baixo = est.teste_monte_carlo(-500, nulo)
    alto = est.teste_monte_carlo(1500, nulo)
    assert baixo.p_valor == pytest.approx(alto.p_valor, rel=1e-9)


def test_monte_carlo_declara_que_o_intervalo_e_do_acaso():
    """O intervalo é a faixa do acaso, não a incerteza da estimativa."""
    r = est.teste_monte_carlo(0.5, list(range(100)))
    assert "o acaso produz entre" in r.leitura
    assert r.n == 100


def test_monte_carlo_com_nulo_vazio_falha():
    with pytest.raises(ValueError):
        est.teste_monte_carlo(1.0, [])


def test_monte_carlo_bate_com_a_referencia_normal():
    """Contra um nulo normal grande, o p do Monte Carlo aproxima o analítico."""
    import random as _r

    rng = _r.Random(7)
    nulo = [rng.gauss(0, 1) for _ in range(20_000)]
    for observado in (1.0, 1.96, 2.5):
        nosso = est.teste_monte_carlo(observado, nulo).p_valor
        analitico = 2 * scipy_stats.norm.sf(observado)
        assert nosso == pytest.approx(analitico, abs=0.02), observado
