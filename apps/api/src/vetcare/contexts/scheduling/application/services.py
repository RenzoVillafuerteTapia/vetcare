"""Casos de uso de la agenda.

Quién puede qué:
- Personal con ``appointments:manage``: agenda citas ya confirmadas y gestiona todo el ciclo.
- Personal con ``appointments:read``: consulta la agenda.
- Cliente (``own:appointments:manage``): solicita citas para mascotas donde su tutela permite
  reservar (``book``), solo para servicios reservables; ve las citas de sus mascotas; reprograma o
  cancela con la antelación de la política. Lo ajeno responde 404.

Una reserva nunca confía en la disponibilidad que el cliente vio: dentro de la transacción se
bloquean los recursos candidatos y se vuelve a calcular.
"""

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from uuid import UUID

from vetcare.contexts.clinic.public import (
    CLINIC_TZ,
    ClinicCatalog,
    OpeningRules,
    ResourceView,
    ServiceTypeView,
)
from vetcare.contexts.customers.public import PetAccess, PetAction, PetStatus, PetSummary
from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.contexts.scheduling.application.ports import SchedulingUnitOfWork, StoredRequest
from vetcare.contexts.scheduling.domain.appointment import (
    Appointment,
    AppointmentStatus,
    Channel,
    SchedulingPolicy,
    TimeSlot,
)
from vetcare.contexts.scheduling.domain.availability import Availability, SlotOption
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import (
    ConflictError,
    FieldError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailedError,
)

APPOINTMENT_NOT_FOUND = "La cita no existe."
SLOT_UNAVAILABLE = ConflictError(
    "El horario ya no está disponible. Elige otro.", code="slot_unavailable"
)


@dataclass(frozen=True)
class BookingRequest:
    pet_id: UUID
    service_type_id: UUID
    start: datetime
    resource_ids: frozenset[UUID] = frozenset()
    client_id: UUID | None = None
    reason: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class Idempotency:
    key: str
    request_hash: str


@dataclass(frozen=True)
class BookingResult:
    appointment: Appointment
    replayed: bool


@dataclass(frozen=True)
class _Viewer:
    staff: bool
    client_id: UUID | None


def _ids(candidates: dict[str, list[ResourceView]]) -> set[UUID]:
    return {r.id for rs in candidates.values() for r in rs}


def _invalid(field_name: str, message: str) -> ValidationFailedError:
    return ValidationFailedError(message, [FieldError(field_name, message)])


class SchedulingService:
    def __init__(
        self,
        *,
        uow_factory: Callable[[], SchedulingUnitOfWork],
        catalog: ClinicCatalog,
        pets: PetAccess,
        clock: Clock,
        policy: SchedulingPolicy | None = None,
    ) -> None:
        self._uow_factory = uow_factory
        self._catalog = catalog
        self._pets = pets
        self._clock = clock
        self._policy = policy or SchedulingPolicy()

    # --- Disponibilidad ---------------------------------------------------------------------

    async def availability(
        self, actor: AuthenticatedUser, service_type_id: UUID, day: date
    ) -> list[SlotOption]:
        viewer = await self._viewer(actor)
        service = await self._service(service_type_id, viewer)
        if not service.active:
            return []
        candidates = await self._candidates(service)
        rules = await self._catalog.opening_rules()
        day_start = datetime.combine(day, time(0), CLINIC_TZ)
        day_end = day_start + timedelta(days=1)
        async with self._uow_factory() as uow:
            busy = await uow.appointments.busy(_ids(candidates), TimeSlot(day_start, day_end))
        now = self._clock.now()
        not_before = now + self._policy.client_booking_lead if not viewer.staff else now
        return Availability(candidates=candidates, busy=busy, is_open=rules.is_open).slots(
            day_start=day_start,
            day_end=day_end,
            duration_minutes=service.duration_minutes,
            step_minutes=self._policy.slot_step_minutes,
            not_before=not_before,
        )

    # --- Reserva ----------------------------------------------------------------------------

    async def book(
        self,
        actor: AuthenticatedUser,
        request: BookingRequest,
        idempotency: Idempotency | None = None,
    ) -> BookingResult:
        viewer = await self._viewer(actor, write=True)
        now = self._clock.now()

        if idempotency is not None:
            async with self._uow_factory() as uow:
                replay = await self._replay(uow, actor, idempotency)
            if replay is not None:
                return BookingResult(replay, replayed=True)

        pet = await self._pet(request.pet_id)
        client_id = await self._booking_client(viewer, pet, request.client_id)
        service = await self._service(request.service_type_id, viewer)
        if not service.active:
            raise ConflictError("El servicio no está disponible.", code="service_inactive")
        slot = self._slot(request.start, service, viewer, now)
        candidates = await self._candidates(service)
        preferred = self._preferred(request.resource_ids, candidates)
        rules = await self._catalog.opening_rules()

        async with self._uow_factory() as uow:
            await uow.appointments.lock_resources(_ids(candidates))
            # Con los recursos bloqueados: si una solicitud igual se confirmó mientras esperábamos,
            # se devuelve su cita en lugar de reservar otra vez.
            if idempotency is not None:
                replay = await self._replay(uow, actor, idempotency)
                if replay is not None:
                    return BookingResult(replay, replayed=True)
            resource_ids = await self._reserve(uow, candidates, rules, slot, preferred)
            appointment = Appointment.book(
                pet_id=pet.id,
                pet_name=pet.name,
                client_id=client_id,
                service_type_id=service.id,
                service_name=service.name,
                slot=slot,
                resource_ids=resource_ids,
                channel=Channel.STAFF if viewer.staff else Channel.CLIENT,
                by=actor.id,
                now=now,
                reason=request.reason,
                notes=request.notes if viewer.staff else None,
            )
            await uow.appointments.add(appointment)
            uow.track(appointment)
            if idempotency is not None:
                await uow.idempotency.save(
                    actor.id,
                    idempotency.key,
                    StoredRequest(idempotency.request_hash, appointment.id),
                    now,
                )
            await uow.commit()
        return BookingResult(appointment, replayed=False)

    async def reschedule(
        self,
        actor: AuthenticatedUser,
        appointment_id: UUID,
        start: datetime,
        resource_ids: frozenset[UUID] = frozenset(),
    ) -> Appointment:
        viewer = await self._viewer(actor, write=True)
        now = self._clock.now()
        async with self._uow_factory() as uow:
            current = await self._load(uow, appointment_id, viewer, action=PetAction.BOOK)
            service_type_id = current.service_type_id
        service = await self._service(service_type_id, viewer)
        slot = self._slot(start, service, viewer, now)
        candidates = await self._candidates(service)
        preferred = self._preferred(resource_ids, candidates)
        rules = await self._catalog.opening_rules()

        async with self._uow_factory() as uow:
            appointment = await self._load(
                uow, appointment_id, viewer, action=PetAction.BOOK, for_update=True
            )
            assigned = await self._reserve(
                uow, candidates, rules, slot, preferred, exclude=appointment.id
            )
            appointment.reschedule(
                slot,
                assigned,
                actor.id,
                now,
                by_client=not viewer.staff,
                policy=self._policy,
            )
            await uow.appointments.save(appointment)
            uow.track(appointment)
            await uow.commit()
        return appointment

    # --- Ciclo de vida ----------------------------------------------------------------------

    async def cancel(
        self, actor: AuthenticatedUser, appointment_id: UUID, reason: str | None
    ) -> Appointment:
        viewer = await self._viewer(actor, write=True)

        def apply(a: Appointment, now: datetime) -> None:
            a.cancel(actor.id, now, reason, by_client=not viewer.staff, policy=self._policy)

        return await self._transition(viewer, appointment_id, apply, staff_only=False)

    async def confirm(self, actor: AuthenticatedUser, appointment_id: UUID) -> Appointment:
        viewer = await self._viewer(actor, write=True)
        return await self._transition(
            viewer, appointment_id, lambda a, now: a.confirm(actor.id, now)
        )

    async def check_in(self, actor: AuthenticatedUser, appointment_id: UUID) -> Appointment:
        viewer = await self._viewer(actor, write=True)
        return await self._transition(
            viewer, appointment_id, lambda a, now: a.check_in(actor.id, now)
        )

    async def complete(self, actor: AuthenticatedUser, appointment_id: UUID) -> Appointment:
        viewer = await self._viewer(actor, write=True)
        return await self._transition(
            viewer, appointment_id, lambda a, now: a.complete(actor.id, now)
        )

    async def mark_no_show(self, actor: AuthenticatedUser, appointment_id: UUID) -> Appointment:
        viewer = await self._viewer(actor, write=True)
        return await self._transition(
            viewer, appointment_id, lambda a, now: a.mark_no_show(actor.id, now)
        )

    # --- Consultas --------------------------------------------------------------------------

    async def get(self, actor: AuthenticatedUser, appointment_id: UUID) -> Appointment:
        viewer = await self._viewer(actor)
        async with self._uow_factory() as uow:
            return await self._load(uow, appointment_id, viewer, action=PetAction.VIEW)

    async def agenda(
        self,
        actor: AuthenticatedUser,
        start: datetime,
        end: datetime,
        *,
        resource_id: UUID | None = None,
        statuses: frozenset[AppointmentStatus] | None = None,
    ) -> list[Appointment]:
        if not actor.has_permission(Permission.APPOINTMENTS_READ):
            raise PermissionDeniedError("Solo el personal consulta la agenda.")
        if end <= start or end - start > timedelta(days=62):
            raise _invalid("to", "Consulta un periodo de hasta 62 días.")
        async with self._uow_factory() as uow:
            return await uow.appointments.between(
                start, end, resource_id=resource_id, statuses=statuses
            )

    async def my_appointments(self, actor: AuthenticatedUser) -> list[Appointment]:
        """Citas de las mascotas del cliente: las próximas y las de los últimos 90 días."""
        viewer = await self._viewer(actor)
        if viewer.staff or viewer.client_id is None:
            return []
        pet_ids = await self._pets.pet_ids_of(viewer.client_id)
        if not pet_ids:
            return []
        async with self._uow_factory() as uow:
            return await uow.appointments.of_pets(pet_ids, self._clock.now() - timedelta(days=90))

    # --- Auxiliares -------------------------------------------------------------------------

    async def _viewer(self, actor: AuthenticatedUser, *, write: bool = False) -> _Viewer:
        staff_permission = Permission.APPOINTMENTS_MANAGE if write else Permission.APPOINTMENTS_READ
        if actor.has_permission(staff_permission):
            return _Viewer(staff=True, client_id=None)
        if actor.has_permission(Permission.OWN_APPOINTMENTS_MANAGE):
            return _Viewer(staff=False, client_id=await self._pets.client_id_of(actor.id))
        raise PermissionDeniedError("No tienes permiso para gestionar citas.")

    async def _service(self, service_type_id: UUID, viewer: _Viewer) -> ServiceTypeView:
        service = await self._catalog.service_type(service_type_id)
        if service is None or (not viewer.staff and not service.bookable_by_client):
            raise NotFoundError("El servicio no existe.")
        return service

    async def _pet(self, pet_id: UUID) -> PetSummary:
        pet = await self._pets.pet(pet_id)
        if pet is None:
            raise NotFoundError("La mascota no existe.")
        return pet

    async def _booking_client(
        self, viewer: _Viewer, pet: PetSummary, requested: UUID | None
    ) -> UUID:
        if not viewer.staff:
            if viewer.client_id is None or viewer.client_id not in pet.guardian_ids:
                raise NotFoundError("La mascota no existe.")
            if not await self._pets.allows(viewer.client_id, pet.id, PetAction.BOOK):
                raise PermissionDeniedError(
                    "Tu autorización sobre esta mascota no incluye reservar citas."
                )
            return viewer.client_id
        if pet.status is not PetStatus.ACTIVE:
            raise ConflictError("La mascota no está activa.", code="pet_inactive")
        if requested is not None:
            if requested not in pet.guardian_ids:
                raise _invalid("client_id", "Ese cliente no es responsable de la mascota.")
            return requested
        return min(pet.owner_ids)

    def _slot(
        self, start: datetime, service: ServiceTypeView, viewer: _Viewer, now: datetime
    ) -> TimeSlot:
        if start.tzinfo is None:
            raise _invalid("start", "Indica la hora con zona horaria.")
        local = start.astimezone(CLINIC_TZ)
        if local.minute % 5 or local.second or local.microsecond:
            raise _invalid("start", "Las citas empiezan en múltiplos de 5 minutos.")
        earliest = now + self._policy.client_booking_lead if not viewer.staff else now
        if start < earliest - (timedelta(minutes=5) if viewer.staff else timedelta(0)):
            raise _invalid("start", "Elige un horario futuro.")
        return TimeSlot.starting(start, service.duration_minutes)

    async def _candidates(self, service: ServiceTypeView) -> dict[str, list[ResourceView]]:
        resources = await self._catalog.active_resources(service.required_resources)
        grouped: dict[str, list[ResourceView]] = defaultdict(list)
        for r in resources:
            grouped[r.kind.value].append(r)
        for kind in service.required_resources:
            grouped.setdefault(kind.value, [])
        return dict(grouped)

    @staticmethod
    def _preferred(
        resource_ids: frozenset[UUID], candidates: dict[str, list[ResourceView]]
    ) -> dict[str, UUID]:
        by_id = {r.id: kind for kind, rs in candidates.items() for r in rs}
        preferred: dict[str, UUID] = {}
        for resource_id in resource_ids:
            kind = by_id.get(resource_id)
            if kind is None:
                raise _invalid("resource_ids", "Ese recurso no presta este servicio.")
            if kind in preferred:
                raise _invalid("resource_ids", "Elige un solo recurso de cada tipo.")
            preferred[kind] = resource_id
        return preferred

    @staticmethod
    async def _reserve(
        uow: SchedulingUnitOfWork,
        candidates: dict[str, list[ResourceView]],
        rules: OpeningRules,
        slot: TimeSlot,
        preferred: dict[str, UUID],
        *,
        exclude: UUID | None = None,
    ) -> frozenset[UUID]:
        resource_ids = _ids(candidates)
        await uow.appointments.lock_resources(resource_ids)
        busy = await uow.appointments.busy(resource_ids, slot, exclude=exclude)
        assigned = Availability(candidates=candidates, busy=busy, is_open=rules.is_open).assign(
            slot, preferred
        )
        if assigned is None:
            raise SLOT_UNAVAILABLE
        return assigned

    @staticmethod
    async def _replay(
        uow: SchedulingUnitOfWork, actor: AuthenticatedUser, idempotency: Idempotency
    ) -> Appointment | None:
        stored = await uow.idempotency.get(actor.id, idempotency.key)
        if stored is None:
            return None
        if stored.request_hash != idempotency.request_hash:
            raise ConflictError(
                "Esa clave de idempotencia ya se usó con otra solicitud.",
                code="idempotency_key_reused",
            )
        return await uow.appointments.get(stored.appointment_id)

    async def _load(
        self,
        uow: SchedulingUnitOfWork,
        appointment_id: UUID,
        viewer: _Viewer,
        *,
        action: PetAction,
        for_update: bool = False,
    ) -> Appointment:
        appointment = await uow.appointments.get(appointment_id, for_update=for_update)
        if appointment is None:
            raise NotFoundError(APPOINTMENT_NOT_FOUND)
        if viewer.staff:
            return appointment
        if viewer.client_id is None or not await self._pets.allows(
            viewer.client_id, appointment.pet_id, PetAction.VIEW
        ):
            raise NotFoundError(APPOINTMENT_NOT_FOUND)
        if action is not PetAction.VIEW and not await self._pets.allows(
            viewer.client_id, appointment.pet_id, action
        ):
            raise PermissionDeniedError(
                "Tu autorización sobre esta mascota no incluye gestionar sus citas."
            )
        return appointment

    async def _transition(
        self,
        viewer: _Viewer,
        appointment_id: UUID,
        apply: Callable[[Appointment, datetime], None],
        *,
        staff_only: bool = True,
    ) -> Appointment:
        if staff_only and not viewer.staff:
            raise PermissionDeniedError("Solo el personal realiza esta acción.")
        async with self._uow_factory() as uow:
            appointment = await self._load(
                uow, appointment_id, viewer, action=PetAction.BOOK, for_update=True
            )
            apply(appointment, self._clock.now())
            await uow.appointments.save(appointment)
            uow.track(appointment)
            await uow.commit()
        return appointment
