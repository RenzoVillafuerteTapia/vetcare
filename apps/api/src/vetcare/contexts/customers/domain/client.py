import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from vetcare.shared_kernel.domain import AggregateRoot
from vetcare.shared_kernel.errors import ConflictError, FieldError, ValidationFailedError


def invalid(field_name: str, message: str) -> ValidationFailedError:
    return ValidationFailedError(message, [FieldError(field_name, message)])


def clean_text(value: str, field_name: str, *, min_length: int, max_length: int) -> str:
    cleaned = " ".join(value.split())
    if not min_length <= len(cleaned) <= max_length:
        raise invalid(field_name, f"Usa entre {min_length} y {max_length} caracteres.")
    return cleaned


def optional_text(value: str | None, field_name: str, *, max_length: int) -> str | None:
    if value is None or not value.strip():
        return None
    cleaned = value.strip()
    if len(cleaned) > max_length:
        raise invalid(field_name, f"Usa como máximo {max_length} caracteres.")
    return cleaned


class DocumentType(StrEnum):
    DNI = "dni"
    CE = "ce"
    PASSPORT = "passport"


_DOCUMENT_RULES: dict[DocumentType, tuple[re.Pattern[str], str]] = {
    DocumentType.DNI: (re.compile(r"^\d{8}$"), "El DNI tiene 8 dígitos."),
    DocumentType.CE: (
        re.compile(r"^[A-Z0-9]{9,12}$"),
        "El carné de extranjería tiene de 9 a 12 caracteres.",
    ),
    DocumentType.PASSPORT: (
        re.compile(r"^[A-Z0-9]{6,12}$"),
        "El pasaporte tiene de 6 a 12 caracteres.",
    ),
}


@dataclass(frozen=True)
class IdentityDocument:
    type: DocumentType
    number: str

    def __post_init__(self) -> None:
        normalized = re.sub(r"[\s.-]", "", self.number).upper()
        pattern, message = _DOCUMENT_RULES[self.type]
        if not pattern.match(normalized):
            raise invalid("document_number", message)
        object.__setattr__(self, "number", normalized)


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class ContactEmail:
    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if len(normalized) > 254 or not _EMAIL.match(normalized):
            raise invalid("email", "Ingresa un correo válido.")
        object.__setattr__(self, "value", normalized)


@dataclass(frozen=True)
class PhoneNumber:
    """Celular peruano de 9 dígitos que empieza con 9, o número internacional con prefijo +."""

    value: str

    def __post_init__(self) -> None:
        digits = re.sub(r"[\s()-]", "", self.value)
        if re.fullmatch(r"9\d{8}", digits):
            digits = "+51" + digits
        elif (
            re.fullmatch(r"\+519\d{8}", digits) is None
            and re.fullmatch(r"\+\d{8,15}", digits) is None
        ):
            raise invalid("phone", "Ingresa un celular de 9 dígitos o un número con prefijo +.")
        object.__setattr__(self, "value", digits)


@dataclass
class Client(AggregateRoot):
    """Dueño o responsable de mascotas. Puede tener una cuenta para usar la app."""

    aggregate_type: ClassVar[str] = "client"

    id: UUID
    full_name: str
    document: IdentityDocument
    phone: PhoneNumber
    created_at: datetime
    email: ContactEmail | None = None
    address: str | None = None
    notes: str | None = None
    user_id: UUID | None = None
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        self.full_name = clean_text(self.full_name, "full_name", min_length=3, max_length=150)
        self.address = optional_text(self.address, "address", max_length=200)
        self.notes = optional_text(self.notes, "notes", max_length=1000)

    def update_contact(
        self,
        *,
        full_name: str,
        document: IdentityDocument,
        phone: PhoneNumber,
        email: ContactEmail | None,
        address: str | None,
        notes: str | None,
    ) -> None:
        if self.user_id is not None and email != self.email:
            raise ConflictError(
                "El cliente ya tiene cuenta: su correo se cambia desde la cuenta.",
                code="email_locked_by_account",
            )
        self.full_name = clean_text(full_name, "full_name", min_length=3, max_length=150)
        self.document = document
        self.phone = phone
        self.email = email
        self.address = optional_text(address, "address", max_length=200)
        self.notes = optional_text(notes, "notes", max_length=1000)

    def link_account(self, user_id: UUID) -> None:
        if self.user_id is not None:
            raise ConflictError("El cliente ya tiene una cuenta.", code="account_already_linked")
        if self.email is None:
            raise invalid("email", "Registra el correo del cliente para invitarlo a la app.")
        self.user_id = user_id
