from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from vetcare.contexts.identity.domain.model import UserAccount, UserStatus
from vetcare.contexts.identity.domain.permissions import Permission, Role

ClientKind = Literal["web", "mobile"]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class LoginRequest(_Request):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    client: ClientKind = Field(
        description="`web` recibe el refresh token en una cookie HttpOnly; `mobile`, en el cuerpo."
    )


class RefreshRequest(_Request):
    client: ClientKind
    refresh_token: str | None = Field(
        default=None, max_length=200, description="Obligatorio para `mobile`."
    )


class LogoutRequest(_Request):
    refresh_token: str | None = Field(default=None, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_in: int = Field(description="Segundos de validez del access token.")
    refresh_token: str | None = Field(
        default=None, description="Solo para `mobile`. Guárdalo en almacenamiento seguro."
    )


class InviteUserRequest(_Request):
    email: str = Field(min_length=3, max_length=254)
    full_name: str = Field(min_length=2, max_length=150)
    roles: list[Role] = Field(min_length=1, max_length=5)


class AcceptInvitationRequest(_Request):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=128)


class PasswordResetRequest(_Request):
    email: str = Field(min_length=3, max_length=254)


class PasswordResetConfirmRequest(_Request):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    roles: list[Role]
    status: UserStatus

    @classmethod
    def from_domain(cls, user: UserAccount) -> "UserResponse":
        return cls(
            id=user.id,
            email=user.email.value,
            full_name=user.full_name,
            roles=sorted(user.roles),
            status=user.status,
        )


class CurrentUserResponse(UserResponse):
    permissions: list[Permission]

    @classmethod
    def from_domain(cls, user: UserAccount) -> "CurrentUserResponse":
        base = UserResponse.from_domain(user)
        return cls(**base.model_dump(), permissions=sorted(user.permissions))
