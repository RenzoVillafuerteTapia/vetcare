from dataclasses import dataclass
from uuid import UUID

from vetcare.contexts.customers.domain.client import invalid

MAX_PHOTO_BYTES = 5 * 1024 * 1024


@dataclass(frozen=True)
class ImageFormat:
    extension: str
    content_type: str


JPEG = ImageFormat("jpg", "image/jpeg")
PNG = ImageFormat("png", "image/png")
WEBP = ImageFormat("webp", "image/webp")


def detect_image_format(content: bytes) -> ImageFormat | None:
    """Reconoce el formato por los primeros bytes: el tipo que declara el cliente no es fiable."""
    if content.startswith(b"\xff\xd8\xff"):
        return JPEG
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return WEBP
    return None


def validate_photo(content: bytes) -> ImageFormat:
    if not content:
        raise invalid("file", "Elige una imagen.")
    if len(content) > MAX_PHOTO_BYTES:
        raise invalid("file", "La imagen pesa más de 5 MB.")
    image_format = detect_image_format(content)
    if image_format is None:
        raise invalid("file", "Usa una imagen JPG, PNG o WebP.")
    return image_format


def photo_key(pet_id: UUID, file_id: UUID, image_format: ImageFormat) -> str:
    """Clave del archivo: solo identificadores, sin el nombre de la mascota ni del dueño."""
    return f"pets/{pet_id}/{file_id}.{image_format.extension}"
