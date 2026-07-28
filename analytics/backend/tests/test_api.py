"""Testes da API.

Cobre autenticação, barreira de maioridade, limite de taxa, geração,
conferência, backtest e LGPD. Nenhum endpoint é exercitado com mock: todos
executam os motores reais sobre um SQLite em memória.
"""

from __future__ import annotations

import os
from datetime import date, timedelta

import pytest

os.environ.setdefault("APP_SECRET", "segredo-de-teste-nao-usar-em-producao")

from fastapi.testclient import TestClient  # noqa: E402

from lab import api, ingestao  # noqa: E402
from lab import persistencia as p  # noqa: E402

SENHA = "senha-de-teste-123"


@pytest.fixture()
def app():
    engine = p.criar_engine()
    return api.criar_app(engine)


@pytest.fixture()
def cliente(app):
    with TestClient(app) as c:
        yield c


def registrar(cliente, email="ana@exemplo.com") -> str:
    r = cliente.post("/auth/registro", json={
        "email": email, "senha": SENHA,
        "maior_de_idade": True, "aceita_privacidade": True})
    assert r.status_code == 201, r.text
    login = cliente.post("/auth/login", json={"email": email, "senha": SENHA})
    assert login.status_code == 200, login.text
    return login.json()["token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Rotas abertas
# --------------------------------------------------------------------------- #

def test_saude(cliente):
    assert cliente.get("/saude").json()["ok"] is True


def test_lista_as_nove_modalidades(cliente):
    dados = cliente.get("/modalidades").json()
    assert len(dados) == 9
    mega = next(d for d in dados if d["codigo"] == "megasena")
    assert mega["combinacoes"] == 50_063_860
    assert mega["universo"] == [1, 60]


def test_probabilidades_sao_as_oficiais(cliente):
    dados = cliente.get("/modalidades/megasena/probabilidades").json()
    sena = next(f for f in dados["faixas"] if f["acertos"] == 6)
    assert sena["uma_em"] == pytest.approx(50_063_860, rel=1e-9)
    assert "Nenhum método" in dados["aviso"]


def test_probabilidade_de_aposta_ampliada(cliente):
    dados = cliente.get("/modalidades/megasena/probabilidades?dezenas=7").json()
    sena = next(f for f in dados["faixas"] if f["acertos"] == 6)
    assert sena["uma_em"] == pytest.approx(50_063_860 / 7, rel=1e-9)
    assert dados["custo"] == pytest.approx(35.0)


def test_modalidade_inexistente_da_404(cliente):
    assert cliente.get("/modalidades/raspadinha/probabilidades").status_code == 404


def test_tamanho_de_aposta_invalido_da_422(cliente):
    assert cliente.get("/modalidades/megasena/probabilidades?dezenas=99").status_code == 422


def test_jogo_responsavel_traz_canais_de_ajuda(cliente):
    dados = cliente.get("/jogo-responsavel").json()
    assert dados["idade_minima"] == 18
    assert any(a["contato"] == "188" for a in dados["ajuda"])
    assert "não investimento" in dados["aviso"]


# --------------------------------------------------------------------------- #
# Autenticação
# --------------------------------------------------------------------------- #

def test_registro_e_login(cliente):
    token = registrar(cliente)
    r = cliente.get("/auth/eu", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["email"] == "ana@exemplo.com"
    assert r.json()["maioridade_confirmada"] is True


def test_registro_exige_maioridade_e_privacidade(cliente):
    for campo in ("maior_de_idade", "aceita_privacidade"):
        corpo = {"email": "b@x.com", "senha": SENHA,
                 "maior_de_idade": True, "aceita_privacidade": True}
        corpo[campo] = False
        assert cliente.post("/auth/registro", json=corpo).status_code == 422


def test_registro_recusa_senha_curta(cliente):
    r = cliente.post("/auth/registro", json={
        "email": "b@x.com", "senha": "curta",
        "maior_de_idade": True, "aceita_privacidade": True})
    assert r.status_code == 422


def test_email_duplicado_da_409(cliente):
    registrar(cliente)
    r = cliente.post("/auth/registro", json={
        "email": "ana@exemplo.com", "senha": SENHA,
        "maior_de_idade": True, "aceita_privacidade": True})
    assert r.status_code == 409


def test_email_e_normalizado_para_minusculas(cliente):
    cliente.post("/auth/registro", json={
        "email": "Ana@Exemplo.COM", "senha": SENHA,
        "maior_de_idade": True, "aceita_privacidade": True})
    r = cliente.post("/auth/login", json={"email": "ana@exemplo.com", "senha": SENHA})
    assert r.status_code == 200


def test_senha_errada_e_email_inexistente_dao_a_mesma_resposta(cliente):
    """Distinguir os dois casos entregaria a lista de e-mails cadastrados."""
    registrar(cliente)
    errada = cliente.post("/auth/login", json={"email": "ana@exemplo.com", "senha": "x" * 12})
    inexistente = cliente.post("/auth/login", json={"email": "zzz@x.com", "senha": "x" * 12})
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json()["detail"] == inexistente.json()["detail"]


def test_rotas_protegidas_exigem_token(cliente):
    assert cliente.get("/auth/eu").status_code == 401
    assert cliente.post("/jogos/gerar", json={"modalidade": "megasena",
                                              "quantidade": 1}).status_code == 401


def test_token_invalido_e_recusado(cliente):
    registrar(cliente)
    assert cliente.get("/auth/eu", headers=auth("inventado")).status_code == 401
    assert cliente.get("/auth/eu", headers={"Authorization": "Basic x"}).status_code == 401


def test_limite_de_tentativas_de_login(cliente):
    registrar(cliente)
    for _ in range(api.LOGIN_MAXIMO):
        cliente.post("/auth/login", json={"email": "ana@exemplo.com", "senha": "errada-12345"})
    r = cliente.post("/auth/login", json={"email": "ana@exemplo.com", "senha": SENHA})
    assert r.status_code == 429


def test_login_correto_zera_o_contador(cliente):
    token = registrar(cliente)          # já fez um login bem-sucedido
    for _ in range(api.LOGIN_MAXIMO - 1):
        cliente.post("/auth/login", json={"email": "ana@exemplo.com", "senha": "errada-12345"})
    assert cliente.post("/auth/login",
                        json={"email": "ana@exemplo.com", "senha": SENHA}).status_code == 200


# --------------------------------------------------------------------------- #
# Geração
# --------------------------------------------------------------------------- #

def test_gera_jogos_validos_com_metricas(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos/gerar", headers=auth(token),
                     json={"modalidade": "megasena", "quantidade": 5, "semente": 7})
    dados = r.json()
    assert r.status_code == 200
    assert len(dados["jogos"]) == 5
    assert all(len(j) == 6 and sorted(j) == j for j in dados["jogos"])
    assert dados["custo_total"] == pytest.approx(25.0)
    assert dados["probabilidade_por_jogo"] == pytest.approx(1 / 50_063_860)
    assert dados["semente"] == 7
    assert "não tornam nenhuma dezena mais provável" in dados["aviso_filtros"].lower()


def test_geracao_e_reproduzivel_pela_semente(cliente):
    token = registrar(cliente)
    corpo = {"modalidade": "megasena", "quantidade": 4, "semente": 99}
    a = cliente.post("/jogos/gerar", headers=auth(token), json=corpo).json()
    b = cliente.post("/jogos/gerar", headers=auth(token), json=corpo).json()
    assert a["jogos"] == b["jogos"]


def test_filtros_da_api_sao_aplicados(cliente):
    token = registrar(cliente)
    dados = cliente.post("/jogos/gerar", headers=auth(token), json={
        "modalidade": "megasena", "quantidade": 6, "semente": 3,
        "pares_min": 3, "pares_max": 3, "max_consecutivos": 1}).json()
    for jogo in dados["jogos"]:
        assert sum(1 for d in jogo if d % 2 == 0) == 3
        assert all(b - a > 1 for a, b in zip(jogo, jogo[1:]))


def test_orcamento_corta_e_avisa(cliente):
    token = registrar(cliente)
    dados = cliente.post("/jogos/gerar", headers=auth(token), json={
        "modalidade": "megasena", "quantidade": 50, "orcamento_maximo": 20}).json()
    assert len(dados["jogos"]) == 4
    assert dados["completo"] is False
    assert any("comporta 4" in a for a in dados["avisos"])


def test_restricao_impossivel_da_422(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos/gerar", headers=auth(token), json={
        "modalidade": "megasena", "quantidade": 1,
        "obrigatorios": [5], "excluidos": [5]})
    assert r.status_code == 422
    assert "obrigatórias e excluídas" in r.json()["detail"]


def test_salvar_e_listar_jogos(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos", headers=auth(token), json={
        "modalidade": "megasena", "jogos": [[6, 5, 4, 3, 2, 1], [10, 20, 30, 40, 50, 60]]})
    assert r.status_code == 201
    assert r.json()["jogos"][0] == [1, 2, 3, 4, 5, 6]
    listados = cliente.get("/jogos", headers=auth(token)).json()
    assert len(listados) == 2
    assert all(l["custo"] == pytest.approx(5.0) for l in listados)


def test_jogo_invalido_nao_e_salvo(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos", headers=auth(token), json={
        "modalidade": "megasena", "jogos": [[1, 2, 3, 4, 5, 61]]})
    assert r.status_code == 422
    assert cliente.get("/jogos", headers=auth(token)).json() == []


def test_jogos_de_um_usuario_nao_vazam_para_outro(cliente):
    a = registrar(cliente, "a@x.com")
    b = registrar(cliente, "b@x.com")
    cliente.post("/jogos", headers=auth(a), json={
        "modalidade": "megasena", "jogos": [[1, 2, 3, 4, 5, 6]]})
    assert cliente.get("/jogos", headers=auth(b)).json() == []


# --------------------------------------------------------------------------- #
# Conferência
# --------------------------------------------------------------------------- #

def test_conferencia_conta_acertos(cliente):
    r = cliente.post("/conferencia", json={
        "modalidade": "megasena", "dezenas_sorteadas": [1, 2, 3, 4, 5, 6],
        "jogos": [[1, 2, 3, 4, 5, 6], [1, 2, 3, 10, 20, 30], [11, 12, 13, 14, 15, 16]]})
    resultados = r.json()["resultados"]
    assert [x["acertos"] for x in resultados] == [6, 3, 0]
    assert resultados[0]["faixa"] == "sena"
    assert resultados[2]["faixa"] is None


def test_conferencia_recusa_sorteio_invalido(cliente):
    r = cliente.post("/conferencia", json={
        "modalidade": "megasena", "dezenas_sorteadas": [1, 2, 3], "jogos": []})
    assert r.status_code == 422


# --------------------------------------------------------------------------- #
# Backtest
# --------------------------------------------------------------------------- #

def _semear_historico(app, quantos=40):
    import random

    rng = random.Random(1)
    engine = app.state.engine
    from sqlalchemy.orm import Session

    with Session(engine) as s:
        p.RepositorioModalidades(s).sincronizar_do_registro()
        concursos = [
            ingestao.ConcursoImportado(
                modalidade="megasena", concurso=i,
                data=date(2020, 1, 1) + timedelta(days=3 * i),
                dezenas=tuple(sorted(rng.sample(range(1, 61), 6))),
                rateio={6: (1, 4e7), 4: (5000, 800.0)}, origem="teste")
            for i in range(1, quantos + 1)]
        p.RepositorioConcursos(s).gravar("megasena", concursos)
        s.commit()


def test_backtest_sem_historico_da_409(cliente):
    token = registrar(cliente)
    r = cliente.post("/backtests", headers=auth(token),
                     json={"modalidade": "megasena", "simulacoes": 10})
    assert r.status_code == 409
    assert "Importe o histórico" in r.json()["detail"]


def test_backtest_devolve_metricas_e_estatistica_completa(app, cliente):
    _semear_historico(app)
    token = registrar(cliente)
    r = cliente.post("/backtests", headers=auth(token), json={
        "modalidade": "megasena", "simulacoes": 30, "semente": 5})
    dados = r.json()
    assert r.status_code == 200, r.text
    assert "desenvolvimento" in dados["particao"]
    assert dados["semente"] == 5
    assert 0 <= dados["percentil_vs_aleatorio"] <= 100
    # nunca p-valor sozinho
    teste = dados["teste"]
    assert set(teste) >= {"estimativa", "ic", "p_valor", "tamanho_efeito", "n", "leitura"}
    assert teste["ic"][0] <= teste["ic"][1]
    assert "não garante resultado futuro" in dados["aviso"]


def test_backtest_e_reproduzivel(app, cliente):
    _semear_historico(app)
    token = registrar(cliente)
    corpo = {"modalidade": "megasena", "simulacoes": 20, "semente": 77}
    a = cliente.post("/backtests", headers=auth(token), json=corpo).json()
    b = cliente.post("/backtests", headers=auth(token), json=corpo).json()
    assert a["roi"] == b["roi"]
    assert a["percentil_vs_aleatorio"] == b["percentil_vs_aleatorio"]


def test_backtest_recusa_simulacoes_demais(app, cliente):
    _semear_historico(app)
    token = registrar(cliente)
    r = cliente.post("/backtests", headers=auth(token), json={
        "modalidade": "megasena", "simulacoes": api.SIMULACOES_MAXIMAS + 1})
    assert r.status_code == 422
    assert "segundo plano" in r.json()["detail"]


# --------------------------------------------------------------------------- #
# LGPD e auditoria
# --------------------------------------------------------------------------- #

def test_exclusao_de_conta_invalida_o_token_e_anonimiza(app, cliente):
    token = registrar(cliente)
    assert cliente.delete("/auth/eu", headers=auth(token)).status_code == 204
    assert cliente.get("/auth/eu", headers=auth(token)).status_code == 401

    from sqlalchemy.orm import Session

    with Session(app.state.engine) as s:
        u = s.query(p.User).one()
        assert "ana" not in u.email
        assert u.deleted_at is not None
        # a trilha permanece: é obrigação distinta do direito ao esquecimento
        assert any(l.action == "exclusao_conta" for l in p.Auditoria(s).listar())


def test_conta_excluida_nao_faz_login(cliente):
    token = registrar(cliente)
    cliente.delete("/auth/eu", headers=auth(token))
    r = cliente.post("/auth/login", json={"email": "ana@exemplo.com", "senha": SENHA})
    assert r.status_code == 401


def test_auditoria_registra_as_acoes(app, cliente):
    token = registrar(cliente)
    cliente.post("/jogos", headers=auth(token),
                 json={"modalidade": "megasena", "jogos": [[1, 2, 3, 4, 5, 6]]})
    from sqlalchemy.orm import Session

    with Session(app.state.engine) as s:
        acoes = {l.action for l in p.Auditoria(s).listar()}
    assert {"registro", "login_ok", "salvar_jogos"} <= acoes


def test_auditoria_guarda_hash_do_ip(app, cliente):
    registrar(cliente)
    from sqlalchemy.orm import Session

    with Session(app.state.engine) as s:
        linha = next(l for l in p.Auditoria(s).listar() if l.action == "registro")
    assert linha.ip_hash and len(linha.ip_hash) == 64
    assert "testclient" not in linha.ip_hash


def test_openapi_declara_que_nao_preve(cliente):
    descricao = cliente.get("/openapi.json").json()["info"]["description"]
    assert "NÃO prevê resultados" in descricao
    assert "18 anos" in descricao


# --------------------------------------------------------------------------- #
# Exportação pela API
# --------------------------------------------------------------------------- #

def test_exporta_jogos_em_csv(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos/exportar", headers=auth(token), json={
        "modalidade": "megasena", "formato": "csv",
        "jogos": [[6, 5, 4, 3, 2, 1], [10, 20, 30, 40, 50, 60]]})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert ".csv" in r.headers["content-disposition"]
    # BOM para o Excel abrir acentuação corretamente
    assert r.content.startswith(b"\xef\xbb\xbf")
    texto = r.content.decode("utf-8-sig")
    assert texto.splitlines()[1].startswith("megasena,1,1,2,3,4,5,6")


def test_exporta_jogos_em_xlsx_que_abre_em_leitor_independente(cliente):
    openpyxl = pytest.importorskip("openpyxl")
    import io as _io

    token = registrar(cliente)
    r = cliente.post("/jogos/exportar", headers=auth(token), json={
        "modalidade": "megasena", "formato": "xlsx", "jogos": [[1, 2, 3, 4, 5, 6]]})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    aba = openpyxl.load_workbook(_io.BytesIO(r.content))["jogos"]
    assert [c.value for c in aba[2]][:8] == ["megasena", 1, 1, 2, 3, 4, 5, 6]


def test_exportacao_recusa_formato_desconhecido(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos/exportar", headers=auth(token), json={
        "modalidade": "megasena", "formato": "docx", "jogos": [[1, 2, 3, 4, 5, 6]]})
    assert r.status_code == 422


def test_exportacao_recusa_jogo_invalido(cliente):
    token = registrar(cliente)
    r = cliente.post("/jogos/exportar", headers=auth(token), json={
        "modalidade": "megasena", "formato": "csv", "jogos": [[1, 2, 3, 4, 5, 99]]})
    assert r.status_code == 422


def test_exportacao_exige_autenticacao(cliente):
    r = cliente.post("/jogos/exportar", json={
        "modalidade": "megasena", "jogos": [[1, 2, 3, 4, 5, 6]]})
    assert r.status_code == 401


def test_relatorio_de_backtest_em_markdown(app, cliente):
    _semear_historico(app)
    token = registrar(cliente)
    r = cliente.post("/backtests/relatorio?formato=md", headers=auth(token),
                     json={"modalidade": "megasena", "simulacoes": 20, "semente": 3})
    assert r.status_code == 200, r.text
    texto = r.content.decode("utf-8")
    for secao in ("1. Objetivo", "5. Custos", "7. Testes estatisticos",
                  "8. Limitacoes", "10. Parametros"):
        assert f"## {secao}" in texto
    assert "não garante resultado futuro" in texto
    assert "semente: 3" in texto


def test_relatorio_de_backtest_em_pdf(app, cliente):
    _semear_historico(app)
    token = registrar(cliente)
    r = cliente.post("/backtests/relatorio?formato=pdf", headers=auth(token),
                     json={"modalidade": "megasena", "simulacoes": 20, "semente": 3})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert r.content.rstrip().endswith(b"%%EOF")


def test_relatorio_recusa_formato_desconhecido(app, cliente):
    _semear_historico(app)
    token = registrar(cliente)
    r = cliente.post("/backtests/relatorio?formato=docx", headers=auth(token),
                     json={"modalidade": "megasena", "simulacoes": 10})
    assert r.status_code == 422


def test_relatorio_sempre_declara_a_independencia_dos_sorteios(app, cliente):
    """A seção de limitações não é opcional nem configurável."""
    _semear_historico(app)
    token = registrar(cliente)
    texto = cliente.post("/backtests/relatorio?formato=md", headers=auth(token),
                         json={"modalidade": "megasena", "simulacoes": 20}
                         ).content.decode("utf-8")
    assert "eventos independentes" in texto
    assert "nao carrega" in texto or "não carrega" in texto
