"""El cliente elige a su veterinario de confianza; los horarios respetan la antelación mínima."""

from datetime import UTC, datetime, time
from typing import Any

import pytest
from integration_support import Api
from test_scheduling_api import LUNES, RelojFijo, lima
from test_scheduling_api import escenario as escenario_de_la_agenda  # noqa: F401

from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.scheduling.infrastructure.composition import build_scheduling


@pytest.fixture
async def e(escenario_de_la_agenda: dict[str, Any], api: Api) -> dict[str, Any]:  # noqa: F811
    """Escenario de la agenda más la consulta y los dos veterinarios de la sede de prueba."""
    datos = dict(escenario_de_la_agenda)
    servicios = (await api.client.get("/api/v1/clinic/service-types", headers=datos["rec"])).json()
    datos["consulta"] = next(s["id"] for s in servicios if s["code"] == "consulta")
    recursos = (await api.client.get("/api/v1/clinic/resources", headers=datos["rec"])).json()
    por_nombre = {r["name"]: r["id"] for r in recursos}
    datos["vet1"], datos["vet2"] = por_nombre["Veterinario 1"], por_nombre["Veterinario 2"]
    datos["consultorio"] = por_nombre["Consultorio 1"]
    return datos


async def inicios(api: Api, headers: dict[str, str], **params: Any) -> list[str]:
    r = await api.client.get("/api/v1/scheduling/availability", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return [
        datetime.fromisoformat(s["start"]).astimezone(CLINIC_TZ).strftime("%H:%M") for s in r.json()
    ]


async def test_el_cliente_ve_quienes_prestan_cada_servicio(api: Api, e: dict[str, Any]) -> None:
    r = await api.client.get(
        "/api/v1/scheduling/professionals",
        params={"service_type_id": e["consulta"]},
        headers=e["ana"],
    )
    assert r.status_code == 200
    assert r.json() == [
        {"id": e["vet1"], "name": "Veterinario 1", "kind": "veterinarian"},
        {"id": e["vet2"], "name": "Veterinario 2", "kind": "veterinarian"},
    ]  # Sin horarios ni salas.

    r = await api.client.get(
        "/api/v1/scheduling/professionals", params={"service_type_id": e["bano"]}, headers=e["ana"]
    )
    assert [p["name"] for p in r.json()] == ["Groomer 1"]

    # Sin servicio: todos, para mostrar quién atiende cada cita.
    r = await api.client.get("/api/v1/scheduling/professionals", headers=e["ana"])
    assert [p["name"] for p in r.json()] == ["Groomer 1", "Veterinario 1", "Veterinario 2"]

    # Un servicio que el cliente no puede reservar no existe para él.
    r = await api.client.get(
        "/api/v1/scheduling/professionals",
        params={"service_type_id": e["esterilizacion"]},
        headers=e["ana"],
    )
    assert r.status_code == 404


async def test_horarios_y_reserva_con_el_veterinario_elegido(api: Api, e: dict[str, Any]) -> None:
    # Recepción agenda una consulta a las 10:00 con el Veterinario 1.
    r = await api.client.post(
        "/api/v1/appointments",
        json={
            "pet_id": e["toby"],
            "service_type_id": e["consulta"],
            "start": lima(10),
            "resource_ids": [e["vet1"]],
        },
        headers=e["rec"],
    )
    assert r.status_code == 201, r.text

    base = {"service_type_id": e["consulta"], "date": LUNES.isoformat()}
    con_vet1 = await inicios(api, e["ana"], **base, professional_id=e["vet1"])
    con_vet2 = await inicios(api, e["ana"], **base, professional_id=e["vet2"])
    cualquiera = await inicios(api, e["ana"], **base)
    assert "10:00" not in con_vet1 and "09:30" in con_vet1 and "10:30" in con_vet1
    assert "10:00" in con_vet2 and "10:00" in cualquiera

    # Ana reserva con el Veterinario 2 a las 10:00; con el 1 ese horario está ocupado.
    cita = {"pet_id": e["luna"], "service_type_id": e["consulta"], "start": lima(10)}
    r = await api.client.post(
        "/api/v1/appointments", json=cita | {"resource_ids": [e["vet1"]]}, headers=e["ana"]
    )
    assert r.status_code == 409 and r.json()["code"] == "slot_unavailable"
    r = await api.client.post(
        "/api/v1/appointments", json=cita | {"resource_ids": [e["vet2"]]}, headers=e["ana"]
    )
    assert r.status_code == 201, r.text
    assert e["vet2"] in r.json()["resource_ids"]
    id_cita = r.json()["id"]

    # Al reprogramar puede mantener a su veterinario.
    r = await api.client.post(
        f"/api/v1/appointments/{id_cita}/reschedule",
        json={"start": lima(11), "resource_ids": [e["vet2"]]},
        headers=e["ana"],
    )
    assert r.status_code == 200 and e["vet2"] in r.json()["resource_ids"]


async def test_el_cliente_solo_elige_al_profesional(api: Api, e: dict[str, Any]) -> None:
    cita = {"pet_id": e["luna"], "service_type_id": e["consulta"], "start": lima(10)}
    r = await api.client.post(
        "/api/v1/appointments", json=cita | {"resource_ids": [e["consultorio"]]}, headers=e["ana"]
    )
    assert r.status_code == 422
    assert r.json()["errors"][0]["field"] == "resource_ids"

    # Un groomer no presta consultas; tampoco sirve un id cualquiera.
    groomer = (
        await api.client.get(
            "/api/v1/scheduling/professionals",
            params={"service_type_id": e["bano"]},
            headers=e["ana"],
        )
    ).json()[0]["id"]
    for otro in (groomer, e["luna"]):
        r = await api.client.get(
            "/api/v1/scheduling/availability",
            params={
                "service_type_id": e["consulta"],
                "date": LUNES.isoformat(),
                "professional_id": otro,
            },
            headers=e["ana"],
        )
        assert r.status_code == 422 and r.json()["errors"][0]["field"] == "professional_id"

    # El personal sí puede fijar la sala.
    r = await api.client.post(
        "/api/v1/appointments", json=cita | {"resource_ids": [e["consultorio"]]}, headers=e["rec"]
    )
    assert r.status_code == 201 and e["consultorio"] in r.json()["resource_ids"]


async def test_el_cliente_reserva_desde_30_minutos_despues_y_el_personal_desde_ya(
    api: Api, e: dict[str, Any]
) -> None:
    # Son las 11:00 del lunes.
    api.app.state.scheduling = build_scheduling(
        api.app.state.session_factory,
        api.app.state.clinic_catalog,
        api.app.state.pet_access,
        clock=RelojFijo(datetime.combine(LUNES, time(11), CLINIC_TZ).astimezone(UTC)),
    )
    base = {"service_type_id": e["consulta"], "date": LUNES.isoformat()}

    cliente = await inicios(api, e["ana"], **base, professional_id=e["vet1"])
    personal = await inicios(api, e["rec"], **base)
    assert cliente[0] == "11:30" and "11:15" not in cliente
    assert personal[0] == "11:00"

    r = await api.client.post(
        "/api/v1/appointments",
        json={"pet_id": e["luna"], "service_type_id": e["consulta"], "start": lima(11, 15)},
        headers=e["ana"],
    )
    assert r.status_code == 422


async def test_vista_del_dia_con_los_horarios_ocupados(api: Api, e: dict[str, Any]) -> None:
    # Son las 09:00 del lunes; el Veterinario 1 tiene una consulta a las 10:00.
    api.app.state.scheduling = build_scheduling(
        api.app.state.session_factory,
        api.app.state.clinic_catalog,
        api.app.state.pet_access,
        clock=RelojFijo(datetime.combine(LUNES, time(9), CLINIC_TZ).astimezone(UTC)),
    )
    r = await api.client.post(
        "/api/v1/appointments",
        json={
            "pet_id": e["toby"],
            "service_type_id": e["consulta"],
            "start": lima(10),
            "resource_ids": [e["vet1"]],
        },
        headers=e["rec"],
    )
    assert r.status_code == 201, r.text

    params = {
        "service_type_id": e["consulta"],
        "date": LUNES.isoformat(),
        "professional_id": e["vet1"],
        "include_unavailable": "true",
    }
    r = await api.client.get("/api/v1/scheduling/availability", params=params, headers=e["ana"])
    estado = {
        datetime.fromisoformat(s["start"]).astimezone(CLINIC_TZ).strftime("%H:%M"): s["status"]
        for s in r.json()
    }
    # Dentro de los 30 minutos: visibles pero no reservables. La consulta de las 10:00 ocupa
    # 09:45 a 10:15 (30 min). El almuerzo del veterinario también aparece como ocupado.
    assert (estado["09:00"], estado["09:15"], estado["09:30"]) == ("too_soon", "too_soon", "free")
    assert (estado["09:45"], estado["10:00"], estado["10:15"]) == ("taken", "taken", "taken")
    assert estado["10:30"] == "free" and estado["12:45"] == "taken"
    # Fuera del horario de la sede no aparece nada.
    assert "08:45" not in estado and "19:00" not in estado

    # Sin el parámetro, como antes: solo los libres.
    del params["include_unavailable"]
    r = await api.client.get("/api/v1/scheduling/availability", params=params, headers=e["ana"])
    assert {s["status"] for s in r.json()} == {"free"}
