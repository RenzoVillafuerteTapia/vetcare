import copy
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from types import TracebackType
from typing import Self
from uuid import UUID

import pytest

from vetcare.contexts.clinic.application.queries import ClinicCatalog
from vetcare.contexts.clinic.application.services import (
    ClinicSetupService,
    ResourceData,
    ServiceTypeData,
)
from vetcare.contexts.clinic.domain.model import (
    ClinicCalendar,
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceCode,
    ServiceType,
)
from vetcare.contexts.clinic.domain.schedule import TimeRange, Weekday, WeeklySchedule
from vetcare.contexts.identity.domain.model import Email, UserAccount, UserStatus
from vetcare.contexts.identity.domain.permissions import Role
from vetcare.shared_kernel.domain import AggregateRoot
from vetcare.shared_kernel.errors import ConflictError, NotFoundError, PermissionDeniedError
from vetcare.shared_kernel.ids import new_id


@dataclass
class Datos:
    service_types: dict[UUID, ServiceType] = field(default_factory=dict)
    resources: dict[UUID, Resource] = field(default_factory=dict)
    calendar: ClinicCalendar = field(
        default_factory=lambda: ClinicCalendar(opening_hours=WeeklySchedule.empty())
    )


class Servicios:
    def __init__(self, d: Datos) -> None:
        self.d = d

    async def get(self, service_type_id: UUID) -> ServiceType | None:
        return self.d.service_types.get(service_type_id)

    async def get_by_code(self, code: ServiceCode) -> ServiceType | None:
        return next((s for s in self.d.service_types.values() if s.code == code), None)

    async def all(self) -> list[ServiceType]:
        return sorted(self.d.service_types.values(), key=lambda s: s.name)

    async def add(self, service_type: ServiceType) -> None:
        self.d.service_types[service_type.id] = service_type

    async def save(self, service_type: ServiceType) -> None:
        self.d.service_types[service_type.id] = service_type


class Recursos:
    def __init__(self, d: Datos) -> None:
        self.d = d

    async def get(self, resource_id: UUID) -> Resource | None:
        return self.d.resources.get(resource_id)

    async def find(self, kinds: frozenset[ResourceKind] | None = None) -> list[Resource]:
        return [r for r in self.d.resources.values() if kinds is None or r.kind in kinds]

    async def add(self, resource: Resource) -> None:
        self.d.resources[resource.id] = resource

    async def save(self, resource: Resource) -> None:
        self.d.resources[resource.id] = resource


class Calendario:
    def __init__(self, d: Datos) -> None:
        self.d = d

    async def get(self) -> ClinicCalendar:
        return self.d.calendar

    async def save(self, calendar: ClinicCalendar) -> None:
        self.d.calendar = calendar


class Uow:
    def __init__(self, datos: Datos) -> None:
        self.datos = datos

    async def __aenter__(self) -> Self:
        self.copia = copy.deepcopy(self.datos)
        self.service_types = Servicios(self.copia)
        self.resources = Recursos(self.copia)
        self.calendar = Calendario(self.copia)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    def track(self, aggregate: AggregateRoot) -> None:
        return None

    async def commit(self) -> None:
        self.datos.__dict__.update(copy.deepcopy(self.copia).__dict__)


def usuario(*roles: Role) -> UserAccount:
    return UserAccount(
        id=new_id(),
        email=Email(f"{roles[0].value}@example.test"),
        full_name="Persona de Prueba",
        roles=frozenset(roles),
        status=UserStatus.ACTIVE,
        created_at=datetime(2026, 10, 1, tzinfo=UTC),
    )


ADMIN = usuario(Role.ADMIN)
RECEPCION = usuario(Role.RECEPTIONIST)
CLIENTE = usuario(Role.CLIENT)

BANO = ServiceTypeData(
    name="Baño",
    category=ServiceCategory.GROOMING,
    duration_minutes=60,
    required_resources=frozenset({ResourceKind.GROOMER, ResourceKind.GROOMING_STATION}),
    bookable_by_client=True,
)
CIRUGIA = ServiceTypeData(
    name="Cirugía programada",
    category=ServiceCategory.SURGERY,
    duration_minutes=120,
    required_resources=frozenset({ResourceKind.VETERINARIAN, ResourceKind.OPERATING_ROOM}),
    bookable_by_client=False,
)
HORARIO = WeeklySchedule.build([(Weekday.MONDAY, TimeRange(time(9), time(18)))])


@pytest.fixture
def datos() -> Datos:
    return Datos()


@pytest.fixture
def servicio(datos: Datos) -> ClinicSetupService:
    return ClinicSetupService(lambda: Uow(datos))


async def test_solo_quien_administra_la_configuracion_la_cambia(
    servicio: ClinicSetupService,
) -> None:
    for actor in (RECEPCION, CLIENTE, usuario(Role.VETERINARIAN)):
        with pytest.raises(PermissionDeniedError):
            await servicio.create_service_type(actor, "bano", BANO)
        with pytest.raises(PermissionDeniedError):
            await servicio.set_opening_hours(actor, HORARIO)

    await servicio.create_service_type(ADMIN, "bano", BANO)


async def test_el_codigo_del_servicio_es_unico(servicio: ClinicSetupService) -> None:
    await servicio.create_service_type(ADMIN, "bano", BANO)

    with pytest.raises(ConflictError) as error:
        await servicio.create_service_type(ADMIN, "BANO", BANO)
    assert error.value.code == "code_taken"


async def test_el_personal_ve_todo_y_el_cliente_solo_lo_reservable(
    servicio: ClinicSetupService,
) -> None:
    bano = await servicio.create_service_type(ADMIN, "bano", BANO)
    await servicio.create_service_type(ADMIN, "cirugia", CIRUGIA)
    corte = await servicio.create_service_type(ADMIN, "corte", BANO)
    await servicio.set_service_type_active(ADMIN, corte.id, False)

    assert len(await servicio.list_service_types(RECEPCION)) == 3
    assert [s.id for s in await servicio.list_service_types(CLIENTE)] == [bano.id]


async def test_solo_el_personal_ve_los_recursos(servicio: ClinicSetupService) -> None:
    await servicio.create_resource(
        ADMIN, ResourceData(kind=ResourceKind.GROOMER, name="Groomer 1", schedule=HORARIO)
    )

    assert len(await servicio.list_resources(RECEPCION)) == 1
    with pytest.raises(PermissionDeniedError):
        await servicio.list_resources(CLIENTE)


async def test_actualizar_un_servicio_inexistente_es_404(servicio: ClinicSetupService) -> None:
    with pytest.raises(NotFoundError):
        await servicio.update_service_type(ADMIN, new_id(), BANO)


async def test_bloqueos_y_feriados_se_guardan(servicio: ClinicSetupService, datos: Datos) -> None:
    recurso = await servicio.create_resource(
        ADMIN, ResourceData(kind=ResourceKind.VETERINARIAN, name="Dra. Prueba", schedule=HORARIO)
    )
    inicio = datetime(2026, 11, 2, 14, tzinfo=UTC)
    fin = datetime(2026, 11, 2, 16, tzinfo=UTC)

    await servicio.add_time_off(ADMIN, recurso.id, inicio, fin, "  Congreso ")
    await servicio.add_holiday(ADMIN, date(2026, 12, 8), "Inmaculada Concepción")

    guardado = datos.resources[recurso.id]
    assert [(b.start, b.reason) for b in guardado.time_off] == [(inicio, "Congreso")]
    assert datos.calendar.holidays == {date(2026, 12, 8): "Inmaculada Concepción"}


async def test_el_catalogo_publico_responde_lo_que_necesita_la_agenda(
    servicio: ClinicSetupService, datos: Datos
) -> None:
    bano = await servicio.create_service_type(ADMIN, "bano", BANO)
    groomer = await servicio.create_resource(
        ADMIN, ResourceData(kind=ResourceKind.GROOMER, name="Groomer 1", schedule=HORARIO)
    )
    inactivo = await servicio.create_resource(
        ADMIN, ResourceData(kind=ResourceKind.GROOMER, name="Groomer 2", schedule=HORARIO)
    )
    await servicio.update_resource(
        ADMIN, inactivo.id, name="Groomer 2", schedule=HORARIO, user_id=None, active=False
    )
    await servicio.set_opening_hours(ADMIN, HORARIO)
    catalogo = ClinicCatalog(lambda: Uow(datos))
    lunes_10 = datetime(2026, 11, 2, 15, tzinfo=UTC)  # 10:00 en Lima
    lunes_11 = datetime(2026, 11, 2, 16, tzinfo=UTC)

    vista = await catalogo.service_type(bano.id)
    recursos = await catalogo.active_resources(frozenset({ResourceKind.GROOMER}))

    assert vista is not None and vista.duration_minutes == 60
    assert [r.id for r in recursos] == [groomer.id]
    assert recursos[0].is_available(lunes_10, lunes_11)
    assert await catalogo.is_open(lunes_10, lunes_11)
    assert await catalogo.service_type(new_id()) is None
