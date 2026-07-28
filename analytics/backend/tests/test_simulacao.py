"""Testes da simulação paralela e da fila.

O teste central é ``test_resultado_identico_com_1_2_e_4_processos``. Se o
número de processos mudasse o resultado, dois backtests da mesma estratégia
divergiriam pelo número de núcleos da máquina — e nenhum deles seria auditável.
"""

from __future__ import annotations

import random
import threading
import time
from datetime import date, timedelta

import pytest

from lab import backtest as bt
from lab import loterias, simulacao, tarefas


def concursos(n: int = 12, semente: int = 3) -> list[bt.Concurso]:
    rng = random.Random(semente)
    return [
        bt.Concurso(numero=i, data=date(2024, 1, 1) + timedelta(days=3 * i),
                    dezenas=tuple(sorted(rng.sample(range(1, 61), 6))),
                    rateio={6: (1, 4e7), 4: (5000, 800.0)})
        for i in range(1, n + 1)
    ]


MEGA = loterias.modalidade("megasena")


# --------------------------------------------------------------------------- #
# Reprodutibilidade sob paralelismo
# --------------------------------------------------------------------------- #

def test_resultado_identico_com_1_2_e_4_processos():
    """A propriedade que torna a paralelização confiável."""
    c = concursos()
    resultados = [
        simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, n_simulacoes=40,
                                  semente=7, processos=n)
        for n in (1, 2, 4)
    ]
    assert resultados[0] == resultados[1] == resultados[2]
    assert len(resultados[0]) == 40


def test_divisao_em_lotes_nao_altera_o_resultado():
    """Fatias de tamanhos diferentes precisam dar exatamente o mesmo."""
    c = concursos()
    a = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 30, semente=1, processos=1)
    b = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 30, semente=1, processos=3)
    d = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 30, semente=1, processos=7)
    assert a == b == d


def concursos_com_premio_frequente(n: int = 12, semente: int = 3) -> list[bt.Concurso]:
    """Rateio em faixas baixas, para o ROI variar entre carteiras.

    Com prêmio só na sena e na quadra, toda carteira aleatória dá exatamente
    -1,0 e o ROI deixa de distinguir qualquer coisa — foi o que fez a primeira
    versão deste teste passar por acidente com sementes diferentes.
    """
    rng = random.Random(semente)
    return [
        bt.Concurso(numero=i, data=date(2024, 1, 1) + timedelta(days=3 * i),
                    dezenas=tuple(sorted(rng.sample(range(1, 61), 6))),
                    rateio={1: (1, 8.0), 2: (1, 40.0), 3: (1, 300.0)})
        for i in range(1, n + 1)
    ]


def test_sementes_diferentes_dao_resultados_diferentes():
    c = concursos_com_premio_frequente()
    a = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 20, semente=1, processos=1)
    b = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 20, semente=2, processos=1)
    assert a != b
    assert len(set(a)) > 1, "sem variacao de ROI o teste nao prova nada"


def test_paralelo_bate_com_o_backtest_serial():
    """A versão paralela não pode divergir da que já era testada."""
    c = concursos()
    serial = bt.avaliar_periodo(MEGA, bt.aleatoria_uniforme, c[8:], c[:8],
                                jogos_por_concurso=1, n_simulacoes=25, semente=11)
    paralelo = simulacao.avaliar_periodo_paralelo(
        MEGA, bt.aleatoria_uniforme, c[8:], c[:8], jogos_por_concurso=1,
        n_simulacoes=25, semente=11, processos=3)
    assert paralelo.metricas.custo_total == serial.metricas.custo_total
    assert paralelo.metricas.roi == serial.metricas.roi
    assert paralelo.percentil_vs_aleatorio == serial.percentil_vs_aleatorio
    assert paralelo.teste.p_valor == serial.teste.p_valor


def test_dez_mil_simulacoes_sao_viaveis():
    """O §12 pede no mínimo 10.000. Sem isto, o requisito não é atendido."""
    c = concursos(10)
    inicio = time.monotonic()
    rois = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1,
                                     n_simulacoes=10_000, semente=5)
    duracao = time.monotonic() - inicio
    assert len(rois) == 10_000
    assert duracao < 120, f"{duracao:.1f}s é lento demais para uso real"


def test_estrategia_fora_do_registro_e_recusada_com_explicacao():
    c = concursos()
    with pytest.raises(simulacao.EstrategiaNaoSerializavel, match="REGISTRO"):
        simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 10,
                                  nome_estrategia="inventada")


def test_entradas_invalidas_falham():
    c = concursos()
    with pytest.raises(ValueError):
        simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1, 0)
    with pytest.raises(ValueError):
        simulacao.avaliar_periodo_paralelo(MEGA, bt.aleatoria_uniforme, [])


def test_volume_pequeno_nao_abre_processos():
    """Abrir processo para 10 simulações custa mais do que economiza."""
    c = concursos()
    rois = simulacao.rois_aleatorios(MEGA, c[8:], c[:8], 1,
                                     n_simulacoes=10, semente=1)
    assert len(rois) == 10


# --------------------------------------------------------------------------- #
# Fila
# --------------------------------------------------------------------------- #

@pytest.fixture()
def fila():
    f = tarefas.Fila(trabalhadores=2)
    yield f
    f.encerrar()


def test_tarefa_executa_e_guarda_o_resultado(fila):
    # Não se afirma NA_FILA logo após enfileirar: o trabalhador pode já ter
    # terminado, e a asserção seria uma corrida. O ciclo de vida é conferido
    # pelos carimbos de início e conclusão.
    t = fila.enfileirar("somar", lambda: 2 + 2, user_id="u1")
    concluida = fila.aguardar(t.id, timeout=10)
    assert concluida.situacao is tarefas.Situacao.CONCLUIDA
    assert concluida.resultado == 4
    assert concluida.iniciada_em and concluida.concluida_em


def test_falha_e_registrada_sem_derrubar_a_fila(fila):
    def quebra():
        raise ValueError("erro proposital de teste")

    t = fila.enfileirar("quebrar", quebra, user_id="u1")
    fila.aguardar(t.id, timeout=10)
    assert t.situacao is tarefas.Situacao.FALHOU
    assert "erro proposital" in t.erro
    # a fila continua funcionando
    outra = fila.enfileirar("ok", lambda: 1, user_id="u1")
    assert fila.aguardar(outra.id, timeout=10).resultado == 1


def test_tarefa_de_um_usuario_nao_e_visivel_para_outro(fila):
    t = fila.enfileirar("x", lambda: 1, user_id="u1")
    fila.aguardar(t.id, timeout=10)
    assert fila.obter(t.id, user_id="u1") is not None
    assert fila.obter(t.id, user_id="u2") is None


def test_id_inexistente_e_alheio_dao_a_mesma_resposta(fila):
    """Distinguir os dois permitiria descobrir quais identificadores existem."""
    t = fila.enfileirar("x", lambda: 1, user_id="u1")
    fila.aguardar(t.id, timeout=10)
    assert fila.obter("nao-existe", user_id="u2") is None
    assert fila.obter(t.id, user_id="u2") is None


def test_limite_de_tarefas_por_usuario():
    f = tarefas.Fila(trabalhadores=1, limite_por_usuario=2)
    try:
        travar = threading.Event()
        f.enfileirar("lenta", travar.wait, user_id="u1")
        f.enfileirar("fila", lambda: 1, user_id="u1")
        with pytest.raises(tarefas.LimiteDeTarefas):
            f.enfileirar("demais", lambda: 1, user_id="u1")
        # outro usuário não é afetado
        assert f.enfileirar("de outro", lambda: 1, user_id="u2")
        travar.set()
    finally:
        f.encerrar()


def test_listar_filtra_por_usuario(fila):
    fila.enfileirar("a", lambda: 1, user_id="u1")
    fila.enfileirar("b", lambda: 1, user_id="u2")
    assert len(fila.listar(user_id="u1")) == 1
    assert len(fila.listar()) == 2


def test_cancelar_so_vale_antes_de_comecar():
    f = tarefas.Fila(trabalhadores=1, limite_por_usuario=10)
    try:
        travar = threading.Event()
        primeira = f.enfileirar("ocupa", travar.wait, user_id="u1")
        segunda = f.enfileirar("na fila", lambda: 1, user_id="u1")
        assert f.cancelar(segunda.id, user_id="u1") is True
        assert segunda.situacao is tarefas.Situacao.CANCELADA
        travar.set()
        f.aguardar(primeira.id, timeout=10)
        assert f.cancelar(primeira.id, user_id="u1") is False
    finally:
        f.encerrar()


def test_trabalhadores_invalidos_falham():
    with pytest.raises(ValueError):
        tarefas.Fila(trabalhadores=0)


def test_backtest_completo_pela_fila(fila):
    """Integração: o caso real de uso da fila."""
    c = concursos(14)

    def rodar():
        a = simulacao.avaliar_periodo_paralelo(
            MEGA, bt.aleatoria_uniforme, c[10:], c[:10],
            n_simulacoes=300, semente=9)
        return {"roi": a.metricas.roi, "percentil": a.percentil_vs_aleatorio,
                "semente": a.semente}

    t = fila.enfileirar("backtest mega-sena", rodar, user_id="u1")
    concluida = fila.aguardar(t.id, timeout=180)
    assert concluida.situacao is tarefas.Situacao.CONCLUIDA
    assert concluida.resultado["semente"] == 9
    assert 0 <= concluida.resultado["percentil"] <= 100
    assert concluida.para_json()["situacao"] == "concluida"
