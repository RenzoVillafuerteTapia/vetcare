"""Ayudas para las pruebas de integración HTTP: app real, MySQL y usuarios de cada rol."""

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from vetcare.contexts.identity.application.services import IdentityService, RequestContext
from vetcare.contexts.identity.domain.model import Email
from vetcare.contexts.identity.domain.permissions import Role
from vetcare.contexts.identity.infrastructure.composition import build_identity_service
from vetcare.main import create_app
from vetcare.platform.settings import Environment, Settings

CLAVE = "un gato duerme en la ventana"
JWT_SECRET = "clave-de-firma-solo-para-pruebas-0123456789"


@dataclass
class Buzon:
    enviados: list[tuple[str, str]] = field(default_factory=list)

    async def send(self, to: Email, subject: str, body: str) -> None:
        self.enviados.append((to.value, body))

    def ultimo_token(self, para: str) -> str:
        body = next(b for to, b in reversed(self.enviados) if to == para)
        match = re.search(r"#token=([\w-]+)", body)
        assert match
        return match.group(1)


@dataclass
class Api:
    app: FastAPI
    client: AsyncClient
    buzon: Buzon

    @property
    def servicio(self) -> IdentityService:
        service: IdentityService = self.app.state.identity
        return service

    async def usuario(self, email: str, roles: frozenset[Role]) -> str:
        """Crea una cuenta activa y devuelve su access token."""
        if email == "admin@example.test":
            await self.servicio.invite_first_admin(email, "Admin Inicial")
        else:
            admin = await self.servicio.authenticate(await self.usuario_admin())
            await self.servicio.invite(admin, email, "Persona de Prueba", roles, RequestContext())
        await self.servicio.accept_invitation(
            self.buzon.ultimo_token(email), CLAVE, RequestContext()
        )
        return await self.login(email)

    async def usuario_admin(self) -> str:
        return await self.login("admin@example.test")

    async def login(self, email: str) -> str:
        r = await self.client.post(
            "/api/v1/auth/login", json={"email": email, "password": CLAVE, "client": "mobile"}
        )
        assert r.status_code == 200, r.text
        token: str = r.json()["access_token"]
        return token


def settings_para(url: str, *, rate_limits: bool = False) -> Settings:
    return Settings(
        environment=Environment.TEST,
        database_url=SecretStr(url),
        jwt_secret=SecretStr(JWT_SECRET),
        public_web_url="https://web.example.test",
        rate_limits_enabled=rate_limits,
    )


async def _api(url: str, rate_limits: bool = False) -> AsyncIterator[Api]:
    settings = settings_para(url, rate_limits=rate_limits)
    app = create_app(settings)
    buzon = Buzon()
    app.state.identity = build_identity_service(settings, app.state.session_factory, email=buzon)
    transport = ASGITransport(app=app, client=("198.51.100.7", 50000))
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        yield Api(app, client, buzon)
    await app.state.engine.dispose()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
