from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from vetcare.contexts.scheduling.application.services import BookingRequest
from vetcare.contexts.scheduling.domain.appointment import (
    Appointment,
    AppointmentStatus,
    Channel,
    HistoryAction,
)
from vetcare.contexts.scheduling.domain.availability import SlotOption


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SlotResponse(BaseModel):
    start: datetime
    end: datetime

    @classmethod
    def of(cls, option: SlotOption) -> "SlotResponse":
        return cls(start=option.slot.start, end=option.slot.end)


class BookAppointmentRequest(_Request):
    pet_id: UUID
    service_type_id: UUID
    start: AwareDatetime = Field(description="Inicio con zona horaria, en múltiplos de 5 minutos.")
    resource_ids: list[UUID] = Field(
        default_factory=list,
        max_length=5,
        description="Solo personal: fijar un recurso por tipo (p. ej. una veterinaria concreta).",
    )
    client_id: UUID | None = Field(
        default=None,
        description="Solo personal: responsable que reserva; por defecto, un dueño de la mascota.",
    )
    reason: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000, description="Notas internas.")

    def to_request(self) -> BookingRequest:
        return BookingRequest(
            pet_id=self.pet_id,
            service_type_id=self.service_type_id,
            start=self.start,
            resource_ids=frozenset(self.resource_ids),
            client_id=self.client_id,
            reason=self.reason,
            notes=self.notes,
        )


class RescheduleRequest(_Request):
    start: AwareDatetime
    resource_ids: list[UUID] = Field(default_factory=list, max_length=5)


class CancelRequest(_Request):
    reason: str | None = Field(default=None, max_length=300)


class HistoryResponse(BaseModel):
    at: datetime
    action: HistoryAction
    start: datetime
    end: datetime
    note: str | None


class AppointmentResponse(BaseModel):
    id: UUID
    pet_id: UUID
    pet_name: str
    client_id: UUID
    service_type_id: UUID
    service_name: str
    start: datetime
    end: datetime
    status: AppointmentStatus
    channel: Channel
    resource_ids: list[UUID]
    reason: str | None
    cancellation_reason: str | None
    created_at: datetime
    notes: str | None = Field(description="Notas internas: solo para el personal.")
    history: list[HistoryResponse] | None = Field(description="Solo para el personal.")

    @classmethod
    def of(cls, a: Appointment, *, staff: bool) -> "AppointmentResponse":
        return cls(
            id=a.id,
            pet_id=a.pet_id,
            pet_name=a.pet_name,
            client_id=a.client_id,
            service_type_id=a.service_type_id,
            service_name=a.service_name,
            start=a.slot.start,
            end=a.slot.end,
            status=a.status,
            channel=a.channel,
            resource_ids=sorted(a.resource_ids),
            reason=a.reason,
            cancellation_reason=a.cancellation_reason,
            created_at=a.created_at,
            notes=a.notes if staff else None,
            history=[
                HistoryResponse(
                    at=h.at, action=h.action, start=h.slot.start, end=h.slot.end, note=h.note
                )
                for h in a.history
            ]
            if staff
            else None,
        )
