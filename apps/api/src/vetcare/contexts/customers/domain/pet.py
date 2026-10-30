from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from vetcare.contexts.customers.domain.client import clean_text, invalid, optional_text
from vetcare.shared_kernel.domain import AggregateRoot
from vetcare.shared_kernel.errors import ConflictError


class Species(StrEnum):
    DOG = "dog"
    CAT = "cat"
    RABBIT = "rabbit"
    BIRD = "bird"
    RODENT = "rodent"
    REPTILE = "reptile"
    OTHER = "other"


class Sex(StrEnum):
    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


class PetStatus(StrEnum):
    ACTIVE = "active"
    DECEASED = "deceased"
    TRANSFERRED = "transferred"


class GuardianKind(StrEnum):
    OWNER = "owner"
    AUTHORIZED = "authorized"


@dataclass(frozen=True)
class BirthDate:
    """Fecha de nacimiento exacta o aproximada (muchas mascotas son adoptadas)."""

    value: date
    approximate: bool = False

    def validate(self, today: date) -> None:
        if self.value > today:
            raise invalid("birth_date", "La fecha de nacimiento no puede ser futura.")
        if (today - self.value).days > 60 * 365:
            raise invalid("birth_date", "Revisa la fecha de nacimiento.")


@dataclass(frozen=True)
class WeightRecord:
    id: UUID
    kilograms: Decimal
    measured_at: datetime
    recorded_by: UUID

    def __post_init__(self) -> None:
        if not Decimal("0.01") <= self.kilograms <= Decimal("200"):
            raise invalid("kilograms", "Ingresa un peso entre 0.01 y 200 kg.")
        if self.kilograms != self.kilograms.quantize(Decimal("0.01")):
            raise invalid("kilograms", "Usa como máximo dos decimales.")


@dataclass(frozen=True)
class GuardianPermissions:
    can_pickup: bool
    can_book: bool
    can_view_clinical: bool

    @classmethod
    def full(cls) -> "GuardianPermissions":
        return cls(can_pickup=True, can_book=True, can_view_clinical=True)


@dataclass
class Guardianship:
    """Relación de un cliente con la mascota. El dueño tiene siempre todos los permisos."""

    client_id: UUID
    kind: GuardianKind
    permissions: GuardianPermissions
    since: datetime
    revoked_at: datetime | None = None

    @property
    def active(self) -> bool:
        return self.revoked_at is None


class PetAction(StrEnum):
    VIEW = "view"
    BOOK = "book"
    PICKUP = "pickup"
    VIEW_CLINICAL = "view_clinical"


@dataclass
class Pet(AggregateRoot):
    aggregate_type: ClassVar[str] = "pet"

    id: UUID
    name: str
    species: Species
    sex: Sex
    created_at: datetime
    guardianships: list[Guardianship]
    breed: str | None = None
    birth_date: BirthDate | None = None
    color: str | None = None
    allergies: str | None = None
    notes: str | None = None
    status: PetStatus = PetStatus.ACTIVE
    weights: list[WeightRecord] = field(default_factory=list)
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        self.name = clean_text(self.name, "name", min_length=1, max_length=60)
        self.breed = optional_text(self.breed, "breed", max_length=60)
        self.color = optional_text(self.color, "color", max_length=60)
        self.allergies = optional_text(self.allergies, "allergies", max_length=1000)
        self.notes = optional_text(self.notes, "notes", max_length=2000)

    @classmethod
    def register(
        cls,
        *,
        id: UUID,
        owner_id: UUID,
        name: str,
        species: Species,
        sex: Sex,
        now: datetime,
        breed: str | None = None,
        birth_date: BirthDate | None = None,
        color: str | None = None,
        allergies: str | None = None,
        notes: str | None = None,
    ) -> "Pet":
        if birth_date is not None:
            birth_date.validate(now.date())
        return cls(
            id=id,
            name=name,
            species=species,
            sex=sex,
            created_at=now,
            guardianships=[
                Guardianship(owner_id, GuardianKind.OWNER, GuardianPermissions.full(), now)
            ],
            breed=breed,
            birth_date=birth_date,
            color=color,
            allergies=allergies,
            notes=notes,
        )

    # --- Perfil -------------------------------------------------------------------------------

    def update_profile(
        self,
        *,
        name: str,
        species: Species,
        sex: Sex,
        breed: str | None,
        birth_date: BirthDate | None,
        color: str | None,
        allergies: str | None,
        notes: str | None,
        today: date,
    ) -> None:
        if birth_date is not None:
            birth_date.validate(today)
        self.name = clean_text(name, "name", min_length=1, max_length=60)
        self.species = species
        self.sex = sex
        self.breed = optional_text(breed, "breed", max_length=60)
        self.birth_date = birth_date
        self.color = optional_text(color, "color", max_length=60)
        self.allergies = optional_text(allergies, "allergies", max_length=1000)
        self.notes = optional_text(notes, "notes", max_length=2000)

    def set_status(self, status: PetStatus) -> None:
        self.status = status

    def record_weight(self, record: WeightRecord) -> None:
        self.weights = sorted([*self.weights, record], key=lambda w: w.measured_at)

    @property
    def current_weight(self) -> WeightRecord | None:
        return self.weights[-1] if self.weights else None

    # --- Tutela -------------------------------------------------------------------------------

    @property
    def active_guardianships(self) -> list[Guardianship]:
        return [g for g in self.guardianships if g.active]

    def guardianship_of(self, client_id: UUID) -> Guardianship | None:
        return next((g for g in self.active_guardianships if g.client_id == client_id), None)

    def add_guardian(
        self,
        client_id: UUID,
        kind: GuardianKind,
        permissions: GuardianPermissions,
        now: datetime,
    ) -> None:
        if self.guardianship_of(client_id) is not None:
            raise ConflictError(
                "Ese cliente ya es responsable de la mascota.", code="guardian_exists"
            )
        if kind is GuardianKind.OWNER:
            permissions = GuardianPermissions.full()
        self.guardianships.append(Guardianship(client_id, kind, permissions, now))

    def update_guardian(
        self, client_id: UUID, kind: GuardianKind, permissions: GuardianPermissions
    ) -> None:
        current = self._require_guardian(client_id)
        if current.kind is GuardianKind.OWNER and kind is not GuardianKind.OWNER:
            self._ensure_another_owner(client_id)
        current.kind = kind
        current.permissions = (
            GuardianPermissions.full() if kind is GuardianKind.OWNER else permissions
        )

    def revoke_guardian(self, client_id: UUID, now: datetime) -> None:
        current = self._require_guardian(client_id)
        if current.kind is GuardianKind.OWNER:
            self._ensure_another_owner(client_id)
        current.revoked_at = now

    def allows(self, client_id: UUID, action: PetAction) -> bool:
        guardianship = self.guardianship_of(client_id)
        if guardianship is None:
            return False
        p = guardianship.permissions
        return {
            PetAction.VIEW: True,
            PetAction.BOOK: p.can_book and self.status is PetStatus.ACTIVE,
            PetAction.PICKUP: p.can_pickup,
            PetAction.VIEW_CLINICAL: p.can_view_clinical,
        }[action]

    def _require_guardian(self, client_id: UUID) -> Guardianship:
        current = self.guardianship_of(client_id)
        if current is None:
            raise ConflictError(
                "Ese cliente no es responsable de la mascota.", code="guardian_not_found"
            )
        return current

    def _ensure_another_owner(self, client_id: UUID) -> None:
        others = [
            g
            for g in self.active_guardianships
            if g.kind is GuardianKind.OWNER and g.client_id != client_id
        ]
        if not others:
            raise ConflictError(
                "La mascota debe tener al menos un dueño. Agrega otro dueño antes de quitar este.",
                code="last_owner",
            )
