"""Datos de prueba realistas para desarrollo: `python -m vetcare.cli seed-demo`.

Arma una veterinaria en marcha usando los casos de uso reales (con sus reglas y eventos):

- sede configurada (servicios, recursos y horario) con tres veterinarios y una groomer;
- clientes con sus mascotas, pesos, alergias y responsables autorizados;
- citas de los últimos 30 días (completadas, canceladas e inasistencias), de hoy (por
  confirmar, confirmadas y en atención) y de las próximas dos semanas;
- seguimientos en curso de los baños y cirugías de hoy, con avances publicados;
- inventario de medicamentos, alimentos y accesorios, algunos con stock bajo;
- cobros de las citas atendidas, con servicios y productos.

Los datos son ficticios (correos en example.test, documentos inventados) y se marcan en las
notas internas de cada cliente. Solo agrega datos: no borra nada. Se niega a correr si ya los
cargó antes.
"""

import contextlib
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetcare.contexts.clinic.domain.model import ResourceKind
from vetcare.contexts.clinic.infrastructure.composition import (
    build_clinic_setup,
    clinic_uow_factory,
)
from vetcare.contexts.clinic.infrastructure.seed import STAFF_HOURS, seed_clinic
from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.customers.application.services import ClientData, CustomersService, PetData
from vetcare.contexts.customers.domain.client import (
    ContactEmail,
    DocumentType,
    IdentityDocument,
    PhoneNumber,
)
from vetcare.contexts.customers.domain.pet import (
    BirthDate,
    GuardianKind,
    GuardianPermissions,
    Sex,
    Species,
)
from vetcare.contexts.customers.infrastructure.composition import customers_uow_factory
from vetcare.contexts.customers.infrastructure.tables import clients as clients_table
from vetcare.contexts.customers.public import PetAccess
from vetcare.contexts.identity.infrastructure.adapters import SqlIdentityUnitOfWork
from vetcare.contexts.identity.public import AuthenticatedUser
from vetcare.contexts.sales.application.services import ChargeRequest, LineRequest, ProductData
from vetcare.contexts.sales.domain.model import LineKind, PaymentMethod, ProductCategory
from vetcare.contexts.sales.infrastructure.composition import build_sales
from vetcare.contexts.scheduling.application.services import BookingRequest
from vetcare.contexts.scheduling.infrastructure.composition import (
    build_appointment_directory,
    build_scheduling,
)
from vetcare.contexts.tracking.infrastructure.composition import build_tracking
from vetcare.shared_kernel.clock import SystemClock
from vetcare.shared_kernel.errors import DomainError

MARK = "Dato de prueba (seed-demo)."
D = Decimal


class AlreadySeededError(Exception):
    pass


class NoAdminError(Exception):
    pass


class _Fixed:
    def __init__(self, at: datetime) -> None:
        self.at = at

    def now(self) -> datetime:
        return self.at


class _NoInvites:
    async def invite_client(self, *_: Any) -> UUID:  # pragma: no cover - no se usa
        raise RuntimeError("seed-demo no invita clientes")


class _NoStorage:
    async def delete(self, key: str) -> None:  # pragma: no cover - no se usa
        return None


@dataclass
class DemoResult:
    clients: int = 0
    pets: int = 0
    appointments: int = 0
    tracked: int = 0
    products: int = 0
    charges: int = 0
    skipped: int = 0
    notes: list[str] = field(default_factory=list)


FIRST = [
    "María",
    "Rosa",
    "Lucía",
    "Carmen",
    "Ana",
    "Sofía",
    "Valeria",
    "Camila",
    "Daniela",
    "Gabriela",
    "Patricia",
    "Elena",
    "Diana",
    "Jorge",
    "Luis",
    "Carlos",
    "José",
    "Miguel",
    "Juan",
    "Pedro",
    "Diego",
    "Andrés",
    "Ricardo",
    "Fernando",
    "Raúl",
    "Martín",
    "Hugo",
]
LAST = [
    "Quispe",
    "Flores",
    "Sánchez",
    "Rodríguez",
    "García",
    "Ramírez",
    "Torres",
    "Mendoza",
    "Chávez",
    "Vargas",
    "Castillo",
    "Huamán",
    "Rojas",
    "Gutiérrez",
    "Díaz",
    "Paredes",
    "Salazar",
    "Cárdenas",
    "Vega",
    "Ríos",
    "Herrera",
    "Palacios",
    "Ccori",
]
DISTRICTS = [
    "Miraflores",
    "San Isidro",
    "Surco",
    "Barranco",
    "Jesús María",
    "Lince",
    "San Borja",
    "La Molina",
    "Magdalena",
    "Pueblo Libre",
]
DOG_NAMES = [
    "Luna",
    "Max",
    "Rocky",
    "Toby",
    "Coco",
    "Lola",
    "Bruno",
    "Milo",
    "Nala",
    "Thor",
    "Kira",
    "Simba",
    "Bobby",
    "Mía",
    "Chester",
    "Canela",
    "Rex",
    "Duke",
    "Lucky",
    "Maya",
]
CAT_NAMES = [
    "Michi",
    "Garfield",
    "Nieve",
    "Pelusa",
    "Salem",
    "Oliver",
    "Mishi",
    "Tom",
    "Kitty",
    "Félix",
    "Luna",
    "Nube",
    "Tigre",
    "Misha",
]
DOG_BREEDS = [
    "Schnauzer",
    "Shih Tzu",
    "Golden Retriever",
    "Labrador",
    "Poodle",
    "Beagle",
    "Bulldog francés",
    "Pug",
    "Cocker Spaniel",
    "Mestizo",
    "Mestizo",
    "Pastor alemán",
    "Chihuahua",
    "Yorkshire Terrier",
]
CAT_BREEDS = ["Mestizo", "Mestizo", "Siamés", "Persa", "Angora", "Bengalí", "Maine Coon"]
COLORS = [
    "Negro",
    "Blanco",
    "Marrón",
    "Atigrado",
    "Gris",
    "Crema",
    "Sal y pimienta",
    "Tricolor",
    "Dorado",
]
ALLERGIES = ["Pollo", "Penicilina", "Pulgas (dermatitis)", "Granos", "Carne de res"]

PRICES = {
    "consulta": D("50"),
    "control": D("30"),
    "vacunacion": D("45"),
    "bano": D("45"),
    "bano-y-corte": D("70"),
    "esterilizacion": D("350"),
    "cirugia-menor": D("250"),
}

PRODUCTS: list[tuple[str, ProductCategory, str, str, str, str, str]] = [
    # nombre, categoría, unidad, costo, venta, stock, mínimo
    ("Antipulgas Bravecto 10-20 kg", ProductCategory.MEDICINE, "tableta", "95", "145", "14", "4"),
    ("Antipulgas Nexgard 4-10 kg", ProductCategory.MEDICINE, "tableta", "38", "60", "3", "5"),
    ("Desparasitante Drontal Plus", ProductCategory.MEDICINE, "tableta", "9.5", "16", "40", "10"),
    ("Desparasitante para gatos", ProductCategory.MEDICINE, "tableta", "7", "13", "6", "8"),
    ("Amoxicilina 250 mg", ProductCategory.MEDICINE, "tableta", "1.2", "3", "120", "30"),
    ("Meloxicam 1.5 mg/ml", ProductCategory.MEDICINE, "frasco", "28", "45", "9", "3"),
    ("Vacuna antirrábica", ProductCategory.SUPPLY, "dosis", "12", "0", "30", "10"),
    ("Vacuna séxtuple", ProductCategory.SUPPLY, "dosis", "22", "0", "18", "8"),
    ("Jeringa 3 ml", ProductCategory.SUPPLY, "unidad", "0.4", "0", "200", "50"),
    ("Alimento Pro Plan adulto 3 kg", ProductCategory.FOOD, "bolsa", "88", "125", "11", "4"),
    ("Alimento Royal Canin cachorro 2 kg", ProductCategory.FOOD, "bolsa", "79", "115", "2", "3"),
    ("Alimento Whiskas gato 1.5 kg", ProductCategory.FOOD, "bolsa", "24", "36", "16", "5"),
    ("Snacks dentales", ProductCategory.FOOD, "paquete", "11", "19", "25", "6"),
    ("Collar antipulgas", ProductCategory.ACCESSORY, "unidad", "18", "32", "12", "4"),
    ("Correa retráctil 5 m", ProductCategory.ACCESSORY, "unidad", "25", "45", "7", "2"),
    ("Cama acolchada mediana", ProductCategory.ACCESSORY, "unidad", "60", "99", "4", "2"),
    ("Juguete mordedor", ProductCategory.ACCESSORY, "unidad", "6", "14", "30", "8"),
    ("Shampoo hipoalergénico", ProductCategory.HYGIENE, "frasco", "18", "30", "10", "3"),
    ("Shampoo antipulgas", ProductCategory.HYGIENE, "frasco", "16", "28", "1", "3"),
    ("Arena para gato 10 kg", ProductCategory.HYGIENE, "bolsa", "22", "35", "15", "5"),
    ("Limpiador de oídos", ProductCategory.HYGIENE, "frasco", "14", "25", "8", "3"),
    ("Cono isabelino M", ProductCategory.ACCESSORY, "unidad", "8", "18", "9", "3"),
]

SALE_ON_VISIT = [
    "Desparasitante Drontal Plus",
    "Antipulgas Bravecto 10-20 kg",
    "Snacks dentales",
    "Collar antipulgas",
    "Shampoo hipoalergénico",
    "Limpiador de oídos",
    "Juguete mordedor",
]

UPDATES = {
    "grooming": [
        "Ya está en el baño, muy tranquila.",
        "Terminamos el baño; ahora la estamos secando.",
        "Le estamos haciendo el corte que pediste.",
    ],
    "surgery": [
        "Ingresó y está estable; la estamos preparando.",
        "La cirugía empezó a la hora prevista.",
        "Salió bien de la cirugía y está despertando.",
    ],
}


def _lima(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), CLINIC_TZ)


async def _admin(session_factory: async_sessionmaker[AsyncSession]) -> AuthenticatedUser:
    async with session_factory() as session:
        admin_id = (
            await session.execute(
                text("select id from iam_users where json_contains(roles, '\"admin\"') limit 1")
            )
        ).scalar_one_or_none()
    if admin_id is None:
        raise NoAdminError("Crea primero el administrador: python -m vetcare.cli create-admin")
    async with SqlIdentityUnitOfWork(session_factory, SystemClock()) as uow:
        admin = await uow.users.get(UUID(str(admin_id)))
    if admin is None:  # pragma: no cover
        raise NoAdminError("No se pudo leer el administrador.")
    return admin


async def seed_demo(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    today: date | None = None,
    clients: int = 40,
    seed: int = 2026,
    log: Callable[[str], None] = lambda _: None,
) -> DemoResult:
    rnd = random.Random(seed)  # noqa: S311 - datos de prueba, no criptografía
    today = today or datetime.now(CLINIC_TZ).date()
    result = DemoResult()

    async with session_factory() as session:
        already = (
            await session.execute(
                select(clients_table.c.id).where(clients_table.c.notes == MARK).limit(1)
            )
        ).first()
    if already:
        raise AlreadySeededError("Los datos de prueba ya están cargados.")
    admin = await _admin(session_factory)

    # --- Sede: catálogo, recursos y tres veterinarios con nombre --------------------------
    await seed_clinic(clinic_uow_factory(session_factory))
    setup, catalog = build_clinic_setup(session_factory)
    resources = await setup.list_resources(admin)
    names = {
        "Veterinario 1": "Dra. Lucía Fernández",
        "Veterinario 2": "Dr. Martín Salas",
        "Groomer 1": "Sofía Ramos (groomer)",
    }
    for r in resources:
        if r.name in names:
            await setup.update_resource(
                admin, r.id, name=names[r.name], schedule=r.schedule, user_id=r.user_id, active=True
            )
    if not any(r.name == "Dra. Carla Rojas" for r in resources):
        from vetcare.contexts.clinic.application.services import ResourceData

        await setup.create_resource(
            admin, ResourceData(ResourceKind.VETERINARIAN, "Dra. Carla Rojas", STAFF_HOURS)
        )
    services = {s.code.value: s for s in await setup.list_service_types(admin)}
    log("Sede lista: 3 veterinarios, 1 groomer y el catálogo de servicios.")

    # --- Clientes y mascotas (registrados hace 3 meses, con pesos en el tiempo) ---------
    start_clock = _Fixed(_lima(today - timedelta(days=95), 10).astimezone(UTC))

    def customers_at(at: datetime) -> CustomersService:
        return CustomersService(
            uow_factory=customers_uow_factory(session_factory),
            inviter=_NoInvites(),
            storage=_NoStorage(),  # type: ignore[arg-type]
            clock=_Fixed(at),
        )

    customers = customers_at(start_clock.at)
    used_docs: set[str] = set()
    pets: list[tuple[UUID, UUID, str, Species]] = []  # (pet_id, owner_id, nombre, especie)
    client_ids: list[UUID] = []
    for i in range(clients):
        first, last1, last2 = rnd.choice(FIRST), rnd.choice(LAST), rnd.choice(LAST)
        while True:
            doc = f"{rnd.randint(10_000_000, 79_999_999)}"
            if doc not in used_docs:
                used_docs.add(doc)
                break
        email = f"{first}.{last1}{i}".lower()
        for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
            email = email.replace(a, b)
        client = await customers.register_client(
            admin,
            ClientData(
                full_name=f"{first} {last1} {last2}",
                document=IdentityDocument(DocumentType.DNI, doc),
                phone=PhoneNumber(f"9{rnd.randint(10_000_000, 99_999_999)}"),
                email=ContactEmail(f"{email}@example.test") if rnd.random() < 0.85 else None,
                address=f"Calle {rnd.choice(LAST)} {rnd.randint(100, 999)}, {rnd.choice(DISTRICTS)}"
                if rnd.random() < 0.7
                else None,
                notes=MARK,
            ),
        )
        client_ids.append(client.id)
        result.clients += 1
        for _ in range(rnd.choices([1, 2, 3], weights=[60, 30, 10])[0]):
            species = rnd.choices([Species.DOG, Species.CAT, Species.RABBIT], weights=[65, 30, 5])[
                0
            ]
            name = rnd.choice(DOG_NAMES if species is Species.DOG else CAT_NAMES)
            breed = (
                rnd.choice(DOG_BREEDS)
                if species is Species.DOG
                else rnd.choice(CAT_BREEDS)
                if species is Species.CAT
                else None
            )
            born = today - timedelta(days=rnd.randint(120, 365 * 13))
            details = await customers.register_pet(
                admin,
                client.id,
                PetData(
                    name=name,
                    species=species,
                    sex=rnd.choice([Sex.MALE, Sex.FEMALE]),
                    breed=breed,
                    birth_date=BirthDate(born, approximate=rnd.random() < 0.4),
                    color=rnd.choice(COLORS),
                    allergies=rnd.choice(ALLERGIES) if rnd.random() < 0.15 else None,
                ),
            )
            pet_id = details.pet.id
            pets.append((pet_id, client.id, name, species))
            result.pets += 1
            base = {Species.DOG: 4 + rnd.random() * 26, Species.CAT: 3 + rnd.random() * 3}.get(
                species, 1.5
            )
            for k in range(rnd.randint(1, 4)):
                when = _lima(today - timedelta(days=90 - k * 28), 11).astimezone(UTC)
                kg = D(str(round(base * (1 + (k * 0.02) + rnd.uniform(-0.03, 0.03)), 2)))
                await customers_at(when).record_weight(admin, pet_id, kg)
    # Algunos responsables autorizados (otro cliente que recoge a la mascota).
    for pet_id, owner_id, _, _ in rnd.sample(pets, k=min(8, len(pets))):
        other = rnd.choice([c for c in client_ids if c != owner_id])
        with contextlib.suppress(DomainError):
            await customers.add_guardian(
                admin,
                pet_id,
                other,
                GuardianKind.AUTHORIZED,
                GuardianPermissions(
                    can_pickup=True, can_book=rnd.random() < 0.5, can_view_clinical=False
                ),
            )
    log(f"Clientes: {result.clients}, mascotas: {result.pets}.")

    # --- Inventario ---------------------------------------------------------------------
    sales = build_sales(session_factory, clock=start_clock)
    product_ids: dict[str, UUID] = {}
    for name, category, unit, cost, sale, stock, minimum in PRODUCTS:
        product = await sales.create_product(
            admin,
            ProductData(name, category, unit, D(cost), D(sale), D(minimum)),
            D(stock) + (D(30) if name in SALE_ON_VISIT else D(0)),
        )
        product_ids[name] = product.id
        result.products += 1

    # --- Citas: pasadas, de hoy y futuras -------------------------------------------------
    pet_access = PetAccess(customers_uow_factory(session_factory))
    common = ["consulta", "consulta", "control", "vacunacion", "bano", "bano", "bano-y-corte"]
    surgeries = ["esterilizacion", "cirugia-menor"]
    tracking_targets: list[tuple[UUID, str]] = []

    async def book(
        day: date, hour: int, minute: int, code: str, *, past: bool, today_state: str | None
    ) -> None:
        pet_id, owner_id, _, species = rnd.choice(pets)
        if code.startswith("bano") and species is Species.RABBIT:
            code = "consulta"
        start = _lima(day, hour, minute)
        booking_clock = _Fixed((start - timedelta(days=3)).astimezone(UTC))
        scheduling = build_scheduling(session_factory, catalog, pet_access, clock=booking_clock)
        try:
            booked = await scheduling.book(
                admin, BookingRequest(pet_id=pet_id, service_type_id=services[code].id, start=start)
            )
        except DomainError:
            result.skipped += 1
            return
        appointment = booked.appointment
        result.appointments += 1
        at = _Fixed((start + timedelta(minutes=5)).astimezone(UTC))
        later = build_scheduling(session_factory, catalog, pet_access, clock=at)
        if past:
            fate = rnd.choices(["done", "cancel", "no_show"], weights=[82, 10, 8])[0]
            if fate == "cancel":
                await later.cancel(admin, appointment.id, "El cliente avisó que no podía venir.")
                return
            if fate == "no_show":
                await later.mark_no_show(admin, appointment.id)
                return
            await later.check_in(admin, appointment.id)
            await later.complete(admin, appointment.id)
            await _charge(appointment.id, code, appointment.pet_name, owner_id, start)
        elif today_state == "checked_in":
            early = _Fixed((start - timedelta(minutes=10)).astimezone(UTC))
            await build_scheduling(session_factory, catalog, pet_access, clock=early).check_in(
                admin, appointment.id
            )
            if code in ("bano", "bano-y-corte", *surgeries):
                tracking_targets.append((appointment.id, code))

    async def _charge(
        appointment_id: UUID, code: str, pet_name: str, owner_id: UUID, start: datetime
    ) -> None:
        lines = [LineRequest(LineKind.SERVICE, D(1), services[code].name, PRICES[code])]
        if rnd.random() < 0.45:
            product = rnd.choice(SALE_ON_VISIT)
            lines.append(
                LineRequest(
                    LineKind.PRODUCT, D(rnd.choice([1, 1, 2])), product_id=product_ids[product]
                )
            )
        owner = await customers.get_client(admin, owner_id)
        method = rnd.choices(list(PaymentMethod), weights=[30, 25, 30, 10, 5])[0]
        charge_sales = build_sales(
            session_factory, clock=_Fixed((start + timedelta(minutes=50)).astimezone(UTC))
        )
        try:
            await charge_sales.register_charge(
                admin,
                ChargeRequest(
                    lines=lines,
                    method=method,
                    customer_name=owner.full_name,
                    pet_name=pet_name,
                    client_id=owner_id,
                    appointment_id=appointment_id,
                ),
            )
            result.charges += 1
        except DomainError:
            result.skipped += 1

    for offset in range(30, 0, -1):
        day = today - timedelta(days=offset)
        if day.weekday() == 6:
            continue
        hours = [9, 10, 11] + ([15, 16, 17] if day.weekday() < 5 else [12])
        for hour in rnd.sample(hours, k=min(len(hours), rnd.randint(3, 5))):
            code = rnd.choice(surgeries) if rnd.random() < 0.08 else rnd.choice(common)
            await book(day, hour, rnd.choice([0, 30]), code, past=True, today_state=None)

    if today.weekday() != 6:
        plan = [
            (9, 0, "bano", "checked_in"),
            (9, 30, "esterilizacion", "checked_in"),
            (10, 0, "bano-y-corte", "checked_in"),
            (11, 0, "consulta", "confirmed"),
            (15, 0, "vacunacion", "confirmed"),
            (16, 0, "control", "confirmed"),
            (17, 0, "consulta", "requested"),
        ]
        for hour, minute, code, state in plan:
            if today.weekday() == 5 and hour >= 14:
                continue
            await book(today, hour, minute, code, past=False, today_state=state)

    for offset in range(1, 15):
        day = today + timedelta(days=offset)
        if day.weekday() == 6:
            continue
        hours = [9, 10, 11, 12] + ([15, 16, 17, 18] if day.weekday() < 5 else [])
        for hour in rnd.sample(hours, k=min(len(hours), rnd.randint(2, 4))):
            code = rnd.choice(surgeries) if rnd.random() < 0.06 else rnd.choice(common)
            await book(day, hour, rnd.choice([0, 30]), code, past=False, today_state=None)
    log(f"Citas: {result.appointments} ({result.skipped} horarios ocupados omitidos).")

    # --- Seguimientos de hoy ------------------------------------------------------------
    now = datetime.now(UTC)
    tracking = build_tracking(
        session_factory,
        appointments=build_appointment_directory(session_factory),
        catalog=catalog,
        pets=pet_access,
        clock=_Fixed(now - timedelta(minutes=40)),
    )
    for i, (appointment_id, code) in enumerate(tracking_targets):
        view = await tracking.start(admin, appointment_id)
        result.tracked += 1
        kind = "surgery" if code in surgeries else "grooming"
        for step in range(i % 3 + 1):
            stepper = build_tracking(
                session_factory,
                appointments=build_appointment_directory(session_factory),
                catalog=catalog,
                pets=pet_access,
                clock=_Fixed(now - timedelta(minutes=30 - step * 10)),
            )
            service = view.service
            if service.advancing_needs_discharge or service.next_stage is None:
                break
            view = await stepper.advance(admin, service.id, service.current_stage.code)
            if step < len(UPDATES[kind]):
                view = await stepper.publish_update(admin, service.id, UPDATES[kind][step])
    log(f"Seguimientos en curso: {result.tracked}. Cobros: {result.charges}.")
    return result
