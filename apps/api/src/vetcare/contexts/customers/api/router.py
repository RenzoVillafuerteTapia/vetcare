from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status

from vetcare.contexts.customers.api.schemas import (
    ClientPage,
    ClientRequest,
    ClientResponse,
    GuardianRequest,
    PetRequest,
    PetResponse,
    PetStatusRequest,
    UpdateGuardianRequest,
    WeightRequest,
)
from vetcare.contexts.customers.application.services import CustomersService
from vetcare.contexts.identity.public.http import CurrentUser
from vetcare.platform.errors import problem_responses

clients_router = APIRouter(prefix="/clients", tags=["Clientes"])
pets_router = APIRouter(prefix="/pets", tags=["Mascotas"])
me_router = APIRouter(prefix="/me", tags=["Mi cuenta"])


def customers(request: Request) -> CustomersService:
    service: CustomersService = request.app.state.customers
    return service


Customers = Annotated[CustomersService, Depends(customers)]

_READ = problem_responses({401: "No autenticado", 403: "Sin acceso", 404: "No existe"})
_WRITE = problem_responses(
    {
        401: "No autenticado",
        403: "Sin permiso",
        404: "No existe",
        409: "Conflicto (duplicado, último dueño o modificación concurrente)",
        422: "Datos inválidos",
    }
)


# --- Clientes -------------------------------------------------------------------------------


@clients_router.get("", summary="Buscar clientes", responses=_READ)
async def search_clients(
    user: CurrentUser,
    service: Customers,
    q: Annotated[
        str | None,
        Query(max_length=100, description="Nombre, documento, correo o teléfono."),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ClientPage:
    result = await service.search_clients(user, q, page, page_size)
    return ClientPage(
        items=[ClientResponse.of(c) for c in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
    )


@clients_router.post(
    "", status_code=status.HTTP_201_CREATED, summary="Registrar un cliente", responses=_WRITE
)
async def register_client(
    body: ClientRequest, user: CurrentUser, service: Customers
) -> ClientResponse:
    return ClientResponse.of(await service.register_client(user, body.to_data()))


@clients_router.get("/{client_id}", summary="Ficha de un cliente", responses=_READ)
async def get_client(client_id: UUID, user: CurrentUser, service: Customers) -> ClientResponse:
    return ClientResponse.of(await service.get_client(user, client_id))


@clients_router.put("/{client_id}", summary="Actualizar un cliente", responses=_WRITE)
async def update_client(
    client_id: UUID, body: ClientRequest, user: CurrentUser, service: Customers
) -> ClientResponse:
    return ClientResponse.of(await service.update_client(user, client_id, body.to_data()))


@clients_router.post(
    "/{client_id}/invitation",
    summary="Invitar al cliente a la app",
    description="Crea su cuenta con el rol cliente y le envía el enlace de activación al correo.",
    responses=_WRITE,
)
async def invite_client(client_id: UUID, user: CurrentUser, service: Customers) -> ClientResponse:
    return ClientResponse.of(await service.invite_client(user, client_id))


@clients_router.get("/{client_id}/pets", summary="Mascotas de un cliente", responses=_READ)
async def pets_of_client(
    client_id: UUID, user: CurrentUser, service: Customers
) -> list[PetResponse]:
    return [PetResponse.of(d) for d in await service.pets_of_client(user, client_id)]


@clients_router.post(
    "/{client_id}/pets",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una mascota con este cliente como dueño",
    responses=_WRITE,
)
async def register_pet(
    client_id: UUID, body: PetRequest, user: CurrentUser, service: Customers
) -> PetResponse:
    return PetResponse.of(await service.register_pet(user, client_id, body.to_data()))


# --- Mascotas -------------------------------------------------------------------------------


@pets_router.get(
    "/{pet_id}",
    summary="Perfil de una mascota",
    description="El personal ve todo. Un cliente solo ve sus mascotas (las demás responden 404), "
    "sin notas internas, y las alergias solo si su tutela lo permite.",
    responses=_READ,
)
async def get_pet(pet_id: UUID, user: CurrentUser, service: Customers) -> PetResponse:
    return PetResponse.of(await service.get_pet(user, pet_id))


@pets_router.put("/{pet_id}", summary="Actualizar el perfil de una mascota", responses=_WRITE)
async def update_pet(
    pet_id: UUID, body: PetRequest, user: CurrentUser, service: Customers
) -> PetResponse:
    return PetResponse.of(await service.update_pet(user, pet_id, body.to_data()))


@pets_router.patch("/{pet_id}/status", summary="Cambiar el estado de una mascota", responses=_WRITE)
async def set_pet_status(
    pet_id: UUID, body: PetStatusRequest, user: CurrentUser, service: Customers
) -> PetResponse:
    return PetResponse.of(await service.set_pet_status(user, pet_id, body.status))


@pets_router.post(
    "/{pet_id}/weights",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un peso",
    responses=_WRITE,
)
async def record_weight(
    pet_id: UUID, body: WeightRequest, user: CurrentUser, service: Customers
) -> PetResponse:
    return PetResponse.of(await service.record_weight(user, pet_id, body.kilograms))


@pets_router.post(
    "/{pet_id}/guardians",
    status_code=status.HTTP_201_CREATED,
    summary="Agregar un dueño o responsable autorizado",
    responses=_WRITE,
)
async def add_guardian(
    pet_id: UUID, body: GuardianRequest, user: CurrentUser, service: Customers
) -> PetResponse:
    details = await service.add_guardian(
        user, pet_id, body.client_id, body.kind, body.permissions.to_domain()
    )
    return PetResponse.of(details)


@pets_router.put(
    "/{pet_id}/guardians/{client_id}",
    summary="Cambiar el tipo o los permisos de un responsable",
    responses=_WRITE,
)
async def update_guardian(
    pet_id: UUID,
    client_id: UUID,
    body: UpdateGuardianRequest,
    user: CurrentUser,
    service: Customers,
) -> PetResponse:
    details = await service.update_guardian(
        user, pet_id, client_id, body.kind, body.permissions.to_domain()
    )
    return PetResponse.of(details)


@pets_router.delete(
    "/{pet_id}/guardians/{client_id}",
    summary="Revocar a un responsable (queda en el historial)",
    responses=_WRITE,
)
async def revoke_guardian(
    pet_id: UUID, client_id: UUID, user: CurrentUser, service: Customers
) -> PetResponse:
    return PetResponse.of(await service.revoke_guardian(user, pet_id, client_id))


# --- Cliente autenticado --------------------------------------------------------------------


@me_router.get(
    "/pets",
    summary="Mis mascotas",
    description="Mascotas donde el cliente autenticado es dueño o responsable autorizado.",
    responses=_READ,
)
async def my_pets(user: CurrentUser, service: Customers) -> list[PetResponse]:
    return [PetResponse.of(d) for d in await service.my_pets(user)]
