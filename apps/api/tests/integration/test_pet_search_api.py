"""Búsqueda de mascotas para el personal: por nombre, por responsable y por especie."""

from integration_support import Api, auth
from test_customers_api import ANA, BETO, LUNA, client_session, create, staff

from vetcare.contexts.identity.domain.permissions import Role


async def test_buscar_mascotas(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    beto = await create(api, rec, "/api/v1/clients", BETO)
    await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)
    await create(
        api,
        rec,
        f"/api/v1/clients/{ana['id']}/pets",
        {"name": "Michi", "species": "cat", "sex": "male"},
    )
    await create(
        api,
        rec,
        f"/api/v1/clients/{beto['id']}/pets",
        {"name": "Toby", "species": "dog", "sex": "male"},
    )

    async def buscar(**params: str | int) -> dict[str, object]:
        r = await api.client.get("/api/v1/pets", params=params, headers=auth(rec))
        assert r.status_code == 200, r.text
        data: dict[str, object] = r.json()
        return data

    def nombres(page: dict[str, object]) -> list[str]:
        return [p["name"] for p in page["items"]]  # type: ignore[attr-defined,index]

    todas = await buscar()
    assert (nombres(todas), todas["total"]) == (["Luna", "Michi", "Toby"], 3)
    # Con sus responsables, para mostrar a quién pertenece cada una.
    assert todas["items"][0]["guardians"][0]["full_name"] == "Ana Pérez"  # type: ignore[index]

    assert nombres(await buscar(q="tob")) == ["Toby"]
    assert nombres(await buscar(q="Ana")) == ["Luna", "Michi"]  # por el nombre de la dueña
    assert nombres(await buscar(species="dog")) == ["Luna", "Toby"]
    assert nombres(await buscar(q="ana", species="cat")) == ["Michi"]

    pagina = await buscar(page=2, page_size=2)
    assert (nombres(pagina), pagina["total"], pagina["page"]) == (["Toby"], 3, 2)

    # Un cliente no busca entre todas las mascotas.
    token = await client_session(api, rec, ana["id"], "ana@example.test")
    r = await api.client.get("/api/v1/pets", headers=auth(token))
    assert r.status_code == 403
