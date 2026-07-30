"""Testes das migrações.

O teste que dá sentido ao módulo é ``test_migracao_produz_o_mesmo_esquema_dos_modelos``:
aplica as migrações num banco limpo e compara o resultado com
``Base.metadata``. Migração que não acompanha o modelo é pior que migração
nenhuma — dá a impressão de que o esquema está versionado enquanto produção e
código divergem em silêncio.

Roda sobre a mesma ``TEST_DATABASE_URL`` do resto da suíte: SQLite por padrão,
PostgreSQL quando a variável estiver definida.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import inspect

from lab import persistencia as p

alembic = pytest.importorskip("alembic", reason="Alembic ausente")
from alembic.autogenerate import compare_metadata  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from alembic import command  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]


def configuracao(conexao) -> Config:
    """Config do Alembic reaproveitando uma conexão já aberta.

    Necessário para o SQLite em memória: o banco existe dentro da conexão e
    morreria se o Alembic abrisse a sua própria.
    """
    cfg = Config(str(RAIZ / "alembic.ini"))
    cfg.set_main_option("script_location", str(RAIZ / "migracoes"))
    cfg.attributes["connection"] = conexao
    return cfg


@pytest.fixture()
def banco_vazio():
    """Engine sem nenhuma tabela — as migrações é que devem criá-las."""
    motor = p.criar_engine(__import__("os").getenv(
        "TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:"))
    p.Base.metadata.drop_all(motor)
    with motor.connect() as conexao:
        if motor.dialect.name != "sqlite":
            conexao.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
            conexao.commit()
    yield motor
    motor.dispose()


# --------------------------------------------------------------------------- #

def test_ha_exatamente_uma_cabeca():
    """Duas cabeças significam ramos não mesclados: a próxima migração falha."""
    script = ScriptDirectory(str(RAIZ / "migracoes"))
    assert len(script.get_heads()) == 1, script.get_heads()


def test_upgrade_cria_todas_as_tabelas_dos_modelos(banco_vazio):
    with banco_vazio.connect() as conexao:
        command.upgrade(configuracao(conexao), "head")
        tabelas = set(inspect(conexao).get_table_names())
    esperadas = set(p.Base.metadata.tables)
    faltando = esperadas - tabelas
    assert not faltando, f"a migração não criou: {sorted(faltando)}"


def test_migracao_produz_o_mesmo_esquema_dos_modelos(banco_vazio):
    """A trava anti-divergência entre migração e modelo."""
    with banco_vazio.connect() as conexao:
        command.upgrade(configuracao(conexao), "head")
        contexto = MigrationContext.configure(conexao)
        diferencas = compare_metadata(contexto, p.Base.metadata)

    # O SQLite não reporta alguns detalhes (CHECK nomeado, por exemplo); o que
    # importa aqui é não haver tabela ou coluna sobrando nem faltando.
    relevantes = [
        d for d in diferencas
        if (isinstance(d, tuple) and d and str(d[0]).startswith(
            ("add_table", "remove_table", "add_column", "remove_column")))
    ]
    assert not relevantes, f"migração divergiu dos modelos: {relevantes}"


def test_downgrade_remove_tudo(banco_vazio):
    """Migração sem volta não pode ser revertida em produção com segurança."""
    with banco_vazio.connect() as conexao:
        cfg = configuracao(conexao)
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        restantes = set(inspect(conexao).get_table_names()) - {"alembic_version"}
    assert restantes == set(), f"sobraram tabelas após o downgrade: {sorted(restantes)}"


def test_migracao_e_idempotente_ate_a_cabeca(banco_vazio):
    with banco_vazio.connect() as conexao:
        cfg = configuracao(conexao)
        command.upgrade(cfg, "head")
        command.upgrade(cfg, "head")      # segunda vez não deve fazer nada
        tabelas = set(inspect(conexao).get_table_names())
    assert set(p.Base.metadata.tables) <= tabelas


def test_nenhum_tipo_ficou_sem_prefixo_sa():
    """O autogenerate emite `Text()` e `SmallInteger()` sem `sa.` dentro de
    ARRAY e JSONB, e a migração quebra com NameError só na hora de aplicar.
    Este teste pega isso antes de chegar a produção."""
    import re

    for arquivo in (RAIZ / "migracoes" / "versions").glob("*.py"):
        fonte = arquivo.read_text(encoding="utf-8")
        sem_prefixo = re.findall(
            r"(?<![\w.])(Text|SmallInteger|Integer|String|Boolean|DateTime|"
            r"Numeric|Date|Float)\(\)", fonte)
        assert not sem_prefixo, f"{arquivo.name}: tipos sem 'sa.': {set(sem_prefixo)}"


def test_url_do_banco_nao_esta_versionada():
    """Credencial em arquivo versionado é a forma mais comum de vazá-la."""
    ini = (RAIZ / "alembic.ini").read_text(encoding="utf-8")
    linha = next(l for l in ini.splitlines() if l.startswith("sqlalchemy.url"))
    assert "@" not in linha, f"parece haver credencial no alembic.ini: {linha}"
    assert linha.strip().endswith(".db"), linha
