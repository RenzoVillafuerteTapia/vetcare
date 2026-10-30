from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from vetcare.contexts.customers.domain.client import Client, ContactEmail, IdentityDocument
from vetcare.contexts.customers.domain.pet import Pet
from vetcare.contexts.identity.public import AuthenticatedUser
from vetcare.shared_kernel.application import UnitOfWork


@dataclass(frozen=True)
class Page[T]:
    items: list[T]
    total: int
    page: int
    page_size: int


class ClientRepository(Protocol):
    async def get(self, client_id: UUID) -> Client | None: ...

    async def get_many(self, client_ids: set[UUID]) -> dict[UUID, Client]: ...

    async def get_by_user(self, user_id: UUID) -> Client | None: ...

    async def get_by_document(self, document: IdentityDocument) -> Client | None: ...

    async def get_by_email(self, email: ContactEmail) -> Client | None: ...

    async def search(self, text: str | None, page: int, page_size: int) -> Page[Client]: ...

    async def add(self, client: Client) -> None:
        """Lanza ConflictError si el documento o el correo ya están registrados."""
        ...

    async def save(self, client: Client) -> None: ...


class PetRepository(Protocol):
    async def get(self, pet_id: UUID, *, for_update: bool = False) -> Pet | None: ...

    async def of_client(self, client_id: UUID) -> list[Pet]:
        """Mascotas donde el cliente tiene una tutela activa."""
        ...

    async def add(self, pet: Pet) -> None: ...

    async def save(self, pet: Pet) -> None: ...


class CustomersUnitOfWork(UnitOfWork, Protocol):
    @property
    def clients(self) -> ClientRepository: ...

    @property
    def pets(self) -> PetRepository: ...


class AccountInviter(Protocol):
    """Crea la cuenta de cliente en Identity & Access y envía la invitación por correo."""

    async def invite_client(
        self, actor: AuthenticatedUser, email: ContactEmail, full_name: str
    ) -> UUID: ...
