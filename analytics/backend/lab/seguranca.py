"""Segurança: senhas, tokens, limite de taxa e CSRF (§28).

Escolhas e o motivo de cada uma:

**scrypt da biblioteca padrão, não uma dependência.** Argon2id seria a primeira
escolha teórica, mas exige `argon2-cffi`. scrypt é memory-hard, está no
`hashlib` desde o Python 3.6 e não adiciona superfície de dependência a um
módulo de segurança. Se `argon2-cffi` estiver instalado, ele é usado
automaticamente — e senhas gravadas com o algoritmo antigo são detectadas por
``precisa_rehash()`` e migradas no próximo login bem-sucedido.

**Parâmetros embutidos no hash.** O formato é `algoritmo$parâmetros$sal$digest`.
Sem isso, endurecer o custo no futuro invalidaria todas as senhas existentes —
e o sistema não teria como saber quais precisam de migração.

**Token nunca é guardado em claro.** O banco guarda o SHA-256 do token. Se o
banco vazar, os tokens vazados não servem para autenticar. O valor em claro
existe apenas no instante da emissão, e é devolvido uma única vez.

**Comparação em tempo constante** em toda verificação de segredo. Comparação
comum vaza, pelo tempo de resposta, quantos bytes iniciais estavam certos.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass, field
from typing import Callable

# --------------------------------------------------------------------------- #
# Senhas
# --------------------------------------------------------------------------- #

#: Parâmetros do scrypt. n=2**15 custa ~64 MB por verificação: caro o bastante
#: para inviabilizar força bruta em massa, barato o bastante para um login.
SCRYPT_N = 2 ** 15
SCRYPT_R = 8
SCRYPT_P = 1
TAMANHO_SAL = 16
TAMANHO_DIGEST = 32


def _maxmem(n: int, r: int) -> int:
    """Teto de memória para o scrypt.

    O OpenSSL usa 32 MiB por padrão e recusa parâmetros que passem disso — com
    n=2^15 e r=8 a necessidade é exatamente 32 MiB, e a chamada falha por um
    triz. Calculamos a necessidade real (128·n·r) com folga, em vez de fixar um
    número que quebraria ao endurecer os parâmetros.
    """
    return 128 * n * r * 2

try:  # pragma: no cover - depende do ambiente
    from argon2 import PasswordHasher as _ArgonHasher
    from argon2.exceptions import VerifyMismatchError as _ArgonMismatch

    _ARGON = _ArgonHasher()
except Exception:  # noqa: BLE001
    _ARGON = None


class SenhaInvalida(ValueError):
    """A senha não atende à política mínima."""


class HashCorrompido(ValueError):
    """O hash gravado não tem o formato esperado."""


#: Política mínima. Deliberadamente simples: exigir símbolos e trocas
#: periódicas produz senhas piores e anotadas em papel. Comprimento é o que
#: mais importa.
COMPRIMENTO_MINIMO = 10


def validar_politica(senha: str) -> None:
    if len(senha) < COMPRIMENTO_MINIMO:
        raise SenhaInvalida(
            f"a senha precisa de ao menos {COMPRIMENTO_MINIMO} caracteres"
        )
    if senha.strip() == "":
        raise SenhaInvalida("a senha não pode ser só espaços")


def _b64(dados: bytes) -> str:
    return base64.b64encode(dados).decode("ascii")


def _de_b64(texto: str) -> bytes:
    return base64.b64decode(texto.encode("ascii"))


def hash_senha(senha: str, *, sal: bytes | None = None) -> str:
    """Devolve `algoritmo$parâmetros$sal$digest`. A senha nunca é guardada."""
    validar_politica(senha)
    if _ARGON is not None and sal is None:  # pragma: no cover
        return _ARGON.hash(senha)
    sal = sal or secrets.token_bytes(TAMANHO_SAL)
    digest = hashlib.scrypt(
        senha.encode("utf-8"), salt=sal, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
        dklen=TAMANHO_DIGEST, maxmem=_maxmem(SCRYPT_N, SCRYPT_R),
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(sal)}${_b64(digest)}"


def verificar_senha(senha: str, gravado: str) -> bool:
    """Comparação em tempo constante. Nunca levanta para senha errada."""
    if not gravado:
        return False
    if gravado.startswith("$argon2"):  # pragma: no cover
        if _ARGON is None:
            raise HashCorrompido("hash Argon2 gravado, mas argon2-cffi não está instalado")
        try:
            return _ARGON.verify(gravado, senha)
        except _ArgonMismatch:
            return False
        except Exception as erro:  # noqa: BLE001
            raise HashCorrompido(str(erro)) from erro

    partes = gravado.split("$")
    if len(partes) != 6 or partes[0] != "scrypt":
        raise HashCorrompido("formato de hash desconhecido")
    try:
        n, r, p = int(partes[1]), int(partes[2]), int(partes[3])
        sal, esperado = _de_b64(partes[4]), _de_b64(partes[5])
    except (ValueError, TypeError) as erro:
        raise HashCorrompido("parâmetros de hash ilegíveis") from erro

    calculado = hashlib.scrypt(
        senha.encode("utf-8"), salt=sal, n=n, r=r, p=p, dklen=len(esperado),
        maxmem=_maxmem(n, r),
    )
    return hmac.compare_digest(calculado, esperado)


def precisa_rehash(gravado: str) -> bool:
    """O hash foi criado com parâmetros mais fracos que os atuais?

    Chamado após login bem-sucedido: é o único momento em que a senha em claro
    está disponível para regravar. Sem isso, endurecer os parâmetros só
    protegeria contas novas.
    """
    if gravado.startswith("$argon2"):  # pragma: no cover
        return _ARGON is None or _ARGON.check_needs_rehash(gravado)
    if _ARGON is not None:  # pragma: no cover
        return True          # migra scrypt -> Argon2id quando disponível
    partes = gravado.split("$")
    if len(partes) != 6 or partes[0] != "scrypt":
        raise HashCorrompido("formato de hash desconhecido")
    n, r, p = int(partes[1]), int(partes[2]), int(partes[3])
    return (n, r, p) != (SCRYPT_N, SCRYPT_R, SCRYPT_P)


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class TokenEmitido:
    """O valor em claro existe só aqui. O banco guarda apenas ``hash``."""

    valor: str = field(repr=False)
    hash: str
    expira_em: float

    def expirado(self, agora: float | None = None) -> bool:
        return (agora if agora is not None else time.time()) >= self.expira_em


def gerar_token(validade_segundos: int = 3600, agora: float | None = None) -> TokenEmitido:
    if validade_segundos <= 0:
        raise ValueError("a validade precisa ser positiva")
    valor = secrets.token_urlsafe(32)          # 256 bits de entropia
    base = agora if agora is not None else time.time()
    return TokenEmitido(valor=valor, hash=hash_token(valor),
                        expira_em=base + validade_segundos)


def hash_token(valor: str) -> str:
    """SHA-256 sem sal, de propósito.

    Token já é aleatório de 256 bits: não há dicionário a proteger, e o hash
    precisa ser determinístico para servir de chave de busca. Sal aqui só
    impediria a consulta, sem ganho de segurança.
    """
    return hashlib.sha256(valor.encode("utf-8")).hexdigest()


def token_confere(valor_recebido: str, hash_gravado: str) -> bool:
    return hmac.compare_digest(hash_token(valor_recebido), hash_gravado)


# --------------------------------------------------------------------------- #
# CSRF — double submit
# --------------------------------------------------------------------------- #

def gerar_csrf(segredo: str, sessao_id: str) -> str:
    """Token ligado à sessão por HMAC.

    Um token aleatório solto seria aceito em qualquer sessão; amarrado ao
    identificador da sessão, um token roubado de outra pessoa não serve.
    """
    if not segredo:
        raise ValueError("segredo do servidor ausente")
    return hmac.new(segredo.encode("utf-8"), sessao_id.encode("utf-8"),
                    hashlib.sha256).hexdigest()


def csrf_confere(segredo: str, sessao_id: str, recebido: str) -> bool:
    return hmac.compare_digest(gerar_csrf(segredo, sessao_id), recebido or "")


# --------------------------------------------------------------------------- #
# Limite de taxa
# --------------------------------------------------------------------------- #

@dataclass
class LimiteDeTaxa:
    """Janela deslizante em memória.

    Deslizante e não fixa: com janela fixa, o atacante dispara o limite no fim
    de uma janela e de novo no início da seguinte, obtendo o dobro de
    tentativas em segundos.

    Em produção o mesmo contrato deve ser servido pelo Redis — em memória, cada
    processo teria seu próprio contador e o limite real seria multiplicado pelo
    número de processos.
    """

    maximo: int
    janela_segundos: float
    _eventos: dict[str, list[float]] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if self.maximo < 1 or self.janela_segundos <= 0:
            raise ValueError("limite e janela precisam ser positivos")

    def permitir(self, chave: str, agora: float | None = None) -> bool:
        t = agora if agora is not None else time.monotonic()
        registros = [x for x in self._eventos.get(chave, []) if t - x < self.janela_segundos]
        if len(registros) >= self.maximo:
            self._eventos[chave] = registros
            return False
        registros.append(t)
        self._eventos[chave] = registros
        return True

    def restantes(self, chave: str, agora: float | None = None) -> int:
        t = agora if agora is not None else time.monotonic()
        registros = [x for x in self._eventos.get(chave, []) if t - x < self.janela_segundos]
        return max(0, self.maximo - len(registros))

    def esquecer(self, chave: str) -> None:
        """Chamado após login bem-sucedido: quem acertou não é atacante."""
        self._eventos.pop(chave, None)


# --------------------------------------------------------------------------- #
# LGPD
# --------------------------------------------------------------------------- #

def hash_ip(ip: str, segredo: str) -> str:
    """HMAC do IP para auditoria.

    Guardar o IP em claro é dado pessoal desnecessário; guardar SHA-256 puro
    seria reversível por força bruta (o espaço de IPv4 tem 4 bilhões de itens,
    percorrível em minutos). Com HMAC e segredo do servidor, não é.
    """
    if not segredo:
        raise ValueError("segredo do servidor ausente")
    return hmac.new(segredo.encode("utf-8"), ip.encode("utf-8"), hashlib.sha256).hexdigest()


def anonimizar_email(email: str) -> str:
    """Para exclusão de conta: mantém a linha para integridade, apaga a pessoa."""
    return f"apagado-{secrets.token_hex(8)}@invalido.local"
