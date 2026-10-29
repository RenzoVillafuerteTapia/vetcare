from datetime import UTC, datetime
from typing import Protocol


class Clock(Protocol):
    """Fuente de la hora actual. Se inyecta para que el dominio sea determinista en pruebas."""

    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)
