from enum import StrEnum
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Configuración leída de variables de entorno con prefijo ``VETCARE_``."""

    model_config = SettingsConfigDict(env_prefix="VETCARE_", extra="ignore")

    environment: Environment = Environment.LOCAL
    cors_origins: list[str] = Field(default_factory=list)
    # URL de SQLAlchemy, p. ej. mysql+asyncmy://usuario:clave@host:3306/base. SecretStr evita
    # que la contraseña aparezca en registros o en el repr de la configuración.
    database_url: SecretStr | None = None

    @property
    def docs_enabled(self) -> bool:
        return self.environment is not Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    return Settings()
