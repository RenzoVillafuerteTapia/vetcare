"""Cálculo de disponibilidad: dónde cabe un servicio y qué recursos ocupa.

Es Python puro: recibe el horario de la sede, los recursos candidatos y lo ya ocupado, y no sabe
de dónde vienen. La reserva vuelve a verificar todo dentro de una transacción con los recursos
bloqueados, porque entre consultar y reservar otra persona puede haber ocupado el horario.
"""

from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from vetcare.contexts.scheduling.domain.appointment import TimeSlot


class Bookable(Protocol):
    """Un recurso agendable visto desde la agenda."""

    @property
    def id(self) -> UUID: ...

    def is_available(self, start: datetime, end: datetime) -> bool: ...


class SlotStatus(StrEnum):
    FREE = "free"
    # Dentro del horario de la sede, pero sin recurso libre (o el profesional elegido ocupado).
    TAKEN = "taken"
    # Aún no pasó, pero está dentro de la antelación mínima del cliente.
    TOO_SOON = "too_soon"


@dataclass(frozen=True)
class SlotOption:
    slot: TimeSlot
    resource_ids: frozenset[UUID] = field(default_factory=frozenset)
    status: SlotStatus = SlotStatus.FREE


class Availability:
    def __init__(
        self,
        *,
        candidates: Mapping[str, Sequence[Bookable]],
        busy: Mapping[UUID, Iterable[TimeSlot]],
        is_open: Callable[[datetime, datetime], bool],
    ) -> None:
        """``candidates``: recursos por tipo requerido, en orden de preferencia.
        ``busy``: lo que ya ocupa cada recurso (citas activas)."""
        self._candidates = candidates
        self._busy = {resource_id: list(slots) for resource_id, slots in busy.items()}
        self._is_open = is_open

    def assign(
        self, slot: TimeSlot, preferred: Mapping[str, UUID] | None = None
    ) -> frozenset[UUID] | None:
        """Un recurso libre por cada tipo requerido, o None si el horario no cabe."""
        if not self._is_open(slot.start, slot.end):
            return None
        chosen: set[UUID] = set()
        for kind, resources in sorted(self._candidates.items()):
            wanted = (preferred or {}).get(kind)
            pool = [r for r in resources if wanted is None or r.id == wanted]
            free = next((r for r in pool if self._is_free(r, slot)), None)
            if free is None:
                return None
            chosen.add(free.id)
        return frozenset(chosen)

    def slots(
        self,
        *,
        day_start: datetime,
        day_end: datetime,
        duration_minutes: int,
        step_minutes: int,
        not_before: datetime,
        preferred: Mapping[str, UUID] | None = None,
        include_unavailable: bool = False,
        now: datetime | None = None,
    ) -> list[SlotOption]:
        """Horarios donde cabe el servicio. Con ``preferred``, solo con esos recursos (p. ej. el
        veterinario que eligió el cliente).

        Con ``include_unavailable`` también devuelve, marcados, los horarios de la sede que están
        ocupados y los que caen dentro de la antelación mínima (desde ``now``): así se puede
        mostrar el día completo, como la sala de un cine. Lo que ya pasó o con la sede cerrada
        nunca se devuelve.
        """
        shown_from = now if now is not None else not_before
        options: list[SlotOption] = []
        start = day_start
        while start + timedelta(minutes=duration_minutes) <= day_end:
            slot = TimeSlot.starting(start, duration_minutes)
            if start >= shown_from and self._is_open(slot.start, slot.end):
                if start < not_before:
                    if include_unavailable:
                        options.append(SlotOption(slot, status=SlotStatus.TOO_SOON))
                else:
                    resource_ids = self.assign(slot, preferred)
                    if resource_ids is not None:
                        options.append(SlotOption(slot, resource_ids))
                    elif include_unavailable:
                        options.append(SlotOption(slot, status=SlotStatus.TAKEN))
            start += timedelta(minutes=step_minutes)
        return options

    def _is_free(self, resource: Bookable, slot: TimeSlot) -> bool:
        return resource.is_available(slot.start, slot.end) and not any(
            slot.overlaps(other) for other in self._busy.get(resource.id, ())
        )
