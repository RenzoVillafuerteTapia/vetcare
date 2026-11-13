from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from vetcare.contexts.notifications.domain.device import Device, DevicePlatform, PushToken
from vetcare.contexts.notifications.infrastructure.tables import devices


def _naive(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


def _device(row: Any) -> Device:
    return Device(
        token=PushToken(row.token),
        user_id=row.user_id,
        platform=DevicePlatform(row.platform),
        registered_at=_aware(row.registered_at),
        last_seen_at=_aware(row.last_seen_at),
    )


class SqlDeviceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, token: str) -> Device | None:
        row = (
            await self._session.execute(
                select(devices).where(devices.c.token == token).with_for_update()
            )
        ).first()
        return _device(row) if row else None

    async def of_user(self, user_id: UUID) -> list[Device]:
        rows = await self._session.execute(select(devices).where(devices.c.user_id == user_id))
        return [_device(r) for r in rows]

    async def save(self, device: Device) -> None:
        values = {
            "user_id": device.user_id,
            "platform": device.platform.value,
            "registered_at": _naive(device.registered_at),
            "last_seen_at": _naive(device.last_seen_at),
        }
        exists = (
            await self._session.execute(
                select(devices.c.token).where(devices.c.token == device.token.value)
            )
        ).first()
        if exists:
            await self._session.execute(
                update(devices).where(devices.c.token == device.token.value).values(**values)
            )
        else:
            await self._session.execute(insert(devices).values(token=device.token.value, **values))

    async def delete(self, token: str) -> None:
        await self._session.execute(delete(devices).where(devices.c.token == token))
