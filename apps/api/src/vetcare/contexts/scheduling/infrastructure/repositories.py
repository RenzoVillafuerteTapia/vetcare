from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from vetcare.contexts.scheduling.application.ports import StoredRequest
from vetcare.contexts.scheduling.domain.appointment import (
    Appointment,
    AppointmentStatus,
    Channel,
    HistoryAction,
    HistoryEntry,
    TimeSlot,
)
from vetcare.contexts.scheduling.infrastructure.tables import (
    appointment_history,
    appointment_resources,
    appointments,
    idempotency_keys,
    resource_locks,
)
from vetcare.shared_kernel.errors import ConflictError

CONCURRENT = ConflictError(
    "Otra persona modificó esta cita. Recarga e intenta de nuevo.",
    code="concurrent_modification",
)


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


class SqlAppointmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        # Recursos ya bloqueados en esta transacción (el repositorio vive lo que dura la unidad
        # de trabajo). Volver a pedirlos no hace nada.
        self._locked: set[UUID] = set()

    async def get(self, appointment_id: UUID, *, for_update: bool = False) -> Appointment | None:
        query = select(appointments).where(appointments.c.id == appointment_id)
        if for_update:
            query = query.with_for_update()
        found = await self._load(query)
        return found[0] if found else None

    async def add(self, appointment: Appointment) -> None:
        await self._session.execute(
            insert(appointments).values(id=appointment.id, **self._values(appointment))
        )
        await self._write_children(appointment)

    async def save(self, appointment: Appointment) -> None:
        result = await self._session.execute(
            update(appointments)
            .where(
                appointments.c.id == appointment.id,
                appointments.c.version == appointment.version,
            )
            .values(**self._values(appointment) | {"version": appointment.version + 1})
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise CONCURRENT
        await self._session.execute(
            delete(appointment_resources).where(
                appointment_resources.c.appointment_id == appointment.id
            )
        )
        await self._write_children(appointment)
        appointment.version += 1

    async def lock_resources(self, resource_ids: set[UUID]) -> None:
        pending = resource_ids - self._locked
        if not pending:
            return
        ordered = sorted(pending)
        # 1. Las filas de bloqueo se crean una vez por recurso, en una transacción aparte y antes
        #    de bloquear: un SELECT … FOR UPDATE sobre filas inexistentes tomaría un bloqueo de
        #    hueco que impediría insertarlas.
        existing_query = select(resource_locks.c.resource_id).where(
            resource_locks.c.resource_id.in_(ordered)
        )
        existing = set((await self._session.execute(existing_query)).scalars())
        missing = [r for r in ordered if r not in existing]
        if missing:
            engine = self._session.bind
            if not isinstance(engine, AsyncEngine):
                raise RuntimeError("La sesión debe estar ligada a un AsyncEngine.")
            async with engine.begin() as connection:
                await connection.execute(
                    insert(resource_locks).prefix_with("IGNORE"),
                    [{"resource_id": r} for r in missing],
                )
        # 2. Bloqueo exclusivo, siempre en el mismo orden para evitar interbloqueos.
        await self._session.execute(
            existing_query.order_by(resource_locks.c.resource_id).with_for_update()
        )
        self._locked |= pending

    async def busy(
        self,
        resource_ids: set[UUID],
        window: TimeSlot,
        *,
        exclude: UUID | None = None,
    ) -> dict[UUID, list[TimeSlot]]:
        if not resource_ids:
            return {}
        query = (
            select(
                appointment_resources.c.resource_id,
                appointment_resources.c.start_at,
                appointment_resources.c.end_at,
            )
            .where(
                appointment_resources.c.resource_id.in_(resource_ids),
                appointment_resources.c.active.is_(True),
                appointment_resources.c.start_at < _naive(window.end),
                appointment_resources.c.end_at > _naive(window.start),
            )
            # Lectura bloqueante: ve lo último confirmado aunque la transacción ya tenga una vista.
            .with_for_update(read=True)
        )
        if exclude is not None:
            query = query.where(appointment_resources.c.appointment_id != exclude)
        result: dict[UUID, list[TimeSlot]] = {}
        for row in await self._session.execute(query):
            result.setdefault(row.resource_id, []).append(
                TimeSlot(_utc(row.start_at), _utc(row.end_at))
            )
        return result

    async def between(
        self,
        start: datetime,
        end: datetime,
        *,
        resource_id: UUID | None = None,
        statuses: frozenset[AppointmentStatus] | None = None,
    ) -> list[Appointment]:
        query = (
            select(appointments)
            .where(appointments.c.start_at < _naive(end), appointments.c.end_at > _naive(start))
            .order_by(appointments.c.start_at, appointments.c.id)
        )
        if statuses:
            query = query.where(appointments.c.status.in_([s.value for s in statuses]))
        if resource_id is not None:
            query = query.where(
                appointments.c.id.in_(
                    select(appointment_resources.c.appointment_id).where(
                        appointment_resources.c.resource_id == resource_id
                    )
                )
            )
        return await self._load(query)

    async def of_pets(self, pet_ids: list[UUID], since: datetime) -> list[Appointment]:
        query = (
            select(appointments)
            .where(appointments.c.pet_id.in_(pet_ids), appointments.c.start_at >= _naive(since))
            .order_by(appointments.c.start_at)
        )
        return await self._load(query)

    async def _write_children(self, appointment: Appointment) -> None:
        await self._session.execute(
            insert(appointment_resources),
            [
                {
                    "appointment_id": appointment.id,
                    "resource_id": resource_id,
                    "start_at": _naive(appointment.slot.start),
                    "end_at": _naive(appointment.slot.end),
                    "active": appointment.is_active,
                }
                for resource_id in sorted(appointment.resource_ids)
            ],
        )
        saved = set(
            (
                await self._session.execute(
                    select(appointment_history.c.id).where(
                        appointment_history.c.appointment_id == appointment.id
                    )
                )
            ).scalars()
        )
        new_entries = [h for h in appointment.history if h.id not in saved]
        if new_entries:
            await self._session.execute(
                insert(appointment_history),
                [
                    {
                        "id": h.id,
                        "appointment_id": appointment.id,
                        "at": _naive(h.at),
                        "by": h.by,
                        "action": h.action.value,
                        "start_at": _naive(h.slot.start),
                        "end_at": _naive(h.slot.end),
                        "note": h.note,
                    }
                    for h in new_entries
                ],
            )

    async def _load(self, query: Any) -> list[Appointment]:
        rows = [r._mapping for r in await self._session.execute(query)]
        if not rows:
            return []
        ids = [r["id"] for r in rows]
        resources: dict[UUID, set[UUID]] = {}
        for r in await self._session.execute(
            select(appointment_resources).where(appointment_resources.c.appointment_id.in_(ids))
        ):
            resources.setdefault(r.appointment_id, set()).add(r.resource_id)
        history: dict[UUID, list[HistoryEntry]] = {}
        for h in await self._session.execute(
            select(appointment_history)
            .where(appointment_history.c.appointment_id.in_(ids))
            .order_by(appointment_history.c.at)
        ):
            history.setdefault(h.appointment_id, []).append(
                HistoryEntry(
                    id=h.id,
                    at=_utc(h.at),
                    by=h.by,
                    action=HistoryAction(h.action),
                    slot=TimeSlot(_utc(h.start_at), _utc(h.end_at)),
                    note=h.note,
                )
            )
        return [
            self._to_domain(r, resources.get(r["id"], set()), history.get(r["id"], []))
            for r in rows
        ]

    @staticmethod
    def _values(a: Appointment) -> dict[str, Any]:
        return {
            "pet_id": a.pet_id,
            "pet_name": a.pet_name,
            "client_id": a.client_id,
            "service_type_id": a.service_type_id,
            "service_name": a.service_name,
            "start_at": _naive(a.slot.start),
            "end_at": _naive(a.slot.end),
            "status": a.status.value,
            "channel": a.channel.value,
            "reason": a.reason,
            "notes": a.notes,
            "cancellation_reason": a.cancellation_reason,
            "created_by": a.created_by,
            "created_at": _naive(a.created_at),
            "version": a.version,
        }

    @staticmethod
    def _to_domain(
        r: RowMapping, resource_ids: set[UUID], history: list[HistoryEntry]
    ) -> Appointment:
        return Appointment(
            id=r["id"],
            pet_id=r["pet_id"],
            pet_name=r["pet_name"],
            client_id=r["client_id"],
            service_type_id=r["service_type_id"],
            service_name=r["service_name"],
            slot=TimeSlot(_utc(r["start_at"]), _utc(r["end_at"])),
            resource_ids=frozenset(resource_ids),
            status=AppointmentStatus(r["status"]),
            channel=Channel(r["channel"]),
            created_by=r["created_by"],
            created_at=_utc(r["created_at"]),
            reason=r["reason"],
            notes=r["notes"],
            cancellation_reason=r["cancellation_reason"],
            history=history,
            version=r["version"],
        )


class SqlIdempotencyStore:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: UUID, key: str) -> StoredRequest | None:
        query = (
            select(idempotency_keys)
            .where(idempotency_keys.c.user_id == user_id, idempotency_keys.c.key == key)
            .with_for_update(read=True)
        )
        row = (await self._session.execute(query)).first()
        return StoredRequest(row.request_hash, row.appointment_id) if row else None

    async def save(self, user_id: UUID, key: str, stored: StoredRequest, now: datetime) -> None:
        try:
            async with self._session.begin_nested():
                await self._session.execute(
                    insert(idempotency_keys).values(
                        user_id=user_id,
                        key=key,
                        request_hash=stored.request_hash,
                        appointment_id=stored.appointment_id,
                        created_at=_naive(now),
                    )
                )
        except IntegrityError:
            raise ConflictError(
                "Esa solicitud ya se está procesando. Intenta de nuevo en unos segundos.",
                code="idempotency_key_race",
            ) from None
