-- Loteria Analytics Brasil — esquema PostgreSQL 16
--
-- As restrições aqui não são decoração: várias delas existem para tornar
-- impossível, no banco, um erro que seria invisível na aplicação.
--   * backtests.seed é NOT NULL      -> backtest sem semente não pode ser auditado
--   * UNIQUE(lottery_id, contest_number) -> duplicidade de concurso é impossível
--   * price_history por vigência     -> custo histórico não pode usar preço de hoje
--   * audit_log sem UPDATE/DELETE    -> auditoria reescrevível não é auditoria
--
-- Convenção: identificadores em inglês (conforme a especificação), comentários
-- em português.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid, crypt

-- ===========================================================================
-- Catálogo de modalidades
-- ===========================================================================

CREATE TABLE lotteries (
    id               SMALLSERIAL PRIMARY KEY,
    code             TEXT        NOT NULL UNIQUE,
    name             TEXT        NOT NULL,
    -- 'dezenas' | 'composta' (dezenas + complemento) | 'colunas' (Super Sete)
    format           TEXT        NOT NULL
        CHECK (format IN ('dezenas', 'composta', 'colunas')),
    minimum_number   SMALLINT    NOT NULL,
    maximum_number   SMALLINT    NOT NULL,
    numbers_drawn    SMALLINT    NOT NULL CHECK (numbers_drawn > 0),
    minimum_bet_size SMALLINT    NOT NULL CHECK (minimum_bet_size > 0),
    maximum_bet_size SMALLINT    NOT NULL,
    active           BOOLEAN     NOT NULL DEFAULT TRUE,
    notes            TEXT        NOT NULL DEFAULT '',
    last_updated     TIMESTAMPTZ,
    CONSTRAINT universo_coerente CHECK (maximum_number > minimum_number),
    CONSTRAINT aposta_coerente   CHECK (maximum_bet_size >= minimum_bet_size)
);

-- Preço por vigência. Tabela, e não coluna: aplicar o preço de hoje a um
-- concurso de 2019 infla o custo e produz um ROI falso no histórico inteiro.
CREATE TABLE price_history (
    id            BIGSERIAL PRIMARY KEY,
    lottery_id    SMALLINT NOT NULL REFERENCES lotteries(id) ON DELETE CASCADE,
    valid_from    DATE     NOT NULL,
    bet_price     NUMERIC(10, 2) NOT NULL CHECK (bet_price > 0),
    source        TEXT     NOT NULL DEFAULT 'caixa',
    UNIQUE (lottery_id, valid_from)
);

-- ===========================================================================
-- Histórico de concursos
-- ===========================================================================

CREATE TABLE draws (
    id              BIGSERIAL PRIMARY KEY,
    lottery_id      SMALLINT   NOT NULL REFERENCES lotteries(id) ON DELETE CASCADE,
    contest_number  INTEGER    NOT NULL CHECK (contest_number > 0),
    draw_date       DATE       NOT NULL,
    -- Array preserva a ORDEM: o Super Sete depende dela, e ordenar destruiria
    -- o resultado. Para as demais modalidades gravamos já ordenado.
    drawn_numbers   SMALLINT[] NOT NULL CHECK (array_length(drawn_numbers, 1) > 0),
    accumulated     BOOLEAN    NOT NULL DEFAULT FALSE,
    estimated_prize NUMERIC(16, 2),
    total_revenue   NUMERIC(16, 2),
    source          TEXT       NOT NULL,          -- 'caixa' | 'csv' | ...
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Duplicidade de concurso é impossível por construção.
    UNIQUE (lottery_id, contest_number)
);

CREATE INDEX draws_por_data      ON draws (lottery_id, draw_date);
CREATE INDEX draws_por_concurso  ON draws (lottery_id, contest_number DESC);

-- Faixas de rateio. Indexadas por número de acertos, nunca por posição na
-- lista: a CAIXA muda a ordem das faixas e a indexação posicional quebra
-- em silêncio.
CREATE TABLE prize_tiers (
    id               BIGSERIAL PRIMARY KEY,
    draw_id          BIGINT   NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    hits             SMALLINT NOT NULL CHECK (hits >= 0),
    winners          INTEGER  NOT NULL CHECK (winners >= 0),
    prize_per_winner NUMERIC(16, 2) NOT NULL CHECK (prize_per_winner >= 0),
    UNIQUE (draw_id, hits)
);

-- ===========================================================================
-- Usuários — mínimo armazenamento necessário (LGPD)
-- ===========================================================================
-- Guardamos e-mail e hash. Nada de nome, CPF, telefone ou endereço: o sistema
-- não precisa deles, e o dado que não existe não vaza.

CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- CITEXT seria melhor (comparação insensível a maiúsculas), mas exige a
    -- extensão. Com TEXT, a aplicação DEVE normalizar para minúsculas antes de
    -- gravar: sem isso, "Ana@x.com" e "ana@x.com" viram duas contas da mesma
    -- pessoa, e o defeito só aparece em produção. A restrição abaixo garante
    -- unicidade sobre o valor normalizado.
    email                TEXT        NOT NULL,
    password_hash        TEXT        NOT NULL,   -- Argon2id; nunca a senha
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Consentimentos explícitos e datados: sem data, não há prova de consentimento.
    age_confirmed_at     TIMESTAMPTZ,            -- maioridade 18+
    privacy_accepted_at  TIMESTAMPTZ,
    -- Exclusão de conta: marcamos e anonimizamos; o histórico agregado de
    -- backtests pode ser mantido sem vínculo com a pessoa.
    deleted_at           TIMESTAMPTZ,
    monthly_budget_limit NUMERIC(12, 2)          -- limite voluntário (§27)
        CHECK (monthly_budget_limit IS NULL OR monthly_budget_limit >= 0),
    CONSTRAINT users_email_minusculo CHECK (email = lower(email))
);

-- Unicidade sobre o e-mail normalizado.
CREATE UNIQUE INDEX users_email_unico ON users (email);

-- ===========================================================================
-- Estratégias — versionadas (§10: alteração cria nova versão)
-- ===========================================================================

CREATE TABLE strategies (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

-- O backtest aponta para a VERSÃO, não para a estratégia. Se apontasse para a
-- estratégia, editar um filtro tornaria todo resultado anterior irrastreável.
CREATE TABLE strategy_versions (
    id          BIGSERIAL PRIMARY KEY,
    strategy_id BIGINT   NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    version     INTEGER  NOT NULL CHECK (version > 0),
    parameters  JSONB    NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (strategy_id, version)
);

CREATE TABLE generated_games (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    strategy_version_id BIGINT   REFERENCES strategy_versions(id) ON DELETE SET NULL,
    lottery_id          SMALLINT NOT NULL REFERENCES lotteries(id),
    numbers             SMALLINT[] NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cost                NUMERIC(10, 2) NOT NULL CHECK (cost >= 0),
    validation_status   TEXT NOT NULL DEFAULT 'valid'
        CHECK (validation_status IN ('valid', 'invalid', 'pending'))
);

CREATE INDEX generated_games_por_usuario ON generated_games (user_id, generated_at DESC);

-- ===========================================================================
-- Backtests
-- ===========================================================================

CREATE TABLE backtests (
    id                  BIGSERIAL PRIMARY KEY,
    strategy_version_id BIGINT   NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
    lottery_id          SMALLINT NOT NULL REFERENCES lotteries(id),

    -- A partição é gravada como faixas de concurso, para ser reconstituível
    -- meses depois sem depender de percentuais nem do tamanho do histórico
    -- naquele momento.
    dev_from     INTEGER NOT NULL,
    dev_to       INTEGER NOT NULL,
    val_from     INTEGER,
    val_to       INTEGER,
    test_from    INTEGER NOT NULL,
    test_to      INTEGER NOT NULL,

    games_per_draw INTEGER NOT NULL CHECK (games_per_draw > 0),
    total_games    INTEGER NOT NULL CHECK (total_games >= 0),
    total_cost     NUMERIC(16, 2) NOT NULL CHECK (total_cost >= 0),
    gross_prizes   NUMERIC(16, 2) NOT NULL CHECK (gross_prizes >= 0),
    net_return     NUMERIC(16, 2) NOT NULL,
    roi            DOUBLE PRECISION NOT NULL,

    -- Comparação contra o aleatório
    random_baseline_roi   DOUBLE PRECISION NOT NULL,
    percentile_vs_random  DOUBLE PRECISION NOT NULL
        CHECK (percentile_vs_random BETWEEN 0 AND 100),
    simulations           INTEGER NOT NULL CHECK (simulations > 0),

    -- Estatística: nunca só o p-valor (§14)
    p_value          DOUBLE PRECISION,
    p_value_adjusted DOUBLE PRECISION,
    correction_method TEXT,
    hypotheses_tested INTEGER NOT NULL DEFAULT 1 CHECK (hypotheses_tested > 0),
    effect_size      DOUBLE PRECISION,
    ci_lower         DOUBLE PRECISION,
    ci_upper         DOUBLE PRECISION,
    confidence       DOUBLE PRECISION NOT NULL DEFAULT 0.95,

    overfitting_index DOUBLE PRECISION
        CHECK (overfitting_index IS NULL OR overfitting_index BETWEEN 0 AND 100),

    -- Sem semente não há reprodução, e sem reprodução não há auditoria.
    seed        BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT particao_cronologica CHECK (
        dev_from <= dev_to
        AND (val_from IS NULL OR (dev_to < val_from AND val_from <= val_to))
        AND test_from <= test_to
        AND test_from > COALESCE(val_to, dev_to)
    ),
    CONSTRAINT ic_coerente CHECK (
        ci_lower IS NULL OR ci_upper IS NULL OR ci_lower <= ci_upper
    )
);

CREATE INDEX backtests_por_versao ON backtests (strategy_version_id, created_at DESC);

-- Janelas do walk-forward (§11.5)
CREATE TABLE backtest_windows (
    id           BIGSERIAL PRIMARY KEY,
    backtest_id  BIGINT  NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
    train_to     INTEGER NOT NULL,
    test_from    INTEGER NOT NULL,
    test_to      INTEGER NOT NULL,
    total_cost   NUMERIC(16, 2) NOT NULL,
    gross_prizes NUMERIC(16, 2) NOT NULL,
    roi          DOUBLE PRECISION NOT NULL,
    CONSTRAINT janela_nao_invade_treino CHECK (train_to < test_from AND test_from <= test_to)
);

-- ===========================================================================
-- Importações e auditoria
-- ===========================================================================

CREATE TABLE import_runs (
    id            BIGSERIAL PRIMARY KEY,
    lottery_id    SMALLINT NOT NULL REFERENCES lotteries(id),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    source        TEXT NOT NULL,
    imported      INTEGER NOT NULL DEFAULT 0,
    duplicates    INTEGER NOT NULL DEFAULT 0,
    rejected      INTEGER NOT NULL DEFAULT 0,
    -- O que foi recusado e por quê. Recusa silenciosa esconde fonte quebrada.
    rejection_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Append-only. Sem UPDATE e sem DELETE — ver as regras abaixo.
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  TEXT,
    details    JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_hash    TEXT,                -- hash, não o IP: dado mínimo (LGPD)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_por_usuario ON audit_log (user_id, created_at DESC);

CREATE RULE audit_log_sem_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_sem_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Alternativa para users.email
-- ---------------------------------------------------------------------------
-- Se a extensão citext estiver disponível no ambiente de destino, ela é
-- preferível à combinação CHECK + índice usada acima, porque move a
-- normalização para o banco em vez de confiar na aplicação:
--
--   CREATE EXTENSION IF NOT EXISTS citext;
--   -- e então: email CITEXT NOT NULL UNIQUE  (dispensa users_email_minusculo)
--
-- O esquema acima foi escrito para rodar sem extensão nenhuma além de
-- pgcrypto, de propósito: um schema.sql que não executa é um schema que
-- ninguém testa.
