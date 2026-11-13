"""Worker del outbox (ADR 0003): ``python -m vetcare.worker``.

Lee los eventos guardados por la API y los entrega a sus manejadores (hoy, los avisos push de
citas). Mismo código y misma configuración que la API; corre como un proceso aparte y **uno solo
a la vez**.
"""

import asyncio
import contextlib
import logging
import signal
import sys
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.customers.infrastructure.composition import customers_uow_factory
from vetcare.contexts.customers.public import PetAccess
from vetcare.contexts.notifications.application.ports import PushSender
from vetcare.contexts.notifications.infrastructure.composition import (
    build_push_handlers,
    build_push_sender,
)
from vetcare.platform.db import create_engine, create_session_factory
from vetcare.platform.outbox_dispatcher import OutboxDispatcher
from vetcare.platform.settings import Settings
from vetcare.shared_kernel.clock import Clock, SystemClock
from vetcare.shared_kernel.events import EventHandler

logger = logging.getLogger("vetcare.worker")


def build_dispatcher(
    session_factory: async_sessionmaker[AsyncSession],
    sender: PushSender,
    *,
    accounts: PetAccess | None = None,
    clock: Clock | None = None,
) -> OutboxDispatcher:
    real_clock = clock or SystemClock()
    handlers: Sequence[EventHandler] = build_push_handlers(
        session_factory,
        accounts or PetAccess(customers_uow_factory(session_factory)),
        sender,
        clock=real_clock,
    )
    return OutboxDispatcher(session_factory, handlers, real_clock)


async def run(settings: Settings, stop: asyncio.Event) -> None:
    if settings.database_url is None:
        raise RuntimeError("Define VETCARE_DATABASE_URL.")
    engine = create_engine(settings.database_url.get_secret_value())
    dispatcher = build_dispatcher(create_session_factory(engine), build_push_sender(settings))
    logger.info(
        "Worker iniciado (avisos push: %s, cada %.1f s)",
        settings.push_provider.value,
        settings.worker_poll_seconds,
    )
    try:
        while not stop.is_set():
            try:
                result = await dispatcher.run_once()
                if result.delivered or result.retried or result.failed:
                    logger.info("Outbox: %s", result)
            except Exception:
                # Si la base de datos cae, el worker sigue y lo intenta en la próxima vuelta.
                logger.exception("Error al procesar el outbox")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
    finally:
        await engine.dispose()
        logger.info("Worker detenido")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    stop = asyncio.Event()

    async def _main() -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, stop.set)
            except NotImplementedError:  # Windows
                signal.signal(sig, lambda *_: stop.set())
        await run(Settings(), stop)

    try:
        asyncio.run(_main())
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
