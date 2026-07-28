"""Camada de persistência.

**Os modelos aqui são a fonte de verdade do runtime.** `banco/schema.sql`
continua existindo como o DDL PostgreSQL de referência, comentado — e há um
teste (`test_schema_sql_nao_divergiu_dos_modelos`) que compara tabela a tabela
e coluna a coluna. Duas fontes de verdade sem trava viram divergência
silenciosa: alguém acrescenta uma coluna no modelo, esquece o SQL, e a
migração de produção quebra meses depois.

Tipos portáteis por variante: `ARRAY(SMALLINT)` e `JSONB` no PostgreSQL,
`JSON` no SQLite. Os testes rodam em SQLite em memória — sem isso a suíte
exigiria um banco no ar e ninguém a rodaria antes de commitar.

O que o banco garante sozinho, e por quê:

* `UNIQUE(lottery_id, contest_number)` — duplicidade de concurso impossível.
* `backtests.seed NOT NULL` — backtest sem semente não se audita.
* `strategy_versions` — o backtest aponta para a *versão*; editar um filtro não
  falsifica resultados antigos.
* `audit_log` sem método de alteração no repositório — auditoria reescrevível
  não é auditoria. No PostgreSQL há também `RULE` bloqueando UPDATE/DELETE.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy import (
    JSON, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint, create_engine, func, select,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

from . import backtest as bt
from .loterias import MODALIDADES, Modalidade

#: Lista de inteiros: nativo no PostgreSQL, JSON no SQLite.
NUMEROS = ARRAY(SmallInteger()).with_variant(JSON(), "sqlite")
JSON_PORTATIL = JSONB().with_variant(JSON(), "sqlite")


def agora() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# --------------------------------------------------------------------------- #
# Catálogo
# --------------------------------------------------------------------------- #

class Lottery(Base):
    __tablename__ = "lotteries"

    # Integer, não SmallInteger: o SQLite só autoincrementa INTEGER PRIMARY KEY,
    # e um tipo que só funciona em um dos dois bancos não é portátil.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(Text, nullable=False)
    minimum_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    maximum_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    numbers_drawn: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    minimum_bet_size: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    maximum_bet_size: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    prices: Mapped[list["PriceHistory"]] = relationship(
        back_populates="lottery", cascade="all, delete-orphan")
    draws: Mapped[list["Draw"]] = relationship(
        back_populates="lottery", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("maximum_number > minimum_number", name="universo_coerente"),
        CheckConstraint("maximum_bet_size >= minimum_bet_size", name="aposta_coerente"),
    )


class PriceHistory(Base):
    """Preço por vigência. Tabela e não coluna: aplicar o preço de hoje a um
    concurso de 2019 infla o custo e falsifica o ROI do histórico inteiro."""

    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lottery_id: Mapped[int] = mapped_column(
        ForeignKey("lotteries.id", ondelete="CASCADE"), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    bet_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="caixa")

    lottery: Mapped[Lottery] = relationship(back_populates="prices")

    __table_args__ = (
        UniqueConstraint("lottery_id", "valid_from", name="preco_unico_por_vigencia"),
        CheckConstraint("bet_price > 0", name="preco_positivo"),
    )


class Draw(Base):
    __tablename__ = "draws"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lottery_id: Mapped[int] = mapped_column(
        ForeignKey("lotteries.id", ondelete="CASCADE"), nullable=False)
    contest_number: Mapped[int] = mapped_column(Integer, nullable=False)
    draw_date: Mapped[date] = mapped_column(Date, nullable=False)
    #: Array preserva a ORDEM — o Super Sete depende dela.
    drawn_numbers = mapped_column(NUMEROS, nullable=False)
    accumulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    estimated_prize: Mapped[float | None] = mapped_column(Numeric(16, 2))
    total_revenue: Mapped[float | None] = mapped_column(Numeric(16, 2))
    source: Mapped[str] = mapped_column(Text, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)

    lottery: Mapped[Lottery] = relationship(back_populates="draws")
    tiers: Mapped[list["PrizeTier"]] = relationship(
        back_populates="draw", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("lottery_id", "contest_number", name="concurso_unico"),
        CheckConstraint("contest_number > 0", name="concurso_positivo"),
        Index("draws_por_concurso", "lottery_id", "contest_number"),
    )


class PrizeTier(Base):
    """Indexada por acertos, nunca por posição na lista: a CAIXA muda a ordem
    das faixas e a indexação posicional quebraria em silêncio."""

    __tablename__ = "prize_tiers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    draw_id: Mapped[int] = mapped_column(
        ForeignKey("draws.id", ondelete="CASCADE"), nullable=False)
    hits: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    winners: Mapped[int] = mapped_column(Integer, nullable=False)
    prize_per_winner: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)

    draw: Mapped[Draw] = relationship(back_populates="tiers")

    __table_args__ = (
        UniqueConstraint("draw_id", "hits", name="faixa_unica_por_concurso"),
        CheckConstraint("hits >= 0 AND winners >= 0 AND prize_per_winner >= 0",
                        name="faixa_nao_negativa"),
    )


# --------------------------------------------------------------------------- #
# Usuários e estratégias
# --------------------------------------------------------------------------- #

class User(Base):
    """Mínimo armazenamento necessário (LGPD): e-mail e hash, nada além.
    O dado que não existe não vaza."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)
    age_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    monthly_budget_limit: Mapped[float | None] = mapped_column(Numeric(12, 2))

    __table_args__ = (
        CheckConstraint("email = lower(email)", name="users_email_minusculo"),
    )


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)

    versions: Mapped[list["StrategyVersion"]] = relationship(
        back_populates="strategy", cascade="all, delete-orphan",
        order_by="StrategyVersion.version")

    __table_args__ = (UniqueConstraint("user_id", "name", name="estrategia_unica_por_usuario"),)


class StrategyVersion(Base):
    """O backtest aponta para a VERSÃO. Se apontasse para a estratégia, editar
    um filtro tornaria irrastreável todo resultado anterior."""

    __tablename__ = "strategy_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(
        ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    parameters = mapped_column(JSON_PORTATIL, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)

    strategy: Mapped[Strategy] = relationship(back_populates="versions")

    __table_args__ = (
        UniqueConstraint("strategy_id", "version", name="versao_unica"),
        CheckConstraint("version > 0", name="versao_positiva"),
    )


class GeneratedGame(Base):
    __tablename__ = "generated_games"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    strategy_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="SET NULL"))
    lottery_id: Mapped[int] = mapped_column(ForeignKey("lotteries.id"), nullable=False)
    numbers = mapped_column(NUMEROS, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)
    cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    validation_status: Mapped[str] = mapped_column(Text, nullable=False, default="valid")


class Backtest(Base):
    __tablename__ = "backtests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    strategy_version_id: Mapped[int] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="CASCADE"), nullable=False)
    lottery_id: Mapped[int] = mapped_column(ForeignKey("lotteries.id"), nullable=False)

    dev_from: Mapped[int] = mapped_column(Integer, nullable=False)
    dev_to: Mapped[int] = mapped_column(Integer, nullable=False)
    val_from: Mapped[int | None] = mapped_column(Integer)
    val_to: Mapped[int | None] = mapped_column(Integer)
    test_from: Mapped[int] = mapped_column(Integer, nullable=False)
    test_to: Mapped[int] = mapped_column(Integer, nullable=False)

    games_per_draw: Mapped[int] = mapped_column(Integer, nullable=False)
    total_games: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cost: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    gross_prizes: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    net_return: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    roi: Mapped[float] = mapped_column(nullable=False)

    random_baseline_roi: Mapped[float] = mapped_column(nullable=False)
    percentile_vs_random: Mapped[float] = mapped_column(nullable=False)
    simulations: Mapped[int] = mapped_column(Integer, nullable=False)

    p_value: Mapped[float | None] = mapped_column()
    p_value_adjusted: Mapped[float | None] = mapped_column()
    correction_method: Mapped[str | None] = mapped_column(Text)
    hypotheses_tested: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    effect_size: Mapped[float | None] = mapped_column()
    ci_lower: Mapped[float | None] = mapped_column()
    ci_upper: Mapped[float | None] = mapped_column()
    confidence: Mapped[float] = mapped_column(nullable=False, default=0.95)

    overfitting_index: Mapped[float | None] = mapped_column()

    #: Sem semente não há reprodução; sem reprodução não há auditoria.
    seed: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)

    windows: Mapped[list["BacktestWindow"]] = relationship(
        back_populates="backtest", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "dev_from <= dev_to "
            "AND (val_from IS NULL OR (dev_to < val_from AND val_from <= val_to)) "
            "AND test_from <= test_to "
            "AND test_from > COALESCE(val_to, dev_to)",
            name="particao_cronologica"),
        CheckConstraint("percentile_vs_random BETWEEN 0 AND 100", name="percentil_valido"),
        CheckConstraint("simulations > 0", name="simulacoes_positivas"),
    )


class BacktestWindow(Base):
    __tablename__ = "backtest_windows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    backtest_id: Mapped[int] = mapped_column(
        ForeignKey("backtests.id", ondelete="CASCADE"), nullable=False)
    train_to: Mapped[int] = mapped_column(Integer, nullable=False)
    test_from: Mapped[int] = mapped_column(Integer, nullable=False)
    test_to: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cost: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    gross_prizes: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    roi: Mapped[float] = mapped_column(nullable=False)

    backtest: Mapped[Backtest] = relationship(back_populates="windows")

    __table_args__ = (
        CheckConstraint("train_to < test_from AND test_from <= test_to",
                        name="janela_nao_invade_treino"),
    )


class ImportRun(Base):
    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lottery_id: Mapped[int] = mapped_column(ForeignKey("lotteries.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(Text, nullable=False)
    imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejection_log = mapped_column(JSON_PORTATIL, nullable=False, default=list)


class AuditLog(Base):
    """Append-only. O repositório não expõe alteração nem remoção; no
    PostgreSQL há ainda RULE bloqueando UPDATE e DELETE."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(Text)
    details = mapped_column(JSON_PORTATIL, nullable=False, default=dict)
    ip_hash: Mapped[str | None] = mapped_column(Text)   # hash, nunca o IP (LGPD)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=agora)


# --------------------------------------------------------------------------- #
# Repositórios
# --------------------------------------------------------------------------- #

class RepositorioModalidades:
    def __init__(self, sessao: Session):
        self.s = sessao

    def sincronizar_do_registro(self) -> int:
        """Carrega `lab.loterias.MODALIDADES` no banco, com o histórico de preços.

        O registro em código continua sendo a fonte de verdade das regras; o
        banco é cópia consultável. Reexecutar é seguro (idempotente).
        """
        gravadas = 0
        for codigo, m in MODALIDADES.items():
            linha = self.por_codigo(codigo)
            if linha is None:
                linha = Lottery(code=codigo)
                self.s.add(linha)
            linha.name = m.nome
            linha.format = m.formato
            linha.minimum_number = m.numero_minimo
            linha.maximum_number = m.numero_maximo
            linha.numbers_drawn = m.dezenas_sorteadas
            linha.minimum_bet_size = m.aposta_minima
            linha.maximum_bet_size = m.aposta_maxima
            linha.active = m.ativa
            linha.notes = m.observacao
            linha.last_updated = agora()
            self.s.flush()
            vigencias = {p.valid_from for p in linha.prices}
            for quando, preco in m.precos:
                if quando not in vigencias:
                    self.s.add(PriceHistory(lottery_id=linha.id, valid_from=quando,
                                            bet_price=preco))
            gravadas += 1
        self.s.flush()
        return gravadas

    def por_codigo(self, codigo: str) -> Lottery | None:
        return self.s.scalar(select(Lottery).where(Lottery.code == codigo))

    def preco_vigente(self, codigo: str, quando: date) -> float | None:
        linha = self.por_codigo(codigo)
        if linha is None:
            return None
        preco = self.s.scalar(
            select(PriceHistory.bet_price)
            .where(PriceHistory.lottery_id == linha.id, PriceHistory.valid_from <= quando)
            .order_by(PriceHistory.valid_from.desc()).limit(1))
        return float(preco) if preco is not None else None


class RepositorioConcursos:
    def __init__(self, sessao: Session):
        self.s = sessao

    def ultimo_concurso(self, codigo: str) -> int:
        """0 quando não há nada importado — é o que a importação incremental espera."""
        linha = RepositorioModalidades(self.s).por_codigo(codigo)
        if linha is None:
            return 0
        return self.s.scalar(
            select(func.coalesce(func.max(Draw.contest_number), 0))
            .where(Draw.lottery_id == linha.id)) or 0

    def gravar(self, codigo: str, importados: Iterable) -> tuple[int, int]:
        """Grava concursos novos. Devolve (gravados, duplicados_ignorados).

        A deduplicação é feita aqui **e** garantida pela restrição do banco:
        checar só na aplicação deixa passar corrida entre dois workers.
        """
        linha = RepositorioModalidades(self.s).por_codigo(codigo)
        if linha is None:
            raise KeyError(f"modalidade {codigo!r} não sincronizada no banco")
        existentes = set(self.s.scalars(
            select(Draw.contest_number).where(Draw.lottery_id == linha.id)))
        gravados = duplicados = 0
        for c in importados:
            if c.concurso in existentes:
                duplicados += 1
                continue
            existentes.add(c.concurso)
            draw = Draw(
                lottery_id=linha.id, contest_number=c.concurso, draw_date=c.data,
                drawn_numbers=list(c.dezenas), accumulated=c.acumulado,
                estimated_prize=c.premio_estimado or None,
                total_revenue=c.arrecadacao or None, source=c.origem)
            self.s.add(draw)
            self.s.flush()
            for acertos, (ganhadores, premio) in (c.rateio or {}).items():
                self.s.add(PrizeTier(draw_id=draw.id, hits=acertos,
                                     winners=ganhadores, prize_per_winner=premio))
            gravados += 1
        self.s.flush()
        return gravados, duplicados

    def para_backtest(self, codigo: str) -> list[bt.Concurso]:
        """Devolve o histórico no formato que o motor de backtest consome.

        Ordenado por concurso: o motor depende da ordem cronológica, e ordenar
        aqui evita que cada chamador precise lembrar disso.
        """
        linha = RepositorioModalidades(self.s).por_codigo(codigo)
        if linha is None:
            return []
        draws = self.s.scalars(
            select(Draw).where(Draw.lottery_id == linha.id)
            .order_by(Draw.contest_number)).all()
        saida = []
        for d in draws:
            rateio = {t.hits: (t.winners, float(t.prize_per_winner)) for t in d.tiers}
            saida.append(bt.Concurso(numero=d.contest_number, data=d.draw_date,
                                     dezenas=tuple(d.drawn_numbers), rateio=rateio))
        return saida


class RepositorioEstrategias:
    def __init__(self, sessao: Session):
        self.s = sessao

    def criar(self, user_id: str, nome: str, parametros: dict,
              descricao: str = "") -> StrategyVersion:
        estrategia = Strategy(user_id=user_id, name=nome, description=descricao)
        self.s.add(estrategia)
        self.s.flush()
        versao = StrategyVersion(strategy_id=estrategia.id, version=1,
                                 parameters=parametros)
        self.s.add(versao)
        self.s.flush()
        return versao

    def nova_versao(self, strategy_id: int, parametros: dict) -> StrategyVersion:
        """Alteração cria versão nova (§10). Nunca sobrescreve a anterior —
        senão os backtests já executados deixariam de ser rastreáveis."""
        ultima = self.s.scalar(
            select(func.coalesce(func.max(StrategyVersion.version), 0))
            .where(StrategyVersion.strategy_id == strategy_id)) or 0
        if ultima == 0:
            raise KeyError(f"estratégia {strategy_id} não existe")
        versao = StrategyVersion(strategy_id=strategy_id, version=ultima + 1,
                                 parameters=parametros)
        self.s.add(versao)
        self.s.flush()
        return versao

    def versoes(self, strategy_id: int) -> list[StrategyVersion]:
        return list(self.s.scalars(
            select(StrategyVersion).where(StrategyVersion.strategy_id == strategy_id)
            .order_by(StrategyVersion.version)))


class RepositorioBacktests:
    def __init__(self, sessao: Session):
        self.s = sessao

    def salvar(self, strategy_version_id: int, lottery_id: int,
               particao: bt.Particao, avaliacao: bt.Avaliacao,
               jogos_por_concurso: int, janelas: Sequence[bt.JanelaWalkForward] = (),
               ajuste_multiplo=None, indice_overfitting: float | None = None) -> Backtest:
        m = avaliacao.metricas
        registro = Backtest(
            strategy_version_id=strategy_version_id, lottery_id=lottery_id,
            dev_from=particao.desenvolvimento[0].numero,
            dev_to=particao.desenvolvimento[-1].numero,
            val_from=particao.validacao[0].numero if particao.validacao else None,
            val_to=particao.validacao[-1].numero if particao.validacao else None,
            test_from=particao.teste[0].numero, test_to=particao.teste[-1].numero,
            games_per_draw=jogos_por_concurso,
            total_games=m.n_concursos * jogos_por_concurso,
            total_cost=m.custo_total, gross_prizes=m.premio_bruto,
            net_return=m.resultado_liquido, roi=m.roi,
            random_baseline_roi=0.0,
            percentile_vs_random=avaliacao.percentil_vs_aleatorio,
            simulations=avaliacao.n_simulacoes,
            p_value=avaliacao.teste.p_valor,
            effect_size=avaliacao.teste.tamanho_efeito,
            ci_lower=avaliacao.teste.ic_inferior,
            ci_upper=avaliacao.teste.ic_superior,
            confidence=avaliacao.teste.confianca,
            overfitting_index=indice_overfitting,
            seed=avaliacao.semente,
        )
        if ajuste_multiplo is not None:
            registro.correction_method = ajuste_multiplo.metodo
            registro.hypotheses_tested = ajuste_multiplo.n_hipoteses
            registro.p_value_adjusted = min(ajuste_multiplo.ajustados)
        self.s.add(registro)
        self.s.flush()
        for j in janelas:
            self.s.add(BacktestWindow(
                backtest_id=registro.id, train_to=j.treino_ate,
                test_from=j.testou_de, test_to=j.testou_ate,
                total_cost=j.metricas.custo_total, gross_prizes=j.metricas.premio_bruto,
                roi=j.metricas.roi))
        self.s.flush()
        return registro


class Auditoria:
    """Só grava. Não há método de alteração nem de remoção, de propósito."""

    def __init__(self, sessao: Session):
        self.s = sessao

    def registrar(self, action: str, entity: str, entity_id: str | None = None,
                  user_id: str | None = None, details: dict | None = None,
                  ip_hash: str | None = None) -> AuditLog:
        linha = AuditLog(user_id=user_id, action=action, entity=entity,
                         entity_id=entity_id, details=details or {}, ip_hash=ip_hash)
        self.s.add(linha)
        self.s.flush()
        return linha

    def listar(self, user_id: str | None = None, limite: int = 100) -> list[AuditLog]:
        consulta = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limite)
        if user_id is not None:
            consulta = consulta.where(AuditLog.user_id == user_id)
        return list(self.s.scalars(consulta))


# --------------------------------------------------------------------------- #
# Sessão
# --------------------------------------------------------------------------- #

def criar_engine(url: str = "sqlite+pysqlite:///:memory:", echo: bool = False):
    """SQLite em memória por padrão (testes); PostgreSQL em produção.

    ``PRAGMA foreign_keys=ON`` é obrigatório no SQLite: sem ele as chaves
    estrangeiras são aceitas e ignoradas, e o teste de CASCADE passaria sem
    nada estar acontecendo.
    """
    engine = create_engine(url, echo=echo)
    if engine.dialect.name == "sqlite":
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def _ativar_fk(conexao, _registro):  # noqa: ANN001
            cursor = conexao.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def criar_tabelas(engine) -> None:
    Base.metadata.create_all(engine)
