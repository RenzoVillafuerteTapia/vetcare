from types import TracebackType
from typing import Protocol, Self

from vetcare.shared_kernel.domain import AggregateRoot


class UnitOfWork(Protocol):
    """Una transacción por caso de uso.

    Los casos de uso registran con ``track`` los agregados que modificaron. Al confirmar, la
    implementación guarda sus eventos en el outbox dentro de la misma transacción. Salir del
    bloque sin ``commit`` (o con una excepción) deshace todo.
    """

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...

    def track(self, aggregate: AggregateRoot) -> None: ...

    async def commit(self) -> None: ...
