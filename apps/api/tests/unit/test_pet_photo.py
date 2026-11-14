from datetime import UTC, datetime
from uuid import UUID

import pytest

from vetcare.contexts.customers.domain.pet import Pet, Sex, Species
from vetcare.contexts.customers.domain.photo import (
    JPEG,
    MAX_PHOTO_BYTES,
    PNG,
    WEBP,
    detect_image_format,
    photo_key,
    validate_photo,
)
from vetcare.shared_kernel.errors import ValidationFailedError

JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32
PET_ID = UUID("0192f0a4-0000-7000-8000-000000000001")
FILE_ID = UUID("0192f0a4-0000-7000-8000-000000000002")


def test_reconoce_el_formato_por_el_contenido() -> None:
    assert detect_image_format(JPG) is JPEG
    assert detect_image_format(PNG_BYTES) is PNG
    assert detect_image_format(WEBP_BYTES) is WEBP


@pytest.mark.parametrize(
    "contenido",
    [
        b"%PDF-1.7 documento",
        b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        b"GIF89a" + b"\x00" * 32,
        b"MZ ejecutable",
        b"RIFF\x24\x00\x00\x00WAVEfmt ",
    ],
)
def test_rechaza_lo_que_no_es_jpg_png_ni_webp(contenido: bytes) -> None:
    with pytest.raises(ValidationFailedError) as error:
        validate_photo(contenido)

    assert [(e.field, e.message) for e in error.value.errors] == [
        ("file", "Usa una imagen JPG, PNG o WebP.")
    ]


def test_rechaza_un_archivo_vacio_o_de_mas_de_5_mb() -> None:
    with pytest.raises(ValidationFailedError, match="Elige una imagen"):
        validate_photo(b"")
    with pytest.raises(ValidationFailedError, match="5 MB"):
        validate_photo(JPG + b"\x00" * MAX_PHOTO_BYTES)

    en_el_limite = JPG + b"\x00" * (MAX_PHOTO_BYTES - len(JPG))
    assert validate_photo(en_el_limite) is JPEG


def test_la_clave_solo_lleva_identificadores() -> None:
    assert photo_key(PET_ID, FILE_ID, PNG) == f"pets/{PET_ID}/{FILE_ID}.png"


def test_cambiar_la_foto_devuelve_la_anterior_para_borrarla() -> None:
    pet = Pet.register(
        id=PET_ID,
        owner_id=FILE_ID,
        name="Luna",
        species=Species.DOG,
        sex=Sex.FEMALE,
        now=datetime(2026, 11, 11, tzinfo=UTC),
    )

    assert pet.set_photo("pets/a/1.jpg") is None
    assert pet.set_photo("pets/a/2.jpg") == "pets/a/1.jpg"
    assert pet.set_photo(None) == "pets/a/2.jpg"
    assert pet.photo_key is None
