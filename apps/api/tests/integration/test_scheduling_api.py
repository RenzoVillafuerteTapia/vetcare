"""Agenda de punta a punta: HTTP → casos de uso → MySQL, incluidas reservas concurrentes."""

import asyncio
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import pytest
from integration_support import CLAVE, Api, auth

from vetcare.contexts.clinic.infrastructure.composition import clinic_uow_factory
from vetcare.contexts.clinic.infrastructure.seed import seed_clinic
from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.identity.application.services import RequestContext
from vetcare.contexts.identity.domain.permissions import Role
from vetcare.contexts.scheduling.infrastructure.composition import build_scheduling


def proximo_lunes() -> date:
    hoy = datetime.now(CLINIC_TZ).date()
    return hoy + timedelta(days=14 + (7 - hoy.weekday()) % 7)


LUNES = proximo_lunes()


def lima(hora: int, minuto: int = 0, dia: date = LUNES) -> str:
    return datetime.combine(dia, time(hora, minuto), CLINIC_TZ).isoformat()


class RelojFijo:
    def __init__(self, ahora: datetime) -> None:
        self.ahora = ahora

    def now(self) -> datetime:
        return self.ahora


@pytest.fixture
async def escenario(api: Api) -> dict[str, Any]:
    """Sede configurada (seed-clinic), personal, dos clientes con cuenta y sus mascotas."""
    await seed_clinic(clinic_uow_factory(api.app.state.session_factory))
    t = {
        rol: await api.usuario(email, frozenset({rol}))
        for rol, email in {
            Role.ADMIN: "admin@example.test",
            Role.RECEPTIONIST: "recepcion@example.test",
            Role.ASSISTANT: "asistente@example.test",
        }.items()
    }
    rec = auth(t[Role.RECEPTIONIST])

    async def post(path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        r = await api.client.post(path, json=body, headers=rec)
        assert r.status_code in (200, 201), r.text
        data: dict[str, Any] = r.json()
        return data

    ana = await post(
        "/api/v1/clients",
        {
            "full_name": "Ana Pérez",
            "document_type": "dni",
            "document_number": "12345678",
            "phone": "987654321",
            "email": "ana@example.test",
        },
    )
    beto = await post(
        "/api/v1/clients",
        {
            "full_name": "Beto Ruiz",
            "document_type": "dni",
            "document_number": "87654321",
            "phone": "912345678",
            "email": "beto@example.test",
        },
    )
    luna = await post(
        f"/api/v1/clients/{ana['id']}/pets", {"name": "Luna", "species": "dog", "sex": "female"}
    )
    toby = await post(
        f"/api/v1/clients/{beto['id']}/pets", {"name": "Toby", "species": "cat", "sex": "male"}
    )
    await post(
        f"/api/v1/pets/{luna['id']}/guardians",
        {
            "client_id": beto["id"],
            "kind": "authorized",
            "permissions": {"can_pickup": True, "can_book": False, "can_view_clinical": False},
        },
    )
    tokens_clientes = {}
    for cliente, email in ((ana, "ana@example.test"), (beto, "beto@example.test")):
        await post(f"/api/v1/clients/{cliente['id']}/invitation")
        await api.servicio.accept_invitation(api.buzon.ultimo_token(email), CLAVE, RequestContext())
        tokens_clientes[email] = await api.login(email)

    servicios = (await api.client.get("/api/v1/clinic/service-types", headers=rec)).json()
    por_codigo = {s["code"]: s["id"] for s in servicios}
    return {
        "rec": rec,
        "asis": auth(t[Role.ASSISTANT]),
        "ana": auth(tokens_clientes["ana@example.test"]),
        "beto": auth(tokens_clientes["beto@example.test"]),
        "luna": luna["id"],
        "toby": toby["id"],
        "ana_id": ana["id"],
        "bano": por_codigo["bano"],
        "esterilizacion": por_codigo["esterilizacion"],
    }


def reserva(e: dict[str, Any], hora: int, minuto: int = 0, **extra: Any) -> dict[str, Any]:
    return {"pet_id": e["luna"], "service_type_id": e["bano"], "start": lima(hora, minuto)} | extra


# --- Disponibilidad ------------------------------------------------------------------------


async def test_disponibilidad_segun_horarios_almuerzo_y_citas(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario
    params = {"service_type_id": e["bano"], "date": LUNES.isoformat()}

    r = await api.client.get("/api/v1/scheduling/availability", params=params, headers=e["rec"])
    inicios = [
        datetime.fromisoformat(s["start"]).astimezone(CLINIC_TZ).strftime("%H:%M") for s in r.json()
    ]
    # Baño de 60 min con el único groomer (9-13 y 14-19), cada 15 min.
    assert inicios[0] == "09:00" and inicios[-1] == "18:00"
    assert "12:00" in inicios and "12:15" not in inicios and "13:45" not in inicios

    await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])
    r = await api.client.get("/api/v1/scheduling/availability", params=params, headers=e["rec"])
    inicios = [
        datetime.fromisoformat(s["start"]).astimezone(CLINIC_TZ).strftime("%H:%M") for s in r.json()
    ]
    assert (
        "09:00" in inicios
        and "09:15" not in inicios
        and "10:45" not in inicios
        and "11:00" in inicios
    )

    # El cliente no ve los servicios que no puede reservar.
    r = await api.client.get(
        "/api/v1/scheduling/availability",
        params={"service_type_id": e["esterilizacion"], "date": LUNES.isoformat()},
        headers=e["ana"],
    )
    assert r.status_code == 404

    # Un domingo la sede está cerrada.
    r = await api.client.get(
        "/api/v1/scheduling/availability",
        params=params | {"date": (LUNES + timedelta(days=6)).isoformat()},
        headers=e["rec"],
    )
    assert r.json() == []


# --- Conflictos y concurrencia -------------------------------------------------------------


async def test_no_se_superponen_citas_del_mismo_recurso(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])
    assert r.status_code == 201 and r.json()["status"] == "confirmed"

    r = await api.client.post("/api/v1/appointments", json=reserva(e, 10, 30), headers=e["rec"])
    assert r.status_code == 409 and r.json()["code"] == "slot_unavailable"

    # Límite exacto: termina 11:00, la siguiente empieza 11:00.
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 11), headers=e["rec"])
    assert r.status_code == 201

    # Fuera del horario de la sede o en el almuerzo del groomer.
    for hora, minuto in ((8, 30), (12, 30), (18, 30)):
        r = await api.client.post(
            "/api/v1/appointments", json=reserva(e, hora, minuto), headers=e["rec"]
        )
        assert r.status_code == 409, (hora, minuto)


async def test_reservas_simultaneas_del_mismo_horario_solo_una_gana(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario
    respuestas = await asyncio.gather(
        *(
            api.client.post("/api/v1/appointments", json=reserva(e, 15), headers=e["rec"])
            for _ in range(5)
        )
    )

    codigos = sorted(r.status_code for r in respuestas)
    assert codigos == [201, 409, 409, 409, 409], [r.text for r in respuestas]
    agenda = await api.client.get(
        "/api/v1/appointments",
        params={"from": lima(0), "to": lima(23, 59)},
        headers=e["rec"],
    )
    assert len(agenda.json()) == 1


async def test_reservas_simultaneas_en_horarios_que_se_cruzan(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario
    respuestas = await asyncio.gather(
        *(
            api.client.post("/api/v1/appointments", json=reserva(e, 15, m), headers=e["rec"])
            for m in (0, 15, 30, 45)
        )
    )
    assert sorted(r.status_code for r in respuestas) == [201, 409, 409, 409]


# --- Idempotencia --------------------------------------------------------------------------


async def test_idempotency_key_evita_duplicados(api: Api, escenario: dict[str, Any]) -> None:
    e = escenario
    headers = e["rec"] | {"Idempotency-Key": "reserva-luna-0001"}

    primera = await api.client.post("/api/v1/appointments", json=reserva(e, 9), headers=headers)
    repetida = await api.client.post("/api/v1/appointments", json=reserva(e, 9), headers=headers)
    assert (primera.status_code, repetida.status_code) == (201, 200)
    assert repetida.headers["idempotent-replayed"] == "true"
    assert repetida.json()["id"] == primera.json()["id"]

    otra = await api.client.post("/api/v1/appointments", json=reserva(e, 16), headers=headers)
    assert otra.status_code == 409 and otra.json()["code"] == "idempotency_key_reused"


async def test_idempotency_key_en_reintentos_simultaneos(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario
    headers = e["rec"] | {"Idempotency-Key": "doble-toque-0002"}

    respuestas = await asyncio.gather(
        *(
            api.client.post("/api/v1/appointments", json=reserva(e, 17), headers=headers)
            for _ in range(3)
        )
    )

    assert sorted(r.status_code for r in respuestas) == [200, 200, 201], [
        r.text for r in respuestas
    ]
    assert len({r.json()["id"] for r in respuestas}) == 1


# --- Clientes ------------------------------------------------------------------------------


async def test_el_cliente_solicita_y_gestiona_solo_lo_suyo(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario

    r = await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["ana"])
    assert r.status_code == 201
    cita = r.json()
    assert (cita["status"], cita["channel"], cita["notes"], cita["history"]) == (
        "requested",
        "client",
        None,
        None,
    )

    # Beto puede recoger a Luna, pero no reservarle citas; Toby no es de Ana.
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 11), headers=e["beto"])
    assert r.status_code == 403
    r = await api.client.post(
        "/api/v1/appointments", json=reserva(e, 11) | {"pet_id": e["toby"]}, headers=e["ana"]
    )
    assert r.status_code == 404
    r = await api.client.post(
        "/api/v1/appointments",
        json=reserva(e, 11) | {"service_type_id": e["esterilizacion"]},
        headers=e["ana"],
    )
    assert r.status_code == 404

    # Beto ve la cita de Luna (tiene tutela) pero no puede cancelarla.
    mis_beto = await api.client.get("/api/v1/me/appointments", headers=e["beto"])
    assert [c["id"] for c in mis_beto.json()] == [cita["id"]]
    r = await api.client.post(
        f"/api/v1/appointments/{cita['id']}/cancel", json={}, headers=e["beto"]
    )
    assert r.status_code == 403

    # El cliente no confirma ni consulta la agenda completa.
    r = await api.client.post(f"/api/v1/appointments/{cita['id']}/confirm", headers=e["ana"])
    assert r.status_code == 403
    r = await api.client.get(
        "/api/v1/appointments", params={"from": lima(0), "to": lima(23)}, headers=e["ana"]
    )
    assert r.status_code == 403

    r = await api.client.post(f"/api/v1/appointments/{cita['id']}/confirm", headers=e["rec"])
    assert r.json()["status"] == "confirmed"

    r = await api.client.post(
        f"/api/v1/appointments/{cita['id']}/reschedule", json={"start": lima(14)}, headers=e["ana"]
    )
    assert r.status_code == 200 and r.json()["status"] == "requested"

    r = await api.client.post(
        f"/api/v1/appointments/{cita['id']}/cancel", json={"reason": "Viaje"}, headers=e["ana"]
    )
    assert r.json()["status"] == "cancelled" and r.json()["cancellation_reason"] == "Viaje"

    # Cancelada, libera el horario.
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 14), headers=e["rec"])
    assert r.status_code == 201


# --- Ciclo de vida y agenda del personal ---------------------------------------------------


async def test_ciclo_de_vida_con_reloj_del_dia_de_la_cita(
    api: Api, escenario: dict[str, Any]
) -> None:
    e = escenario
    r = await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])
    cita = r.json()

    r = await api.client.post(f"/api/v1/appointments/{cita['id']}/check-in", headers=e["rec"])
    assert r.status_code == 409 and r.json()["code"] == "check_in_too_early"

    reloj = RelojFijo(datetime.combine(LUNES, time(9, 50), CLINIC_TZ).astimezone(UTC))
    api.app.state.scheduling = build_scheduling(
        api.app.state.session_factory,
        api.app.state.clinic_catalog,
        api.app.state.pet_access,
        clock=reloj,
    )
    for accion, estado in (("check-in", "checked_in"), ("complete", "completed")):
        r = await api.client.post(f"/api/v1/appointments/{cita['id']}/{accion}", headers=e["rec"])
        assert r.json()["status"] == estado, r.text
    assert [h["action"] for h in r.json()["history"]] == ["booked", "checked_in", "completed"]

    # La asistencia consulta la agenda, pero no registra llegadas.
    r = await api.client.get(
        "/api/v1/appointments",
        params={"from": lima(0), "to": lima(23, 59), "status": "completed"},
        headers=e["asis"],
    )
    assert [c["id"] for c in r.json()] == [cita["id"]]
    otra = await api.client.post("/api/v1/appointments", json=reserva(e, 15), headers=e["rec"])
    r = await api.client.post(
        f"/api/v1/appointments/{otra.json()['id']}/check-in", headers=e["asis"]
    )
    assert r.status_code == 403

    reloj.ahora = datetime.combine(LUNES, time(15, 30), CLINIC_TZ).astimezone(UTC)
    r = await api.client.post(f"/api/v1/appointments/{otra.json()['id']}/no-show", headers=e["rec"])
    assert r.json()["status"] == "no_show"


async def test_un_feriado_cierra_la_agenda(api: Api, escenario: dict[str, Any]) -> None:
    e = escenario
    admin_token = await api.login("admin@example.test")
    await api.client.post(
        "/api/v1/clinic/calendar/holidays",
        json={"day": LUNES.isoformat(), "name": "Feriado de prueba"},
        headers=auth(admin_token),
    )

    r = await api.client.post("/api/v1/appointments", json=reserva(e, 10), headers=e["rec"])
    assert r.status_code == 409
    r = await api.client.get(
        "/api/v1/scheduling/availability",
        params={"service_type_id": e["bano"], "date": LUNES.isoformat()},
        headers=e["rec"],
    )
    assert r.json() == []


async def test_validaciones_de_la_reserva(api: Api, escenario: dict[str, Any]) -> None:
    e = escenario
    pasado = datetime.now(UTC) - timedelta(days=1)
    casos = [
        (reserva(e, 10, 7), "start"),  # no es múltiplo de 5 minutos
        (reserva(e, 10) | {"start": pasado.isoformat()}, "start"),
        (reserva(e, 10) | {"resource_ids": [e["luna"]]}, "resource_ids"),
    ]
    for cuerpo, campo in casos:
        r = await api.client.post("/api/v1/appointments", json=cuerpo, headers=e["rec"])
        assert r.status_code == 422 and r.json()["errors"][0]["field"] == campo, cuerpo

    r = await api.client.post(
        "/api/v1/appointments",
        json=reserva(e, 10) | {"start": "2026-11-02T10:00:00"},
        headers=e["rec"],
    )
    assert r.status_code == 422
