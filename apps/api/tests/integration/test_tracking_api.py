"""Seguimiento de servicios de punta a punta: llegada → etapas → avances → entrega, y avisos."""

from datetime import UTC, datetime, time
from typing import Any

import pytest
from integration_support import Api, auth
from test_notifications_api import Emisor
from test_scheduling_api import LUNES, RelojFijo, reserva
from test_scheduling_api import escenario as escenario_de_la_agenda  # noqa: F401

from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.identity.domain.permissions import Role
from vetcare.contexts.scheduling.infrastructure.composition import build_scheduling
from vetcare.worker import build_dispatcher

TELEFONO_ANA = "ExponentPushToken[telefono-de-ana-0001]"


@pytest.fixture
async def e(escenario_de_la_agenda: dict[str, Any], api: Api) -> dict[str, Any]:  # noqa: F811
    """Escenario de la agenda con el reloj de la agenda en el día de las citas (para la llegada)
    y una veterinaria."""
    datos = dict(escenario_de_la_agenda)
    api.app.state.scheduling = build_scheduling(
        api.app.state.session_factory,
        api.app.state.clinic_catalog,
        api.app.state.pet_access,
        clock=RelojFijo(datetime.combine(LUNES, time(8, 30), CLINIC_TZ).astimezone(UTC)),
    )
    datos["vet"] = auth(await api.usuario("vet@example.test", frozenset({Role.VETERINARIAN})))
    return datos


async def con_llegada(api: Api, e: dict[str, Any], **extra: Any) -> str:
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 9, **extra), headers=e["rec"])
    assert r.status_code == 201, r.text
    cita = r.json()["id"]
    r = await api.client.post(f"/api/v1/appointments/{cita}/check-in", headers=e["rec"])
    assert r.status_code == 200, r.text
    return str(cita)


async def avanzar(api: Api, headers: dict[str, str], seguimiento: dict[str, Any]) -> Any:
    return await api.client.post(
        f"/api/v1/tracked-services/{seguimiento['id']}/advance",
        json={"from_stage": seguimiento["current_stage"]},
        headers=headers,
    )


async def test_bano_de_punta_a_punta(api: Api, e: dict[str, Any]) -> None:
    await api.client.put(
        "/api/v1/me/devices", json={"token": TELEFONO_ANA, "platform": "android"}, headers=e["ana"]
    )
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 9), headers=e["rec"])
    cita = r.json()["id"]

    # Sin llegada no se inicia; el cliente no inicia nada.
    r = await api.client.post(f"/api/v1/appointments/{cita}/tracking", headers=e["asis"])
    assert r.status_code == 409 and r.json()["code"] == "appointment_not_checked_in"
    await api.client.post(f"/api/v1/appointments/{cita}/check-in", headers=e["rec"])
    r = await api.client.post(f"/api/v1/appointments/{cita}/tracking", headers=e["ana"])
    assert r.status_code == 403

    r = await api.client.post(f"/api/v1/appointments/{cita}/tracking", headers=e["asis"])
    assert r.status_code == 200, r.text
    s = r.json()
    assert (s["template"], s["status"], s["current_stage"], s["next_stage"]) == (
        "grooming",
        "in_progress",
        "received",
        "Baño",
    )
    assert [st["label"] for st in s["stages"]] == [
        "Recibido",
        "Baño",
        "Secado",
        "Corte y peinado",
        "Listo para recoger",
    ]
    assert [st["state"] for st in s["stages"]] == ["current"] + ["pending"] * 4
    # Iniciar otra vez devuelve el mismo seguimiento.
    r = await api.client.post(f"/api/v1/appointments/{cita}/tracking", headers=e["rec"])
    assert r.json()["id"] == s["id"]

    # Avanza a Baño; un segundo toque con la etapa vieja no avanza dos veces.
    r = await avanzar(api, e["asis"], s)
    assert r.status_code == 200 and r.json()["current_stage"] == "bathing"
    r = await avanzar(api, e["asis"], s)
    assert r.status_code == 409 and r.json()["code"] == "stage_changed"
    s = (await api.client.get(f"/api/v1/tracked-services/{s['id']}", headers=e["asis"])).json()

    # La recepción no avanza etapas.
    assert (await avanzar(api, e["rec"], s)).status_code == 403
    r = await api.client.post(
        f"/api/v1/tracked-services/{s['id']}/updates",
        json={"text": "Luna se portó muy bien en el baño."},
        headers=e["asis"],
    )
    assert r.status_code == 200

    # Ana (dueña) ve etapas y avances; Beto (autorizado sin lo clínico) solo las etapas.
    mias = (await api.client.get("/api/v1/me/tracked-services", headers=e["ana"])).json()
    assert [m["id"] for m in mias] == [s["id"]]
    assert mias[0]["updates"][0]["text"] == "Luna se portó muy bien en el baño."
    beto = (await api.client.get(f"/api/v1/tracked-services/{s['id']}", headers=e["beto"])).json()
    assert beto["current_stage"] == "bathing"
    assert (beto["updates"], beto["updates_hidden"]) == ([], True)
    r = await api.client.get(f"/api/v1/appointments/{cita}/tracking", headers=e["ana"])
    assert r.json()["id"] == s["id"]

    # Hasta "Listo para recoger".
    for _ in range(3):
        r = await avanzar(api, e["asis"], s)
        assert r.status_code == 200, r.text
        s = r.json()
    assert (s["status"], s["current_stage"], s["next_stage"]) == ("ready", "ready", None)
    assert all(st["reached_at"] for st in s["stages"])
    r = await avanzar(api, e["asis"], s)
    assert r.status_code == 409 and r.json()["code"] == "tracking_finished"

    # Entrega y tablero.
    r = await api.client.post(f"/api/v1/tracked-services/{s['id']}/hand-over", headers=e["rec"])
    assert r.status_code == 200 and r.json()["status"] == "handed_over"
    assert r.json()["handed_over_at"]
    tablero = (await api.client.get("/api/v1/tracked-services", headers=e["rec"])).json()
    assert [t["id"] for t in tablero] == [s["id"]]
    assert (await api.client.get("/api/v1/tracked-services", headers=e["ana"])).status_code == 403

    # Avisos: inicio, el avance publicado y "lista para recoger"; las etapas intermedias no.
    emisor = Emisor()
    await build_dispatcher(api.app.state.session_factory, emisor).run_once()
    # (El primero es el de la cita que agendó la recepción.)
    assert emisor.enviados[0].title == "Cita confirmada"
    del emisor.enviados[0]
    assert [m.title for m in emisor.enviados] == [
        "Comenzó la atención de Luna",
        "Novedades de Luna",
        "Luna está lista para recoger",
    ]
    assert all(m.to == TELEFONO_ANA for m in emisor.enviados)
    assert emisor.enviados[0].data["url"] == f"/citas/seguimiento/{s['id']}"
    # El texto del avance no viaja en el aviso.
    assert "portó" not in emisor.enviados[1].body


async def test_el_alta_de_una_cirugia_la_autoriza_un_veterinario(
    api: Api, e: dict[str, Any]
) -> None:
    cita = await con_llegada(api, e, service_type_id=e["esterilizacion"])
    s = (await api.client.post(f"/api/v1/appointments/{cita}/tracking", headers=e["vet"])).json()
    assert s["template"] == "surgery"
    assert [st["label"] for st in s["stages"]][-1] == "Alta autorizada"

    for _ in range(3):
        s = (await avanzar(api, e["asis"], s)).json()
    assert (s["current_stage"], s["next_is_discharge"]) == ("recovery", True)

    r = await avanzar(api, e["asis"], s)
    assert r.status_code == 403
    r = await avanzar(api, e["vet"], s)
    assert r.status_code == 200 and r.json()["status"] == "ready"


async def test_lo_ajeno_no_existe(api: Api, e: dict[str, Any]) -> None:
    r = await api.client.get(
        "/api/v1/tracked-services/0192f0a4-0000-7000-8000-000000000000", headers=e["ana"]
    )
    assert r.status_code == 404
    cita = await con_llegada(api, e, pet_id=e["toby"])
    s = (await api.client.post(f"/api/v1/appointments/{cita}/tracking", headers=e["asis"])).json()
    # Toby es de Beto: Ana no lo ve ni en su lista.
    r = await api.client.get(f"/api/v1/tracked-services/{s['id']}", headers=e["ana"])
    assert r.status_code == 404
    assert (await api.client.get("/api/v1/me/tracked-services", headers=e["ana"])).json() == []
