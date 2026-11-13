"""Texto de los avisos push.

Regla de ADR 0004: el aviso nunca lleva información clínica (ni el servicio ni el motivo); solo
el nombre de la mascota y la fecha. El detalle se ve dentro de la app, con sesión iniciada.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

APPOINTMENT_CONFIRMED = "scheduling.appointment_confirmed"
APPOINTMENT_RESCHEDULED = "scheduling.appointment_rescheduled"
APPOINTMENT_CANCELLED = "scheduling.appointment_cancelled"

_WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


@dataclass(frozen=True)
class PushContent:
    title: str
    body: str
    # Datos para la app: a dónde llevar al tocar el aviso. Sin datos personales.
    data: Mapping[str, str] = field(default_factory=dict)


def spoken_date(local: datetime) -> str:
    """'jueves 12 de noviembre a las 15:00' (la hora ya en la zona de la sede)."""
    return (
        f"{_WEEKDAYS[local.weekday()]} {local.day} de {_MONTHS[local.month - 1]} "
        f"a las {local:%H:%M}"
    )


def appointment_push(
    event_type: str, appointment_id: str, payload: Mapping[str, Any], local_start: datetime
) -> PushContent | None:
    """Aviso para el dueño, o ``None`` si este cambio no lo amerita (lo hizo él mismo)."""
    pet = str(payload.get("pet_name") or "tu mascota")
    when = spoken_date(local_start)
    data = {"url": f"/citas/{appointment_id}", "appointment_id": appointment_id}
    if event_type == APPOINTMENT_CONFIRMED:
        return PushContent("Cita confirmada", f"La cita de {pet} es el {when}.", data)
    if event_type == APPOINTMENT_RESCHEDULED and not payload.get("by_client", False):
        return PushContent(
            "Tu cita cambió de horario", f"La cita de {pet} ahora es el {when}.", data
        )
    if event_type == APPOINTMENT_CANCELLED and not payload.get("by_client", False):
        return PushContent(
            "Cita cancelada",
            f"La veterinaria canceló la cita de {pet} del {when}. Abre la app para ver el detalle.",
            data,
        )
    return None
