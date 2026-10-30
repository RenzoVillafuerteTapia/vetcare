"""Adaptadores entre contextos, en la raíz de composición.

Un contexto declara lo que necesita de otro como un puerto propio; aquí se conecta ese puerto
con el servicio del otro contexto, sin que ninguno de los dos importe los internos del otro.
"""

from collections.abc import Callable
from uuid import UUID

from vetcare.contexts.customers.domain.client import ContactEmail
from vetcare.contexts.identity.application.services import IdentityService, RequestContext
from vetcare.contexts.identity.public import AuthenticatedUser


class IdentityAccountInviter:
    """Customers & Pets → Identity & Access: invitar a un cliente a la app."""

    def __init__(self, identity: Callable[[], IdentityService | None]) -> None:
        self._identity = identity

    async def invite_client(
        self, actor: AuthenticatedUser, email: ContactEmail, full_name: str
    ) -> UUID:
        identity = self._identity()
        if identity is None:
            raise RuntimeError("La autenticación no está configurada (VETCARE_JWT_SECRET).")
        user = await identity.invite_client(actor, email.value, full_name, RequestContext())
        return user.id
