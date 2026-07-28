"""Fila de tarefas em segundo plano.

Um backtest com 10.000 simulações não cabe num ciclo de requisição HTTP: o
cliente receberia timeout e o servidor ficaria preso. A API enfileira, devolve
um identificador e o cliente acompanha.

Esta implementação é **em processo**, com um pool de threads. É suficiente para
um servidor único e mantém o comportamento testável sem infraestrutura. Em
produção com vários processos, o registro precisa migrar para Redis ou uma
tabela — do contrário cada processo teria a sua fila e o cliente consultaria
um identificador que o outro processo não conhece. Está declarado aqui e no
README em vez de ser descoberto em produção.

A thread só orquestra: o trabalho pesado desce para `simulacao`, que usa
processos e não sofre com o GIL.
"""

from __future__ import annotations

import threading
import traceback
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable


class Situacao(str, Enum):
    NA_FILA = "na_fila"
    EXECUTANDO = "executando"
    CONCLUIDA = "concluida"
    FALHOU = "falhou"
    CANCELADA = "cancelada"


@dataclass
class Tarefa:
    id: str
    descricao: str
    situacao: Situacao = Situacao.NA_FILA
    criada_em: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    iniciada_em: datetime | None = None
    concluida_em: datetime | None = None
    resultado: Any = None
    erro: str | None = None
    #: Identificador do dono. Uma tarefa só é visível para quem a criou.
    user_id: str | None = None

    def para_json(self) -> dict[str, Any]:
        return {
            "id": self.id, "descricao": self.descricao,
            "situacao": self.situacao.value,
            "criada_em": self.criada_em.isoformat(),
            "iniciada_em": self.iniciada_em.isoformat() if self.iniciada_em else None,
            "concluida_em": self.concluida_em.isoformat() if self.concluida_em else None,
            "resultado": self.resultado,
            "erro": self.erro,
        }


class Fila:
    """Registro de tarefas com execução assíncrona."""

    def __init__(self, trabalhadores: int = 2, limite_por_usuario: int = 3):
        if trabalhadores < 1:
            raise ValueError("é preciso ao menos um trabalhador")
        self._executor = ThreadPoolExecutor(max_workers=trabalhadores)
        self._tarefas: dict[str, Tarefa] = {}
        self._futuros: dict[str, Future] = {}
        self._trava = threading.Lock()
        #: Impede que um usuário ocupe a fila inteira. Sem isso, um cliente
        #: dispara mil backtests e trava o serviço para todos os outros.
        self.limite_por_usuario = limite_por_usuario

    # ------------------------------------------------------------------ #
    def enfileirar(self, descricao: str, funcao: Callable[[], Any],
                   user_id: str | None = None) -> Tarefa:
        with self._trava:
            ativas = sum(
                1 for t in self._tarefas.values()
                if t.user_id == user_id
                and t.situacao in (Situacao.NA_FILA, Situacao.EXECUTANDO))
            if user_id is not None and ativas >= self.limite_por_usuario:
                raise LimiteDeTarefas(
                    f"{ativas} tarefas suas já estão na fila; aguarde uma terminar")
            tarefa = Tarefa(id=str(uuid.uuid4()), descricao=descricao, user_id=user_id)
            self._tarefas[tarefa.id] = tarefa

        def executar() -> Any:
            with self._trava:
                if tarefa.situacao is Situacao.CANCELADA:
                    return None
                tarefa.situacao = Situacao.EXECUTANDO
                tarefa.iniciada_em = datetime.now(timezone.utc)
            try:
                valor = funcao()
            except Exception as erro:  # noqa: BLE001 — a fila absorve e registra
                with self._trava:
                    tarefa.situacao = Situacao.FALHOU
                    # Mensagem para o cliente; traceback fica no log do servidor.
                    tarefa.erro = f"{type(erro).__name__}: {erro}"
                    tarefa.concluida_em = datetime.now(timezone.utc)
                traceback.print_exc()
                return None
            with self._trava:
                tarefa.resultado = valor
                tarefa.situacao = Situacao.CONCLUIDA
                tarefa.concluida_em = datetime.now(timezone.utc)
            return valor

        self._futuros[tarefa.id] = self._executor.submit(executar)
        return tarefa

    def obter(self, tarefa_id: str, user_id: str | None = None) -> Tarefa | None:
        tarefa = self._tarefas.get(tarefa_id)
        if tarefa is None:
            return None
        # Resposta idêntica para "não existe" e "não é sua": distinguir os dois
        # permitiria descobrir quais identificadores existem.
        if user_id is not None and tarefa.user_id != user_id:
            return None
        return tarefa

    def listar(self, user_id: str | None = None) -> list[Tarefa]:
        return [t for t in self._tarefas.values()
                if user_id is None or t.user_id == user_id]

    def cancelar(self, tarefa_id: str, user_id: str | None = None) -> bool:
        """Cancela se ainda não começou. Tarefa em execução não é interrompida."""
        tarefa = self.obter(tarefa_id, user_id)
        if tarefa is None or tarefa.situacao is not Situacao.NA_FILA:
            return False
        with self._trava:
            tarefa.situacao = Situacao.CANCELADA
            tarefa.concluida_em = datetime.now(timezone.utc)
        self._futuros.get(tarefa_id, Future()).cancel()
        return True

    def aguardar(self, tarefa_id: str, timeout: float | None = None) -> Tarefa | None:
        """Bloqueia até a tarefa terminar. Existe para os testes, não para a API."""
        futuro = self._futuros.get(tarefa_id)
        if futuro is not None:
            futuro.result(timeout=timeout)
        return self._tarefas.get(tarefa_id)

    def encerrar(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


class LimiteDeTarefas(RuntimeError):
    """O usuário já tem tarefas demais na fila."""
