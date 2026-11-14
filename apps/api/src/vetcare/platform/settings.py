from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class StorageBackend(StrEnum):
    LOCAL = "local"
    S3 = "s3"


class PushProvider(StrEnum):
    # Escribe los avisos en el registro: desarrollo y pruebas, sin cuenta de Expo.
    CONSOLE = "console"
    EXPO = "expo"


class Settings(BaseSettings):
    """Configuración leída de variables de entorno con prefijo ``VETCARE_``."""

    model_config = SettingsConfigDict(env_prefix="VETCARE_", extra="ignore")

    environment: Environment = Environment.LOCAL
    cors_origins: list[str] = Field(default_factory=list)
    # URL de SQLAlchemy, p. ej. mysql+asyncmy://usuario:clave@host:3306/base. SecretStr evita
    # que la contraseña aparezca en registros o en el repr de la configuración.
    database_url: SecretStr | None = None

    # Firma de los access tokens (HS256). Mínimo 32 caracteres aleatorios.
    jwt_secret: SecretStr | None = None
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    # Base de los enlaces de los correos (activar cuenta, restablecer contraseña).
    public_web_url: str = "http://localhost:5173"
    rate_limits_enabled: bool = True

    # Archivos (fotos): en disco para desarrollo y pruebas; S3 privado en producción.
    storage_backend: StorageBackend = StorageBackend.LOCAL
    storage_local_dir: Path = Path("var/storage")
    storage_s3_bucket: str | None = None
    storage_s3_region: str | None = None
    # Base de las URLs firmadas del almacenamiento en disco (las sirve esta misma API).
    public_api_url: str = "http://localhost:8000"

    # Avisos push (ADR 0004). El token de acceso de Expo es opcional: solo hace falta si el
    # proyecto de Expo exige envíos autenticados.
    push_provider: PushProvider = PushProvider.CONSOLE
    expo_access_token: SecretStr | None = None
    # Cada cuántos segundos el worker revisa el outbox.
    worker_poll_seconds: float = Field(default=2.0, gt=0, le=60)

    @property
    def secure_cookies(self) -> bool:
        return self.environment in {Environment.STAGING, Environment.PRODUCTION}

    @property
    def docs_enabled(self) -> bool:
        return self.environment is not Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    return Settings()
