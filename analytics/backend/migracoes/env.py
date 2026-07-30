"""Ambiente do Alembic.

A URL do banco vem do ambiente (`DATABASE_URL`), não do `alembic.ini`. Deixar
credencial em arquivo versionado é o caminho mais comum para vazá-la, e a mesma
migração precisa rodar em máquinas diferentes sem editar arquivo.

Os metadados vêm de `lab.persistencia.Base` — a mesma fonte de verdade que a
aplicação usa. É isso que permite ao teste comparar o esquema produzido pelas
migrações com o dos modelos e falhar quando divergirem: migração que não
acompanha o modelo é pior que migração nenhuma, porque dá a impressão de que o
esquema está versionado.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lab.persistencia import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

url = os.getenv("DATABASE_URL")
if url:
    # '%' tem significado no ConfigParser; escapar evita quebra com senha que o contenha.
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))

target_metadata = Base.metadata


def executar_offline() -> None:
    """Gera o SQL sem conectar — para revisão antes de aplicar em produção."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def executar_online() -> None:
    conexao_existente = config.attributes.get("connection", None)
    if conexao_existente is not None:
        # Caminho dos testes: reaproveita a conexão aberta, o que permite migrar
        # um SQLite em memória — banco que morre junto com a conexão.
        context.configure(
            connection=conexao_existente,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=conexao_existente.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    conectavel = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with conectavel.connect() as conexao:
        context.configure(
            connection=conexao,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=conexao.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    executar_offline()
else:
    executar_online()
