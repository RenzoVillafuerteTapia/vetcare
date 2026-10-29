from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.identity.application.ports import EmailSender
from vetcare.contexts.identity.application.services import EmailLinks, IdentityService
from vetcare.contexts.identity.infrastructure.adapters import (
    Argon2PasswordHasher,
    ConsoleEmailSender,
    JwtAccessTokenService,
    SqlIdentityUnitOfWork,
)
from vetcare.platform.settings import Environment, Settings
from vetcare.shared_kernel.clock import SystemClock


def build_identity_service(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    email: EmailSender | None = None,
) -> IdentityService:
    if settings.jwt_secret is None:
        raise RuntimeError("Define VETCARE_JWT_SECRET para habilitar la autenticación.")
    if settings.environment is Environment.PRODUCTION and email is None:
        # Todavía no hay un proveedor de correo real (decisión pendiente, ver docs/roadmap.md).
        raise RuntimeError("Configura un proveedor de correo antes de usar producción.")
    clock = SystemClock()
    return IdentityService(
        uow_factory=lambda: SqlIdentityUnitOfWork(session_factory, clock),
        hasher=Argon2PasswordHasher(),
        access_tokens=JwtAccessTokenService(
            settings.jwt_secret.get_secret_value(),
            timedelta(minutes=settings.access_token_minutes),
        ),
        email=email or ConsoleEmailSender(),
        links=EmailLinks(settings.public_web_url.rstrip("/")),
        clock=clock,
    )
