from dataclasses import dataclass
from datetime import UTC, datetime
from typing import ClassVar
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.platform.outbox import outbox_events
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.ids import new_id

AHORA = datetime(2026, 10, 29, 15, 30, 12, 345678, tzinfo=UTC)


class RelojFijo:
    def now(self) -> datetime:
        return AHORA


@dataclass(frozen=True, kw_only=True)
class EtapaAvanzada(DomainEvent):
    event_type: ClassVar[str] = "tracking.stage_advanced"

    etapa: str


@dataclass
class Servicio(AggregateRoot):
    aggregate_type: ClassVar[str] = "tracked_service"

    id: UUID

    def avanzar(self, etapa: str) -> None:
        self.record(EtapaAvanzada(aggregate_id=self.id, occurred_at=AHORA, etapa=etapa))


async def eventos_guardados(factory: async_sessionmaker[AsyncSession]) -> list[dict[str, object]]:
    async with factory() as session:
        result = await session.execute(select(outbox_events).order_by(outbox_events.c.position))
        return [dict(row._mapping) for row in result]


async def test_commit_guarda_los_eventos_en_orden_con_su_sobre(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    servicio = Servicio(id=new_id())
    servicio.avanzar("BATHING")
    servicio.avanzar("DRYING")

    async with SqlAlchemyUnitOfWork(session_factory, RelojFijo()) as uow:
        uow.track(servicio)
        await uow.commit()

    filas = await eventos_guardados(session_factory)
    assert [f["payload"] for f in filas] == [{"etapa": "BATHING"}, {"etapa": "DRYING"}]
    assert {f["event_type"] for f in filas} == {"tracking.stage_advanced"}
    assert {f["aggregate_type"] for f in filas} == {"tracked_service"}
    assert {f["aggregate_id"] for f in filas} == {servicio.id}
    # MySQL guarda microsegundos (DATETIME(6)) y sin zona: el valor se conserva en UTC.
    assert filas[0]["occurred_at"] == AHORA.replace(tzinfo=None)
    assert filas[0]["position"] < filas[1]["position"]  # type: ignore[operator]


async def test_sin_commit_no_se_guarda_nada(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    servicio = Servicio(id=new_id())
    servicio.avanzar("BATHING")

    async with SqlAlchemyUnitOfWork(session_factory, RelojFijo()) as uow:
        uow.track(servicio)

    assert await eventos_guardados(session_factory) == []


async def test_una_excepcion_deshace_la_transaccion(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    servicio = Servicio(id=new_id())
    servicio.avanzar("BATHING")

    with pytest.raises(RuntimeError):
        async with SqlAlchemyUnitOfWork(session_factory, RelojFijo()) as uow:
            uow.track(servicio)
            await uow.session.execute(select(func.count()).select_from(outbox_events))
            raise RuntimeError("falla del caso de uso")

    assert await eventos_guardados(session_factory) == []


async def test_registrar_dos_veces_el_mismo_agregado_no_duplica_eventos(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    servicio = Servicio(id=new_id())
    servicio.avanzar("BATHING")

    async with SqlAlchemyUnitOfWork(session_factory, RelojFijo()) as uow:
        uow.track(servicio)
        uow.track(servicio)
        await uow.commit()

    assert len(await eventos_guardados(session_factory)) == 1


async def test_usar_la_sesion_fuera_del_bloque_es_un_error(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    uow = SqlAlchemyUnitOfWork(session_factory, RelojFijo())

    with pytest.raises(RuntimeError, match="no está abierta"):
        _ = uow.session
