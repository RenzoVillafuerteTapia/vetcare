import pytest

from vetcare.platform.settings import Environment, Settings


def test_lee_variables_con_prefijo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VETCARE_ENVIRONMENT", "staging")
    monkeypatch.setenv("VETCARE_CORS_ORIGINS", '["http://localhost:5173"]')

    settings = Settings()

    assert settings.environment is Environment.STAGING
    assert settings.cors_origins == ["http://localhost:5173"]


def test_rechaza_entorno_desconocido(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VETCARE_ENVIRONMENT", "demo")

    with pytest.raises(ValueError, match="environment"):
        Settings()
