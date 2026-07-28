"""Testes de segurança (§28).

Inclui um teste que dispara uma injeção de SQL de verdade contra o repositório
e verifica que a tabela continua de pé — provar que a parametrização funciona
vale mais do que afirmar que ela existe.
"""

from __future__ import annotations

import time

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from lab import persistencia as p
from lab import seguranca as sec

SEGREDO = "segredo-de-teste-nao-usar-em-producao"


@pytest.fixture()
def sessao():
    engine = p.criar_engine()
    p.criar_tabelas(engine)
    with Session(engine) as s:
        yield s


# --------------------------------------------------------------------------- #
# Senhas
# --------------------------------------------------------------------------- #

def test_hash_nao_contem_a_senha():
    senha = "senha-bem-longa-123"
    gravado = sec.hash_senha(senha)
    assert senha not in gravado
    assert "senha" not in gravado.split("$")[-1]


def test_verifica_senha_correta_e_recusa_errada():
    gravado = sec.hash_senha("minha-senha-longa")
    assert sec.verificar_senha("minha-senha-longa", gravado)
    assert not sec.verificar_senha("minha-senha-long", gravado)
    assert not sec.verificar_senha("", gravado)
    assert not sec.verificar_senha("MINHA-SENHA-LONGA", gravado)


def test_sal_diferente_a_cada_hash():
    """Sem sal por senha, senhas iguais teriam hashes iguais e vazariam isso."""
    a = sec.hash_senha("mesma-senha-longa")
    b = sec.hash_senha("mesma-senha-longa")
    assert a != b
    assert sec.verificar_senha("mesma-senha-longa", a)
    assert sec.verificar_senha("mesma-senha-longa", b)


def test_hash_adulterado_nao_valida():
    gravado = sec.hash_senha("senha-longa-valida")
    partes = gravado.split("$")
    partes[-1] = sec._b64(b"\x00" * 32)
    assert not sec.verificar_senha("senha-longa-valida", "$".join(partes))


def test_hash_corrompido_falha_alto():
    """Formato irreconhecível é erro de programação, não senha errada."""
    for ruim in ("", "xxx", "scrypt$1$2$3", "desconhecido$1$2$3$4$5"):
        if ruim == "":
            assert not sec.verificar_senha("x", ruim)
            continue
        with pytest.raises(sec.HashCorrompido):
            sec.verificar_senha("senha-longa-valida", ruim)


def test_politica_de_senha():
    with pytest.raises(sec.SenhaInvalida):
        sec.hash_senha("curta")
    with pytest.raises(sec.SenhaInvalida):
        sec.hash_senha(" " * 20)
    sec.hash_senha("a" * sec.COMPRIMENTO_MINIMO)


def test_parametros_ficam_no_hash_para_permitir_migracao():
    gravado = sec.hash_senha("senha-longa-valida")
    if gravado.startswith("scrypt$"):
        _, n, r, pp, _, _ = gravado.split("$")
        assert (int(n), int(r), int(pp)) == (sec.SCRYPT_N, sec.SCRYPT_R, sec.SCRYPT_P)
        assert not sec.precisa_rehash(gravado)


def test_detecta_hash_com_parametros_fracos():
    """Sem isso, endurecer o custo só protegeria contas novas."""
    if sec._ARGON is not None:            # pragma: no cover
        pytest.skip("Argon2 instalado: a migração é sempre indicada")
    fraco = f"scrypt$1024$8$1${sec._b64(b'x' * 16)}${sec._b64(b'y' * 32)}"
    assert sec.precisa_rehash(fraco)


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #

def test_token_e_unico_e_longo():
    tokens = {sec.gerar_token().valor for _ in range(200)}
    assert len(tokens) == 200
    assert all(len(t) >= 40 for t in tokens)


def test_token_guardado_e_o_hash_e_nao_o_valor():
    """Se o banco vazar, os tokens vazados não devem autenticar."""
    t = sec.gerar_token()
    assert t.valor not in t.hash
    assert len(t.hash) == 64
    assert sec.token_confere(t.valor, t.hash)
    assert not sec.token_confere(t.valor + "x", t.hash)


def test_token_expira():
    t = sec.gerar_token(validade_segundos=10, agora=1_000.0)
    assert not t.expirado(agora=1_009.0)
    assert t.expirado(agora=1_010.0)


def test_validade_invalida_falha():
    with pytest.raises(ValueError):
        sec.gerar_token(0)


def test_repr_do_token_nao_vaza_o_valor():
    """Um log acidental do objeto não pode entregar o segredo."""
    t = sec.gerar_token()
    assert t.valor not in repr(t)


# --------------------------------------------------------------------------- #
# CSRF
# --------------------------------------------------------------------------- #

def test_csrf_valido_e_aceito():
    token = sec.gerar_csrf(SEGREDO, "sessao-1")
    assert sec.csrf_confere(SEGREDO, "sessao-1", token)


def test_csrf_de_outra_sessao_e_recusado():
    """É o que impede um token roubado de servir na sessão da vítima."""
    token = sec.gerar_csrf(SEGREDO, "sessao-atacante")
    assert not sec.csrf_confere(SEGREDO, "sessao-vitima", token)


def test_csrf_vazio_ou_errado_e_recusado():
    assert not sec.csrf_confere(SEGREDO, "s", "")
    assert not sec.csrf_confere(SEGREDO, "s", "a" * 64)


def test_csrf_sem_segredo_falha():
    with pytest.raises(ValueError):
        sec.gerar_csrf("", "s")


# --------------------------------------------------------------------------- #
# Limite de taxa
# --------------------------------------------------------------------------- #

def test_permite_ate_o_limite_e_bloqueia_depois():
    limite = sec.LimiteDeTaxa(maximo=3, janela_segundos=60)
    assert [limite.permitir("ip", agora=0) for _ in range(3)] == [True, True, True]
    assert not limite.permitir("ip", agora=0)
    assert limite.restantes("ip", agora=0) == 0


def test_janela_desliza_em_vez_de_zerar_de_uma_vez():
    """Com janela fixa, o atacante obteria o dobro de tentativas na virada."""
    limite = sec.LimiteDeTaxa(maximo=2, janela_segundos=10)
    assert limite.permitir("ip", agora=0)
    assert limite.permitir("ip", agora=5)
    assert not limite.permitir("ip", agora=9)
    assert limite.permitir("ip", agora=10.1)     # o de t=0 saiu da janela
    assert not limite.permitir("ip", agora=10.2)  # o de t=5 ainda conta


def test_chaves_diferentes_nao_se_afetam():
    limite = sec.LimiteDeTaxa(maximo=1, janela_segundos=60)
    assert limite.permitir("ip-a", agora=0)
    assert limite.permitir("ip-b", agora=0)
    assert not limite.permitir("ip-a", agora=0)


def test_login_bem_sucedido_zera_o_contador():
    limite = sec.LimiteDeTaxa(maximo=2, janela_segundos=60)
    limite.permitir("ip", agora=0)
    limite.esquecer("ip")
    assert limite.restantes("ip", agora=0) == 2


def test_configuracao_invalida_falha():
    with pytest.raises(ValueError):
        sec.LimiteDeTaxa(maximo=0, janela_segundos=10)
    with pytest.raises(ValueError):
        sec.LimiteDeTaxa(maximo=1, janela_segundos=0)


# --------------------------------------------------------------------------- #
# LGPD
# --------------------------------------------------------------------------- #

def test_hash_de_ip_usa_hmac_e_nao_e_reversivel_por_forca_bruta():
    """SHA-256 puro de um IPv4 é percorrível em minutos; com HMAC, não."""
    h = sec.hash_ip("192.168.0.15", SEGREDO)
    import hashlib

    assert h != hashlib.sha256(b"192.168.0.15").hexdigest()
    assert h == sec.hash_ip("192.168.0.15", SEGREDO)      # determinístico
    assert h != sec.hash_ip("192.168.0.15", "outro-segredo")


def test_anonimizacao_de_email_nao_colide():
    emails = {sec.anonimizar_email("ana@x.com") for _ in range(100)}
    assert len(emails) == 100
    assert all("ana" not in e for e in emails)


def test_exclusao_de_conta_apaga_a_pessoa_e_mantem_integridade(sessao):
    u = p.User(id="u1", email="ana@exemplo.com", password_hash=sec.hash_senha("senha-longa-1"))
    sessao.add(u)
    sessao.flush()
    p.Auditoria(sessao).registrar("login", "users", u.id, user_id=u.id)

    u.email = sec.anonimizar_email(u.email)
    u.password_hash = ""
    u.deleted_at = p.agora()
    sessao.flush()

    guardado = sessao.scalar(select(p.User).where(p.User.id == "u1"))
    assert "ana" not in guardado.email
    assert guardado.deleted_at is not None
    # A trilha de auditoria continua existindo — é obrigação legal distinta.
    assert len(p.Auditoria(sessao).listar()) == 1


# --------------------------------------------------------------------------- #
# Injeção de SQL
# --------------------------------------------------------------------------- #

def test_injecao_de_sql_nao_derruba_a_tabela(sessao):
    """Prova que a parametrização funciona, em vez de afirmar que existe."""
    p.RepositorioModalidades(sessao).sincronizar_do_registro()
    sessao.commit()

    ataque = "megasena'); DROP TABLE lotteries; --"
    resultado = p.RepositorioModalidades(sessao).por_codigo(ataque)

    assert resultado is None                       # não encontrou, e não executou
    assert sessao.query(p.Lottery).count() == 9    # a tabela continua de pé
    assert p.RepositorioModalidades(sessao).por_codigo("megasena") is not None


def test_injecao_em_email_e_tratada_como_texto(sessao):
    # Em minúsculas de propósito: a restrição users_email_minusculo já barraria
    # o payload em caixa alta, e o teste passaria sem provar a parametrização.
    malicioso = "x'; delete from users; --"
    sessao.add(p.User(id="u1", email=malicioso, password_hash="h"))
    sessao.flush()
    guardado = sessao.scalar(select(p.User).where(p.User.email == malicioso))
    assert guardado is not None
    assert guardado.email == malicioso             # gravado literalmente
    assert sessao.query(p.User).count() == 1


# --------------------------------------------------------------------------- #
# Fluxo completo
# --------------------------------------------------------------------------- #

def test_fluxo_de_login_com_limite_e_auditoria(sessao):
    senha = "senha-do-usuario-1"
    u = p.User(id="u1", email="ana@exemplo.com", password_hash=sec.hash_senha(senha))
    sessao.add(u)
    sessao.flush()

    limite = sec.LimiteDeTaxa(maximo=3, janela_segundos=300)
    auditoria = p.Auditoria(sessao)
    ip = sec.hash_ip("203.0.113.7", SEGREDO)

    # três tentativas erradas
    for i in range(3):
        assert limite.permitir("ana@exemplo.com", agora=i)
        assert not sec.verificar_senha("errada-errada", u.password_hash)
        auditoria.registrar("login_falhou", "users", u.id, ip_hash=ip)

    # a quarta é barrada antes mesmo de conferir a senha
    assert not limite.permitir("ana@exemplo.com", agora=3)

    # após a janela, a senha certa passa e zera o contador
    assert limite.permitir("ana@exemplo.com", agora=400)
    assert sec.verificar_senha(senha, u.password_hash)
    limite.esquecer("ana@exemplo.com")
    token = sec.gerar_token(validade_segundos=3600)
    auditoria.registrar("login_ok", "users", u.id, user_id=u.id, ip_hash=ip,
                        details={"token_hash": token.hash})

    registros = auditoria.listar()
    assert len(registros) == 4
    assert sum(1 for r in registros if r.action == "login_falhou") == 3
    # o token em claro nunca chega ao banco
    for r in registros:
        assert token.valor not in str(r.details)
