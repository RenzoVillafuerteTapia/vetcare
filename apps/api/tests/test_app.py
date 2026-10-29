from httpx import ASGITransport, AsyncClient

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
