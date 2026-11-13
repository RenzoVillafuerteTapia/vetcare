"""Avisos push de punta a punta: registro del teléfono → cambio de la cita → outbox → worker."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from integration_support import Api
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from test_scheduling_api import RelojFijo, lima, reserva
from test_scheduling_api import escenario as escenario_de_la_agenda  # noqa: F401

from vetcare.contexts.notifications.application.ports import PushMessage, PushTicket
from vetcare.contexts.notifications.infrastructure.tables import devices
from vetcare.platform.outbox_dispatcher import RetryPolicy, outbox_deliveries
from vetcare.shared_kernel.events import RetryLaterError
from vetcare.worker import build_dispatcher


@pytest.fixture
def escenario(escenario_de_la_agenda: dict[str, Any]) -> dict[str, Any]:  # noqa: F811
    """Sede, personal, Ana (dueña de Luna) y Beto (autorizado), como en las pruebas de agenda."""
    return escenario_de_la_agenda


TELEFONO_ANA = "ExponentPushToken[telefono-de-ana-0001]"
TELEFONO_BETO = "ExponentPushToken[telefono-de-beto-001]"


class Emisor:
    """Expo de mentira: guarda los avisos y puede fallar o rechazar tokens a pedido."""

    def __init__(self) -> None:
        self.enviados: list[PushMessage] = []
        self.caidas = 0
        self.desinstalados: set[str] = set()

    async def send(self, messages: Sequence[PushMessage]) -> list[PushTicket]:
        if self.caidas:
            self.caidas -= 1
            raise RetryLaterError("Expo respondió 503")
        self.enviados += messages
        return [
            PushTicket(
                m.to, ok=m.to not in self.desinstalados, unregistered=m.to in self.desinstalados
            )
            for m in messages
        ]


async def registrar(api: Api, headers: dict[str, str], token: str) -> int:
    r = await api.client.put(
        "/api/v1/me/devices", json={"token": token, "platform": "android"}, headers=headers
    )
    return r.status_code


async def tokens(sf: async_sessionmaker[AsyncSession]) -> dict[str, Any]:
    async with sf() as s:
        return {r.token: r.user_id for r in await s.execute(select(devices))}


async def test_registro_del_telefono(
    api: Api, escenario: dict[str, Any], session_factory: Any
) -> None:
    e = escenario
    assert await registrar(api, e["ana"], TELEFONO_ANA) == 204
    assert await registrar(api, e["ana"], TELEFONO_ANA) == 204  # idempotente
    assert len(await tokens(session_factory)) == 1

    # Solo clientes, y solo tokens de Expo.
    assert await registrar(api, e["rec"], TELEFONO_BETO) == 403
    assert await registrar(api, e["ana"], "no-es-un-token-de-expo") == 422
    r = await api.client.put(
        "/api/v1/me/devices", json={"token": TELEFONO_ANA, "platform": "web"}, headers=e["ana"]
    )
    assert r.status_code == 422

    # Beto inicia sesión en el mismo teléfono: el token pasa a su cuenta.
    assert await registrar(api, e["beto"], TELEFONO_ANA) == 204
    assert len(set((await tokens(session_factory)).values())) == 1

    # Ana ya no puede quitarlo (no es suyo); Beto sí, al cerrar sesión.
    r = await api.client.post(
        "/api/v1/me/devices/unregister", json={"token": TELEFONO_ANA}, headers=e["ana"]
    )
    assert r.status_code == 204 and len(await tokens(session_factory)) == 1
    r = await api.client.post(
        "/api/v1/me/devices/unregister", json={"token": TELEFONO_ANA}, headers=e["beto"]
    )
    assert r.status_code == 204 and await tokens(session_factory) == {}


async def test_el_dueno_recibe_el_aviso_cuando_la_clinica_confirma_o_cancela(
    api: Api, escenario: dict[str, Any], session_factory: Any
) -> None:
    e = escenario
    await registrar(api, e["ana"], TELEFONO_ANA)
    await registrar(api, e["beto"], TELEFONO_BETO)
    emisor = Emisor()
    worker = build_dispatcher(session_factory, emisor)

    cita = (
        await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["ana"])
    ).json()
    await worker.run_once()
    assert emisor.enviados == []  # Ana solicitó; nadie confirmó todavía.

    await api.client.post(f"/api/v1/appointments/{cita['id']}/confirm", headers=e["rec"])
    resultado = await worker.run_once()
    assert resultado.delivered == 1
    (aviso,) = emisor.enviados
    assert aviso.to == TELEFONO_ANA  # Beto ve la cita (tutela) pero no es el cliente de la cita.
    assert aviso.title == "Cita confirmada"
    assert aviso.body.startswith("La cita de Luna es el lunes ") and aviso.body.endswith(
        "a las 10:00."
    )
    assert aviso.data == {"url": f"/citas/{cita['id']}", "appointment_id": cita["id"]}

    # Una segunda vuelta no repite el aviso.
    await worker.run_once()
    assert len(emisor.enviados) == 1

    # Si Ana reprograma, no se le avisa de su propio cambio; si la clínica lo mueve, sí.
    await api.client.post(
        f"/api/v1/appointments/{cita['id']}/reschedule", json={"start": lima(11)}, headers=e["ana"]
    )
    await worker.run_once()
    assert len(emisor.enviados) == 1
    await api.client.post(
        f"/api/v1/appointments/{cita['id']}/reschedule", json={"start": lima(12)}, headers=e["rec"]
    )
    await worker.run_once()
    assert emisor.enviados[-1].title == "Tu cita cambió de horario"
    assert emisor.enviados[-1].body.endswith("a las 12:00.")

    await api.client.post(
        f"/api/v1/appointments/{cita['id']}/cancel",
        json={"reason": "Sin anestesista"},
        headers=e["rec"],
    )
    await worker.run_once()
    assert emisor.enviados[-1].title == "Cita cancelada"
    assert "Sin anestesista" not in emisor.enviados[-1].body
    assert len(emisor.enviados) == 3


async def test_reintenta_si_expo_falla_y_olvida_los_telefonos_desinstalados(
    api: Api, escenario: dict[str, Any], session_factory: Any
) -> None:
    e = escenario
    await registrar(api, e["ana"], TELEFONO_ANA)
    emisor = Emisor()
    emisor.caidas = 1
    reloj = RelojFijo(datetime.now(UTC))
    worker = build_dispatcher(session_factory, emisor, clock=reloj)

    r = await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])
    assert r.status_code == 201  # Reservada por recepción: nace confirmada.
    assert (await worker.run_once()).retried == 1
    async with session_factory() as s:
        entrega = (await s.execute(select(outbox_deliveries))).one()
    assert (entrega.status, entrega.attempts, entrega.last_error) == (
        "pending",
        1,
        "Expo respondió 503",
    )

    # Antes de la espera no se reintenta; después, sí.
    assert (await worker.run_once()).delivered == 0
    reloj.ahora += RetryPolicy().delay(1)
    assert (await worker.run_once()).delivered == 1
    assert len(emisor.enviados) == 1

    # Expo avisa que la app se desinstaló: se olvida el token.
    emisor.desinstalados.add(TELEFONO_ANA)
    await api.client.post("/api/v1/appointments", json=reserva(e, 15), headers=e["rec"])
    await worker.run_once()
    assert await tokens(session_factory) == {}


async def test_tras_varios_fallos_la_entrega_queda_para_revision(
    api: Api, escenario: dict[str, Any], session_factory: Any
) -> None:
    e = escenario
    await registrar(api, e["ana"], TELEFONO_ANA)
    emisor = Emisor()
    emisor.caidas = 100
    reloj = RelojFijo(datetime.now(UTC))
    worker = build_dispatcher(session_factory, emisor, clock=reloj)
    await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])

    for _ in range(RetryPolicy().max_attempts):
        await worker.run_once()
        reloj.ahora += RetryPolicy().max_delay
    async with session_factory() as s:
        entrega = (await s.execute(select(outbox_deliveries))).one()
    assert (entrega.status, entrega.attempts) == ("failed", RetryPolicy().max_attempts)
    assert (await worker.run_once()).retried == 0


async def test_no_envia_avisos_viejos(
    api: Api, escenario: dict[str, Any], session_factory: Any
) -> None:
    e = escenario
    await registrar(api, e["ana"], TELEFONO_ANA)
    await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])

    # El worker arranca 13 horas después (p. ej. tras una caída): la entrega se cierra sin enviar.
    emisor = Emisor()
    reloj = RelojFijo(datetime.now(UTC) + timedelta(hours=13))
    assert (await build_dispatcher(session_factory, emisor, clock=reloj).run_once()).delivered == 1
    assert emisor.enviados == []
