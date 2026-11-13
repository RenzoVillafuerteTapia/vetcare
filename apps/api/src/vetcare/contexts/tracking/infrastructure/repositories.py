from collections import defaultdict
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from vetcare.contexts.tracking.domain.tracking import (
    EntryKind,
    Stage,
    Template,
    TimelineEntry,
    TrackedService,
    TrackingStatus,
)
from vetcare.contexts.tracking.infrastructure.tables import timeline, tracked_services
from vetcare.shared_kernel.errors import ConflictError

CONCURRENT = ConflictError(
    "Otra persona actualizó este seguimiento. Recarga e intenta de nuevo.",
    code="concurrent_modification",
)


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


class SqlTrackedServiceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, service_id: UUID, *, for_update: bool = False) -> TrackedService | None:
        query = select(tracked_services).where(tracked_services.c.id == service_id)
        if for_update:
            query = query.with_for_update()
        found = await self._load(query)
        return found[0] if found else None

    async def by_appointment(self, appointment_id: UUID) -> TrackedService | None:
        found = await self._load(
            select(tracked_services).where(tracked_services.c.appointment_id == appointment_id)
        )
        return found[0] if found else None

    async def add(self, service: TrackedService) -> None:
        await self._session.execute(insert(tracked_services).values(**self._values(service)))
        await self._write_timeline(service, existing=set())

    async def save(self, service: TrackedService) -> None:
        result = await self._session.execute(
            update(tracked_services)
            .where(
                tracked_services.c.id == service.id,
                tracked_services.c.version == service.version,
            )
            .values(**self._values(service) | {"version": service.version + 1})
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise CONCURRENT
        stored = await self._session.execute(
            select(timeline.c.id).where(timeline.c.service_id == service.id)
        )
        await self._write_timeline(service, existing={r.id for r in stored})
        service.version += 1

    async def recent(self, since: datetime) -> list[TrackedService]:
        s = tracked_services.c
        return await self._load(
            select(tracked_services)
            .where(
                or_(
                    s.status != TrackingStatus.HANDED_OVER.value,
                    s.updated_at >= _naive(since),
                )
            )
            .order_by(s.started_at)
        )

    async def of_pets(self, pet_ids: list[UUID], since: datetime) -> list[TrackedService]:
        s = tracked_services.c
        return await self._load(
            select(tracked_services)
            .where(s.pet_id.in_(pet_ids), s.updated_at >= _naive(since))
            .order_by(s.started_at.desc())
        )

    async def _write_timeline(self, service: TrackedService, existing: set[UUID]) -> None:
        rows = [
            {
                "id": e.id,
                "service_id": service.id,
                "at": _naive(e.at),
                "by": e.by,
                "kind": e.kind.value,
                "stage_index": e.stage_index,
                "text": e.text,
            }
            for e in service.timeline
            if e.id not in existing
        ]
        if rows:
            await self._session.execute(insert(timeline), rows)

    async def _load(self, query: Select[Any]) -> list[TrackedService]:
        rows = (await self._session.execute(query)).mappings().all()
        if not rows:
            return []
        entries: dict[UUID, list[TimelineEntry]] = defaultdict(list)
        for e in (
            await self._session.execute(
                select(timeline)
                .where(timeline.c.service_id.in_([r["id"] for r in rows]))
                .order_by(timeline.c.at, timeline.c.id)
            )
        ).mappings():
            entries[e["service_id"]].append(
                TimelineEntry(
                    id=e["id"],
                    at=_aware(e["at"]),
                    by=e["by"],
                    kind=EntryKind(e["kind"]),
                    stage_index=e["stage_index"],
                    text=e["text"],
                )
            )
        return [
            TrackedService(
                id=r["id"],
                appointment_id=r["appointment_id"],
                pet_id=r["pet_id"],
                pet_name=r["pet_name"],
                client_id=r["client_id"],
                service_name=r["service_name"],
                template=Template(r["template"]),
                stages=tuple(Stage(s["code"], s["label"]) for s in r["stages"]),
                current=r["current_index"],
                status=TrackingStatus(r["status"]),
                started_at=_aware(r["started_at"]),
                updated_at=_aware(r["updated_at"]),
                timeline=entries[r["id"]],
                version=r["version"],
            )
            for r in rows
        ]

    @staticmethod
    def _values(service: TrackedService) -> dict[str, Any]:
        return {
            "id": service.id,
            "appointment_id": service.appointment_id,
            "pet_id": service.pet_id,
            "pet_name": service.pet_name,
            "client_id": service.client_id,
            "service_name": service.service_name,
            "template": service.template.value,
            "stages": [{"code": s.code, "label": s.label} for s in service.stages],
            "current_index": service.current,
            "status": service.status.value,
            "started_at": _naive(service.started_at),
            "updated_at": _naive(service.updated_at),
            "version": service.version,
        }
