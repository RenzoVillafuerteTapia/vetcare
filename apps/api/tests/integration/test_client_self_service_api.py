"""Lo que el cliente gestiona por su cuenta desde la app: sus datos, la foto y su contraseña."""

from integration_support import CLAVE, Api, auth
from test_customers_api import ANA, BETO, LUNA, SOLO_RECOGER, client_session, create, staff
from test_pet_photos_api import JPG, archivos, subir

from vetcare.contexts.identity.domain.permissions import Role

NUEVA = "el perro ladra a la luna llena"


async def test_el_cliente_ve_y_corrige_su_telefono_y_direccion(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", {**ANA, "notes": "Paga siempre en efectivo."})
    token = await client_session(api, rec, ana["id"], "ana@example.test")

    r = await api.client.get("/api/v1/me/profile", headers=auth(token))
    assert r.status_code == 200, r.text
    assert r.json() == {
        "full_name": "Ana Pérez",
        "document_type": "dni",
        "document_number": "12345678",
        "phone": "+51987654321",
        "email": "ana@example.test",
        "address": None,
    }  # sin las notas internas

    r = await api.client.put(
        "/api/v1/me/profile",
        json={"phone": "999 888 777", "address": "Av. Larco 123, Miraflores"},
        headers=auth(token),
    )
    assert r.status_code == 200, r.text
    assert (r.json()["phone"], r.json()["address"]) == ("+51999888777", "Av. Larco 123, Miraflores")

    # La recepción ve el cambio en la ficha, y las notas siguen intactas.
    ficha = (await api.client.get(f"/api/v1/clients/{ana['id']}", headers=auth(rec))).json()
    assert (ficha["phone"], ficha["notes"]) == ("+51999888777", "Paga siempre en efectivo.")

    # No acepta otros campos (nombre, documento, correo) ni un teléfono inválido.
    r = await api.client.put(
        "/api/v1/me/profile",
        json={"phone": "999888777", "full_name": "Otra Persona"},
        headers=auth(token),
    )
    assert r.status_code == 422
    r = await api.client.put(
        "/api/v1/me/profile", json={"phone": "abc-def-ghi"}, headers=auth(token)
    )
    assert r.status_code == 422


async def test_el_personal_no_tiene_perfil_de_cliente(api: Api) -> None:
    t = await staff(api)
    r = await api.client.get("/api/v1/me/profile", headers=auth(t[Role.RECEPTIONIST]))
    assert r.status_code == 403


async def test_solo_un_dueno_cambia_la_foto_desde_la_app(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    beto = await create(api, rec, "/api/v1/clients", BETO)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)
    await create(
        api,
        rec,
        f"/api/v1/pets/{luna['id']}/guardians",
        {"client_id": beto["id"], "kind": "authorized", "permissions": SOLO_RECOGER},
    )
    token_ana = await client_session(api, rec, ana["id"], "ana@example.test")
    token_beto = await client_session(api, rec, beto["id"], "beto@example.test")

    vista_ana = (await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_ana))).json()
    vista_beto = (
        await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_beto))
    ).json()
    assert (vista_ana["can_change_photo"], vista_beto["can_change_photo"]) == (True, False)

    # Ana, dueña, sube la foto y la quita; la respuesta es la vista del cliente.
    r = await subir(api, token_ana, luna["id"], JPG)
    assert r.status_code == 200, r.text
    assert r.json()["photo_url"] and r.json()["notes"] is None
    assert len(archivos(api)) == 1

    # Beto, solo autorizado, no puede.
    r = await subir(api, token_beto, luna["id"], JPG)
    assert r.status_code == 403
    r = await api.client.delete(f"/api/v1/pets/{luna['id']}/photo", headers=auth(token_beto))
    assert r.status_code == 403
    assert len(archivos(api)) == 1

    r = await api.client.delete(f"/api/v1/pets/{luna['id']}/photo", headers=auth(token_ana))
    assert r.status_code == 200 and r.json()["photo_url"] is None
    assert archivos(api) == []

    # Una mascota ajena no existe para el cliente.
    toby_body = {"name": "Toby", "species": "cat", "sex": "male"}
    toby = await create(api, rec, f"/api/v1/clients/{beto['id']}/pets", toby_body)
    r = await subir(api, token_ana, toby["id"], JPG)
    assert r.status_code == 404


async def test_cambiar_la_contrasena_cierra_las_otras_sesiones(api: Api) -> None:
    t = await staff(api)
    ana = await create(api, t[Role.RECEPTIONIST], "/api/v1/clients", ANA)
    await client_session(api, t[Role.RECEPTIONIST], ana["id"], "ana@example.test")

    def entrar(clave: str):  # type: ignore[no-untyped-def]
        return api.client.post(
            "/api/v1/auth/login",
            json={"email": "ana@example.test", "password": clave, "client": "mobile"},
        )

    telefono = (await entrar(CLAVE)).json()
    tablet = (await entrar(CLAVE)).json()

    # Con la actual equivocada no cambia nada y el error va al campo.
    r = await api.client.post(
        "/api/v1/auth/password",
        json={"current_password": "no es esta", "new_password": NUEVA, "client": "mobile"},
        headers=auth(telefono["access_token"]),
    )
    assert r.status_code == 422
    assert r.json()["errors"][0]["field"] == "current_password"

    # Una nueva débil también se rechaza por campo.
    r = await api.client.post(
        "/api/v1/auth/password",
        json={"current_password": CLAVE, "new_password": "corta", "client": "mobile"},
        headers=auth(telefono["access_token"]),
    )
    assert r.status_code == 422
    assert {e["field"] for e in r.json()["errors"]} == {"new_password"}

    r = await api.client.post(
        "/api/v1/auth/password",
        json={"current_password": CLAVE, "new_password": NUEVA, "client": "mobile"},
        headers=auth(telefono["access_token"]),
    )
    assert r.status_code == 200, r.text
    sesion = r.json()
    assert sesion["refresh_token"] and r.headers["cache-control"] == "no-store"

    # La sesión nueva sirve; las anteriores (incluida la de la tablet) ya no.
    renovada = await api.client.post(
        "/api/v1/auth/refresh", json={"client": "mobile", "refresh_token": sesion["refresh_token"]}
    )
    assert renovada.status_code == 200
    for anterior in (telefono, tablet):
        r = await api.client.post(
            "/api/v1/auth/refresh",
            json={"client": "mobile", "refresh_token": anterior["refresh_token"]},
        )
        assert r.status_code == 401

    assert (await entrar(CLAVE)).status_code == 401
    assert (await entrar(NUEVA)).status_code == 200
