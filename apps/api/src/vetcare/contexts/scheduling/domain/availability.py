"""Cálculo de disponibilidad: dónde cabe un servicio y qué recursos ocupa.

Es Python puro: recibe el horario de la sede, los recursos candidatos y lo ya ocupado, y no sabe
de dónde vienen. La reserva vuelve a verificar todo dentro de una transacción con los recursos
bloqueados, porque entre consultar y reservar otra persona puede haber ocupado el horario.
"""

from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from vetcare.contexts.scheduling.domain.appointment import TimeSlot


class Bookable(Protocol):
    """Un recurso agendable visto desde la agenda."""

    @property
    def id(self) -> UUID: ...

    def is_available(self, start: datetime, end: datetime) -> bool: ...


@dataclass(frozen=True)
class SlotOption:
    slot: TimeSlot
    resource_ids: frozenset[UUID]


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
    ) -> list[SlotOption]:
        options: list[SlotOption] = []
        start = day_start
        while start + timedelta(minutes=duration_minutes) <= day_end:
            if start >= not_before:
                slot = TimeSlot.starting(start, duration_minutes)
                resource_ids = self.assign(slot)
                if resource_ids is not None:
                    options.append(SlotOption(slot, resource_ids))
            start += timedelta(minutes=step_minutes)
        return options

    def _is_free(self, resource: Bookable, slot: TimeSlot) -> bool:
        return resource.is_available(slot.start, slot.end) and not any(
            slot.overlaps(other) for other in self._busy.get(resource.id, ())
        )
