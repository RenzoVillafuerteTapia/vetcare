"""El generador de datos de prueba arma una veterinaria en marcha usando los casos de uso reales."""

import pytest
from integration_support import Api, auth

from vetcare.contexts.identity.domain.permissions import Role
from vetcare.demo_data import AlreadySeededError, seed_demo


async def test_carga_una_veterinaria_en_marcha(api: Api) -> None:
    admin = auth(await api.usuario("admin@example.test", frozenset({Role.ADMIN})))
    sf = api.app.state.session_factory

    result = await seed_demo(sf, clients=6, seed=7)

    assert result.clients == 6 and result.pets >= 6
    assert result.appointments > 40 and result.charges > 10
    assert result.products == 22

    # Tres veterinarios con nombre y la groomer.
    recursos = (await api.client.get("/api/v1/clinic/resources", headers=admin)).json()
    nombres = {r["name"] for r in recursos}
    assert {"Dra. Lucía Fernández", "Dr. Martín Salas", "Dra. Carla Rojas"} <= nombres

    # Las mascotas tienen pesos en el tiempo y los cobros suman.
    mascotas = (await api.client.get("/api/v1/pets", headers=admin)).json()
    assert mascotas["total"] == result.pets
    assert any(len(p["weights"]) > 1 for p in mascotas["items"])
    resumen = await api.client.get(
        "/api/v1/sales/summary",
        params={"from": "2000-01-01", "to": "2100-12-31"},
        headers=admin,
    )
    assert resumen.status_code == 422  # periodo de más de un año
    productos = (await api.client.get("/api/v1/sales/products", headers=admin)).json()
    assert any(p["low_stock"] for p in productos)

    # No se carga dos veces.
    with pytest.raises(AlreadySeededError):
        await seed_demo(sf, clients=6, seed=7)
