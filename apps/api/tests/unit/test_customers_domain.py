from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

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
    Pet,
    PetAction,
    PetStatus,
    Sex,
    Species,
    WeightRecord,
)
from vetcare.shared_kernel.errors import ConflictError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id

AHORA = datetime(2026, 10, 30, 15, 0, tzinfo=UTC)
SOLO_RECOGER = GuardianPermissions(can_pickup=True, can_book=False, can_view_clinical=False)


# --- Clientes -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("tipo", "numero", "esperado"),
    [
        (DocumentType.DNI, "12345678", "12345678"),
        (DocumentType.DNI, " 1234-5678 ", "12345678"),
        (DocumentType.CE, "ab1234567", "AB1234567"),
        (DocumentType.PASSPORT, "x12345", "X12345"),
    ],
)
def test_documentos_validos_se_normalizan(tipo: DocumentType, numero: str, esperado: str) -> None:
    assert IdentityDocument(tipo, numero).number == esperado


@pytest.mark.parametrize(
    ("tipo", "numero"),
    [(DocumentType.DNI, "1234567"), (DocumentType.DNI, "1234567A"), (DocumentType.CE, "123")],
)
def test_documentos_invalidos(tipo: DocumentType, numero: str) -> None:
    with pytest.raises(ValidationFailedError) as error:
        IdentityDocument(tipo, numero)
    assert error.value.errors[0].field == "document_number"


@pytest.mark.parametrize(
    ("telefono", "esperado"),
    [
        ("987 654 321", "+51987654321"),
        ("+51 987654321", "+51987654321"),
        ("+34 600123456", "+34600123456"),
    ],
)
def test_telefonos_se_normalizan(telefono: str, esperado: str) -> None:
    assert PhoneNumber(telefono).value == esperado


@pytest.mark.parametrize("telefono", ["12345", "887654321", "+51 12"])
def test_telefonos_invalidos(telefono: str) -> None:
    with pytest.raises(ValidationFailedError):
        PhoneNumber(telefono)


def cliente(email: str | None = "ana@example.test") -> Client:
    return Client(
        id=new_id(),
        full_name="  Ana   Pérez ",
        document=IdentityDocument(DocumentType.DNI, "12345678"),
        phone=PhoneNumber("987654321"),
        email=ContactEmail(email) if email else None,
        created_at=AHORA,
    )


def test_el_nombre_del_cliente_se_limpia() -> None:
    assert cliente().full_name == "Ana Pérez"


def test_vincular_una_cuenta_requiere_correo_y_es_una_sola_vez() -> None:
    with pytest.raises(ValidationFailedError):
        cliente(email=None).link_account(new_id())
    c = cliente()
    c.link_account(new_id())
    with pytest.raises(ConflictError):
        c.link_account(new_id())


def test_con_cuenta_el_correo_no_se_cambia_desde_la_ficha() -> None:
    c = cliente()
    c.link_account(new_id())
    with pytest.raises(ConflictError):
        c.update_contact(
            full_name=c.full_name,
            document=c.document,
            phone=c.phone,
            email=ContactEmail("otro@example.test"),
            address=None,
            notes=None,
        )


# --- Mascotas y tutela ------------------------------------------------------------------------


def mascota(owner: object = None) -> Pet:
    return Pet.register(
        id=new_id(),
        owner_id=owner or new_id(),  # type: ignore[arg-type]
        name="Luna",
        species=Species.DOG,
        sex=Sex.FEMALE,
        now=AHORA,
    )


def test_registrar_crea_al_dueno_con_todos_los_permisos() -> None:
    dueno = new_id()
    pet = mascota(dueno)

    (g,) = pet.active_guardianships
    assert (g.client_id, g.kind, g.permissions) == (
        dueno,
        GuardianKind.OWNER,
        GuardianPermissions.full(),
    )


def test_la_fecha_de_nacimiento_no_puede_ser_futura() -> None:
    with pytest.raises(ValidationFailedError):
        Pet.register(
            id=new_id(),
            owner_id=new_id(),
            name="Luna",
            species=Species.CAT,
            sex=Sex.UNKNOWN,
            now=AHORA,
            birth_date=BirthDate(date(2027, 1, 1)),
        )


def test_un_responsable_autorizado_solo_puede_lo_permitido() -> None:
    pet = mascota()
    autorizado = new_id()
    pet.add_guardian(autorizado, GuardianKind.AUTHORIZED, SOLO_RECOGER, AHORA)

    assert pet.allows(autorizado, PetAction.VIEW)
    assert pet.allows(autorizado, PetAction.PICKUP)
    assert not pet.allows(autorizado, PetAction.BOOK)
    assert not pet.allows(autorizado, PetAction.VIEW_CLINICAL)
    assert not pet.allows(new_id(), PetAction.VIEW)


def test_no_se_reserva_para_una_mascota_inactiva() -> None:
    dueno = new_id()
    pet = mascota(dueno)
    pet.set_status(PetStatus.DECEASED)

    assert pet.allows(dueno, PetAction.VIEW)
    assert not pet.allows(dueno, PetAction.BOOK)


def test_no_se_duplica_una_tutela_activa() -> None:
    dueno = new_id()
    pet = mascota(dueno)
    with pytest.raises(ConflictError):
        pet.add_guardian(dueno, GuardianKind.AUTHORIZED, SOLO_RECOGER, AHORA)


def test_siempre_queda_al_menos_un_dueno() -> None:
    dueno = new_id()
    pet = mascota(dueno)

    with pytest.raises(ConflictError) as error:
        pet.revoke_guardian(dueno, AHORA)
    assert error.value.code == "last_owner"
    with pytest.raises(ConflictError):
        pet.update_guardian(dueno, GuardianKind.AUTHORIZED, SOLO_RECOGER)

    segundo = new_id()
    pet.add_guardian(segundo, GuardianKind.OWNER, SOLO_RECOGER, AHORA)
    pet.revoke_guardian(dueno, AHORA)
    assert [g.client_id for g in pet.active_guardianships] == [segundo]
    assert pet.guardianship_of(segundo).permissions == GuardianPermissions.full()  # type: ignore[union-attr]


def test_una_tutela_revocada_ya_no_da_acceso_pero_queda_en_el_historial() -> None:
    pet = mascota()
    autorizado = new_id()
    pet.add_guardian(autorizado, GuardianKind.AUTHORIZED, SOLO_RECOGER, AHORA)
    pet.revoke_guardian(autorizado, AHORA)

    assert not pet.allows(autorizado, PetAction.VIEW)
    assert len(pet.guardianships) == 2
    pet.add_guardian(autorizado, GuardianKind.AUTHORIZED, SOLO_RECOGER, AHORA)


def test_pesos_ordenados_y_validados() -> None:
    pet = mascota()
    quien = new_id()
    pet.record_weight(WeightRecord(new_id(), Decimal("12.40"), AHORA, quien))
    pet.record_weight(WeightRecord(new_id(), Decimal("11.90"), AHORA.replace(month=9), quien))

    assert pet.current_weight is not None and pet.current_weight.kilograms == Decimal("12.40")
    for invalido in ("0", "200.01", "1.234"):
        with pytest.raises(ValidationFailedError):
            WeightRecord(new_id(), Decimal(invalido), AHORA, quien)
