"""Clinic Setup de punta a punta: HTTP → casos de uso → MySQL."""

import asyncio
from typing import Any

from integration_support import Api, auth

from vetcare.contexts.identity.domain.permissions import Role

BANO: dict[str, Any] = {
    "code": "bano",
    "name": "Baño",
    "category": "grooming",
    "duration_minutes": 60,
    "required_resources": ["groomer", "grooming_station"],
    "bookable_by_client": True,
    "description": "Baño con secado.",
}
CIRUGIA: dict[str, Any] = {
    "code": "esterilizacion",
    "name": "Esterilización",
    "category": "surgery",
    "duration_minutes": 120,
    "required_resources": ["veterinarian", "operating_room"],
    "bookable_by_client": False,
}
LUNES_A_VIERNES = [{"weekday": d, "start": "09:00", "end": "13:00"} for d in range(5)] + [
    {"weekday": d, "start": "14:00", "end": "19:00"} for d in range(5)
]


async def tokens(api: Api) -> dict[Role, str]:
    roles = {
        Role.ADMIN: "admin@example.test",
        Role.VETERINARIAN: "vet@example.test",
        Role.RECEPTIONIST: "recepcion@example.test",
        Role.CLIENT: "cliente@example.test",
    }
    return {rol: await api.usuario(email, frozenset({rol})) for rol, email in roles.items()}


async def test_catalogo_crud_y_visibilidad_por_rol(api: Api) -> None:
    t = await tokens(api)
    admin = auth(t[Role.ADMIN])

    bano = await api.client.post("/api/v1/clinic/service-types", json=BANO, headers=admin)
    cirugia = await api.client.post("/api/v1/clinic/service-types", json=CIRUGIA, headers=admin)
    assert bano.status_code == cirugia.status_code == 201

    cambio = BANO | {"name": "Baño medicado", "duration_minutes": 75}
    del cambio["code"]
    r = await api.client.put(
        f"/api/v1/clinic/service-types/{bano.json()['id']}", json=cambio, headers=admin
    )
    assert r.json()["name"] == "Baño medicado" and r.json()["code"] == "bano"

    personal = await api.client.get(
        "/api/v1/clinic/service-types", headers=auth(t[Role.RECEPTIONIST])
    )
    cliente = await api.client.get("/api/v1/clinic/service-types", headers=auth(t[Role.CLIENT]))
    assert {s["code"] for s in personal.json()} == {"bano", "esterilizacion"}
    assert [s["code"] for s in cliente.json()] == ["bano"]

    r = await api.client.patch(
        f"/api/v1/clinic/service-types/{bano.json()['id']}/active",
        json={"active": False},
        headers=admin,
    )
    assert r.json()["active"] is False
    cliente = await api.client.get("/api/v1/clinic/service-types", headers=auth(t[Role.CLIENT]))
    assert cliente.json() == []


async def test_solo_la_administracion_escribe_la_configuracion(api: Api) -> None:
    t = await tokens(api)
    escrituras = [
        ("POST", "/api/v1/clinic/service-types", BANO),
        ("POST", "/api/v1/clinic/resources", {"kind": "groomer", "name": "Groomer 1"}),
        ("PUT", "/api/v1/clinic/calendar/opening-hours", {"opening_hours": LUNES_A_VIERNES}),
        ("POST", "/api/v1/clinic/calendar/holidays", {"day": "2026-12-08", "name": "Feriado"}),
    ]
    for rol in (Role.VETERINARIAN, Role.RECEPTIONIST, Role.CLIENT):
        for method, path, body in escrituras:
            r = await api.client.request(method, path, json=body, headers=auth(t[rol]))
            assert r.status_code == 403, (rol, method, path)

    r = await api.client.get("/api/v1/clinic/resources", headers=auth(t[Role.CLIENT]))
    assert r.status_code == 403
    for method, path, _ in escrituras[:1]:
        r = await api.client.request(method, path, json=BANO)
        assert r.status_code == 401


async def test_validaciones_del_dominio_llegan_como_422_por_campo(api: Api) -> None:
    t = await tokens(api)
    admin = auth(t[Role.ADMIN])

    r = await api.client.post(
        "/api/v1/clinic/service-types", json=BANO | {"code": "Con Espacios"}, headers=admin
    )
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "code"

    r = await api.client.post(
        "/api/v1/clinic/service-types", json=BANO | {"duration_minutes": 62}, headers=admin
    )
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "duration_minutes"

    solapado = [
        {"weekday": 0, "start": "09:00", "end": "12:00"},
        {"weekday": 0, "start": "11:00", "end": "13:00"},
    ]
    r = await api.client.put(
        "/api/v1/clinic/calendar/opening-hours", json={"opening_hours": solapado}, headers=admin
    )
    assert r.status_code == 422
    assert "lunes" in r.json()["errors"][0]["message"]


async def test_codigo_duplicado_incluso_en_solicitudes_simultaneas(api: Api) -> None:
    t = await tokens(api)

    respuestas = await asyncio.gather(
        *(
            api.client.post("/api/v1/clinic/service-types", json=BANO, headers=auth(t[Role.ADMIN]))
            for _ in range(2)
        )
    )

    assert sorted(r.status_code for r in respuestas) == [201, 409]


async def test_recursos_con_horario_y_bloqueos(api: Api) -> None:
    t = await tokens(api)
    admin = auth(t[Role.ADMIN])

    r = await api.client.post(
        "/api/v1/clinic/resources",
        json={"kind": "groomer", "name": "Groomer 1", "schedule": LUNES_A_VIERNES},
        headers=admin,
    )
    assert r.status_code == 201
    recurso = r.json()
    assert len(recurso["schedule"]) == 10

    r = await api.client.post(
        f"/api/v1/clinic/resources/{recurso['id']}/time-off",
        json={
            "start": "2026-11-02T09:00:00-05:00",
            "end": "2026-11-02T13:00:00-05:00",
            "reason": "Capacitación",
        },
        headers=admin,
    )
    assert r.status_code == 201
    bloqueo = r.json()["time_off"][0]
    assert bloqueo["reason"] == "Capacitación"
    assert bloqueo["start"].startswith("2026-11-02T14:00:00")  # se guarda en UTC

    r = await api.client.post(
        f"/api/v1/clinic/resources/{recurso['id']}/time-off",
        json={"start": "2026-11-02T12:00:00-05:00", "end": "2026-11-02T15:00:00-05:00"},
        headers=admin,
    )
    assert r.status_code == 409 and r.json()["code"] == "time_off_overlap"

    r = await api.client.post(
        f"/api/v1/clinic/resources/{recurso['id']}/time-off",
        json={"start": "2026-11-02T12:00:00", "end": "2026-11-02T15:00:00"},
        headers=admin,
    )
    assert r.status_code == 422  # sin zona horaria

    r = await api.client.delete(
        f"/api/v1/clinic/resources/{recurso['id']}/time-off/{bloqueo['id']}", headers=admin
    )
    assert r.json()["time_off"] == []

    r = await api.client.post(
        "/api/v1/clinic/resources",
        json={"kind": "operating_room", "name": "Quirófano", "user_id": recurso["id"]},
        headers=admin,
    )
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "user_id"

    listado = await api.client.get("/api/v1/clinic/resources", headers=auth(t[Role.RECEPTIONIST]))
    assert [x["name"] for x in listado.json()] == ["Groomer 1"]


async def test_calendario_con_horario_y_feriados(api: Api) -> None:
    t = await tokens(api)
    admin = auth(t[Role.ADMIN])

    vacio = await api.client.get("/api/v1/clinic/calendar", headers=auth(t[Role.CLIENT]))
    assert vacio.json() == {"timezone": "America/Lima", "opening_hours": [], "holidays": []}

    await api.client.put(
        "/api/v1/clinic/calendar/opening-hours",
        json={"opening_hours": LUNES_A_VIERNES},
        headers=admin,
    )
    r = await api.client.post(
        "/api/v1/clinic/calendar/holidays",
        json={"day": "2026-12-08", "name": "Inmaculada Concepción"},
        headers=admin,
    )
    assert r.status_code == 201
    r = await api.client.post(
        "/api/v1/clinic/calendar/holidays",
        json={"day": "2026-12-08", "name": "Otra vez"},
        headers=admin,
    )
    assert r.status_code == 409

    calendario = await api.client.get("/api/v1/clinic/calendar", headers=auth(t[Role.CLIENT]))
    assert len(calendario.json()["opening_hours"]) == 10
    assert calendario.json()["holidays"] == [{"day": "2026-12-08", "name": "Inmaculada Concepción"}]

    r = await api.client.delete("/api/v1/clinic/calendar/holidays/2026-12-08", headers=admin)
    assert r.json()["holidays"] == []


async def test_la_configuracion_inicial_es_idempotente(api: Api) -> None:
    from vetcare.contexts.clinic.infrastructure.composition import clinic_uow_factory
    from vetcare.contexts.clinic.infrastructure.seed import RESOURCES, SERVICES, seed_clinic

    uow = clinic_uow_factory(api.app.state.session_factory)
    primera = await seed_clinic(uow)
    segunda = await seed_clinic(uow)

    assert (primera.service_types, primera.resources, primera.opening_hours) == (
        len(SERVICES),
        len(RESOURCES),
        True,
    )
    assert (segunda.service_types, segunda.resources, segunda.opening_hours) == (0, 0, False)
    t = await tokens(api)
    cliente = await api.client.get("/api/v1/clinic/service-types", headers=auth(t[Role.CLIENT]))
    assert {s["category"] for s in cliente.json()} == {"consultation", "vaccination", "grooming"}
