from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from vetcare.contexts.identity.application.services import IdentityService, RequestContext
from vetcare.contexts.identity.domain.model import UserAccount
from vetcare.contexts.identity.domain.permissions import Permission
from vetcare.shared_kernel.errors import AuthenticationError, PermissionDeniedError

_bearer = HTTPBearer(auto_error=False, description="Access token obtenido en /auth/login.")


def identity_service(request: Request) -> IdentityService:
    service: IdentityService | None = getattr(request.app.state, "identity", None)
    if service is None:
        raise RuntimeError("La autenticación no está configurada (VETCARE_JWT_SECRET).")
    return service


def request_context(request: Request) -> RequestContext:
    return RequestContext(ip_address=request.client.host if request.client else None)


Identity = Annotated[IdentityService, Depends(identity_service)]
Context = Annotated[RequestContext, Depends(request_context)]


async def current_user(
    service: Identity,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UserAccount:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError("Debes iniciar sesión.")
    return await service.authenticate(credentials.credentials)


CurrentUser = Annotated[UserAccount, Depends(current_user)]


def require_permission(permission: Permission) -> Callable[..., Awaitable[UserAccount]]:
    """Dependencia que exige un permiso del rol. La relación con el recurso concreto (p. ej.
    la tutela de una mascota) la verifica después el caso de uso del contexto dueño del dato."""

    async def dependency(user: CurrentUser) -> UserAccount:
        if not user.has_permission(permission):
            raise PermissionDeniedError("No tienes permiso para realizar esta operación.")
        return user

    return dependency
