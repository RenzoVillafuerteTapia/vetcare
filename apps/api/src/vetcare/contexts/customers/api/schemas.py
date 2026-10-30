from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from vetcare.contexts.customers.application.services import (
    Audience,
    ClientData,
    PetData,
    PetDetails,
)
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
    PetStatus,
    Sex,
    Species,
)


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Clientes -------------------------------------------------------------------------------


class ClientRequest(_Request):
    full_name: str = Field(min_length=3, max_length=150)
    document_type: DocumentType
    document_number: str = Field(min_length=6, max_length=20)
    phone: str = Field(min_length=6, max_length=20)
    email: str | None = Field(default=None, max_length=254)
    address: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=1000)

    def to_data(self) -> ClientData:
        return ClientData(
            full_name=self.full_name,
            document=IdentityDocument(self.document_type, self.document_number),
            phone=PhoneNumber(self.phone),
            email=ContactEmail(self.email) if self.email and self.email.strip() else None,
            address=self.address,
            notes=self.notes,
        )


class ClientResponse(BaseModel):
    id: UUID
    full_name: str
    document_type: DocumentType
    document_number: str
    phone: str
    email: str | None
    address: str | None
    notes: str | None
    has_account: bool = Field(description="Si el cliente ya fue invitado a la app.")
    created_at: datetime

    @classmethod
    def of(cls, c: Client) -> "ClientResponse":
        return cls(
            id=c.id,
            full_name=c.full_name,
            document_type=c.document.type,
            document_number=c.document.number,
            phone=c.phone.value,
            email=c.email.value if c.email else None,
            address=c.address,
            notes=c.notes,
            has_account=c.user_id is not None,
            created_at=c.created_at,
        )


class ClientPage(BaseModel):
    items: list[ClientResponse]
    total: int
    page: int
    page_size: int


# --- Mascotas -------------------------------------------------------------------------------


class PetRequest(_Request):
    name: str = Field(min_length=1, max_length=60)
    species: Species
    sex: Sex
    breed: str | None = Field(default=None, max_length=60)
    birth_date: date | None = None
    birth_date_approximate: bool = False
    color: str | None = Field(default=None, max_length=60)
    allergies: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(
        default=None, max_length=2000, description="Notas internas; el cliente no las ve."
    )

    def to_data(self) -> PetData:
        return PetData(
            name=self.name,
            species=self.species,
            sex=self.sex,
            breed=self.breed,
            birth_date=BirthDate(self.birth_date, self.birth_date_approximate)
            if self.birth_date
            else None,
            color=self.color,
            allergies=self.allergies,
            notes=self.notes,
        )


class PetStatusRequest(_Request):
    status: PetStatus


class WeightRequest(_Request):
    kilograms: Decimal = Field(gt=0, le=200, decimal_places=2)


class GuardianPermissionsSchema(BaseModel):
    can_pickup: bool
    can_book: bool
    can_view_clinical: bool

    def to_domain(self) -> GuardianPermissions:
        return GuardianPermissions(
            can_pickup=self.can_pickup,
            can_book=self.can_book,
            can_view_clinical=self.can_view_clinical,
        )


class GuardianRequest(_Request):
    client_id: UUID
    kind: GuardianKind
    permissions: GuardianPermissionsSchema = Field(
        description="Para un dueño se ignoran: siempre tiene todos los permisos."
    )


class UpdateGuardianRequest(_Request):
    kind: GuardianKind
    permissions: GuardianPermissionsSchema


class GuardianResponse(BaseModel):
    client_id: UUID
    full_name: str
    kind: GuardianKind
    permissions: GuardianPermissionsSchema


class WeightResponse(BaseModel):
    kilograms: Decimal
    measured_at: datetime


class PetResponse(BaseModel):
    id: UUID
    name: str
    species: Species
    sex: Sex
    breed: str | None
    birth_date: date | None
    birth_date_approximate: bool
    color: str | None
    status: PetStatus
    allergies: str | None = Field(
        description="Para el cliente, solo si su tutela permite ver información clínica."
    )
    notes: str | None = Field(description="Notas internas: solo para el personal.")
    weights: list[WeightResponse]
    guardians: list[GuardianResponse]

    @classmethod
    def of(cls, d: PetDetails) -> "PetResponse":
        p = d.pet
        staff = d.audience is Audience.STAFF
        return cls(
            id=p.id,
            name=p.name,
            species=p.species,
            sex=p.sex,
            breed=p.breed,
            birth_date=p.birth_date.value if p.birth_date else None,
            birth_date_approximate=p.birth_date.approximate if p.birth_date else False,
            color=p.color,
            status=p.status,
            allergies=p.allergies if d.can_view_clinical else None,
            notes=p.notes if staff else None,
            weights=[
                WeightResponse(kilograms=w.kilograms, measured_at=w.measured_at) for w in p.weights
            ],
            guardians=[
                GuardianResponse(
                    client_id=g.client_id,
                    full_name=g.full_name,
                    kind=g.kind,
                    permissions=GuardianPermissionsSchema(
                        can_pickup=g.permissions.can_pickup,
                        can_book=g.permissions.can_book,
                        can_view_clinical=g.permissions.can_view_clinical,
                    ),
                )
                for g in d.guardians
            ],
        )
