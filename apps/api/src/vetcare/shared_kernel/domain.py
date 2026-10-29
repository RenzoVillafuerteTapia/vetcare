from dataclasses import dataclass, field
from datetime import datetime
from typing import ClassVar
from uuid import UUID

from vetcare.shared_kernel.ids import new_id


@dataclass(frozen=True, kw_only=True)
class DomainEvent:
    """Algo que ocurrió en el dominio. Se publica por el outbox después de confirmar la transacción.

    Cada subclase define ``event_type`` (nombre estable, p. ej.
    ``"scheduling.appointment_confirmed"``) y ``schema_version``. La carga útil son los demás
    campos y nunca debe contener secretos.
    """

    event_type: ClassVar[str]
    schema_version: ClassVar[int] = 1

    aggregate_id: UUID
    occurred_at: datetime
    event_id: UUID = field(default_factory=new_id)


class AggregateRoot:
    """Raíz de agregado: protege sus invariantes y acumula los eventos que registra.

    Los eventos se guardan fuera de los campos declarados para que las subclases puedan ser
    dataclasses sin llamar a ``super().__init__``.
    """

    aggregate_type: ClassVar[str]

    def record(self, event: DomainEvent) -> None:
        self.__dict__.setdefault("_pending_events", []).append(event)

    def pull_events(self) -> list[DomainEvent]:
        events: list[DomainEvent] = self.__dict__.pop("_pending_events", [])
        return events
