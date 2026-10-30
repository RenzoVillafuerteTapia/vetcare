from datetime import UTC, datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy import delete, insert, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from vetcare.contexts.clinic.domain.model import (
    ClinicCalendar,
    Duration,
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceCode,
    ServiceType,
    TimeOff,
)
from vetcare.contexts.clinic.domain.schedule import TimeRange, Weekday, WeeklySchedule
from vetcare.contexts.clinic.infrastructure.tables import (
    CALENDAR_ROW_ID,
    calendar,
    holidays,
    resource_time_off,
    resources,
    service_types,
)
from vetcare.shared_kernel.errors import ConflictError

CONCURRENT = ConflictError(
    "Otra persona modificó este registro. Recarga e intenta de nuevo.",
    code="concurrent_modification",
)


def schedule_to_json(schedule: WeeklySchedule) -> list[dict[str, Any]]:
    return [
        {"weekday": int(day), "start": r.start.strftime("%H:%M"), "end": r.end.strftime("%H:%M")}
        for day, r in schedule.entries()
    ]


def schedule_from_json(data: list[dict[str, Any]]) -> WeeklySchedule:
    return WeeklySchedule.build(
        (
            Weekday(item["weekday"]),
            TimeRange(time.fromisoformat(item["start"]), time.fromisoformat(item["end"])),
        )
        for item in data
    )


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


async def _check_updated(result: Any) -> None:
    if result.rowcount != 1:
        raise CONCURRENT


class SqlServiceTypeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, service_type_id: UUID) -> ServiceType | None:
        query = select(service_types).where(service_types.c.id == service_type_id)
        row = (await self._session.execute(query)).first()
        return self._to_domain(row._mapping) if row else None

    async def get_by_code(self, code: ServiceCode) -> ServiceType | None:
        query = select(service_types).where(service_types.c.code == code.value)
        row = (await self._session.execute(query)).first()
        return self._to_domain(row._mapping) if row else None

    async def all(self) -> list[ServiceType]:
        query = select(service_types).order_by(service_types.c.category, service_types.c.name)
        return [self._to_domain(r._mapping) for r in await self._session.execute(query)]

    async def add(self, service_type: ServiceType) -> None:
        try:
            async with self._session.begin_nested():
                await self._session.execute(
                    insert(service_types).values(id=service_type.id, **self._values(service_type))
                )
        except IntegrityError:
            raise ConflictError(
                "Ya existe un servicio con ese código.", code="code_taken"
            ) from None

    async def save(self, service_type: ServiceType) -> None:
        result = await self._session.execute(
            update(service_types)
            .where(
                service_types.c.id == service_type.id,
                service_types.c.version == service_type.version,
            )
            .values(**self._values(service_type) | {"version": service_type.version + 1})
        )
        await _check_updated(result)
        service_type.version += 1

    @staticmethod
    def _values(s: ServiceType) -> dict[str, Any]:
        return {
            "code": s.code.value,
            "name": s.name,
            "category": s.category.value,
            "duration_minutes": s.duration.minutes,
            "required_resources": sorted(k.value for k in s.required_resources),
            "bookable_by_client": s.bookable_by_client,
            "description": s.description,
            "active": s.active,
            "version": s.version,
        }

    @staticmethod
    def _to_domain(row: RowMapping) -> ServiceType:
        return ServiceType(
            id=row["id"],
            code=ServiceCode(row["code"]),
            name=row["name"],
            category=ServiceCategory(row["category"]),
            duration=Duration(row["duration_minutes"]),
            required_resources=frozenset(ResourceKind(k) for k in row["required_resources"]),
            bookable_by_client=row["bookable_by_client"],
            description=row["description"],
            active=row["active"],
            version=row["version"],
        )


class SqlResourceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, resource_id: UUID) -> Resource | None:
        found = await self._load(select(resources).where(resources.c.id == resource_id))
        return found[0] if found else None

    async def find(self, kinds: frozenset[ResourceKind] | None = None) -> list[Resource]:
        query = select(resources).order_by(resources.c.kind, resources.c.name)
        if kinds is not None:
            query = query.where(resources.c.kind.in_([k.value for k in kinds]))
        return await self._load(query)

    async def add(self, resource: Resource) -> None:
        await self._session.execute(
            insert(resources).values(id=resource.id, **self._values(resource))
        )
        await self._replace_time_off(resource)

    async def save(self, resource: Resource) -> None:
        result = await self._session.execute(
            update(resources)
            .where(resources.c.id == resource.id, resources.c.version == resource.version)
            .values(**self._values(resource) | {"version": resource.version + 1})
        )
        await _check_updated(result)
        await self._replace_time_off(resource)
        resource.version += 1

    async def _replace_time_off(self, resource: Resource) -> None:
        await self._session.execute(
            delete(resource_time_off).where(resource_time_off.c.resource_id == resource.id)
        )
        if resource.time_off:
            await self._session.execute(
                insert(resource_time_off),
                [
                    {
                        "id": b.id,
                        "resource_id": resource.id,
                        "start_at": _naive(b.start),
                        "end_at": _naive(b.end),
                        "reason": b.reason,
                    }
                    for b in resource.time_off
                ],
            )

    async def _load(self, query: Any) -> list[Resource]:
        rows = [r._mapping for r in await self._session.execute(query)]
        if not rows:
            return []
        blocks_query = (
            select(resource_time_off)
            .where(resource_time_off.c.resource_id.in_([r["id"] for r in rows]))
            .order_by(resource_time_off.c.start_at)
        )
        blocks: dict[UUID, list[TimeOff]] = {}
        for b in await self._session.execute(blocks_query):
            blocks.setdefault(b.resource_id, []).append(
                TimeOff(
                    id=b.id,
                    start=b.start_at.replace(tzinfo=UTC),
                    end=b.end_at.replace(tzinfo=UTC),
                    reason=b.reason,
                )
            )
        return [
            Resource(
                id=r["id"],
                kind=ResourceKind(r["kind"]),
                name=r["name"],
                schedule=schedule_from_json(r["schedule"]),
                user_id=r["user_id"],
                active=r["active"],
                time_off=blocks.get(r["id"], []),
                version=r["version"],
            )
            for r in rows
        ]

    @staticmethod
    def _values(r: Resource) -> dict[str, Any]:
        return {
            "kind": r.kind.value,
            "name": r.name,
            "user_id": r.user_id,
            "active": r.active,
            "schedule": schedule_to_json(r.schedule),
            "version": r.version,
        }


class SqlCalendarRepository:
    """Una sola fila. Si aún no existe (instalación nueva) se crea vacía: sede sin horario."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self) -> ClinicCalendar:
        query = select(calendar).where(calendar.c.id == CALENDAR_ROW_ID).with_for_update()
        row = (await self._session.execute(query)).first()
        if row is None:
            try:
                async with self._session.begin_nested():
                    await self._session.execute(
                        insert(calendar).values(id=CALENDAR_ROW_ID, opening_hours=[], version=0)
                    )
            except IntegrityError:
                pass  # Otra transacción la creó al mismo tiempo.
            row = (await self._session.execute(query)).one()
        days = await self._session.execute(select(holidays).order_by(holidays.c.day))
        return ClinicCalendar(
            opening_hours=schedule_from_json(row.opening_hours),
            holidays={d.day: d.name for d in days},
            version=row.version,
        )

    async def save(self, clinic_calendar: ClinicCalendar) -> None:
        result = await self._session.execute(
            update(calendar)
            .where(calendar.c.id == CALENDAR_ROW_ID, calendar.c.version == clinic_calendar.version)
            .values(
                opening_hours=schedule_to_json(clinic_calendar.opening_hours),
                version=clinic_calendar.version + 1,
            )
        )
        await _check_updated(result)
        await self._session.execute(delete(holidays))
        if clinic_calendar.holidays:
            await self._session.execute(
                insert(holidays),
                [{"day": d, "name": n} for d, n in clinic_calendar.holidays.items()],
            )
        clinic_calendar.version += 1
