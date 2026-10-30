"""Casos de uso de Customers & Pets.

Acceso:
- Personal con ``pets:read``: ve todos los clientes y mascotas.
- Cliente: solo las mascotas donde tiene una tutela activa. Lo ajeno responde 404, para no
  revelar que existe.
- Escribir requiere ``clients:manage``, ``pets:manage`` o ``guardianships:manage`` según el caso.
"""

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from vetcare.contexts.customers.application.ports import (
    AccountInviter,
    CustomersUnitOfWork,
    Page,
)
from vetcare.contexts.customers.domain.client import (
    Client,
    ContactEmail,
    IdentityDocument,
    PhoneNumber,
)
from vetcare.contexts.customers.domain.pet import (
    BirthDate,
    GuardianKind,
    GuardianPermissions,
    Pet,
    PetAction,
    PetStatus,
    Sex,
    Species,
    WeightRecord,
)
from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import (
    ConflictError,
    FieldError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailedError,
)
from vetcare.shared_kernel.ids import new_id

PET_NOT_FOUND = "La mascota no existe."


@dataclass(frozen=True)
class ClientData:
    full_name: str
    document: IdentityDocument
    phone: PhoneNumber
    email: ContactEmail | None = None
    address: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class PetData:
    name: str
    species: Species
    sex: Sex
    breed: str | None = None
    birth_date: BirthDate | None = None
    color: str | None = None
    allergies: str | None = None
    notes: str | None = None


class Audience(StrEnum):
    STAFF = "staff"
    GUARDIAN = "guardian"


@dataclass(frozen=True)
class GuardianSummary:
    client_id: UUID
    full_name: str
    kind: GuardianKind
    permissions: GuardianPermissions


@dataclass(frozen=True)
class PetDetails:
    """Mascota con sus responsables, según quién la mira. El cliente no ve las notas internas
    y solo ve la información clínica (alergias) si su tutela lo permite."""

    pet: Pet
    guardians: list[GuardianSummary]
    audience: Audience
    can_view_clinical: bool


def _require(actor: AuthenticatedUser, permission: Permission) -> None:
    if not actor.has_permission(permission):
        raise PermissionDeniedError("No tienes permiso para realizar esta operación.")


class CustomersService:
    def __init__(
        self,
        *,
        uow_factory: Callable[[], CustomersUnitOfWork],
        inviter: AccountInviter,
        clock: Clock,
    ) -> None:
        self._uow_factory = uow_factory
        self._inviter = inviter
        self._clock = clock

    # --- Clientes ---------------------------------------------------------------------------

    async def register_client(self, actor: AuthenticatedUser, data: ClientData) -> Client:
        _require(actor, Permission.CLIENTS_MANAGE)
        client = Client(
            id=new_id(),
            full_name=data.full_name,
            document=data.document,
            phone=data.phone,
            email=data.email,
            address=data.address,
            notes=data.notes,
            created_at=self._clock.now(),
        )
        async with self._uow_factory() as uow:
            await self._ensure_unique(uow, client)
            await uow.clients.add(client)
            await uow.commit()
        return client

    async def update_client(
        self, actor: AuthenticatedUser, client_id: UUID, data: ClientData
    ) -> Client:
        _require(actor, Permission.CLIENTS_MANAGE)
        async with self._uow_factory() as uow:
            client = await self._get_client(uow, client_id)
            client.update_contact(
                full_name=data.full_name,
                document=data.document,
                phone=data.phone,
                email=data.email,
                address=data.address,
                notes=data.notes,
            )
            await self._ensure_unique(uow, client)
            await uow.clients.save(client)
            await uow.commit()
        return client

    async def get_client(self, actor: AuthenticatedUser, client_id: UUID) -> Client:
        _require(actor, Permission.PETS_READ)
        async with self._uow_factory() as uow:
            return await self._get_client(uow, client_id)

    async def search_clients(
        self, actor: AuthenticatedUser, text: str | None, page: int, page_size: int
    ) -> Page[Client]:
        _require(actor, Permission.PETS_READ)
        async with self._uow_factory() as uow:
            return await uow.clients.search(text.strip() if text else None, page, page_size)

    async def invite_client(self, actor: AuthenticatedUser, client_id: UUID) -> Client:
        """Crea la cuenta del cliente para la app y le envía la invitación por correo."""
        _require(actor, Permission.CLIENTS_MANAGE)
        async with self._uow_factory() as uow:
            client = await self._get_client(uow, client_id)
            if client.user_id is not None:
                raise ConflictError(
                    "El cliente ya tiene una cuenta.", code="account_already_linked"
                )
            if client.email is None:
                raise ValidationFailedError(
                    "Registra el correo del cliente para invitarlo a la app.",
                    [FieldError("email", "Registra el correo del cliente.")],
                )
            # La cuenta se crea en Identity (su propia transacción) y luego se vincula aquí. Si el
            # vínculo fallara, la cuenta quedaría invitada sin cliente; se resuelve reenviando.
            user_id = await self._inviter.invite_client(actor, client.email, client.full_name)
            client.link_account(user_id)
            await uow.clients.save(client)
            await uow.commit()
        return client

    # --- Mascotas ---------------------------------------------------------------------------

    async def register_pet(
        self, actor: AuthenticatedUser, owner_id: UUID, data: PetData
    ) -> PetDetails:
        _require(actor, Permission.PETS_MANAGE)
        async with self._uow_factory() as uow:
            await self._get_client(uow, owner_id)
            pet = Pet.register(
                id=new_id(),
                owner_id=owner_id,
                now=self._clock.now(),
                name=data.name,
                species=data.species,
                sex=data.sex,
                breed=data.breed,
                birth_date=data.birth_date,
                color=data.color,
                allergies=data.allergies,
                notes=data.notes,
            )
            await uow.pets.add(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, can_view_clinical=True)

    async def update_pet(self, actor: AuthenticatedUser, pet_id: UUID, data: PetData) -> PetDetails:
        _require(actor, Permission.PETS_MANAGE)
        async with self._uow_factory() as uow:
            pet = await self._get_pet(uow, pet_id)
            pet.update_profile(
                name=data.name,
                species=data.species,
                sex=data.sex,
                breed=data.breed,
                birth_date=data.birth_date,
                color=data.color,
                allergies=data.allergies,
                notes=data.notes,
                today=self._clock.now().date(),
            )
            await uow.pets.save(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, can_view_clinical=True)

    async def set_pet_status(
        self, actor: AuthenticatedUser, pet_id: UUID, status: PetStatus
    ) -> PetDetails:
        _require(actor, Permission.PETS_MANAGE)
        async with self._uow_factory() as uow:
            pet = await self._get_pet(uow, pet_id)
            pet.set_status(status)
            await uow.pets.save(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, can_view_clinical=True)

    async def record_weight(
        self, actor: AuthenticatedUser, pet_id: UUID, kilograms: Decimal
    ) -> PetDetails:
        _require(actor, Permission.PETS_MANAGE)
        async with self._uow_factory() as uow:
            pet = await self._get_pet(uow, pet_id)
            pet.record_weight(
                WeightRecord(
                    id=new_id(),
                    kilograms=kilograms,
                    measured_at=self._clock.now(),
                    recorded_by=actor.id,
                )
            )
            await uow.pets.save(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, can_view_clinical=True)

    async def get_pet(self, actor: AuthenticatedUser, pet_id: UUID) -> PetDetails:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get(pet_id)
            if pet is None:
                raise NotFoundError(PET_NOT_FOUND)
            if actor.has_permission(Permission.PETS_READ):
                return await self._details(uow, pet, Audience.STAFF, can_view_clinical=True)
            client = await self._own_client(uow, actor)
            if client is None or not pet.allows(client.id, PetAction.VIEW):
                raise NotFoundError(PET_NOT_FOUND)
            return await self._details(
                uow,
                pet,
                Audience.GUARDIAN,
                can_view_clinical=pet.allows(client.id, PetAction.VIEW_CLINICAL),
            )

    async def pets_of_client(self, actor: AuthenticatedUser, client_id: UUID) -> list[PetDetails]:
        _require(actor, Permission.PETS_READ)
        async with self._uow_factory() as uow:
            await self._get_client(uow, client_id)
            pets = await uow.pets.of_client(client_id)
            return [await self._details(uow, p, Audience.STAFF, True) for p in pets]

    async def my_pets(self, actor: AuthenticatedUser) -> list[PetDetails]:
        _require(actor, Permission.OWN_PETS_READ)
        async with self._uow_factory() as uow:
            client = await self._own_client(uow, actor)
            if client is None:
                return []
            pets = await uow.pets.of_client(client.id)
            return [
                await self._details(
                    uow, p, Audience.GUARDIAN, p.allows(client.id, PetAction.VIEW_CLINICAL)
                )
                for p in pets
            ]

    # --- Tutela -----------------------------------------------------------------------------

    async def add_guardian(
        self,
        actor: AuthenticatedUser,
        pet_id: UUID,
        client_id: UUID,
        kind: GuardianKind,
        permissions: GuardianPermissions,
    ) -> PetDetails:
        _require(actor, Permission.GUARDIANSHIPS_MANAGE)
        async with self._uow_factory() as uow:
            pet = await self._get_pet(uow, pet_id)
            await self._get_client(uow, client_id)
            pet.add_guardian(client_id, kind, permissions, self._clock.now())
            await uow.pets.save(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, True)

    async def update_guardian(
        self,
        actor: AuthenticatedUser,
        pet_id: UUID,
        client_id: UUID,
        kind: GuardianKind,
        permissions: GuardianPermissions,
    ) -> PetDetails:
        _require(actor, Permission.GUARDIANSHIPS_MANAGE)
        async with self._uow_factory() as uow:
            pet = await self._get_pet(uow, pet_id)
            pet.update_guardian(client_id, kind, permissions)
            await uow.pets.save(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, True)

    async def revoke_guardian(
        self, actor: AuthenticatedUser, pet_id: UUID, client_id: UUID
    ) -> PetDetails:
        _require(actor, Permission.GUARDIANSHIPS_MANAGE)
        async with self._uow_factory() as uow:
            pet = await self._get_pet(uow, pet_id)
            pet.revoke_guardian(client_id, self._clock.now())
            await uow.pets.save(pet)
            await uow.commit()
            return await self._details(uow, pet, Audience.STAFF, True)

    # --- Auxiliares -------------------------------------------------------------------------

    @staticmethod
    async def _ensure_unique(uow: CustomersUnitOfWork, client: Client) -> None:
        same_document = await uow.clients.get_by_document(client.document)
        if same_document is not None and same_document.id != client.id:
            raise ConflictError("Ya hay un cliente con ese documento.", code="document_taken")
        if client.email is not None:
            same_email = await uow.clients.get_by_email(client.email)
            if same_email is not None and same_email.id != client.id:
                raise ConflictError("Ya hay un cliente con ese correo.", code="email_taken")

    @staticmethod
    async def _get_client(uow: CustomersUnitOfWork, client_id: UUID) -> Client:
        client = await uow.clients.get(client_id)
        if client is None:
            raise NotFoundError("El cliente no existe.")
        return client

    @staticmethod
    async def _get_pet(uow: CustomersUnitOfWork, pet_id: UUID) -> Pet:
        # FOR UPDATE: la tutela tiene invariantes (al menos un dueño) que dos cambios simultáneos
        # podrían romper.
        pet = await uow.pets.get(pet_id, for_update=True)
        if pet is None:
            raise NotFoundError(PET_NOT_FOUND)
        return pet

    @staticmethod
    async def _own_client(uow: CustomersUnitOfWork, actor: AuthenticatedUser) -> Client | None:
        return await uow.clients.get_by_user(actor.id)

    @staticmethod
    async def _details(
        uow: CustomersUnitOfWork, pet: Pet, audience: Audience, can_view_clinical: bool
    ) -> PetDetails:
        active = pet.active_guardianships
        clients = await uow.clients.get_many({g.client_id for g in active})
        return PetDetails(
            pet=pet,
            guardians=[
                GuardianSummary(g.client_id, clients[g.client_id].full_name, g.kind, g.permissions)
                for g in active
                if g.client_id in clients
            ],
            audience=audience,
            can_view_clinical=can_view_clinical,
        )
