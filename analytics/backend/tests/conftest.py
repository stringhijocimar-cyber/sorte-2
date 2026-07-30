"""Configuração comum dos testes.

A suíte roda contra **dois bancos**. Sem variável de ambiente usa SQLite em
memória, que é o padrão e não exige infraestrutura — é o que faz a suíte ser
executada antes de cada commit. Com ``TEST_DATABASE_URL`` apontando para um
PostgreSQL, os mesmos testes rodam lá.

O motivo de existirem os dois: os tipos são portáteis por variante
(``ARRAY``/``JSONB`` no PostgreSQL, ``JSON`` no SQLite), e portabilidade que
nunca foi exercitada nos dois lados é suposição, não fato. Um `CHECK` que o
SQLite aceita e o PostgreSQL recusa — ou o contrário — só aparece executando.

    # padrão, sem infraestrutura
    python3 -m pytest -q

    # contra PostgreSQL de verdade
    TEST_DATABASE_URL=postgresql+psycopg://lab@127.0.0.1:5433/loteria_teste \\
        python3 -m pytest -q
"""

from __future__ import annotations

import os

import pytest

from lab import persistencia as p

URL_TESTE = os.getenv("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")


def motor_de_teste():
    """Engine limpo para um teste.

    No SQLite em memória cada engine já nasce vazio. No PostgreSQL o banco
    persiste entre testes, então as tabelas são derrubadas e recriadas — sem
    isso, o segundo teste encontraria as linhas do primeiro e as falhas seriam
    intermitentes e difíceis de reproduzir.
    """
    engine = p.criar_engine(URL_TESTE)
    if engine.dialect.name != "sqlite":
        p.Base.metadata.drop_all(engine)
    p.criar_tabelas(engine)
    return engine


@pytest.fixture()
def engine():
    motor = motor_de_teste()
    yield motor
    motor.dispose()


def pytest_report_header(config) -> str:  # noqa: ARG001
    return f"banco de testes: {URL_TESTE}"
