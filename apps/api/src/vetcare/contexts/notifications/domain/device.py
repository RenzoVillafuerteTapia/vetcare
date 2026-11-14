"""Dispositivos donde un usuario recibe avisos push (Expo Notifications, ADR 0004)."""

import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from vetcare.shared_kernel.errors import FieldError, ValidationFailedError

# Formato de los tokens de Expo: ExponentPushToken[...] o ExpoPushToken[...].
_EXPO_TOKEN = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,180}\]$")

# Un usuario rara vez tiene más de unos pocos teléfonos; los más antiguos se descartan.
MAX_DEVICES_PER_USER = 5


class DevicePlatform(StrEnum):
    ANDROID = "android"
    IOS = "ios"


@dataclass(frozen=True)
class PushToken:
    value: str

    def __post_init__(self) -> None:
        if not _EXPO_TOKEN.match(self.value):
            message = "El token de notificaciones no es válido."
            raise ValidationFailedError(message, [FieldError("token", message)])


@dataclass
class Device:
    """Un teléfono con la app instalada. El token identifica al teléfono, no a la persona: si
    otra persona inicia sesión en él, el token pasa a esa cuenta."""

    token: PushToken
    user_id: UUID
    platform: DevicePlatform
    registered_at: datetime
    last_seen_at: datetime
