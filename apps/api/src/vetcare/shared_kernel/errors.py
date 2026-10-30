from dataclasses import dataclass


class DomainError(Exception):
    """Error de negocio con un código estable y un mensaje en español para el usuario."""

    code: str = "domain_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class NotFoundError(DomainError):
    """El recurso no existe o el usuario no tiene relación con él (no se revela cuál de los dos)."""

    code = "not_found"


class ConflictError(DomainError):
    """La operación choca con el estado actual.

    Por ejemplo: horario ocupado, transición de etapa inválida o versión desactualizada.
    """

    code = "conflict"


class AuthenticationError(DomainError):
    """Falta autenticación o las credenciales no son válidas."""

    code = "not_authenticated"


class PermissionDeniedError(DomainError):
    code = "permission_denied"


@dataclass(frozen=True)
class FieldError:
    field: str
    message: str


class ValidationFailedError(DomainError):
    code = "validation_failed"

    def __init__(self, message: str, errors: list[FieldError] | None = None) -> None:
        super().__init__(message)
        self.errors = errors or []
