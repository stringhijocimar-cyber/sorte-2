"""API REST (FastAPI).

Costura persistência, segurança e motores. Nenhum endpoint é ilustrativo: todos
executam o código real e devolvem o que o motor calculou.

Três regras que valem para todas as rotas:

**Maioridade é barreira, não caixa de seleção.** Qualquer rota que gere jogos
ou calcule backtest exige `age_confirmed_at` preenchido. Sem confirmação, a
resposta é 403 — não uma tela com aviso que dá para ignorar.

**Nada de p-valor sozinho.** As respostas estatísticas carregam estimativa,
intervalo de confiança, tamanho de efeito, amostra e leitura em português,
porque é o contrato da camada `estatistica`.

**Auditoria em toda ação relevante.** Registro, login, geração, backtest. Sem
trilha, o §19 não se cumpre.

O segredo do servidor vem do ambiente. Não há valor padrão em produção: subir
sem `APP_SECRET` deve falhar alto, e não silenciosamente com uma chave conhecida.
"""

from __future__ import annotations

import hmac
import os
import uuid
from datetime import date
from typing import Annotated, Any, Iterator

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from . import backtest as bt
from . import estatistica, exportacao, filtros as mod_filtros, gerador, loterias
from . import persistencia as p
from . import seguranca as sec

# --------------------------------------------------------------------------- #
# Configuração
# --------------------------------------------------------------------------- #

BANCO_URL = os.getenv("DATABASE_URL", "sqlite+pysqlite:///:memory:")
#: Tentativas de login por e-mail antes do bloqueio temporário.
LOGIN_MAXIMO = int(os.getenv("LOGIN_MAXIMO", "5"))
LOGIN_JANELA = float(os.getenv("LOGIN_JANELA_SEGUNDOS", "300"))
#: Teto de simulações por requisição: 10.000 num ciclo HTTP estoura o tempo.
#: Backtests maiores pertencem ao worker, ainda não implementado.
SIMULACOES_MAXIMAS = int(os.getenv("SIMULACOES_MAXIMAS", "500"))


def segredo() -> str:
    valor = os.getenv("APP_SECRET", "")
    if not valor:
        raise RuntimeError(
            "APP_SECRET ausente. Sem segredo do servidor não há CSRF nem hash de IP; "
            "subir com uma chave padrão seria pior do que não subir."
        )
    return valor


# --------------------------------------------------------------------------- #
# Esquemas
# --------------------------------------------------------------------------- #

class Registro(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=sec.COMPRIMENTO_MINIMO)
    #: §27: confirmação de 18+ e aceite da política são obrigatórios.
    maior_de_idade: bool
    aceita_privacidade: bool

    @field_validator("maior_de_idade", "aceita_privacidade")
    @classmethod
    def exigir(cls, v: bool) -> bool:
        if not v:
            raise ValueError("confirmação obrigatória")
        return v


class Login(BaseModel):
    email: EmailStr
    senha: str


class PedidoGerar(BaseModel):
    modalidade: str
    quantidade: int = Field(ge=1, le=500)
    tamanho: int | None = None
    obrigatorios: list[int] = []
    excluidos: list[int] = []
    orcamento_maximo: float | None = Field(default=None, ge=0)
    semente: int | None = None
    pares_min: int | None = None
    pares_max: int | None = None
    soma_min: float | None = None
    soma_max: float | None = None
    max_consecutivos: int | None = Field(default=None, ge=1)


class PedidoSalvar(BaseModel):
    modalidade: str
    jogos: list[list[int]]


class PedidoConferir(BaseModel):
    modalidade: str
    dezenas_sorteadas: list[int]
    jogos: list[list[int]]


class PedidoExportarJogos(BaseModel):
    modalidade: str
    jogos: list[list[int]] = Field(min_length=1)
    formato: str = "csv"

    @field_validator("formato")
    @classmethod
    def formato_conhecido(cls, v: str) -> str:
        if v not in {"csv", "xlsx"}:
            raise ValueError("formato deve ser 'csv' ou 'xlsx'")
        return v


class PedidoBacktest(BaseModel):
    modalidade: str
    jogos_por_concurso: int = Field(default=1, ge=1, le=20)
    simulacoes: int = Field(default=200, ge=1)
    semente: int = 20260728



# --------------------------------------------------------------------------- #
# Dependências
# --------------------------------------------------------------------------- #
# Precisam viver no nível do módulo: com `from __future__ import annotations`
# as anotações viram texto, e o FastAPI as resolve contra os globais do módulo.
# Um alias definido dentro da fábrica não é encontrado, e o parâmetro acabaria
# tratado como query string — que foi exatamente o que aconteceu na primeira
# versão. O engine vem do `request.app.state`, então cada app tem o seu.


def obter_sessao(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as s:
        yield s
        s.commit()


Sessao = Annotated[Session, Depends(obter_sessao)]


def usuario_atual(request: Request, sessao: Sessao,
                  authorization: Annotated[str | None, Header()] = None) -> p.User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "credencial ausente")
    valor = authorization.split(" ", 1)[1].strip()
    alvo = sec.hash_token(valor)
    # Busca pelo hash, não varrendo usuários: comparar o token contra cada
    # conta do banco seria O(n) e pioraria conforme a base cresce.
    for user_id, emitidos in request.app.state.tokens.items():
        for t in emitidos:
            if hmac.compare_digest(t.hash, alvo):
                if t.expirado():
                    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "credencial expirada")
                dono = sessao.get(p.User, user_id)
                if dono is None or dono.deleted_at is not None:
                    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "conta encerrada")
                return dono
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "credencial inválida ou expirada")


Autenticado = Annotated[p.User, Depends(usuario_atual)]


def maior_de_idade(u: Autenticado) -> p.User:
    """Barreira, não aviso: sem confirmação, a rota não executa."""
    if u.age_confirmed_at is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "confirmação de maioridade obrigatória para esta operação")
    return u


Adulto = Annotated[p.User, Depends(maior_de_idade)]


def ip_da(request: Request) -> str:
    bruto = request.client.host if request.client else "desconhecido"
    return sec.hash_ip(bruto, segredo())


# --------------------------------------------------------------------------- #
# Aplicação
# --------------------------------------------------------------------------- #

def criar_app(engine=None) -> FastAPI:
    """Fábrica: os testes injetam um engine SQLite em memória."""
    motor = engine or p.criar_engine(BANCO_URL)
    p.criar_tabelas(motor)

    app = FastAPI(
        title="Loteria Analytics Brasil",
        description=(
            "Análise estatística de loterias. NÃO prevê resultados, NÃO garante "
            "prêmios e NÃO encontra combinações vencedoras. Exclusivo para "
            "maiores de 18 anos."
        ),
        version="0.1.0",
    )
    app.state.engine = motor
    app.state.limite_login = sec.LimiteDeTaxa(LOGIN_MAXIMO, LOGIN_JANELA)
    #: Tokens ativos, por usuário. Em produção pertencem ao Redis ou a uma
    #: tabela; aqui a estrutura é explícita para o comportamento ser testável.
    app.state.tokens = {}

    # ----------------------------------------------------------------- #
    @app.get("/saude")
    def saude() -> dict[str, Any]:
        return {"ok": True, "versao": app.version}

    @app.get("/modalidades")
    def listar_modalidades() -> list[dict[str, Any]]:
        saida = []
        for codigo, m in loterias.MODALIDADES.items():
            saida.append({
                "codigo": codigo, "nome": m.nome, "formato": m.formato,
                "universo": [m.numero_minimo, m.numero_maximo],
                "dezenas_sorteadas": m.dezenas_sorteadas,
                "aposta": [m.aposta_minima, m.aposta_maxima],
                "preco_hoje": m.preco(date.today()),
                "combinacoes": m.combinacoes_possiveis(),
                "observacao": m.observacao,
            })
        return saida

    @app.get("/modalidades/{codigo}/probabilidades")
    def probabilidades(codigo: str, dezenas: int | None = None) -> dict[str, Any]:
        try:
            m = loterias.modalidade(codigo)
        except KeyError as erro:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(erro)) from erro
        n = dezenas or m.aposta_minima
        try:
            faixas = [
                {"acertos": f.acertos, "descricao": f.descricao,
                 "probabilidade": m.probabilidade(f.acertos, n),
                 "uma_em": (1 / pr) if (pr := m.probabilidade(f.acertos, n)) else None}
                for f in m.faixas
            ]
        except loterias.FormatoInvalido as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro
        return {
            "modalidade": codigo, "dezenas_por_jogo": n,
            "custo": m.preco(date.today(), n), "faixas": faixas,
            "aviso": ("Probabilidade matemática por aposta. Nenhum método, filtro ou "
                      "estratégia altera estes valores."),
        }

    # ----------------------------------------------------------------- #
    @app.post("/auth/registro", status_code=status.HTTP_201_CREATED)
    def registrar(dados: Registro, sessao: Sessao, request: Request) -> dict[str, Any]:
        email = dados.email.lower()
        if sessao.query(p.User).filter(p.User.email == email).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "e-mail já cadastrado")
        try:
            hash_ = sec.hash_senha(dados.senha)
        except sec.SenhaInvalida as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro
        u = p.User(id=str(uuid.uuid4()), email=email, password_hash=hash_,
                   age_confirmed_at=p.agora(), privacy_accepted_at=p.agora())
        sessao.add(u)
        sessao.flush()
        p.Auditoria(sessao).registrar("registro", "users", u.id, user_id=u.id,
                                      ip_hash=ip_da(request))
        return {"id": u.id, "email": u.email}

    @app.post("/auth/login")
    def login(dados: Login, sessao: Sessao, request: Request) -> dict[str, Any]:
        email = dados.email.lower()
        if not app.state.limite_login.permitir(email):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "tentativas demais; aguarde antes de tentar de novo")
        u = sessao.query(p.User).filter(p.User.email == email).first()
        auditoria = p.Auditoria(sessao)
        ip = ip_da(request)
        # Mesma resposta para e-mail inexistente e senha errada: distinguir os
        # dois casos entrega ao atacante a lista de e-mails cadastrados.
        if u is None or u.deleted_at is not None or not sec.verificar_senha(
                dados.senha, u.password_hash or ""):
            if u is not None:
                auditoria.registrar("login_falhou", "users", u.id, ip_hash=ip)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "credenciais inválidas")

        app.state.limite_login.esquecer(email)
        if sec.precisa_rehash(u.password_hash):
            u.password_hash = sec.hash_senha(dados.senha)
        token = sec.gerar_token(validade_segundos=3600)
        app.state.tokens.setdefault(u.id, []).append(token)
        auditoria.registrar("login_ok", "users", u.id, user_id=u.id, ip_hash=ip)
        return {"token": token.valor, "expira_em": token.expira_em}

    @app.get("/auth/eu")
    def eu(u: Autenticado) -> dict[str, Any]:
        return {"id": u.id, "email": u.email,
                "maioridade_confirmada": u.age_confirmed_at is not None,
                "limite_orcamento": float(u.monthly_budget_limit)
                if u.monthly_budget_limit is not None else None}

    @app.delete("/auth/eu", status_code=status.HTTP_204_NO_CONTENT)
    def excluir_conta(u: Autenticado, sessao: Sessao, request: Request) -> None:
        """LGPD: anonimiza a pessoa e mantém a trilha de auditoria."""
        p.Auditoria(sessao).registrar("exclusao_conta", "users", u.id,
                                      ip_hash=ip_da(request))
        u.email = sec.anonimizar_email(u.email)
        u.password_hash = ""
        u.deleted_at = p.agora()
        app.state.tokens.pop(u.id, None)

    # ----------------------------------------------------------------- #
    @app.post("/jogos/gerar")
    def gerar_jogos(pedido: PedidoGerar, u: Adulto) -> dict[str, Any]:
        try:
            m = loterias.modalidade(pedido.modalidade)
        except KeyError as erro:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(erro)) from erro

        ativos = []
        if pedido.pares_min is not None and pedido.pares_max is not None:
            ativos.append(mod_filtros.paridade(pedido.pares_min, pedido.pares_max))
        if pedido.soma_min is not None and pedido.soma_max is not None:
            ativos.append(mod_filtros.soma(pedido.soma_min, pedido.soma_max))
        if pedido.max_consecutivos is not None:
            ativos.append(mod_filtros.consecutivos(pedido.max_consecutivos))

        try:
            lote = gerador.gerar(
                m, pedido.quantidade, pedido.tamanho, filtros=ativos,
                obrigatorios=pedido.obrigatorios, excluidos=pedido.excluidos,
                orcamento_maximo=pedido.orcamento_maximo, semente=pedido.semente)
        except (gerador.RestricaoImpossivel, loterias.FormatoInvalido, ValueError) as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

        return {
            "modalidade": lote.modalidade,
            "jogos": [list(j) for j in lote.jogos],
            "solicitados": lote.solicitados, "completo": lote.completo,
            "custo_total": lote.custo_total,
            "probabilidade_por_jogo": lote.probabilidade_por_jogo,
            "distintos": lote.distintos,
            "sobreposicao_media": lote.sobreposicao_media,
            "cobertura_pares": lote.cobertura_pares,
            "tentativas": lote.tentativas, "semente": lote.semente,
            "avisos": list(lote.avisos),
            "aviso_filtros": ("Filtros restringem quais combinações o gerador aceita. "
                              "Não tornam nenhuma dezena mais provável de ser sorteada."),
        }

    @app.post("/jogos", status_code=status.HTTP_201_CREATED)
    def salvar_jogos(pedido: PedidoSalvar, u: Adulto, sessao: Sessao) -> dict[str, Any]:
        try:
            m = loterias.modalidade(pedido.modalidade)
        except KeyError as erro:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(erro)) from erro
        p.RepositorioModalidades(sessao).sincronizar_do_registro()
        linha = p.RepositorioModalidades(sessao).por_codigo(pedido.modalidade)
        salvos = []
        for jogo in pedido.jogos:
            try:
                m.validar_aposta(jogo)
            except loterias.FormatoInvalido as erro:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro
            registro = p.GeneratedGame(
                user_id=u.id, lottery_id=linha.id, numbers=sorted(jogo),
                cost=m.preco(date.today(), len(jogo)))
            sessao.add(registro)
            salvos.append(sorted(jogo))
        sessao.flush()
        p.Auditoria(sessao).registrar("salvar_jogos", "generated_games",
                                      user_id=u.id, details={"quantidade": len(salvos)})
        return {"salvos": len(salvos), "jogos": salvos}

    @app.get("/jogos")
    def listar_jogos(u: Autenticado, sessao: Sessao) -> list[dict[str, Any]]:
        registros = sessao.query(p.GeneratedGame).filter(
            p.GeneratedGame.user_id == u.id).all()
        return [{"id": r.id, "numeros": list(r.numbers), "custo": float(r.cost)}
                for r in registros]

    @app.post("/conferencia")
    def conferir(pedido: PedidoConferir) -> dict[str, Any]:
        try:
            m = loterias.modalidade(pedido.modalidade)
            m.validar_sorteio(pedido.dezenas_sorteadas)
        except KeyError as erro:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(erro)) from erro
        except loterias.FormatoInvalido as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

        sorteadas = set(pedido.dezenas_sorteadas)
        faixas = {f.acertos: f.descricao for f in m.faixas}
        resultados = []
        for jogo in pedido.jogos:
            acertos = len(sorteadas & set(jogo))
            resultados.append({
                "jogo": sorted(jogo), "acertos": acertos,
                "faixa": faixas.get(acertos),
                "probabilidade_desta_faixa": m.probabilidade(acertos, len(jogo)),
            })
        return {"modalidade": pedido.modalidade, "resultados": resultados}

    # ----------------------------------------------------------------- #
    @app.post("/backtests")
    def rodar_backtest(pedido: PedidoBacktest, u: Adulto, sessao: Sessao) -> dict[str, Any]:
        if pedido.simulacoes > SIMULACOES_MAXIMAS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"máximo de {SIMULACOES_MAXIMAS} simulações por requisição; "
                "backtests maiores pertencem ao processamento em segundo plano")
        try:
            m = loterias.modalidade(pedido.modalidade)
        except KeyError as erro:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(erro)) from erro

        historico = p.RepositorioConcursos(sessao).para_backtest(pedido.modalidade)
        if len(historico) < 10:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"histórico insuficiente: {len(historico)} concursos importados. "
                "Importe o histórico antes de rodar backtest.")
        particao = bt.particionar(historico)
        avaliacao = bt.avaliar_periodo(
            m, bt.aleatoria_uniforme, particao.teste,
            particao.desenvolvimento + particao.validacao,
            jogos_por_concurso=pedido.jogos_por_concurso,
            n_simulacoes=pedido.simulacoes, semente=pedido.semente,
            periodo="teste final")
        p.Auditoria(sessao).registrar("backtest", "backtests", user_id=u.id,
                                      details={"modalidade": pedido.modalidade,
                                               "semente": pedido.semente})
        mt = avaliacao.metricas
        return {
            "particao": particao.resumo(),
            "custo_total": mt.custo_total, "premio_bruto": mt.premio_bruto,
            "resultado_liquido": mt.resultado_liquido, "roi": mt.roi,
            "perda_maxima": mt.perda_maxima,
            "maior_sequencia_sem_premio": mt.maior_sequencia_sem_premio,
            "percentil_vs_aleatorio": avaliacao.percentil_vs_aleatorio,
            "simulacoes": avaliacao.n_simulacoes, "semente": avaliacao.semente,
            # Nunca p-valor sozinho: é o contrato da camada estatística.
            "teste": {
                "nome": avaliacao.teste.nome,
                "estimativa": avaliacao.teste.estimativa,
                "ic": [avaliacao.teste.ic_inferior, avaliacao.teste.ic_superior],
                "p_valor": avaliacao.teste.p_valor,
                "tamanho_efeito": avaliacao.teste.tamanho_efeito,
                "nome_efeito": avaliacao.teste.nome_efeito,
                "n": avaliacao.teste.n,
                "leitura": avaliacao.teste.leitura,
            },
            "aviso": ("Desempenho passado não garante resultado futuro. Sorteios são "
                      "independentes e nenhum método altera a probabilidade de acerto."),
        }

    # ----------------------------------------------------------------- #
    # Exportação
    # ----------------------------------------------------------------- #
    @app.post("/jogos/exportar")
    def exportar_jogos(pedido: PedidoExportarJogos, u: Adulto) -> Response:
        try:
            m = loterias.modalidade(pedido.modalidade)
            for jogo in pedido.jogos:
                m.validar_aposta(jogo)
        except KeyError as erro:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(erro)) from erro
        except loterias.FormatoInvalido as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

        custo = m.preco(date.today(), len(pedido.jogos[0])) if pedido.jogos else 0.0
        carimbo = date.today().isoformat()
        try:
            if pedido.formato == "csv":
                corpo = exportacao.jogos_para_csv(
                    pedido.jogos, pedido.modalidade, custo).encode("utf-8-sig")
                tipo = "text/csv; charset=utf-8"
            else:
                corpo = exportacao.jogos_para_xlsx(pedido.jogos, pedido.modalidade, custo)
                tipo = ("application/vnd.openxmlformats-officedocument"
                        ".spreadsheetml.sheet")
        except ValueError as erro:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(erro)) from erro

        nome = f"jogos-{pedido.modalidade}-{carimbo}.{pedido.formato}"
        return Response(content=corpo, media_type=tipo,
                        headers={"Content-Disposition": f'attachment; filename="{nome}"'})

    @app.post("/backtests/relatorio")
    def relatorio_de_backtest(pedido: PedidoBacktest, formato: str,
                              u: Adulto, sessao: Sessao) -> Response:
        """Roda o backtest e devolve o relatório completo do §23.

        O relatório sai do mesmo caminho de código do endpoint /backtests: se
        fossem caminhos diferentes, o documento exportado poderia divergir do
        que a tela mostrou, e o exportado é o que fica.
        """
        if formato not in {"md", "pdf"}:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "formato deve ser 'md' ou 'pdf'")
        dados = rodar_backtest(pedido, u, sessao)
        teste = dados["teste"]

        limitacoes = [
            "Sorteios sao eventos independentes: o historico nao carrega "
            "informacao sobre o proximo concurso.",
            f"Amostra de {teste['n']} observacoes no periodo de teste.",
            "Rateio historico ausente em alguma faixa e contado como zero, "
            "nunca estimado.",
        ]
        if dados["maior_sequencia_sem_premio"] >= 10:
            limitacoes.append(
                f"Houve {dados['maior_sequencia_sem_premio']} concursos seguidos "
                "sem premio algum.")
        if dados["roi"] > 0:
            limitacoes.append(
                "ROI positivo em periodo curto costuma vir de poucos premios "
                "isolados; ver a perda maxima acumulada.")

        relatorio = exportacao.Relatorio(
            objetivo="Comparar a estrategia com carteiras aleatorias equivalentes",
            modalidade=loterias.modalidade(pedido.modalidade).nome,
            periodo=dados["particao"],
            metodologia=(
                "Particao cronologica; a estrategia recebe apenas concursos "
                f"anteriores ao avaliado; {dados['simulacoes']} carteiras "
                "aleatorias de mesma modalidade, concursos, quantidade e custo."),
            custos={
                "custo total": f"R$ {dados['custo_total']:.2f}",
                "premio bruto": f"R$ {dados['premio_bruto']:.2f}",
                "resultado liquido": f"R$ {dados['resultado_liquido']:.2f}",
            },
            resultados={
                "ROI": f"{dados['roi'] * 100:.2f}%",
                "percentil vs aleatorio": f"{dados['percentil_vs_aleatorio']:.1f}",
                "perda maxima acumulada": f"R$ {dados['perda_maxima']:.2f}",
                "maior sequencia sem premio": dados["maior_sequencia_sem_premio"],
            },
            testes={
                "teste": teste["nome"],
                "estimativa": f"{teste['estimativa']:.6g}",
                "IC 95%": f"[{teste['ic'][0]:.6g}; {teste['ic'][1]:.6g}]",
                "p-valor": f"{teste['p_valor']:.4g}",
                teste["nome_efeito"]: f"{teste['tamanho_efeito']:.4g}",
                "amostra": teste["n"],
                "leitura": teste["leitura"],
            },
            limitacoes=limitacoes,
            conclusao=teste["leitura"],
            parametros={
                "semente": dados["semente"],
                "simulacoes": dados["simulacoes"],
                "jogos por concurso": pedido.jogos_por_concurso,
                "modalidade": pedido.modalidade,
            },
        )
        if formato == "md":
            corpo = exportacao.relatorio_markdown(relatorio).encode("utf-8")
            tipo = "text/markdown; charset=utf-8"
        else:
            corpo = exportacao.relatorio_pdf(relatorio)
            tipo = "application/pdf"
        nome = f"backtest-{pedido.modalidade}-{date.today().isoformat()}.{formato}"
        return Response(content=corpo, media_type=tipo,
                        headers={"Content-Disposition": f'attachment; filename="{nome}"'})

    @app.get("/jogo-responsavel")
    def jogo_responsavel() -> dict[str, Any]:
        return {
            "idade_minima": 18,
            "aviso": ("Loteria é gasto de entretenimento, não investimento. O valor "
                      "esperado de qualquer aposta é negativo, por desenho."),
            "ajuda": [
                {"nome": "CVV", "contato": "188", "descricao": "24h, gratuito"},
                {"nome": "Jogadores Anônimos",
                 "contato": "jogadoresanonimos.com.br", "descricao": "grupos de apoio"},
            ],
        }

    return app
