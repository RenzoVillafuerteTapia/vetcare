"""Adaptadores técnicos de los puertos de Identity & Access."""

import logging
from datetime import datetime, timedelta
from uuid import UUID

import jwt
from argon2 import PasswordHasher as Argon2
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.identity.application.ports import AccessToken
from vetcare.contexts.identity.domain.model import Email, UserAccount
from vetcare.contexts.identity.infrastructure.repositories import (
    SqlAuditLog,
    SqlOneTimeTokenRepository,
    SqlRefreshTokenRepository,
    SqlUserRepository,
)
from vetcare.platform.unit_of_work import SqlAlchemyUnitOfWork
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import AuthenticationError
from vetcare.shared_kernel.ids import new_id

logger = logging.getLogger(__name__)


class SqlIdentityUnitOfWork(SqlAlchemyUnitOfWork):
    users: SqlUserRepository
    tokens: SqlOneTimeTokenRepository
    refresh_tokens: SqlRefreshTokenRepository
    audit: SqlAuditLog

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], clock: Clock) -> None:
        super().__init__(session_factory, clock)

    async def __aenter__(self) -> "SqlIdentityUnitOfWork":
        await super().__aenter__()
        self.users = SqlUserRepository(self.session)
        self.tokens = SqlOneTimeTokenRepository(self.session)
        self.refresh_tokens = SqlRefreshTokenRepository(self.session)
        self.audit = SqlAuditLog(self.session)
        return self


class Argon2PasswordHasher:
    """argon2id con los parámetros recomendados por argon2-cffi (RFC 9106, perfil de bajo uso
    de memoria)."""

    def __init__(self) -> None:
        self._argon2 = Argon2()
        self._dummy_hash = self._argon2.hash("contraseña ficticia para igualar tiempos")

    def hash(self, password: str) -> str:
        return self._argon2.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._argon2.verify(password_hash, password)
        except VerifyMismatchError:
            return False
        except (VerificationError, InvalidHashError):
            logger.warning("Hash de contraseña inválido en la base de datos")
            return False

    def needs_rehash(self, password_hash: str) -> bool:
        return self._argon2.check_needs_rehash(password_hash)

    def verify_dummy(self, password: str) -> None:
        self.verify(self._dummy_hash, password)


class JwtAccessTokenService:
    ISSUER = "vetcare-api"
    ALGORITHM = "HS256"

    def __init__(self, secret: str, lifetime: timedelta) -> None:
        if len(secret) < 32:
            raise ValueError("VETCARE_JWT_SECRET debe tener al menos 32 caracteres.")
        self._secret = secret
        self._lifetime = lifetime

    def issue(self, user: UserAccount, now: datetime) -> AccessToken:
        claims = {
            "iss": self.ISSUER,
            "sub": str(user.id),
            "typ": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + self._lifetime).timestamp()),
            "jti": str(new_id()),
        }
        token = jwt.encode(claims, self._secret, algorithm=self.ALGORITHM)
        return AccessToken(token, int(self._lifetime.total_seconds()))

    def user_id_from(self, token: str, now: datetime) -> UUID:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[self.ALGORITHM],
                issuer=self.ISSUER,
                options={"require": ["exp", "iat", "sub", "iss"], "verify_exp": False},
            )
            if claims.get("typ") != "access" or claims["exp"] <= now.timestamp():
                raise jwt.InvalidTokenError
            return UUID(claims["sub"])
        except (jwt.InvalidTokenError, ValueError):
            raise AuthenticationError("Tu sesión no es válida. Inicia sesión de nuevo.") from None


class ConsoleEmailSender:
    """Solo para desarrollo: escribe el correo en el registro de la API en lugar de enviarlo."""

    async def send(self, to: Email, subject: str, body: str) -> None:
        logger.warning(
            "Correo de desarrollo (no enviado)\nPara: %s\nAsunto: %s\n\n%s", to, subject, body
        )
