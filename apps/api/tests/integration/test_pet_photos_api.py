"""Fotos de mascotas de punta a punta: subida validada, URL firmada y acceso."""

import re
from pathlib import Path
from typing import Any

from integration_support import Api, auth
from test_customers_api import ANA, BETO, LUNA, SOLO_RECOGER, client_session, create, staff

from vetcare.contexts.customers.domain.photo import MAX_PHOTO_BYTES
from vetcare.contexts.identity.domain.permissions import Role

JPG = b"\xff\xd8\xff\xe0" + b"foto de luna en jpg"
PNG = b"\x89PNG\r\n\x1a\n" + b"foto de luna en png"


async def subir(
    api: Api, token: str, pet_id: str, contenido: bytes, nombre: str = "foto.jpg"
) -> Any:
    return await api.client.put(
        f"/api/v1/pets/{pet_id}/photo",
        files={"file": (nombre, contenido, "image/jpeg")},
        headers=auth(token),
    )


def archivos(api: Api) -> list[str]:
    root: Path = api.app.state.settings.storage_local_dir
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file())


async def test_subir_ver_reemplazar_y_quitar_la_foto(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)
    assert luna["photo_url"] is None

    r = await subir(api, rec, luna["id"], JPG, nombre="Luna de Ana Pérez.jpg")
    assert r.status_code == 200, r.text
    url = r.json()["photo_url"]

    # La clave solo lleva identificadores: ni el nombre de la mascota ni el del archivo subido.
    (clave,) = archivos(api)
    assert re.fullmatch(rf"pets/{luna['id']}/[0-9a-f-]{{36}}\.jpg", clave)
    assert f"/api/v1/files/{clave}?" in url

    # La URL firmada se abre sin token (así la usa una etiqueta <img>) y sirve la imagen.
    foto = await api.client.get(url)
    assert foto.status_code == 200
    assert foto.content == JPG
    assert foto.headers["content-type"] == "image/jpeg"
    assert foto.headers["content-disposition"] == "inline"
    assert foto.headers["x-content-type-options"] == "nosniff"

    # Reemplazar borra el archivo anterior; su URL deja de servir.
    r = await subir(api, rec, luna["id"], PNG)
    assert r.status_code == 200
    (nueva,) = archivos(api)
    assert nueva.endswith(".png") and nueva != clave
    assert (await api.client.get(url)).status_code == 403
    assert (await api.client.get(r.json()["photo_url"])).content == PNG

    r = await api.client.delete(f"/api/v1/pets/{luna['id']}/photo", headers=auth(rec))
    assert r.status_code == 200 and r.json()["photo_url"] is None
    assert archivos(api) == []
    # Quitar una foto que ya no está no es un error.
    r = await api.client.delete(f"/api/v1/pets/{luna['id']}/photo", headers=auth(rec))
    assert r.status_code == 200


async def test_la_subida_valida_tipo_y_tamano(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)

    # Un PDF con nombre y tipo de imagen: manda el contenido.
    r = await subir(api, rec, luna["id"], b"%PDF-1.7 no soy una foto")
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "file", "message": "Usa una imagen JPG, PNG o WebP."}]

    r = await subir(api, rec, luna["id"], JPG + b"\x00" * MAX_PHOTO_BYTES)
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "file", "message": "La imagen pesa más de 5 MB."}]

    r = await subir(api, rec, luna["id"], b"")
    assert r.status_code == 422

    r = await api.client.put(f"/api/v1/pets/{luna['id']}/photo", headers=auth(rec))
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "file"

    assert archivos(api) == []
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(rec))
    assert r.json()["photo_url"] is None


async def test_solo_quien_puede_ver_la_mascota_recibe_la_url(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    beto = await create(api, rec, "/api/v1/clients", BETO)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)
    toby = await create(api, rec, f"/api/v1/clients/{beto['id']}/pets", LUNA | {"name": "Toby"})
    token_ana = await client_session(api, rec, ana["id"], "ana@example.test")
    token_beto = await client_session(api, rec, beto["id"], "beto@example.test")
    assert (await subir(api, rec, luna["id"], JPG)).status_code == 200
    assert (await subir(api, rec, toby["id"], PNG)).status_code == 200

    # Sin sesión no hay perfil ni URL.
    assert (await api.client.get(f"/api/v1/pets/{luna['id']}")).status_code == 401
    assert (await api.client.put(f"/api/v1/pets/{luna['id']}/photo")).status_code == 401

    # El asistente ve la foto, pero no la cambia ni la quita (no tiene pets:manage).
    asistente = t[Role.ASSISTANT]
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(asistente))
    assert (await api.client.get(r.json()["photo_url"])).content == JPG
    assert (await subir(api, asistente, luna["id"], PNG)).status_code == 403
    r = await api.client.delete(f"/api/v1/pets/{luna['id']}/photo", headers=auth(asistente))
    assert r.status_code == 403

    # La dueña recibe la URL de su mascota, también en "mis mascotas"; no la de una ajena.
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_ana))
    assert (await api.client.get(r.json()["photo_url"])).content == JPG
    mias = await api.client.get("/api/v1/me/pets", headers=auth(token_ana))
    assert [bool(p["photo_url"]) for p in mias.json()] == [True]
    assert (
        await api.client.get(f"/api/v1/pets/{toby['id']}", headers=auth(token_ana))
    ).status_code == 404
    # Un cliente no toca la foto de una mascota ajena (la del dueño, en test_client_self_service).
    assert (await subir(api, token_ana, toby["id"], PNG)).status_code == 404

    # Un responsable autorizado la ve mientras dure su tutela.
    await create(
        api,
        rec,
        f"/api/v1/pets/{luna['id']}/guardians",
        {"client_id": beto["id"], "kind": "authorized", "permissions": SOLO_RECOGER},
    )
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_beto))
    assert r.json()["photo_url"]
    await api.client.delete(f"/api/v1/pets/{luna['id']}/guardians/{beto['id']}", headers=auth(rec))
    assert (
        await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_beto))
    ).status_code == 404

    # Mascota inexistente.
    r = await subir(api, rec, "0192f0a4-0000-7000-8000-00000000dead", JPG)
    assert r.status_code == 404


async def test_una_url_alterada_o_vencida_no_sirve(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)
    toby = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA | {"name": "Toby"})
    url_luna: str = (await subir(api, rec, luna["id"], JPG)).json()["photo_url"]
    url_toby: str = (await subir(api, rec, toby["id"], PNG)).json()["photo_url"]
    base_luna, query_luna = url_luna.split("?")
    base_toby, _ = url_toby.split("?")

    # La firma de una foto no abre otra.
    r = await api.client.get(f"{base_toby}?{query_luna}")
    assert r.status_code == 403
    assert r.headers["content-type"] == "application/problem+json"

    # Alargar el vencimiento invalida la firma; uno ya pasado tampoco sirve.
    expira = query_luna.split("expires=")[1].split("&")[0]
    assert (
        await api.client.get(url_luna.replace(f"expires={expira}", f"expires={int(expira) + 600}"))
    ).status_code == 403
    assert (
        await api.client.get(url_luna.replace(f"expires={expira}", "expires=1700000000"))
    ).status_code == 403

    # Sin firma, o intentando salir de la carpeta.
    assert (await api.client.get(base_luna)).status_code == 422
    r = await api.client.get(f"https://test/api/v1/files/..%2F..%2Fetc%2Fpasswd?{query_luna}")
    assert r.status_code in {403, 404}

    # Vigente: cinco minutos desde que se pidió.
    assert (await api.client.get(url_luna)).status_code == 200
