"""Implementaciones en memoria de los puertos de Identity & Access para probar los casos de uso."""

import copy
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID

from vetcare.contexts.identity.application.ports import AccessToken
from vetcare.contexts.identity.application.services import EmailLinks, IdentityService
from vetcare.contexts.identity.domain.audit import AuditEntry
from vetcare.contexts.identity.domain.model import Email, UserAccount
from vetcare.contexts.identity.domain.tokens import (
    OneTimeToken,
    RefreshTokenFamily,
    RevocationReason,
    TokenPurpose,
)
from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.errors import AuthenticationError


class Reloj:
    def __init__(self) -> None:
        self.actual = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.actual

    def avanzar(self, **delta: float) -> None:
        self.actual += timedelta(**delta)


@dataclass
class Almacen:
    """Estado "persistido". Las unidades de trabajo trabajan sobre copias y lo reemplazan al
    confirmar, igual que una transacción."""

    users: dict[UUID, UserAccount] = field(default_factory=dict)
    tokens: dict[str, OneTimeToken] = field(default_factory=dict)
    families: dict[UUID, RefreshTokenFamily] = field(default_factory=dict)
    retired: dict[str, UUID] = field(default_factory=dict)
    audit: list[AuditEntry] = field(default_factory=list)
    events: list[DomainEvent] = field(default_factory=list)


class Usuarios:
    def __init__(self, data: Almacen) -> None:
        self.data = data

    async def get(self, user_id: UUID) -> UserAccount | None:
        return self.data.users.get(user_id)

    async def get_by_email(self, email: Email) -> UserAccount | None:
        return next((u for u in self.data.users.values() if u.email == email), None)

    async def exists_any(self) -> bool:
        return bool(self.data.users)

    async def add(self, user: UserAccount) -> None:
        self.data.users[user.id] = user

    async def save(self, user: UserAccount) -> None:
        self.data.users[user.id] = user


class Tokens:
    def __init__(self, data: Almacen) -> None:
        self.data = data

    async def get_by_hash(self, token_hash: str) -> OneTimeToken | None:
        return self.data.tokens.get(token_hash)

    async def add(self, token: OneTimeToken) -> None:
        self.data.tokens[token.token_hash] = token

    async def save(self, token: OneTimeToken) -> None:
        self.data.tokens[token.token_hash] = token

    async def invalidate_pending(self, user_id: UUID, purpose: TokenPurpose, now: datetime) -> None:
        for t in self.data.tokens.values():
            if t.user_id == user_id and t.purpose is purpose:
                t.invalidate(now)


class Refresh:
    def __init__(self, data: Almacen) -> None:
        self.data = data

    async def get_by_current_hash(self, token_hash: str) -> RefreshTokenFamily | None:
        return next(
            (f for f in self.data.families.values() if f.current_token_hash == token_hash), None
        )

    async def get_by_retired_hash(self, token_hash: str) -> RefreshTokenFamily | None:
        family_id = self.data.retired.get(token_hash)
        return self.data.families.get(family_id) if family_id else None

    async def add(self, family: RefreshTokenFamily) -> None:
        self.data.families[family.id] = family

    async def save(self, family: RefreshTokenFamily, retired_hash: str | None = None) -> None:
        self.data.families[family.id] = family
        if retired_hash:
            self.data.retired[retired_hash] = family.id

    async def revoke_all_for_user(
        self, user_id: UUID, reason: RevocationReason, now: datetime
    ) -> None:
        for f in self.data.families.values():
            if f.user_id == user_id:
                f.revoke(reason, now)


class Auditoria:
    def __init__(self, data: Almacen) -> None:
        self.data = data

    async def record(self, entry: AuditEntry) -> None:
        self.data.audit.append(entry)


class UnidadDeTrabajo:
    def __init__(self, almacen: Almacen) -> None:
        self.almacen = almacen

    async def __aenter__(self) -> Self:
        self.copia = copy.deepcopy(self.almacen)
        self.users = Usuarios(self.copia)
        self.tokens = Tokens(self.copia)
        self.refresh_tokens = Refresh(self.copia)
        self.audit = Auditoria(self.copia)
        self.tracked: list[AggregateRoot] = []
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    def track(self, aggregate: AggregateRoot) -> None:
        self.tracked.append(aggregate)

    async def commit(self) -> None:
        for aggregate in self.tracked:
            self.copia.events.extend(aggregate.pull_events())
        self.almacen.__dict__.update(copy.deepcopy(self.copia).__dict__)


class Hasher:
    def hash(self, password: str) -> str:
        return f"v2:{password}"

    def verify(self, password_hash: str, password: str) -> bool:
        return password_hash.split(":", 1)[1] == password

    def needs_rehash(self, password_hash: str) -> bool:
        return not password_hash.startswith("v2:")

    def verify_dummy(self, password: str) -> None:
        return None


class AccessTokens:
    def issue(self, user: UserAccount, now: datetime) -> AccessToken:
        return AccessToken(f"access:{user.id}", 900)

    def user_id_from(self, token: str, now: datetime) -> UUID:
        if not token.startswith("access:"):
            raise AuthenticationError("Token inválido.")
        return UUID(token.removeprefix("access:"))


@dataclass
class Correo:
    to: Email
    subject: str
    body: str

    @property
    def token(self) -> str:
        match = re.search(r"#token=([\w-]+)", self.body)
        assert match, self.body
        return match.group(1)


class Buzon:
    def __init__(self) -> None:
        self.enviados: list[Correo] = []
        self.fallar = False

    async def send(self, to: Email, subject: str, body: str) -> None:
        if self.fallar:
            raise ConnectionError("SMTP caído")
        self.enviados.append(Correo(to, subject, body))


@dataclass
class Entorno:
    almacen: Almacen
    reloj: Reloj
    buzon: Buzon
    servicio: IdentityService


def crear_entorno() -> Entorno:
    almacen, reloj, buzon = Almacen(), Reloj(), Buzon()
    servicio = IdentityService(
        uow_factory=lambda: UnidadDeTrabajo(almacen),
        hasher=Hasher(),
        access_tokens=AccessTokens(),
        email=buzon,
        links=EmailLinks("https://web.example.test"),
        clock=reloj,
    )
    return Entorno(almacen, reloj, buzon, servicio)
