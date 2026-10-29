from vetcare.contexts.identity.domain.model import Email
from vetcare.shared_kernel.errors import FieldError, ValidationFailedError

MIN_LENGTH = 10
MAX_LENGTH = 128

# Muestra de contraseñas muy usadas (en minúsculas). Se rechazan aunque cumplan la longitud.
_COMMON = frozenset(
    {
        "1234567890",
        "12345678910",
        "0123456789",
        "1111111111",
        "0000000000",
        "qwertyuiop",
        "qwerty1234",
        "contraseña",
        "contrasena",
        "contrasena1",
        "contraseña1",
        "contraseña123",
        "contrasena123",
        "password123",
        "password1234",
        "passw0rd123",
        "iloveyou123",
        "abcdefghij",
        "abc1234567",
        "veterinaria",
        "veterinaria1",
        "veterinaria123",
        "mascota123",
        "mascotas123",
        "peru123456",
        "teamo12345",
        "1q2w3e4r5t",
        "asdfghjkl1",
        "zxcvbnm123",
        "administrador",
        "admin12345",
    }
)


def validate_password(password: str, email: Email) -> None:
    """Reglas de contraseña de docs/security. No limita caracteres para permitir frases."""
    problems: list[str] = []
    if len(password) < MIN_LENGTH:
        problems.append(f"Debe tener al menos {MIN_LENGTH} caracteres.")
    if len(password) > MAX_LENGTH:
        problems.append(f"Debe tener como máximo {MAX_LENGTH} caracteres.")
    lowered = password.lower()
    if lowered in _COMMON or len(set(password)) <= 2:
        problems.append("Es demasiado común. Elige otra.")
    local_part = email.value.split("@", 1)[0]
    if len(local_part) >= 4 and local_part in lowered:
        problems.append("No debe contener tu correo.")
    if problems:
        raise ValidationFailedError(
            "La contraseña no cumple los requisitos.",
            [FieldError("password", message) for message in problems],
        )
