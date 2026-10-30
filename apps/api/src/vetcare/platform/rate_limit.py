"""Límite de solicitudes por cliente para endpoints sensibles (login, recuperación de acceso).

Ventana fija en memoria del proceso: con varios workers el límite efectivo se multiplica por su
número. Es una primera barrera; la protección principal contra adivinar contraseñas es el bloqueo
de cuenta, que se guarda en la base de datos.
"""

import math
import time
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request


class FixedWindowRateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._windows: dict[str, tuple[float, int]] = {}

    def hit(self, key: str, limit: int, window_seconds: int) -> float | None:
        """Registra una solicitud. Devuelve los segundos de espera si se superó el límite."""
        now = self._clock()
        started, count = self._windows.get(key, (now, 0))
        if now - started >= window_seconds:
            started, count = now, 0
        count += 1
        self._windows[key] = (started, count)
        if len(self._windows) > 50_000:
            self._purge(now, window_seconds)
        if count > limit:
            return started + window_seconds - now
        return None

    def _purge(self, now: float, window_seconds: int) -> None:
        self._windows = {k: v for k, v in self._windows.items() if now - v[0] < window_seconds}


def rate_limit(scope: str, limit: int, window_seconds: int) -> Callable[[Request], Awaitable[None]]:
    """Dependencia de FastAPI que limita por IP de origen y por ``scope``."""

    async def dependency(request: Request) -> None:
        if not request.app.state.settings.rate_limits_enabled:
            return
        limiter: FixedWindowRateLimiter = request.app.state.rate_limiter
        client = request.client.host if request.client else "desconocido"
        wait = limiter.hit(f"{scope}:{client}", limit, window_seconds)
        if wait is not None:
            raise HTTPException(
                status_code=429, headers={"Retry-After": str(max(1, math.ceil(wait)))}
            )

    return dependency
