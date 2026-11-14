"""Textos de los avisos, formato de los tokens y el emisor de Expo (con un transporte falso)."""

import json
from datetime import datetime

import httpx
import pytest

from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.notifications.application.ports import PushMessage
from vetcare.contexts.notifications.domain.device import PushToken
from vetcare.contexts.notifications.domain.messages import appointment_push, spoken_date
from vetcare.contexts.notifications.infrastructure.senders import EXPO_PUSH_URL, ExpoPushSender
from vetcare.shared_kernel.errors import ValidationFailedError
from vetcare.shared_kernel.events import RetryLaterError

JUEVES = datetime(2026, 11, 12, 15, 0, tzinfo=CLINIC_TZ)
TOKEN = "ExponentPushToken[abcdefghij0123456789]"


def test_la_fecha_se_lee_en_espanol() -> None:
    assert spoken_date(JUEVES) == "jueves 12 de noviembre a las 15:00"


@pytest.mark.parametrize("token", [TOKEN, "ExpoPushToken[xxxxxxxxxxxxxxxxxxxx]"])
def test_acepta_los_tokens_de_expo(token: str) -> None:
    assert PushToken(token).value == token


@pytest.mark.parametrize(
    "token", ["", "abc", "ExponentPushToken[]", "fcm:token-de-otro-proveedor", TOKEN + " "]
)
def test_rechaza_lo_que_no_es_un_token_de_expo(token: str) -> None:
    with pytest.raises(ValidationFailedError):
        PushToken(token)


def test_avisos_de_cita_sin_datos_clinicos() -> None:
    base = {"pet_name": "Luna", "client_id": "x", "reason": "Vómitos", "service_name": "Consulta"}

    confirmada = appointment_push("scheduling.appointment_confirmed", "c1", base, JUEVES)
    assert confirmada is not None
    assert confirmada.title == "Cita confirmada"
    assert confirmada.body == "La cita de Luna es el jueves 12 de noviembre a las 15:00."
    assert confirmada.data == {"url": "/citas/c1", "appointment_id": "c1"}
    assert "Vómitos" not in confirmada.body and "Consulta" not in confirmada.body

    movida = appointment_push(
        "scheduling.appointment_rescheduled", "c1", base | {"by_client": False}, JUEVES
    )
    assert movida is not None and movida.title == "Tu cita cambió de horario"

    cancelada = appointment_push(
        "scheduling.appointment_cancelled", "c1", base | {"by_client": False}, JUEVES
    )
    assert cancelada is not None and "La veterinaria canceló la cita de Luna" in cancelada.body


def test_no_avisa_lo_que_hizo_el_propio_cliente() -> None:
    hecho_por_cliente = {"pet_name": "Luna", "by_client": True}
    for event_type in ("scheduling.appointment_rescheduled", "scheduling.appointment_cancelled"):
        assert appointment_push(event_type, "c1", hecho_por_cliente, JUEVES) is None
    assert appointment_push("scheduling.appointment_requested", "c1", {}, JUEVES) is None


def _expo(handler: httpx.MockTransport, token: str | None = None) -> ExpoPushSender:
    return ExpoPushSender(token, transport=handler)


async def test_expo_traduce_los_resultados_de_cada_mensaje() -> None:
    recibidas: list[httpx.Request] = []

    def responder(request: httpx.Request) -> httpx.Response:
        recibidas.append(request)
        return httpx.Response(
            200,
            json={
                "data": [
                    {"status": "ok", "id": "t1"},
                    {
                        "status": "error",
                        "message": "no registrado",
                        "details": {"error": "DeviceNotRegistered"},
                    },
                ]
            },
        )

    tickets = await _expo(httpx.MockTransport(responder), "clave-expo").send(
        [PushMessage(TOKEN, "Hola", "Cuerpo", {"url": "/citas/1"}), PushMessage("otro", "a", "b")]
    )

    assert [(t.ok, t.unregistered) for t in tickets] == [(True, False), (False, True)]
    (request,) = recibidas
    assert str(request.url) == EXPO_PUSH_URL
    assert request.headers["Authorization"] == "Bearer clave-expo"
    enviado = json.loads(request.content)
    assert enviado[0] == {
        "to": TOKEN,
        "title": "Hola",
        "body": "Cuerpo",
        "data": {"url": "/citas/1"},
        "sound": "default",
        "priority": "high",
        "channelId": "default",
    }


@pytest.mark.parametrize("status", [429, 500, 503])
async def test_expo_caido_o_saturado_se_reintenta(status: int) -> None:
    sender = _expo(httpx.MockTransport(lambda _: httpx.Response(status)))
    with pytest.raises(RetryLaterError):
        await sender.send([PushMessage(TOKEN, "a", "b")])


async def test_sin_conexion_con_expo_se_reintenta() -> None:
    def sin_red(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sin red", request=request)

    with pytest.raises(RetryLaterError):
        await _expo(httpx.MockTransport(sin_red)).send([PushMessage(TOKEN, "a", "b")])


async def test_expo_envia_de_a_cien() -> None:
    lotes: list[int] = []

    def responder(request: httpx.Request) -> httpx.Response:
        cantidad = len(json.loads(request.content))
        lotes.append(cantidad)
        return httpx.Response(200, json={"data": [{"status": "ok"}] * cantidad})

    tickets = await _expo(httpx.MockTransport(responder)).send([PushMessage(TOKEN, "a", "b")] * 150)
    assert lotes == [100, 50] and len(tickets) == 150
