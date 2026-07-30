"""Testes da matriz de estabilidade (§17) e da robustez (§18).

Dois testes aqui valem mais que os outros:

* ``test_robusta_exige_todos_os_recortes`` — trava a definição severa. Se
  algum dia alguém trocar o ``all`` por ``any`` para o relatório ficar mais
  bonito, este teste reprova.
* ``test_recortes_por_terco_nao_deixam_o_futuro_entrar`` — a trava
  anti-vazamento do backtest vale de nada se o recorte entregar como
  "anteriores" concursos que vêm depois. Aqui isso é conferido concurso a
  concurso, não por confiança no código.
"""

from __future__ import annotations

import random
from datetime import date, timedelta

import pytest

from lab import loterias, robustez
from lab.backtest import Concurso, aleatoria_uniforme


def concursos_falsos(n: int, modalidade: str = "megasena", semente: int = 11):
    m = loterias.modalidade(modalidade)
    rng = random.Random(semente)
    universo = list(m.dezenas_validas())
    return [
        Concurso(
            numero=i,
            data=date(2019, 1, 1) + timedelta(days=3 * i),
            dezenas=tuple(sorted(rng.sample(universo, m.dezenas_sorteadas))),
            rateio={6: (1, 30_000_000.0), 5: (50, 40_000.0), 4: (3_000, 800.0)},
        )
        for i in range(1, n + 1)
    ]


def linha(nome: str, percentil: float, roi: float = -0.5) -> robustez.LinhaDaMatriz:
    return robustez.LinhaDaMatriz(
        recorte=nome, n_concursos=10, custo=50.0, retorno=25.0, roi=roi,
        percentil_vs_aleatorio=percentil, p_valor=0.4,
        conclusao="acima" if percentil > 50 else "abaixo")


# --------------------------------------------------------------------------- #
# Recortes
# --------------------------------------------------------------------------- #

def test_recorte_vazio_e_recusado():
    """Um recorte sem concursos passaria adiante e explodiria longe daqui."""
    with pytest.raises(ValueError, match="vazio"):
        robustez.Recorte(nome="antigo", concursos=())


def test_recortes_por_terco_dividem_em_tres_sem_sobreposicao():
    c = concursos_falsos(120)
    recortes = robustez.recortes_por_terco(c)

    assert [r.nome for r in recortes] == ["antigo", "intermediário", "recente"]
    vistos: list[int] = []
    for r in recortes:
        vistos.extend(x.numero for x in r.concursos)
    assert len(vistos) == len(set(vistos)), "algum concurso caiu em dois recortes"
    assert vistos == sorted(vistos), "os recortes saíram fora de ordem"
    # O último recorte vai até o fim do histórico: nada é descartado no final.
    assert recortes[-1].concursos[-1].numero == 120


def test_recortes_por_terco_nao_deixam_o_futuro_entrar():
    """Cada "anterior" precisa ser estritamente anterior ao recorte inteiro."""
    for r in robustez.recortes_por_terco(concursos_falsos(90)):
        primeiro = min(x.numero for x in r.concursos)
        assert all(a.numero < primeiro for a in r.anteriores), (
            f"o recorte {r.nome} recebeu concursos do futuro como passado")


def test_recorte_antigo_tem_menos_passado_que_o_recente():
    """Sanidade: se todos tivessem o mesmo passado, não seriam recortes."""
    antigo, meio, recente = robustez.recortes_por_terco(concursos_falsos(90))
    assert len(antigo.anteriores) < len(meio.anteriores) < len(recente.anteriores)


def test_recortes_por_terco_recusam_historico_curto():
    with pytest.raises(ValueError, match="curto demais"):
        robustez.recortes_por_terco(concursos_falsos(15), treino_minimo=10)


def test_recortes_por_janela_cobrem_curto_e_longo():
    c = concursos_falsos(100)
    recortes = robustez.recortes_por_janela(c, [10, 30, 60])
    assert [r.nome for r in recortes] == ["últimos 10", "últimos 30", "últimos 60"]
    for r in recortes:
        assert len(r.concursos) + len(r.anteriores) == 100
        assert r.concursos[-1].numero == 100


def test_janela_que_nao_deixa_treino_e_descartada_em_silencio():
    """Pedir 95 de 100 com treino mínimo 10 não deve inventar um recorte."""
    recortes = robustez.recortes_por_janela(concursos_falsos(100), [95, 20],
                                            treino_minimo=10)
    assert [r.nome for r in recortes] == ["últimos 20"]


def test_nenhuma_janela_cabivel_falha_alto():
    with pytest.raises(ValueError, match="nenhuma janela"):
        robustez.recortes_por_janela(concursos_falsos(12), [11, 12], treino_minimo=10)


# --------------------------------------------------------------------------- #
# Matriz de estabilidade
# --------------------------------------------------------------------------- #

def test_matriz_tem_uma_linha_por_recorte():
    m = loterias.modalidade("megasena")
    c = concursos_falsos(60)
    recortes = robustez.recortes_por_terco(c)
    matriz = robustez.matriz_estabilidade(m, aleatoria_uniforme, recortes,
                                          n_simulacoes=40, semente=5)

    assert len(matriz.linhas) == 3
    assert [l.recorte for l in matriz.linhas] == [r.nome for r in recortes]
    for l, r in zip(matriz.linhas, recortes):
        assert l.n_concursos == len(r.concursos)
        assert l.custo > 0
        assert 0.0 <= l.percentil_vs_aleatorio <= 100.0
        assert 0.0 <= l.p_valor <= 1.0
    assert matriz.leitura()


def test_matriz_sem_recorte_falha():
    m = loterias.modalidade("megasena")
    with pytest.raises(ValueError, match="nenhum recorte"):
        robustez.matriz_estabilidade(m, aleatoria_uniforme, [])


def test_cada_recorte_usa_semente_propria():
    """Recortes diferentes têm de receber sementes diferentes.

    Se a semente fosse reaproveitada, as carteiras aleatórias seriam as mesmas
    dezenas em todos os recortes e a "concordância entre recortes" seria um
    artefato da semente, não uma medida.

    A conferência é feita no gerador, e não comparando ROIs: numa modalidade
    difícil e num trecho curto, todas as carteiras perdem tudo e o ROI é
    exatamente -1,0 nos dois recortes — o teste passaria por engano com uma
    semente única. Espiar o primeiro número sorteado do ``rng`` é determinístico
    e não depende de ninguém ganhar prêmio.
    """
    m = loterias.modalidade("megasena")
    c = concursos_falsos(40)
    igual = dict(concursos=tuple(c[35:]), anteriores=tuple(c[:35]))
    vistos: list[float] = []

    def espia(mod, historico, quantos, rng):
        if len(historico) == 35:            # primeira aposta de cada recorte
            vistos.append(rng.random())
        return aleatoria_uniforme(mod, historico, quantos, rng)

    robustez.matriz_estabilidade(
        m, espia,
        [robustez.Recorte(nome="a", **igual), robustez.Recorte(nome="b", **igual)],
        n_simulacoes=1, semente=77)

    assert len(vistos) == 2
    assert vistos[0] != vistos[1], "os dois recortes usaram a mesma semente"


def test_matriz_e_reproduzivel_com_a_mesma_semente():
    m = loterias.modalidade("megasena")
    recortes = robustez.recortes_por_terco(concursos_falsos(60))
    args = dict(recortes=recortes, n_simulacoes=30, semente=2026)
    primeira = robustez.matriz_estabilidade(m, aleatoria_uniforme, **args)
    segunda = robustez.matriz_estabilidade(m, aleatoria_uniforme, **args)
    assert primeira.rois == segunda.rois
    assert [l.percentil_vs_aleatorio for l in primeira.linhas] == \
        [l.percentil_vs_aleatorio for l in segunda.linhas]


def test_robusta_exige_todos_os_recortes():
    """A definição do §17: funcionar em TODOS, não em algum."""
    todos = robustez.Matriz(linhas=(linha("antigo", 70), linha("meio", 60),
                                    linha("recente", 80)))
    quase = robustez.Matriz(linhas=(linha("antigo", 70), linha("meio", 60),
                                    linha("recente", 30)))
    assert todos.robusta is True
    assert quase.robusta is False
    assert "NÃO é robusta" in quase.leitura()
    assert "NÃO é robusta" not in todos.leitura()


def test_um_recorte_so_nunca_e_robusto():
    """Sem comparação entre períodos não há robustez a declarar."""
    unica = robustez.Matriz(linhas=(linha("recente", 99),))
    assert unica.robusta is False
    assert "Um recorte só" in unica.leitura()


def test_leitura_conta_quantos_recortes_ficaram_acima():
    m = robustez.Matriz(linhas=(linha("a", 70, roi=-0.30), linha("b", 20, roi=-0.80)))
    texto = m.leitura()
    assert "1 de 2 recortes" in texto
    assert "-80.00%" in texto and "-30.00%" in texto


def test_robusta_nao_significa_vantagem():
    """O texto de sucesso não pode virar promessa — o §15 vale aqui também."""
    texto = robustez.Matriz(linhas=(linha("a", 70), linha("b", 60))).leitura()
    assert "ainda não" in texto and "vantagem" in texto


# --------------------------------------------------------------------------- #
# Perturbação de parâmetros
# --------------------------------------------------------------------------- #

def test_perturba_um_parametro_por_vez():
    """Mexer em tudo junto esconde qual parâmetro carregava o resultado."""
    base = {"minimo_pares": 2.0, "soma_maxima": 200.0}
    chamadas: list[dict[str, float]] = []

    def rodar(p):
        chamadas.append(dict(p))
        return -0.4

    s = robustez.perturbar_parametros(base, rodar)

    assert chamadas[0] == base, "a primeira chamada deveria ser o caso base"
    for recebido in chamadas[1:]:
        diferentes = [k for k in base if recebido[k] != base[k]]
        assert len(diferentes) == 1, f"mudou mais de um parâmetro: {diferentes}"
    assert len(s.perturbacoes) == 2 * len(robustez.FATORES)
    assert {p.parametro for p in s.perturbacoes} == set(base)


def test_perturbacao_aplica_os_fatores_pedidos():
    s = robustez.perturbar_parametros({"x": 100.0}, lambda p: p["x"] / 1000.0,
                                      fatores=(-0.10, 0.20))
    assert [p.valor for p in s.perturbacoes] == pytest.approx([90.0, 120.0])
    assert [p.roi for p in s.perturbacoes] == pytest.approx([0.09, 0.12])
    assert s.amplitude == pytest.approx(0.03)


def test_resultado_que_desaparece_com_empurrao_e_denunciado():
    base = {"limite": 10.0}
    # Positivo só no valor exato; qualquer desvio derruba para negativo.
    s = robustez.perturbar_parametros(base, lambda p: 0.3 if p["limite"] == 10.0 else -0.6)
    assert s.roi_base == pytest.approx(0.3)
    assert s.pior == pytest.approx(-0.6)
    assert "desaparece" in s.leitura()


def test_resultado_que_sobrevive_nao_e_denunciado():
    s = robustez.perturbar_parametros({"limite": 10.0}, lambda p: 0.10)
    assert "sobrevive" in s.leitura()
    assert s.amplitude == pytest.approx(0.0)


def test_roi_base_negativo_nao_conta_como_fragilidade():
    """Não há resultado a perder quando não havia resultado."""
    s = robustez.perturbar_parametros({"limite": 10.0},
                                      lambda p: -0.5 if p["limite"] == 10.0 else -0.9)
    assert "sobrevive" in s.leitura()


def test_perturbar_sem_parametro_falha():
    with pytest.raises(ValueError, match="nenhum parâmetro"):
        robustez.perturbar_parametros({}, lambda p: 0.0)


# --------------------------------------------------------------------------- #
# Concentração do retorno
# --------------------------------------------------------------------------- #

def test_concentracao_de_carteira_conhecida():
    c = robustez.medir_concentracao([(10.0, 0.0), (10.0, 0.0),
                                     (10.0, 100.0), (10.0, 0.0)])
    assert c.roi_completo == pytest.approx(1.5)          # (100 - 40) / 40
    assert c.roi_sem_melhor == pytest.approx(-1.0)       # (0 - 30) / 30
    assert c.roi_sem_pior == pytest.approx(70 / 30)      # (100 - 30) / 30
    assert c.fracao_do_melhor == pytest.approx(1.0)
    assert c.depende_de_um_concurso is True
    assert "um único concurso" in c.leitura()


def test_retorno_espalhado_nao_e_acusado_de_concentracao():
    c = robustez.medir_concentracao([(10.0, 20.0), (10.0, 20.0),
                                     (10.0, 20.0), (10.0, 20.0)])
    assert c.fracao_do_melhor == pytest.approx(0.25)
    assert c.depende_de_um_concurso is False
    assert "um único concurso" not in c.leitura()


def test_metade_exata_ainda_nao_e_dependencia():
    """A fronteira é > 50%, e ficar em cima dela não acusa."""
    c = robustez.medir_concentracao([(10.0, 50.0), (10.0, 50.0)])
    assert c.fracao_do_melhor == pytest.approx(0.5)
    assert c.depende_de_um_concurso is False


def test_um_concurso_so_declara_concentracao_total():
    """Remover o único concurso não produz medida; a verdade é 100%."""
    c = robustez.medir_concentracao([(10.0, 5.0)])
    assert c.roi_completo == pytest.approx(-0.5)
    assert c.fracao_do_melhor == pytest.approx(1.0)
    assert c.depende_de_um_concurso is True


def test_carteira_sem_premio_nenhum_nao_divide_por_zero():
    c = robustez.medir_concentracao([(10.0, 0.0), (10.0, 0.0)])
    assert c.roi_completo == pytest.approx(-1.0)
    assert c.fracao_do_melhor == pytest.approx(0.0)
    assert c.depende_de_um_concurso is False


def test_concentracao_sem_concurso_falha():
    with pytest.raises(ValueError, match="nenhum concurso"):
        robustez.medir_concentracao([])


# --------------------------------------------------------------------------- #
# Ligação com o índice de sobreajuste
# --------------------------------------------------------------------------- #

def test_medir_reduz_a_incerteza_do_indice():
    """Medir tem de mudar o índice — senão os instrumentos não servem de nada.

    Sem matriz nem perturbação, `overfitting.calcular` cobra metade do peso de
    instabilidade e de sensibilidade por "não medido". Passando medidas
    estáveis, esses componentes caem.
    """
    matriz = robustez.Matriz(linhas=(linha("a", 60, roi=-0.50),
                                     linha("b", 55, roi=-0.51),
                                     linha("c", 58, roi=-0.49)))
    sens = robustez.Sensibilidade(
        roi_base=-0.50,
        perturbacoes=tuple(robustez.Perturbacao("x", f, 1.0, -0.50)
                           for f in robustez.FATORES))
    conc = robustez.medir_concentracao([(10.0, 5.0), (10.0, 5.0), (10.0, 5.0)])

    cego = robustez.risco_medido(-0.45, -0.50, 3, 2)
    medido = robustez.risco_medido(-0.45, -0.50, 3, 2, matriz, sens, conc)

    assert medido.indice < cego.indice
    assert medido.componentes["instabilidade"] < cego.componentes["instabilidade"]
    assert medido.n_janelas == 3
    assert "não pôde ser medida" in cego.leitura
    assert "não pôde ser medida" not in medido.leitura


def test_instabilidade_entre_recortes_eleva_o_indice():
    estavel = robustez.Matriz(linhas=(linha("a", 60, roi=-0.50),
                                      linha("b", 55, roi=-0.51)))
    caotica = robustez.Matriz(linhas=(linha("a", 95, roi=+0.90),
                                      linha("b", 5, roi=-0.95)))
    calmo = robustez.risco_medido(0.1, 0.1, 3, 2, matriz=estavel)
    agitado = robustez.risco_medido(0.1, 0.1, 3, 2, matriz=caotica)
    assert agitado.componentes["instabilidade"] > calmo.componentes["instabilidade"]


def test_concentracao_alta_chega_ao_indice():
    concentrado = robustez.medir_concentracao([(10.0, 0.0), (10.0, 100.0)])
    espalhado = robustez.medir_concentracao([(10.0, 50.0), (10.0, 50.0)])
    alto = robustez.risco_medido(0.1, 0.1, 3, 2, concentracao=concentrado)
    baixo = robustez.risco_medido(0.1, 0.1, 3, 2, concentracao=espalhado)
    assert alto.componentes["concentracao"] > baixo.componentes["concentracao"]


def test_indice_medido_continua_na_faixa():
    matriz = robustez.Matriz(linhas=(linha("a", 99, roi=1.0), linha("b", 1, roi=-1.0)))
    r = robustez.risco_medido(0.9, -0.9, 30, 30, matriz=matriz)
    assert 0.0 <= r.indice <= 100.0
    assert r.classificacao in {"baixo", "moderado", "alto", "crítico"}


# --------------------------------------------------------------------------- #
# Ponta a ponta
# --------------------------------------------------------------------------- #

def test_aleatorio_nao_sai_robusto_por_acidente():
    """A referência não pode se destacar contra ela mesma nos três recortes.

    Não é determinístico em teoria — mas com a semente fixada é, e o valor do
    teste é justamente denunciar o dia em que uma mudança fizer a estratégia
    aleatória aparecer como "robusta".
    """
    m = loterias.modalidade("lotofacil")
    c = concursos_falsos(90, "lotofacil", semente=8)
    matriz = robustez.matriz_estabilidade(
        m, aleatoria_uniforme, robustez.recortes_por_terco(c),
        n_simulacoes=60, semente=31)
    assert matriz.robusta is False, (
        "a estratégia aleatória apareceu robusta contra o próprio acaso: "
        f"{[l.percentil_vs_aleatorio for l in matriz.linhas]}")
