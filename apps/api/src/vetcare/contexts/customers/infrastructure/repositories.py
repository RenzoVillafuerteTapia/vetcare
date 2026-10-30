from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, func, insert, or_, select, update
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from vetcare.contexts.customers.application.ports import Page
from vetcare.contexts.customers.domain.client import (
    Client,
    ContactEmail,
    DocumentType,
    IdentityDocument,
    PhoneNumber,
)
from vetcare.contexts.customers.domain.pet import (
    BirthDate,
    GuardianKind,
    GuardianPermissions,
    Guardianship,
    Pet,
    PetStatus,
    Sex,
    Species,
    WeightRecord,
)
from vetcare.contexts.customers.infrastructure.tables import (
    clients,
    guardianships,
    pets,
    weight_records,
)
from vetcare.shared_kernel.errors import ConflictError

CONCURRENT = ConflictError(
    "Otra persona modificó este registro. Recarga e intenta de nuevo.",
    code="concurrent_modification",
)


def _naive(value: datetime | None) -> datetime | None:
    return value.astimezone(UTC).replace(tzinfo=None) if value else None


def _utc(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=UTC) if value else None


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class SqlClientRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, client_id: UUID) -> Client | None:
        return await self._one(clients.c.id == client_id)

    async def get_many(self, client_ids: set[UUID]) -> dict[UUID, Client]:
        if not client_ids:
            return {}
        rows = await self._session.execute(select(clients).where(clients.c.id.in_(client_ids)))
        return {r.id: self._to_domain(r._mapping) for r in rows}

    async def get_by_user(self, user_id: UUID) -> Client | None:
        return await self._one(clients.c.user_id == user_id)

    async def get_by_document(self, document: IdentityDocument) -> Client | None:
        return await self._one(
            and_(
                clients.c.document_type == document.type.value,
                clients.c.document_number == document.number,
            )
        )

    async def get_by_email(self, email: ContactEmail) -> Client | None:
        return await self._one(clients.c.email == email.value)

    async def search(self, text: str | None, page: int, page_size: int) -> Page[Client]:
        condition: Any = True
        if text:
            like = f"%{_escape_like(text)}%"
            digits = "".join(ch for ch in text if ch.isdigit())
            options = [
                clients.c.full_name.ilike(like, escape="\\"),
                clients.c.email.ilike(like, escape="\\"),
                clients.c.document_number.ilike(f"%{_escape_like(text.upper())}%", escape="\\"),
            ]
            if len(digits) >= 3:
                options.append(clients.c.phone.like(f"%{digits}%"))
            condition = or_(*options)
        total = await self._session.scalar(
            select(func.count()).select_from(clients).where(condition)
        )
        rows = await self._session.execute(
            select(clients)
            .where(condition)
            .order_by(clients.c.full_name, clients.c.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        return Page(
            items=[self._to_domain(r._mapping) for r in rows],
            total=int(total or 0),
            page=page,
            page_size=page_size,
        )

    async def add(self, client: Client) -> None:
        try:
            async with self._session.begin_nested():
                await self._session.execute(
                    insert(clients).values(id=client.id, **self._values(client))
                )
        except IntegrityError:
            raise ConflictError(
                "Ya hay un cliente con ese documento o correo.", code="client_exists"
            ) from None

    async def save(self, client: Client) -> None:
        try:
            async with self._session.begin_nested():
                result = await self._session.execute(
                    update(clients)
                    .where(clients.c.id == client.id, clients.c.version == client.version)
                    .values(**self._values(client) | {"version": client.version + 1})
                )
        except IntegrityError:
            raise ConflictError(
                "Ya hay un cliente con ese documento o correo.", code="client_exists"
            ) from None
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise CONCURRENT
        client.version += 1

    async def _one(self, condition: Any) -> Client | None:
        row = (await self._session.execute(select(clients).where(condition))).first()
        return self._to_domain(row._mapping) if row else None

    @staticmethod
    def _values(c: Client) -> dict[str, Any]:
        return {
            "full_name": c.full_name,
            "document_type": c.document.type.value,
            "document_number": c.document.number,
            "phone": c.phone.value,
            "email": c.email.value if c.email else None,
            "address": c.address,
            "notes": c.notes,
            "user_id": c.user_id,
            "created_at": _naive(c.created_at),
            "version": c.version,
        }

    @staticmethod
    def _to_domain(r: RowMapping) -> Client:
        return Client(
            id=r["id"],
            full_name=r["full_name"],
            document=IdentityDocument(DocumentType(r["document_type"]), r["document_number"]),
            phone=PhoneNumber(r["phone"]),
            email=ContactEmail(r["email"]) if r["email"] else None,
            address=r["address"],
            notes=r["notes"],
            user_id=r["user_id"],
            created_at=r["created_at"].replace(tzinfo=UTC),
            version=r["version"],
        )


class SqlPetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, pet_id: UUID, *, for_update: bool = False) -> Pet | None:
        query = select(pets).where(pets.c.id == pet_id)
        if for_update:
            query = query.with_for_update()
        found = await self._load(query)
        return found[0] if found else None

    async def of_client(self, client_id: UUID) -> list[Pet]:
        active_for_client = select(guardianships.c.pet_id).where(
            guardianships.c.client_id == client_id, guardianships.c.revoked_at.is_(None)
        )
        return await self._load(
            select(pets).where(pets.c.id.in_(active_for_client)).order_by(pets.c.name)
        )

    async def add(self, pet: Pet) -> None:
        await self._session.execute(insert(pets).values(id=pet.id, **self._values(pet)))
        await self._replace_children(pet)

    async def save(self, pet: Pet) -> None:
        result = await self._session.execute(
            update(pets)
            .where(pets.c.id == pet.id, pets.c.version == pet.version)
            .values(**self._values(pet) | {"version": pet.version + 1})
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise CONCURRENT
        await self._replace_children(pet)
        pet.version += 1

    async def _replace_children(self, pet: Pet) -> None:
        await self._session.execute(delete(guardianships).where(guardianships.c.pet_id == pet.id))
        await self._session.execute(
            insert(guardianships),
            [
                {
                    "pet_id": pet.id,
                    "client_id": g.client_id,
                    "since": _naive(g.since),
                    "kind": g.kind.value,
                    "can_pickup": g.permissions.can_pickup,
                    "can_book": g.permissions.can_book,
                    "can_view_clinical": g.permissions.can_view_clinical,
                    "revoked_at": _naive(g.revoked_at),
                }
                for g in pet.guardianships
            ],
        )
        await self._session.execute(delete(weight_records).where(weight_records.c.pet_id == pet.id))
        if pet.weights:
            await self._session.execute(
                insert(weight_records),
                [
                    {
                        "id": w.id,
                        "pet_id": pet.id,
                        "kilograms": w.kilograms,
                        "measured_at": _naive(w.measured_at),
                        "recorded_by": w.recorded_by,
                    }
                    for w in pet.weights
                ],
            )

    async def _load(self, query: Any) -> list[Pet]:
        rows = [r._mapping for r in await self._session.execute(query)]
        if not rows:
            return []
        ids = [r["id"] for r in rows]
        guardians: dict[UUID, list[Guardianship]] = {}
        for g in await self._session.execute(
            select(guardianships)
            .where(guardianships.c.pet_id.in_(ids))
            .order_by(guardianships.c.since)
        ):
            guardians.setdefault(g.pet_id, []).append(
                Guardianship(
                    client_id=g.client_id,
                    kind=GuardianKind(g.kind),
                    permissions=GuardianPermissions(
                        can_pickup=g.can_pickup,
                        can_book=g.can_book,
                        can_view_clinical=g.can_view_clinical,
                    ),
                    since=g.since.replace(tzinfo=UTC),
                    revoked_at=_utc(g.revoked_at),
                )
            )
        weights: dict[UUID, list[WeightRecord]] = {}
        for w in await self._session.execute(
            select(weight_records)
            .where(weight_records.c.pet_id.in_(ids))
            .order_by(weight_records.c.measured_at)
        ):
            weights.setdefault(w.pet_id, []).append(
                WeightRecord(
                    id=w.id,
                    kilograms=w.kilograms,
                    measured_at=w.measured_at.replace(tzinfo=UTC),
                    recorded_by=w.recorded_by,
                )
            )
        return [
            Pet(
                id=r["id"],
                name=r["name"],
                species=Species(r["species"]),
                sex=Sex(r["sex"]),
                breed=r["breed"],
                birth_date=BirthDate(r["birth_date"], r["birth_date_approximate"])
                if r["birth_date"]
                else None,
                color=r["color"],
                allergies=r["allergies"],
                notes=r["notes"],
                status=PetStatus(r["status"]),
                created_at=r["created_at"].replace(tzinfo=UTC),
                guardianships=guardians.get(r["id"], []),
                weights=weights.get(r["id"], []),
                version=r["version"],
            )
            for r in rows
        ]

    @staticmethod
    def _values(p: Pet) -> dict[str, Any]:
        return {
            "name": p.name,
            "species": p.species.value,
            "sex": p.sex.value,
            "breed": p.breed,
            "birth_date": p.birth_date.value if p.birth_date else None,
            "birth_date_approximate": p.birth_date.approximate if p.birth_date else False,
            "color": p.color,
            "allergies": p.allergies,
            "notes": p.notes,
            "status": p.status.value,
            "created_at": _naive(p.created_at),
            "version": p.version,
        }
