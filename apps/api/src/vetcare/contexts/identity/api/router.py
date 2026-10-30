from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status

from vetcare.contexts.identity.api.dependencies import (
    Context,
    CurrentUser,
    Identity,
    require_permission,
)
from vetcare.contexts.identity.api.schemas import (
    AcceptInvitationRequest,
    CurrentUserResponse,
    InviteUserRequest,
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)
from vetcare.contexts.identity.application.services import SessionTokens
from vetcare.contexts.identity.domain.model import UserAccount
from vetcare.contexts.identity.domain.permissions import Permission
from vetcare.contexts.identity.domain.tokens import REFRESH_LIFETIME
from vetcare.platform.errors import problem_responses
from vetcare.platform.rate_limit import rate_limit
from vetcare.shared_kernel.errors import AuthenticationError

REFRESH_COOKIE = "vetcare_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"

auth = APIRouter(prefix="/auth", tags=["Autenticación"])
users = APIRouter(prefix="/users", tags=["Usuarios"])

_UNAUTHENTICATED = "No autenticado o credenciales inválidas"
_INVALID = "Datos inválidos"
_TOO_MANY = "Demasiadas solicitudes; reintenta después de Retry-After"
_BAD_LINK = "Enlace inválido, vencido o ya usado"
_ERRORS = problem_responses({401: _UNAUTHENTICATED, 422: _INVALID, 429: _TOO_MANY})


def _respond_tokens(
    tokens: SessionTokens, client: str, request: Request, response: Response
) -> TokenResponse:
    if client == "web":
        response.set_cookie(
            REFRESH_COOKIE,
            tokens.refresh_token,
            max_age=int(REFRESH_LIFETIME.total_seconds()),
            path=REFRESH_COOKIE_PATH,
            httponly=True,
            secure=request.app.state.settings.secure_cookies,
            samesite="strict",
        )
        refresh = None
    else:
        refresh = tokens.refresh_token
    response.headers["Cache-Control"] = "no-store"
    return TokenResponse(
        access_token=tokens.access.token,
        expires_in=tokens.access.expires_in_seconds,
        refresh_token=refresh,
    )


@auth.post(
    "/login",
    summary="Iniciar sesión con correo y contraseña",
    responses=_ERRORS,
    dependencies=[Depends(rate_limit("login", limit=10, window_seconds=60))],
)
async def login(
    body: LoginRequest, service: Identity, ctx: Context, request: Request, response: Response
) -> TokenResponse:
    tokens = await service.login(body.email, body.password, ctx)
    return _respond_tokens(tokens, body.client, request, response)


@auth.post(
    "/refresh",
    summary="Renovar el access token rotando el refresh token",
    responses=_ERRORS,
    dependencies=[Depends(rate_limit("refresh", limit=30, window_seconds=60))],
)
async def refresh(
    body: RefreshRequest, service: Identity, ctx: Context, request: Request, response: Response
) -> TokenResponse:
    presented = request.cookies.get(REFRESH_COOKIE) if body.client == "web" else body.refresh_token
    if not presented:
        raise AuthenticationError("Tu sesión venció. Inicia sesión de nuevo.")
    tokens = await service.refresh(presented, ctx)
    return _respond_tokens(tokens, body.client, request, response)


@auth.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cerrar la sesión actual",
)
async def logout(
    body: LogoutRequest, service: Identity, ctx: Context, request: Request, response: Response
) -> None:
    presented = body.refresh_token or request.cookies.get(REFRESH_COOKIE)
    if presented:
        await service.logout(presented, ctx)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


@auth.get(
    "/me",
    summary="Usuario autenticado y sus permisos",
    responses=problem_responses({401: _UNAUTHENTICATED}),
)
async def me(user: CurrentUser) -> CurrentUserResponse:
    return CurrentUserResponse.from_domain(user)


@auth.post(
    "/invitations/accept",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Activar una cuenta invitada eligiendo la contraseña",
    responses=problem_responses({409: _BAD_LINK, 422: _INVALID, 429: _TOO_MANY}),
    dependencies=[Depends(rate_limit("accept_invitation", limit=10, window_seconds=60))],
)
async def accept_invitation(body: AcceptInvitationRequest, service: Identity, ctx: Context) -> None:
    await service.accept_invitation(body.token, body.password, ctx)


@auth.post(
    "/password-reset",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    summary="Solicitar un enlace para restablecer la contraseña",
    description="La respuesta es la misma exista o no la cuenta.",
    responses=problem_responses({422: _INVALID, 429: _TOO_MANY}),
    dependencies=[Depends(rate_limit("password_reset", limit=5, window_seconds=300))],
)
async def request_password_reset(
    body: PasswordResetRequest, service: Identity, ctx: Context
) -> None:
    await service.request_password_reset(body.email, ctx)


@auth.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Elegir una nueva contraseña con el enlace recibido",
    responses=problem_responses({409: _BAD_LINK, 422: _INVALID, 429: _TOO_MANY}),
    dependencies=[Depends(rate_limit("password_reset_confirm", limit=10, window_seconds=60))],
)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest, service: Identity, ctx: Context
) -> None:
    await service.reset_password(body.token, body.password, ctx)


ManageUsers = Annotated[UserAccount, Depends(require_permission(Permission.USERS_MANAGE))]


@users.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Invitar a un empleado o cliente por correo",
    responses=problem_responses(
        {
            401: _UNAUTHENTICATED,
            403: "Requiere users:manage",
            409: "Ya existe una cuenta con ese correo",
            422: _INVALID,
        }
    ),
)
async def invite_user(
    body: InviteUserRequest, actor: ManageUsers, service: Identity, ctx: Context
) -> UserResponse:
    user = await service.invite(actor, body.email, body.full_name, frozenset(body.roles), ctx)
    return UserResponse.from_domain(user)


@users.post(
    "/{user_id}/invitation",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    summary="Reenviar la invitación (invalida el enlace anterior)",
    responses=problem_responses(
        {401: _UNAUTHENTICATED, 403: "Requiere users:manage", 404: "La cuenta no existe"}
    ),
)
async def resend_invitation(
    user_id: UUID, actor: ManageUsers, service: Identity, ctx: Context
) -> None:
    await service.resend_invitation(actor, user_id, ctx)
