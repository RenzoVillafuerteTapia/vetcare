"""Consultas que Customers & Pets ofrece a otros contextos (p. ej. Scheduling, Service Operations).

Son la fuente única de la pregunta "¿esta persona tiene relación con esta mascota y qué puede
hacer?". Ningún otro contexto replica la regla de tutela.
"""

from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

from vetcare.contexts.customers.application.ports import CustomersUnitOfWork
from vetcare.contexts.customers.domain.pet import PetAction, PetStatus, Species


@dataclass(frozen=True)
class PetSummary:
    id: UUID
    name: str
    species: Species
    status: PetStatus
    guardian_ids: frozenset[UUID]


class PetAccess:
    def __init__(self, uow_factory: Callable[[], CustomersUnitOfWork]) -> None:
        self._uow_factory = uow_factory

    async def client_id_of(self, user_id: UUID) -> UUID | None:
        """Cliente vinculado a una cuenta, si existe."""
        async with self._uow_factory() as uow:
            client = await uow.clients.get_by_user(user_id)
        return client.id if client else None

    async def allows(self, client_id: UUID, pet_id: UUID, action: PetAction) -> bool:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get(pet_id)
        return pet is not None and pet.allows(client_id, action)

    async def pet(self, pet_id: UUID) -> PetSummary | None:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get(pet_id)
        if pet is None:
            return None
        return PetSummary(
            id=pet.id,
            name=pet.name,
            species=pet.species,
            status=pet.status,
            guardian_ids=frozenset(g.client_id for g in pet.active_guardianships),
        )

    async def client_exists(self, client_id: UUID) -> bool:
        async with self._uow_factory() as uow:
            return await uow.clients.get(client_id) is not None
