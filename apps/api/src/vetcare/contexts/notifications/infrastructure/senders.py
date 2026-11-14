"""Emisores de avisos push: Expo (staging y producción) y consola (desarrollo y pruebas)."""

import logging
from collections.abc import Sequence
from typing import Any

import httpx

from vetcare.contexts.notifications.application.ports import PushMessage, PushTicket
from vetcare.shared_kernel.events import RetryLaterError

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
# Límite de Expo por petición.
_EXPO_BATCH = 100


class ConsolePushSender:
    """No envía nada: escribe el aviso en el registro. Sirve mientras no hay cuenta de Expo."""

    def __init__(self) -> None:
        self.sent: list[PushMessage] = []

    async def send(self, messages: Sequence[PushMessage]) -> list[PushTicket]:
        for message in messages:
            self.sent.append(message)
            logger.info("Aviso push (consola): %s | %s", message.title, message.body)
        return [PushTicket(m.to, ok=True) for m in messages]


class ExpoPushSender:
    """Servicio push de Expo, que entrega por FCM (Android) y APNs (iOS).

    Referencia: https://docs.expo.dev/push-notifications/sending-notifications/
    """

    def __init__(
        self,
        access_token: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if access_token:
            self._headers["Authorization"] = f"Bearer {access_token}"
        self._transport = transport
        self._timeout = timeout

    async def send(self, messages: Sequence[PushMessage]) -> list[PushTicket]:
        tickets: list[PushTicket] = []
        async with httpx.AsyncClient(transport=self._transport, timeout=self._timeout) as client:
            for start in range(0, len(messages), _EXPO_BATCH):
                tickets += await self._send_batch(client, messages[start : start + _EXPO_BATCH])
        return tickets

    async def _send_batch(
        self, client: httpx.AsyncClient, batch: Sequence[PushMessage]
    ) -> list[PushTicket]:
        body = [
            {
                "to": m.to,
                "title": m.title,
                "body": m.body,
                "data": m.data,
                "sound": "default",
                "priority": "high",
                "channelId": "default",
            }
            for m in batch
        ]
        try:
            response = await client.post(EXPO_PUSH_URL, json=body, headers=self._headers)
        except httpx.HTTPError as error:
            raise RetryLaterError(f"Expo no respondió ({type(error).__name__})") from error
        if response.status_code == 429 or response.status_code >= 500:
            raise RetryLaterError(f"Expo respondió {response.status_code}")
        if response.status_code >= 400:
            # Petición mal formada o token de acceso inválido: reintentar no lo arregla, pero el
            # worker igual reintenta hasta el máximo y lo deja en 'failed' para revisión.
            raise RuntimeError(f"Expo rechazó la petición ({response.status_code})")
        data: list[dict[str, Any]] = response.json().get("data", [])
        return [_ticket(m.to, t) for m, t in zip(batch, data, strict=False)]


def _ticket(token: str, raw: dict[str, Any]) -> PushTicket:
    if raw.get("status") == "ok":
        return PushTicket(token, ok=True)
    detail = (raw.get("details") or {}).get("error")
    return PushTicket(
        token,
        ok=False,
        unregistered=detail == "DeviceNotRegistered",
        error=str(detail or raw.get("message") or "error")[:200],
    )
