"""Casos de uso del seguimiento de servicios.

Quién puede qué (docs/security/README.md):
- Iniciar: personal con `tracking:advance` o `appointments:manage`, sobre una cita con la llegada
  registrada. Es idempotente: una cita tiene a lo sumo un seguimiento.
- Ver el tablero y el detalle completo: `tracking:read`.
- Avanzar etapas: `tracking:advance`; el alta de una cirugía, además
  `tracking:authorize_discharge` (solo veterinarios).
- Publicar avances: `tracking:publish_update`. Entregar: `tracking:hand_over`.
- Cliente (`own:tracking:read`): sus mascotas con tutela activa. Ve las etapas; los textos de los
  avances, solo si su tutela permite ver información clínica. Lo ajeno responde 404.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from vetcare.contexts.clinic.public import ClinicCatalog
from vetcare.contexts.customers.public import PetAccess, PetAction
from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.contexts.scheduling.public import AppointmentDirectory
from vetcare.contexts.tracking.application.ports import TrackingUnitOfWork
from vetcare.contexts.tracking.domain.tracking import TrackedService
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import ConflictError, NotFoundError, PermissionDeniedError

NOT_FOUND_MESSAGE = "No encontramos ese seguimiento."
# El tablero muestra también lo entregado hace poco; el cliente, lo de la última semana.
BOARD_WINDOW = timedelta(hours=12)
CLIENT_WINDOW = timedelta(days=7)


@dataclass(frozen=True)
class TrackingView:
    service: TrackedService
    staff: bool
    # El cliente ve los textos de los avances solo con permiso clínico en su tutela.
    can_see_updates: bool


def _require(actor: AuthenticatedUser, *permissions: Permission) -> None:
    if not any(actor.has_permission(p) for p in permissions):
        raise PermissionDeniedError("No tienes permiso para realizar esta operación.")


class TrackingService:
    def __init__(
        self,
        *,
        uow_factory: Callable[[], TrackingUnitOfWork],
        appointments: AppointmentDirectory,
        catalog: ClinicCatalog,
        pets: PetAccess,
        clock: Clock,
    ) -> None:
        self._uow_factory = uow_factory
        self._appointments = appointments
        self._catalog = catalog
        self._pets = pets
        self._clock = clock

    async def start(self, actor: AuthenticatedUser, appointment_id: UUID) -> TrackingView:
        _require(actor, Permission.TRACKING_ADVANCE, Permission.APPOINTMENTS_MANAGE)
        appointment = await self._appointments.appointment(appointment_id)
        if appointment is None:
            raise NotFoundError("No encontramos esa cita.")
        service_type = await self._catalog.service_type(appointment.service_type_id)
        async with self._uow_factory() as uow:
            existing = await uow.services.by_appointment(appointment_id)
            if existing is not None:
                return self._staff_view(existing)
            if appointment.status != "checked_in":
                raise ConflictError(
                    "Registra primero la llegada de la mascota.",
                    code="appointment_not_checked_in",
                )
            service = TrackedService.start(
                appointment_id=appointment.id,
                pet_id=appointment.pet_id,
                pet_name=appointment.pet_name,
                client_id=appointment.client_id,
                service_name=appointment.service_name,
                category=service_type.category.value if service_type else "other",
                by=actor.id,
                now=self._clock.now(),
            )
            await uow.services.add(service)
            uow.track(service)
            await uow.commit()
        return self._staff_view(service)

    async def board(self, actor: AuthenticatedUser) -> list[TrackingView]:
        _require(actor, Permission.TRACKING_READ)
        async with self._uow_factory() as uow:
            services = await uow.services.recent(self._clock.now() - BOARD_WINDOW)
        return [self._staff_view(s) for s in services]

    async def get(self, actor: AuthenticatedUser, service_id: UUID) -> TrackingView:
        async with self._uow_factory() as uow:
            service = await uow.services.get(service_id)
        return await self._view(actor, service)

    async def of_appointment(self, actor: AuthenticatedUser, appointment_id: UUID) -> TrackingView:
        async with self._uow_factory() as uow:
            service = await uow.services.by_appointment(appointment_id)
        return await self._view(actor, service)

    async def mine(self, actor: AuthenticatedUser) -> list[TrackingView]:
        _require(actor, Permission.OWN_TRACKING_READ)
        client_id = await self._pets.client_id_of(actor.id)
        if client_id is None:
            return []
        pet_ids = await self._pets.pet_ids_of(client_id)
        if not pet_ids:
            return []
        async with self._uow_factory() as uow:
            services = await uow.services.of_pets(pet_ids, self._clock.now() - CLIENT_WINDOW)
        return [
            TrackingView(
                s,
                staff=False,
                can_see_updates=await self._pets.allows(
                    client_id, s.pet_id, PetAction.VIEW_CLINICAL
                ),
            )
            for s in services
        ]

    async def advance(
        self, actor: AuthenticatedUser, service_id: UUID, from_stage: str
    ) -> TrackingView:
        _require(actor, Permission.TRACKING_ADVANCE)

        def apply(service: TrackedService) -> None:
            if service.advancing_needs_discharge and not actor.has_permission(
                Permission.TRACKING_AUTHORIZE_DISCHARGE
            ):
                raise PermissionDeniedError("Solo un veterinario autoriza el alta.")
            service.advance(actor.id, self._clock.now(), from_stage=from_stage)

        return await self._change(service_id, apply)

    async def publish_update(
        self, actor: AuthenticatedUser, service_id: UUID, text: str
    ) -> TrackingView:
        _require(actor, Permission.TRACKING_PUBLISH_UPDATE)
        return await self._change(
            service_id, lambda s: s.publish_update(actor.id, self._clock.now(), text)
        )

    async def hand_over(self, actor: AuthenticatedUser, service_id: UUID) -> TrackingView:
        _require(actor, Permission.TRACKING_HAND_OVER)
        return await self._change(service_id, lambda s: s.hand_over(actor.id, self._clock.now()))

    async def _change(
        self, service_id: UUID, apply: Callable[[TrackedService], object]
    ) -> TrackingView:
        async with self._uow_factory() as uow:
            service = await uow.services.get(service_id, for_update=True)
            if service is None:
                raise NotFoundError(NOT_FOUND_MESSAGE)
            apply(service)
            await uow.services.save(service)
            uow.track(service)
            await uow.commit()
        return self._staff_view(service)

    async def _view(self, actor: AuthenticatedUser, service: TrackedService | None) -> TrackingView:
        if service is None:
            raise NotFoundError(NOT_FOUND_MESSAGE)
        if actor.has_permission(Permission.TRACKING_READ):
            return self._staff_view(service)
        _require(actor, Permission.OWN_TRACKING_READ)
        client_id = await self._pets.client_id_of(actor.id)
        if client_id is None or not await self._pets.allows(
            client_id, service.pet_id, PetAction.VIEW
        ):
            raise NotFoundError(NOT_FOUND_MESSAGE)
        can_see = await self._pets.allows(client_id, service.pet_id, PetAction.VIEW_CLINICAL)
        return TrackingView(service, staff=False, can_see_updates=can_see)

    @staticmethod
    def _staff_view(service: TrackedService) -> TrackingView:
        return TrackingView(service, staff=True, can_see_updates=True)
