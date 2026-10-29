from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from vetcare.main import create_app
from vetcare.platform.settings import Environment, Settings


def client_for(settings: Settings) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=create_app(settings)), base_url="http://test")


async def test_health_responde_ok() -> None:
    async with client_for(Settings(environment=Environment.TEST)) as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_documentacion_disponible_fuera_de_produccion() -> None:
    async with client_for(Settings(environment=Environment.LOCAL)) as client:
        assert (await client.get("/api/docs")).status_code == 200
        assert (await client.get("/api/openapi.json")).status_code == 200


async def test_documentacion_oculta_en_produccion() -> None:
    async with client_for(Settings(environment=Environment.PRODUCTION)) as client:
        assert (await client.get("/api/docs")).status_code == 404
        assert (await client.get("/api/openapi.json")).status_code == 404


async def test_cors_solo_permite_origenes_configurados() -> None:
    settings = Settings(environment=Environment.TEST, cors_origins=["http://localhost:5173"])
    async with client_for(settings) as client:
        permitido = await client.options(
            "/api/v1/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        ajeno = await client.options(
            "/api/v1/health",
            headers={"Origin": "https://otro.example", "Access-Control-Request-Method": "GET"},
        )

    assert permitido.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in ajeno.headers


async def test_ready_sin_base_configurada_responde_503() -> None:
    # database_url explícito: el entorno del contenedor define VETCARE_DATABASE_URL.
    settings = Settings(environment=Environment.TEST, database_url=None)
    async with client_for(settings) as client:
        response = await client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json()["code"] == "database_not_configured"


async def test_ready_con_base_inaccesible_responde_503_sin_exponer_la_url() -> None:
    url = "mysql+asyncmy://usuario:clave-secreta@127.0.0.1:1/vetcare"
    settings = Settings(environment=Environment.TEST, database_url=SecretStr(url))
    async with client_for(settings) as client:
        response = await client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json()["code"] == "database_unavailable"
    assert "clave-secreta" not in response.text


def test_la_url_de_la_base_no_aparece_en_la_configuracion() -> None:
    url = "mysql+asyncmy://usuario:clave-secreta@db:3306/vetcare"
    assert "clave-secreta" not in repr(Settings(database_url=SecretStr(url)))
