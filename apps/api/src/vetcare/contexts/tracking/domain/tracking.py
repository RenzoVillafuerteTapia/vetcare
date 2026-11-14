"""Seguimiento de un servicio por etapas (baño, cirugía u otra atención).

- Las etapas salen de una plantilla según la categoría del servicio y se copian al iniciar: un
  cambio posterior de la plantilla no altera un seguimiento en curso.
- Se avanza de a una etapa. El paso a la última etapa de una cirugía es el **alta** y solo lo
  autoriza un veterinario.
- Al llegar a la última etapa la mascota queda **lista**; después se **entrega** a quien la recoge.
- Los avances publicados son textos para el dueño; el personal decide qué contar.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import ClassVar, TypedDict
from uuid import UUID

from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.errors import ConflictError, FieldError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id

MAX_UPDATE_LENGTH = 500


@dataclass(frozen=True)
class Stage:
    code: str
    label: str


class Template(StrEnum):
    GROOMING = "grooming"
    SURGERY = "surgery"
    GENERAL = "general"


TEMPLATES: dict[Template, tuple[Stage, ...]] = {
    Template.GROOMING: (
        Stage("received", "Recibido"),
        Stage("bathing", "Baño"),
        Stage("drying", "Secado"),
        Stage("styling", "Corte y peinado"),
        Stage("ready", "Listo para recoger"),
    ),
    Template.SURGERY: (
        Stage("admitted", "Ingreso"),
        Stage("pre_op", "Preparación"),
        Stage("surgery", "En cirugía"),
        Stage("recovery", "Recuperación"),
        Stage("discharged", "Alta autorizada"),
    ),
    Template.GENERAL: (
        Stage("in_care", "En atención"),
        Stage("ready", "Listo para recoger"),
    ),
}

# Categorías de servicio (Clinic Setup) → plantilla.
TEMPLATE_BY_CATEGORY = {
    "grooming": Template.GROOMING,
    "surgery": Template.SURGERY,
    "hospitalization": Template.SURGERY,
}


def template_for(category: str) -> Template:
    return TEMPLATE_BY_CATEGORY.get(category, Template.GENERAL)


class TrackingStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    READY = "ready"
    HANDED_OVER = "handed_over"


class EntryKind(StrEnum):
    STAGE = "stage"
    UPDATE = "update"
    HANDED_OVER = "handed_over"


@dataclass(frozen=True)
class TimelineEntry:
    id: UUID
    at: datetime
    by: UUID
    kind: EntryKind
    stage_index: int | None = None
    text: str | None = None


# --- Eventos --------------------------------------------------------------------------------


@dataclass(frozen=True, kw_only=True)
class TrackingEvent(DomainEvent):
    appointment_id: UUID
    pet_id: UUID
    pet_name: str
    client_id: UUID
    template: str


@dataclass(frozen=True, kw_only=True)
class TrackingStarted(TrackingEvent):
    event_type: ClassVar[str] = "tracking.started"
    stage: str


@dataclass(frozen=True, kw_only=True)
class StageChanged(TrackingEvent):
    event_type: ClassVar[str] = "tracking.stage_changed"
    stage: str
    stage_label: str
    is_last: bool


@dataclass(frozen=True, kw_only=True)
class UpdatePublished(TrackingEvent):
    event_type: ClassVar[str] = "tracking.update_published"


@dataclass(frozen=True, kw_only=True)
class HandedOver(TrackingEvent):
    event_type: ClassVar[str] = "tracking.handed_over"


class _Fields(TypedDict):
    aggregate_id: UUID
    occurred_at: datetime
    appointment_id: UUID
    pet_id: UUID
    pet_name: str
    client_id: UUID
    template: str


# --- Agregado -------------------------------------------------------------------------------


@dataclass
class TrackedService(AggregateRoot):
    aggregate_type: ClassVar[str] = "tracked_service"

    id: UUID
    appointment_id: UUID
    pet_id: UUID
    pet_name: str
    client_id: UUID
    service_name: str
    template: Template
    stages: tuple[Stage, ...]
    current: int
    status: TrackingStatus
    started_at: datetime
    updated_at: datetime
    timeline: list[TimelineEntry] = field(default_factory=list)
    version: int = field(default=0, compare=False)

    @classmethod
    def start(
        cls,
        *,
        appointment_id: UUID,
        pet_id: UUID,
        pet_name: str,
        client_id: UUID,
        service_name: str,
        category: str,
        by: UUID,
        now: datetime,
    ) -> "TrackedService":
        template = template_for(category)
        service = cls(
            id=new_id(),
            appointment_id=appointment_id,
            pet_id=pet_id,
            pet_name=pet_name,
            client_id=client_id,
            service_name=service_name,
            template=template,
            stages=TEMPLATES[template],
            current=0,
            status=TrackingStatus.IN_PROGRESS,
            started_at=now,
            updated_at=now,
        )
        service.timeline.append(TimelineEntry(new_id(), now, by, EntryKind.STAGE, stage_index=0))
        service.record(TrackingStarted(**service._fields(now), stage=service.stages[0].code))
        return service

    @property
    def current_stage(self) -> Stage:
        return self.stages[self.current]

    @property
    def next_stage(self) -> Stage | None:
        return self.stages[self.current + 1] if self.current + 1 < len(self.stages) else None

    @property
    def advancing_needs_discharge(self) -> bool:
        """El siguiente paso es el alta de una cirugía: lo autoriza un veterinario."""
        return self.template is Template.SURGERY and self.current + 1 == len(self.stages) - 1

    def advance(self, by: UUID, now: datetime, *, from_stage: str) -> None:
        """Pasa a la etapa siguiente. ``from_stage`` evita que dos personas avancen dos veces
        al tocar el botón casi a la vez: si la etapa ya cambió, responde conflicto."""
        if self.status is not TrackingStatus.IN_PROGRESS or self.next_stage is None:
            raise ConflictError(
                "El servicio ya terminó todas sus etapas.", code="tracking_finished"
            )
        if from_stage != self.current_stage.code:
            raise ConflictError(
                f"La etapa ya cambió a «{self.current_stage.label}». Recarga para ver el estado.",
                code="stage_changed",
            )
        self.current += 1
        self.updated_at = now
        is_last = self.current == len(self.stages) - 1
        if is_last:
            self.status = TrackingStatus.READY
        self.timeline.append(
            TimelineEntry(new_id(), now, by, EntryKind.STAGE, stage_index=self.current)
        )
        self.record(
            StageChanged(
                **self._fields(now),
                stage=self.current_stage.code,
                stage_label=self.current_stage.label,
                is_last=is_last,
            )
        )

    def publish_update(self, by: UUID, now: datetime, text: str) -> TimelineEntry:
        clean = text.strip()
        if not clean or len(clean) > MAX_UPDATE_LENGTH:
            message = f"Escribe el avance (máximo {MAX_UPDATE_LENGTH} caracteres)."
            raise ValidationFailedError(message, [FieldError("text", message)])
        if self.status is TrackingStatus.HANDED_OVER:
            raise ConflictError("La mascota ya fue entregada.", code="tracking_finished")
        entry = TimelineEntry(new_id(), now, by, EntryKind.UPDATE, text=clean)
        self.timeline.append(entry)
        self.updated_at = now
        # El texto no viaja en el evento: el aviso es genérico y el detalle se lee en la app.
        self.record(UpdatePublished(**self._fields(now)))
        return entry

    def hand_over(self, by: UUID, now: datetime) -> None:
        if self.status is not TrackingStatus.READY:
            raise ConflictError(
                "Solo se entrega una mascota lista para recoger.", code="tracking_not_ready"
            )
        self.status = TrackingStatus.HANDED_OVER
        self.updated_at = now
        self.timeline.append(TimelineEntry(new_id(), now, by, EntryKind.HANDED_OVER))
        self.record(HandedOver(**self._fields(now)))

    def stage_reached_at(self, index: int) -> datetime | None:
        return next(
            (
                e.at
                for e in reversed(self.timeline)
                if e.kind is EntryKind.STAGE and e.stage_index == index
            ),
            None,
        )

    def _fields(self, now: datetime) -> _Fields:
        return {
            "aggregate_id": self.id,
            "occurred_at": now,
            "appointment_id": self.appointment_id,
            "pet_id": self.pet_id,
            "pet_name": self.pet_name,
            "client_id": self.client_id,
            "template": self.template.value,
        }
