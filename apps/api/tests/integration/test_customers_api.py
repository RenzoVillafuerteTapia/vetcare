"""Customers & Pets de punta a punta: HTTP → casos de uso → MySQL."""

import asyncio
from typing import Any

from integration_support import CLAVE, Api, auth

from vetcare.contexts.identity.application.services import RequestContext
from vetcare.contexts.identity.domain.permissions import Role

ANA: dict[str, Any] = {
    "full_name": "Ana Pérez",
    "document_type": "dni",
    "document_number": "12345678",
    "phone": "987 654 321",
    "email": "ana@example.test",
}
BETO: dict[str, Any] = {
    "full_name": "Beto Ruiz",
    "document_type": "ce",
    "document_number": "ab1234567",
    "phone": "912345678",
    "email": "beto@example.test",
}
LUNA: dict[str, Any] = {
    "name": "Luna",
    "species": "dog",
    "sex": "female",
    "breed": "Mestiza",
    "birth_date": "2022-03-01",
    "birth_date_approximate": True,
    "allergies": "Penicilina",
    "notes": "Se pone nerviosa con el secador.",
}
SOLO_RECOGER = {"can_pickup": True, "can_book": False, "can_view_clinical": False}


async def staff(api: Api) -> dict[Role, str]:
    roles = {
        Role.ADMIN: "admin@example.test",
        Role.RECEPTIONIST: "recepcion@example.test",
        Role.ASSISTANT: "asistente@example.test",
    }
    return {rol: await api.usuario(email, frozenset({rol})) for rol, email in roles.items()}


async def client_session(api: Api, recepcion: str, client_id: str, email: str) -> str:
    """Invita al cliente desde su ficha, activa la cuenta y devuelve su access token."""
    r = await api.client.post(f"/api/v1/clients/{client_id}/invitation", headers=auth(recepcion))
    assert r.status_code == 200, r.text
    await api.servicio.accept_invitation(api.buzon.ultimo_token(email), CLAVE, RequestContext())
    return await api.login(email)


async def create(api: Api, token: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
    r = await api.client.post(path, json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


# --- Clientes -------------------------------------------------------------------------------


async def test_registro_busqueda_y_unicidad_de_clientes(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]

    ana = await create(api, rec, "/api/v1/clients", ANA)
    await create(api, rec, "/api/v1/clients", BETO)
    assert (ana["phone"], ana["document_number"], ana["has_account"]) == (
        "+51987654321",
        "12345678",
        False,
    )

    r = await api.client.post(
        "/api/v1/clients", json=BETO | {"email": "otro@example.test"}, headers=auth(rec)
    )
    assert r.status_code == 409 and r.json()["code"] == "document_taken"
    r = await api.client.post(
        "/api/v1/clients",
        json=BETO | {"document_number": "XY9999999", "email": "ANA@example.test"},
        headers=auth(rec),
    )
    assert r.status_code == 409 and r.json()["code"] == "email_taken"

    for q, esperado in [
        ("pérez", ["Ana Pérez"]),
        ("AB12", ["Beto Ruiz"]),
        ("912 345", ["Beto Ruiz"]),
    ]:
        r = await api.client.get("/api/v1/clients", params={"q": q}, headers=auth(rec))
        assert [c["full_name"] for c in r.json()["items"]] == esperado, q

    r = await api.client.get(
        "/api/v1/clients", params={"page_size": 1, "page": 2}, headers=auth(rec)
    )
    assert r.json()["total"] == 2 and [c["full_name"] for c in r.json()["items"]] == ["Beto Ruiz"]

    r = await api.client.get("/api/v1/clients", params={"q": "100%_"}, headers=auth(rec))
    assert r.json()["items"] == []


async def test_dos_registros_simultaneos_del_mismo_documento(api: Api) -> None:
    t = await staff(api)
    respuestas = await asyncio.gather(
        *(
            api.client.post(
                "/api/v1/clients",
                json=ANA | {"email": f"ana{i}@example.test"},
                headers=auth(t[Role.RECEPTIONIST]),
            )
            for i in range(2)
        )
    )
    assert sorted(r.status_code for r in respuestas) == [201, 409]


async def test_permisos_de_escritura_por_rol(api: Api) -> None:
    t = await staff(api)
    ana = await create(api, t[Role.RECEPTIONIST], "/api/v1/clients", ANA)
    luna = await create(api, t[Role.RECEPTIONIST], f"/api/v1/clients/{ana['id']}/pets", LUNA)

    # La asistencia ve, pero no registra clientes, mascotas ni responsables.
    asis = auth(t[Role.ASSISTANT])
    assert (await api.client.get(f"/api/v1/pets/{luna['id']}", headers=asis)).status_code == 200
    for method, path, body in [
        ("POST", "/api/v1/clients", BETO),
        ("POST", f"/api/v1/clients/{ana['id']}/pets", LUNA),
        ("POST", f"/api/v1/clients/{ana['id']}/invitation", None),
        (
            "POST",
            f"/api/v1/pets/{luna['id']}/guardians",
            {"client_id": ana["id"], "kind": "authorized", "permissions": SOLO_RECOGER},
        ),
    ]:
        r = await api.client.request(method, path, json=body, headers=asis)
        assert r.status_code == 403, (method, path)

    assert (await api.client.get("/api/v1/clients")).status_code == 401


# --- Mascotas, tutela y aislamiento entre clientes ------------------------------------------


async def test_cada_cliente_ve_solo_sus_mascotas_y_con_lo_que_le_corresponde(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    beto = await create(api, rec, "/api/v1/clients", BETO)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)
    toby = await create(
        api,
        rec,
        f"/api/v1/clients/{beto['id']}/pets",
        {"name": "Toby", "species": "cat", "sex": "male"},
    )
    # Beto puede recoger a Luna, pero no reservar ni ver lo clínico.
    await create(
        api,
        rec,
        f"/api/v1/pets/{luna['id']}/guardians",
        {"client_id": beto["id"], "kind": "authorized", "permissions": SOLO_RECOGER},
    )

    token_ana = await client_session(api, rec, ana["id"], "ana@example.test")
    token_beto = await client_session(api, rec, beto["id"], "beto@example.test")

    # El personal ve todo, incluidas las notas internas.
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(rec))
    assert r.json()["notes"] == LUNA["notes"] and r.json()["allergies"] == "Penicilina"

    # Ana, dueña: ve alergias, no las notas internas.
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_ana))
    assert r.status_code == 200
    assert (r.json()["allergies"], r.json()["notes"]) == ("Penicilina", None)

    # Beto, autorizado sin permiso clínico: ve a Luna sin alergias ni notas.
    r = await api.client.get(f"/api/v1/pets/{luna['id']}", headers=auth(token_beto))
    assert (r.json()["allergies"], r.json()["notes"]) == (None, None)

    # Ana no tiene relación con Toby: 404, igual que una mascota inexistente.
    r = await api.client.get(f"/api/v1/pets/{toby['id']}", headers=auth(token_ana))
    assert r.status_code == 404
    r_inexistente = await api.client.get(
        "/api/v1/pets/0192f0a4-0000-7000-8000-00000000dead", headers=auth(token_ana)
    )
    assert r.json()["code"] == r_inexistente.json()["code"] == "not_found"

    mis_ana = await api.client.get("/api/v1/me/pets", headers=auth(token_ana))
    mis_beto = await api.client.get("/api/v1/me/pets", headers=auth(token_beto))
    assert [p["name"] for p in mis_ana.json()] == ["Luna"]
    assert sorted(p["name"] for p in mis_beto.json()) == ["Luna", "Toby"]

    # Un cliente no lista clientes ni ve fichas ajenas, ni modifica mascotas.
    assert (await api.client.get("/api/v1/clients", headers=auth(token_ana))).status_code == 403
    assert (
        await api.client.get(f"/api/v1/clients/{beto['id']}", headers=auth(token_ana))
    ).status_code == 403
    r = await api.client.put(f"/api/v1/pets/{luna['id']}", json=LUNA, headers=auth(token_ana))
    assert r.status_code == 403


async def test_tutela_revocada_quita_el_acceso_y_siempre_queda_un_dueno(api: Api) -> None:
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
    token_beto = await client_session(api, rec, beto["id"], "beto@example.test")

    r = await api.client.delete(
        f"/api/v1/pets/{luna['id']}/guardians/{ana['id']}", headers=auth(rec)
    )
    assert r.status_code == 409 and r.json()["code"] == "last_owner"

    r = await api.client.put(
        f"/api/v1/pets/{luna['id']}/guardians/{beto['id']}",
        json={"kind": "owner", "permissions": SOLO_RECOGER},
        headers=auth(rec),
    )
    beto_tutela = next(g for g in r.json()["guardians"] if g["client_id"] == beto["id"])
    assert beto_tutela["kind"] == "owner" and beto_tutela["permissions"]["can_book"] is True

    r = await api.client.delete(
        f"/api/v1/pets/{luna['id']}/guardians/{ana['id']}", headers=auth(rec)
    )
    assert [g["full_name"] for g in r.json()["guardians"]] == ["Beto Ruiz"]

    r = await api.client.delete(
        f"/api/v1/pets/{luna['id']}/guardians/{beto['id']}", headers=auth(rec)
    )
    assert r.status_code == 409

    # Beto, ahora único dueño, sigue viendo a Luna entre sus mascotas.
    mis = await api.client.get("/api/v1/me/pets", headers=auth(token_beto))
    assert [p["name"] for p in mis.json()] == ["Luna"]


async def test_perfil_peso_y_estado_de_la_mascota(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    ana = await create(api, rec, "/api/v1/clients", ANA)
    luna = await create(api, rec, f"/api/v1/clients/{ana['id']}/pets", LUNA)

    r = await api.client.post(
        f"/api/v1/pets/{luna['id']}/weights", json={"kilograms": "12.40"}, headers=auth(rec)
    )
    assert r.status_code == 201 and r.json()["weights"][0]["kilograms"] == "12.40"
    r = await api.client.post(
        f"/api/v1/pets/{luna['id']}/weights", json={"kilograms": "0"}, headers=auth(rec)
    )
    assert r.status_code == 422

    r = await api.client.put(
        f"/api/v1/pets/{luna['id']}", json=LUNA | {"birth_date": "2099-01-01"}, headers=auth(rec)
    )
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "birth_date"

    r = await api.client.patch(
        f"/api/v1/pets/{luna['id']}/status", json={"status": "deceased"}, headers=auth(rec)
    )
    assert r.json()["status"] == "deceased"

    r = await api.client.get(f"/api/v1/clients/{ana['id']}/pets", headers=auth(t[Role.ASSISTANT]))
    assert [p["name"] for p in r.json()] == ["Luna"]


# --- Invitación a la app --------------------------------------------------------------------


async def test_invitar_al_cliente_a_la_app(api: Api) -> None:
    t = await staff(api)
    rec = t[Role.RECEPTIONIST]
    sin_correo = await create(api, rec, "/api/v1/clients", ANA | {"email": None})

    r = await api.client.post(f"/api/v1/clients/{sin_correo['id']}/invitation", headers=auth(rec))
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "email"

    beto = await create(api, rec, "/api/v1/clients", BETO)
    token = await client_session(api, rec, beto["id"], "beto@example.test")

    r = await api.client.get("/api/v1/auth/me", headers=auth(token))
    assert r.json()["roles"] == ["client"]
    r = await api.client.get(f"/api/v1/clients/{beto['id']}", headers=auth(rec))
    assert r.json()["has_account"] is True

    r = await api.client.post(f"/api/v1/clients/{beto['id']}/invitation", headers=auth(rec))
    assert r.status_code == 409 and r.json()["code"] == "account_already_linked"
    r = await api.client.put(
        f"/api/v1/clients/{beto['id']}",
        json=BETO | {"email": "nuevo@example.test"},
        headers=auth(rec),
    )
    assert r.status_code == 409 and r.json()["code"] == "email_locked_by_account"
