"""Testes da persistência, em SQLite em memória.

O teste mais valioso aqui é ``test_schema_sql_nao_divergiu_dos_modelos``: ele
compara tabela a tabela e coluna a coluna os modelos SQLAlchemy (fonte de
verdade do runtime) com o DDL PostgreSQL de referência. Sem essa trava, alguém
acrescenta uma coluna no modelo, esquece o SQL, e a migração de produção quebra
meses depois — o tipo de defeito que nenhuma revisão de código pega.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from lab import backtest as bt
from lab import ingestao, loterias, persistencia as p

RAIZ = Path(__file__).resolve().parents[2]


@pytest.fixture()
def sessao():
    engine = p.criar_engine()
    p.criar_tabelas(engine)
    with Session(engine) as s:
        yield s


@pytest.fixture()
def com_modalidades(sessao):
    p.RepositorioModalidades(sessao).sincronizar_do_registro()
    sessao.commit()
    return sessao


def concurso(numero: int, dezenas=(1, 2, 3, 4, 5, 6), rateio=None):
    return ingestao.ConcursoImportado(
        modalidade="megasena", concurso=numero,
        data=date(2024, 1, 1) + timedelta(days=numero),
        dezenas=tuple(dezenas), origem="teste",
        rateio=rateio if rateio is not None else {6: (1, 4e7), 4: (100, 900.0)})


def usuario(sessao, email="ana@exemplo.com") -> p.User:
    u = p.User(id=f"uid-{email}", email=email, password_hash="hash")
    sessao.add(u)
    sessao.flush()
    return u


# --------------------------------------------------------------------------- #
# Modalidades e preços
# --------------------------------------------------------------------------- #

def test_sincroniza_as_nove_modalidades(sessao):
    n = p.RepositorioModalidades(sessao).sincronizar_do_registro()
    assert n == len(loterias.MODALIDADES) == 9
    assert p.RepositorioModalidades(sessao).por_codigo("megasena").name == "Mega-Sena"


def test_sincronizacao_e_idempotente(sessao):
    repo = p.RepositorioModalidades(sessao)
    repo.sincronizar_do_registro()
    antes = len(sessao.query(p.PriceHistory).all())
    repo.sincronizar_do_registro()
    assert len(sessao.query(p.PriceHistory).all()) == antes
    assert len(sessao.query(p.Lottery).all()) == 9


def test_preco_vigente_respeita_a_data(com_modalidades):
    repo = p.RepositorioModalidades(com_modalidades)
    assert repo.preco_vigente("megasena", date(2021, 6, 1)) == pytest.approx(3.50)
    assert repo.preco_vigente("megasena", date(2023, 6, 1)) == pytest.approx(4.50)
    assert repo.preco_vigente("megasena", date(2025, 6, 1)) == pytest.approx(5.00)


def test_preco_bate_com_o_registro_em_codigo(com_modalidades):
    """Banco e registro não podem discordar sobre preço."""
    repo = p.RepositorioModalidades(com_modalidades)
    m = loterias.modalidade("megasena")
    for quando in (date(2021, 1, 1), date(2023, 1, 1), date(2025, 1, 1)):
        assert repo.preco_vigente("megasena", quando) == pytest.approx(m.preco(quando))


def test_preco_duplicado_na_mesma_vigencia_e_recusado(com_modalidades):
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    com_modalidades.add(p.PriceHistory(lottery_id=linha.id,
                                       valid_from=date(2024, 5, 26), bet_price=9.9))
    with pytest.raises(IntegrityError):
        com_modalidades.flush()


# --------------------------------------------------------------------------- #
# Concursos
# --------------------------------------------------------------------------- #

def test_ultimo_concurso_comeca_em_zero(com_modalidades):
    assert p.RepositorioConcursos(com_modalidades).ultimo_concurso("megasena") == 0


def test_grava_e_reporta_ultimo(com_modalidades):
    repo = p.RepositorioConcursos(com_modalidades)
    gravados, dup = repo.gravar("megasena", [concurso(1), concurso(2), concurso(3)])
    assert (gravados, dup) == (3, 0)
    assert repo.ultimo_concurso("megasena") == 3


def test_duplicado_e_ignorado_e_contado(com_modalidades):
    repo = p.RepositorioConcursos(com_modalidades)
    repo.gravar("megasena", [concurso(1), concurso(2)])
    gravados, dup = repo.gravar("megasena", [concurso(2), concurso(3)])
    assert (gravados, dup) == (1, 1)
    assert repo.ultimo_concurso("megasena") == 3


def test_banco_impede_duplicidade_mesmo_burlando_o_repositorio(com_modalidades):
    """Checar só na aplicação deixa passar corrida entre dois workers."""
    repo = p.RepositorioConcursos(com_modalidades)
    repo.gravar("megasena", [concurso(1)])
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    com_modalidades.add(p.Draw(lottery_id=linha.id, contest_number=1,
                               draw_date=date(2024, 1, 1),
                               drawn_numbers=[1, 2, 3, 4, 5, 6], source="x"))
    with pytest.raises(IntegrityError):
        com_modalidades.flush()


def test_modalidade_nao_sincronizada_falha(sessao):
    with pytest.raises(KeyError):
        p.RepositorioConcursos(sessao).gravar("megasena", [concurso(1)])


def test_rateio_e_gravado_por_acertos(com_modalidades):
    p.RepositorioConcursos(com_modalidades).gravar("megasena", [concurso(1)])
    draw = com_modalidades.query(p.Draw).one()
    assert {t.hits: t.winners for t in draw.tiers} == {6: 1, 4: 100}


def test_ordem_das_dezenas_e_preservada(com_modalidades):
    """O Super Sete depende da ordem das colunas."""
    p.RepositorioModalidades(com_modalidades).sincronizar_do_registro()
    c = ingestao.ConcursoImportado(modalidade="supersete", concurso=1,
                                   data=date(2024, 1, 1), dezenas=(3, 0, 9, 1, 5, 5, 2),
                                   origem="teste")
    p.RepositorioConcursos(com_modalidades).gravar("supersete", [c])
    draw = com_modalidades.query(p.Draw).filter_by(contest_number=1).all()[-1]
    assert list(draw.drawn_numbers) == [3, 0, 9, 1, 5, 5, 2]


def test_para_backtest_devolve_ordenado_e_com_rateio(com_modalidades):
    repo = p.RepositorioConcursos(com_modalidades)
    repo.gravar("megasena", [concurso(3), concurso(1), concurso(2)])
    historico = repo.para_backtest("megasena")
    assert [c.numero for c in historico] == [1, 2, 3]
    assert historico[0].premio_para(6) == pytest.approx(4e7)
    assert historico[0].premio_para(5) == 0.0        # faixa ausente devolve zero


def test_historico_do_banco_roda_no_motor_de_backtest(com_modalidades):
    """Integração real: o que sai do banco entra no motor sem adaptação."""
    repo = p.RepositorioConcursos(com_modalidades)
    repo.gravar("megasena", [concurso(i) for i in range(1, 41)])
    historico = repo.para_backtest("megasena")
    particao = bt.particionar(historico)
    m = loterias.modalidade("megasena")
    a = bt.avaliar_periodo(m, bt.aleatoria_uniforme, particao.teste,
                           particao.desenvolvimento + particao.validacao,
                           n_simulacoes=50, semente=1)
    assert a.metricas.n_concursos == len(particao.teste)
    assert 0 <= a.percentil_vs_aleatorio <= 100


def test_apagar_modalidade_leva_concursos_e_faixas(com_modalidades):
    repo = p.RepositorioConcursos(com_modalidades)
    repo.gravar("megasena", [concurso(1)])
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    com_modalidades.delete(linha)
    com_modalidades.flush()
    assert com_modalidades.query(p.Draw).count() == 0
    assert com_modalidades.query(p.PrizeTier).count() == 0


# --------------------------------------------------------------------------- #
# Versionamento de estratégias (§10)
# --------------------------------------------------------------------------- #

def test_criar_estrategia_gera_versao_1(sessao):
    u = usuario(sessao)
    v = p.RepositorioEstrategias(sessao).criar(u.id, "minha", {"filtros": []})
    assert v.version == 1


def test_alteracao_cria_nova_versao_sem_apagar_a_anterior(sessao):
    u = usuario(sessao)
    repo = p.RepositorioEstrategias(sessao)
    v1 = repo.criar(u.id, "minha", {"pares": 3})
    v2 = repo.nova_versao(v1.strategy_id, {"pares": 4})
    assert (v1.version, v2.version) == (1, 2)
    versoes = repo.versoes(v1.strategy_id)
    assert [v.version for v in versoes] == [1, 2]
    assert versoes[0].parameters == {"pares": 3}, "a versão antiga foi alterada"


def test_versao_duplicada_e_recusada(sessao):
    u = usuario(sessao)
    v1 = p.RepositorioEstrategias(sessao).criar(u.id, "minha", {})
    sessao.add(p.StrategyVersion(strategy_id=v1.strategy_id, version=1, parameters={}))
    with pytest.raises(IntegrityError):
        sessao.flush()


def test_nova_versao_de_estrategia_inexistente_falha(sessao):
    with pytest.raises(KeyError):
        p.RepositorioEstrategias(sessao).nova_versao(999, {})


def test_nome_de_estrategia_e_unico_por_usuario(sessao):
    u = usuario(sessao)
    repo = p.RepositorioEstrategias(sessao)
    repo.criar(u.id, "igual", {})
    with pytest.raises(IntegrityError):
        repo.criar(u.id, "igual", {})


# --------------------------------------------------------------------------- #
# Backtests
# --------------------------------------------------------------------------- #

def _avaliacao(com_modalidades):
    repo = p.RepositorioConcursos(com_modalidades)
    repo.gravar("megasena", [concurso(i) for i in range(1, 41)])
    historico = repo.para_backtest("megasena")
    particao = bt.particionar(historico)
    m = loterias.modalidade("megasena")
    a = bt.avaliar_periodo(m, bt.aleatoria_uniforme, particao.teste,
                           particao.desenvolvimento + particao.validacao,
                           n_simulacoes=30, semente=4242)
    return particao, a


def test_salva_backtest_com_semente_e_particao(com_modalidades):
    u = usuario(com_modalidades)
    v = p.RepositorioEstrategias(com_modalidades).criar(u.id, "e", {})
    particao, a = _avaliacao(com_modalidades)
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    registro = p.RepositorioBacktests(com_modalidades).salvar(
        v.id, linha.id, particao, a, jogos_por_concurso=2)
    assert registro.seed == 4242
    assert registro.simulations == 30
    assert registro.dev_from == 1
    assert registro.test_to == 40
    assert registro.total_games == a.metricas.n_concursos * 2


def test_backtest_sem_semente_e_recusado_pelo_banco(com_modalidades):
    """Backtest que não se reproduz não se audita — o banco recusa a linha."""
    u = usuario(com_modalidades)
    v = p.RepositorioEstrategias(com_modalidades).criar(u.id, "e", {})
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    com_modalidades.add(p.Backtest(
        strategy_version_id=v.id, lottery_id=linha.id,
        dev_from=1, dev_to=10, test_from=11, test_to=20,
        games_per_draw=1, total_games=10, total_cost=50, gross_prizes=0,
        net_return=-50, roi=-1.0, random_baseline_roi=-1.0,
        percentile_vs_random=50.0, simulations=100, seed=None))
    with pytest.raises(IntegrityError):
        com_modalidades.flush()


def test_particao_fora_de_ordem_e_recusada_pelo_banco(com_modalidades):
    u = usuario(com_modalidades)
    v = p.RepositorioEstrategias(com_modalidades).criar(u.id, "e", {})
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    com_modalidades.add(p.Backtest(
        strategy_version_id=v.id, lottery_id=linha.id,
        dev_from=1, dev_to=30, test_from=10, test_to=20,   # teste dentro do dev
        games_per_draw=1, total_games=10, total_cost=50, gross_prizes=0,
        net_return=-50, roi=-1.0, random_baseline_roi=-1.0,
        percentile_vs_random=50.0, simulations=100, seed=1))
    with pytest.raises(IntegrityError):
        com_modalidades.flush()


def test_janela_de_walk_forward_nao_pode_invadir_o_treino(com_modalidades):
    u = usuario(com_modalidades)
    v = p.RepositorioEstrategias(com_modalidades).criar(u.id, "e", {})
    particao, a = _avaliacao(com_modalidades)
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    registro = p.RepositorioBacktests(com_modalidades).salvar(
        v.id, linha.id, particao, a, 1)
    com_modalidades.add(p.BacktestWindow(
        backtest_id=registro.id, train_to=50, test_from=10, test_to=20,
        total_cost=1, gross_prizes=0, roi=-1.0))
    with pytest.raises(IntegrityError):
        com_modalidades.flush()


def test_percentil_fora_de_faixa_e_recusado(com_modalidades):
    u = usuario(com_modalidades)
    v = p.RepositorioEstrategias(com_modalidades).criar(u.id, "e", {})
    linha = p.RepositorioModalidades(com_modalidades).por_codigo("megasena")
    com_modalidades.add(p.Backtest(
        strategy_version_id=v.id, lottery_id=linha.id,
        dev_from=1, dev_to=10, test_from=11, test_to=20,
        games_per_draw=1, total_games=10, total_cost=50, gross_prizes=0,
        net_return=-50, roi=-1.0, random_baseline_roi=-1.0,
        percentile_vs_random=150.0, simulations=100, seed=1))
    with pytest.raises(IntegrityError):
        com_modalidades.flush()


# --------------------------------------------------------------------------- #
# Auditoria e LGPD
# --------------------------------------------------------------------------- #

def test_auditoria_grava_e_lista(sessao):
    u = usuario(sessao)
    a = p.Auditoria(sessao)
    a.registrar("gerar_jogos", "generated_games", "1", user_id=u.id,
                details={"quantidade": 5}, ip_hash="abc")
    a.registrar("rodar_backtest", "backtests", "1", user_id=u.id)
    linhas = a.listar(user_id=u.id)
    assert len(linhas) == 2
    assert {l.action for l in linhas} == {"gerar_jogos", "rodar_backtest"}


def test_auditoria_nao_expoe_alteracao_nem_remocao(sessao):
    """Auditoria reescrevível não é auditoria."""
    metodos = {m for m in dir(p.Auditoria) if not m.startswith("_")}
    assert metodos == {"registrar", "listar"}
    for proibido in ("atualizar", "remover", "apagar", "editar", "update", "delete"):
        assert proibido not in metodos


def test_auditoria_guarda_hash_do_ip_e_nao_o_ip(sessao):
    linha = p.Auditoria(sessao).registrar("x", "y", ip_hash="deadbeef")
    colunas = {c.name for c in p.AuditLog.__table__.columns}
    assert "ip_hash" in colunas and "ip" not in colunas
    assert linha.ip_hash == "deadbeef"


def test_usuario_guarda_o_minimo_necessario(sessao):
    """Dado que não existe não vaza: sem nome, CPF, telefone ou endereço."""
    colunas = {c.name for c in p.User.__table__.columns}
    for proibido in ("name", "full_name", "cpf", "phone", "address", "birth_date"):
        assert proibido not in colunas
    assert "password_hash" in colunas and "password" not in colunas


def test_consentimentos_sao_datados(sessao):
    colunas = {c.name for c in p.User.__table__.columns}
    assert {"age_confirmed_at", "privacy_accepted_at", "deleted_at"} <= colunas


def test_apagar_usuario_leva_estrategias_e_jogos(sessao):
    u = usuario(sessao)
    p.RepositorioEstrategias(sessao).criar(u.id, "e", {})
    sessao.delete(u)
    sessao.flush()
    assert sessao.query(p.Strategy).count() == 0
    assert sessao.query(p.StrategyVersion).count() == 0


def test_email_precisa_estar_em_minusculas(sessao):
    sessao.add(p.User(id="x", email="Ana@Exemplo.com", password_hash="h"))
    with pytest.raises(IntegrityError):
        sessao.flush()


def test_email_e_unico(sessao):
    usuario(sessao, "a@b.com")
    sessao.add(p.User(id="outro", email="a@b.com", password_hash="h"))
    with pytest.raises(IntegrityError):
        sessao.flush()


# --------------------------------------------------------------------------- #
# Trava contra divergência entre modelos e schema.sql
# --------------------------------------------------------------------------- #

RESERVADAS = {"CONSTRAINT", "UNIQUE", "CHECK", "PRIMARY", "FOREIGN", "EXCLUDE", "LIKE"}


def _sem_comentarios(corpo: str) -> str:
    """Remove comentários ANTES de qualquer divisão.

    Ordem importa: um comentário pode conter vírgula ("depende dela, e
    ordenar destruiria"), e dividir primeiro partiria o comentário ao meio,
    fazendo a continuação parecer uma coluna chamada "e".
    """
    return "\n".join(linha.split("--")[0] for linha in corpo.splitlines())


def _partir_no_nivel_zero(corpo: str) -> list[str]:
    """Divide o corpo do CREATE TABLE nas vírgulas de nível zero.

    Dividir por linha não serve: um CHECK multilinha continua em linhas que
    começam com 'AND' ou ')', e essas seriam lidas como nomes de coluna.
    """
    partes, atual, profundidade = [], [], 0
    for caractere in corpo:
        if caractere == "(":
            profundidade += 1
        elif caractere == ")":
            profundidade -= 1
        if caractere == "," and profundidade == 0:
            partes.append("".join(atual))
            atual = []
            continue
        atual.append(caractere)
    if "".join(atual).strip():
        partes.append("".join(atual))
    return partes


def _tabelas_do_sql(texto: str) -> dict[str, set[str]]:
    """Extrai tabelas e colunas do DDL. Suficiente para detectar divergência."""
    tabelas: dict[str, set[str]] = {}
    for bloco in re.finditer(r"CREATE TABLE (\w+)\s*\((.*?)\n\);", texto, re.S):
        nome, corpo = bloco.group(1), bloco.group(2)
        colunas: set[str] = set()
        for fragmento in _partir_no_nivel_zero(_sem_comentarios(corpo)):
            limpo = fragmento.strip()
            if not limpo:
                continue
            primeira = limpo.split()[0]
            if primeira.upper() in RESERVADAS:
                continue
            colunas.add(primeira)
        tabelas[nome] = colunas
    return tabelas


def test_o_parser_de_ddl_ignora_restricoes_multilinha():
    """Sanidade do parser: sem isso, a trava de divergência daria falso alarme."""
    ddl = """CREATE TABLE exemplo (
    id       BIGSERIAL PRIMARY KEY,
    -- Comentário com vírgula, que já quebrou este parser uma vez.
    valor    INTEGER NOT NULL,  -- comentário à direita
    CONSTRAINT faixa CHECK (
        valor > 0
        AND valor < 10
    ),
    UNIQUE (id, valor)
);"""
    assert _tabelas_do_sql(ddl) == {"exemplo": {"id", "valor"}}


def test_schema_sql_nao_divergiu_dos_modelos():
    """Modelos são a fonte de verdade; o SQL é referência. Não podem divergir.

    Sem esta trava, uma coluna acrescentada ao modelo e esquecida no SQL só
    apareceria na migração de produção, meses depois.
    """
    caminho = RAIZ / "banco" / "schema.sql"
    assert caminho.exists(), "banco/schema.sql sumiu"
    do_sql = _tabelas_do_sql(caminho.read_text(encoding="utf-8"))
    dos_modelos = {t.name: {c.name for c in t.columns} for t in p.Base.metadata.tables.values()}

    faltando_no_sql = set(dos_modelos) - set(do_sql)
    sobrando_no_sql = set(do_sql) - set(dos_modelos)
    assert not faltando_no_sql, f"tabelas no modelo e ausentes no schema.sql: {faltando_no_sql}"
    assert not sobrando_no_sql, f"tabelas no schema.sql e ausentes no modelo: {sobrando_no_sql}"

    for tabela, colunas_modelo in dos_modelos.items():
        colunas_sql = do_sql[tabela]
        assert colunas_modelo == colunas_sql, (
            f"divergência em {tabela}: "
            f"só no modelo={sorted(colunas_modelo - colunas_sql)}, "
            f"só no SQL={sorted(colunas_sql - colunas_modelo)}"
        )
