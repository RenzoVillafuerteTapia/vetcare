"""Flujos de Identity & Access de punta a punta: HTTP → casos de uso → MySQL."""

import asyncio

import pytest
from integration_support import CLAVE, Api, _api, auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine

from vetcare.contexts.identity.domain.permissions import Role
from vetcare.contexts.identity.infrastructure.tables import audit_log, users
from vetcare.platform.outbox import outbox_events

# --- Recorrido completo ------------------------------------------------------------------


async def test_recorrido_web_invitacion_login_cookie_me_y_logout(api: Api) -> None:
    await api.servicio.invite_first_admin("admin@example.test", "Admin Inicial")
    token = api.buzon.ultimo_token("admin@example.test")

    r = await api.client.post(
        "/api/v1/auth/invitations/accept", json={"token": token, "password": CLAVE}
    )
    assert r.status_code == 204

    r = await api.client.post(
        "/api/v1/auth/login",
        json={"email": "Admin@Example.test", "password": CLAVE, "client": "web"},
    )
    assert r.status_code == 200
    assert r.json()["refresh_token"] is None
    assert r.headers["cache-control"] == "no-store"
    cookie = r.headers["set-cookie"]
    assert "vetcare_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Path=/api/v1/auth" in cookie
    access = r.json()["access_token"]

    r = await api.client.get("/api/v1/auth/me", headers=auth(access))
    assert r.status_code == 200
    assert r.json()["email"] == "admin@example.test"
    assert r.json()["roles"] == ["admin"]
    assert "users:manage" in r.json()["permissions"]
    assert "tracking:authorize_discharge" not in r.json()["permissions"]

    r = await api.client.post("/api/v1/auth/refresh", json={"client": "web"})
    assert r.status_code == 200
    assert r.json()["access_token"]

    r = await api.client.post("/api/v1/auth/logout", json={})
    assert r.status_code == 204
    r = await api.client.post("/api/v1/auth/refresh", json={"client": "web"})
    assert r.status_code == 401


async def test_recorrido_movil_con_rotacion_y_deteccion_de_reutilizacion(api: Api) -> None:
    await api.usuario("admin@example.test", frozenset({Role.ADMIN}))
    r = await api.client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.test", "password": CLAVE, "client": "mobile"},
    )
    primero = r.json()["refresh_token"]
    assert primero

    r = await api.client.post(
        "/api/v1/auth/refresh", json={"client": "mobile", "refresh_token": primero}
    )
    segundo = r.json()["refresh_token"]
    assert r.status_code == 200 and segundo != primero

    robado = await api.client.post(
        "/api/v1/auth/refresh", json={"client": "mobile", "refresh_token": primero}
    )
    legitimo = await api.client.post(
        "/api/v1/auth/refresh", json={"client": "mobile", "refresh_token": segundo}
    )

    assert robado.status_code == 401
    assert legitimo.status_code == 401
    acciones = await _acciones(api)
    assert "auth.refresh_reuse_detected" in acciones


async def test_dos_refresh_simultaneos_con_el_mismo_token_solo_uno_gana(api: Api) -> None:
    await api.usuario("admin@example.test", frozenset({Role.ADMIN}))
    r = await api.client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.test", "password": CLAVE, "client": "mobile"},
    )
    refresh = r.json()["refresh_token"]

    respuestas = await asyncio.gather(
        *(
            api.client.post(
                "/api/v1/auth/refresh", json={"client": "mobile", "refresh_token": refresh}
            )
            for _ in range(2)
        )
    )

    assert sorted(r.status_code for r in respuestas) == [200, 401]


async def test_dos_invitaciones_simultaneas_al_mismo_correo(api: Api) -> None:
    admin = await api.usuario("admin@example.test", frozenset({Role.ADMIN}))
    cuerpo = {"email": "doble@example.test", "full_name": "Doble Envío", "roles": ["client"]}

    respuestas = await asyncio.gather(
        *(api.client.post("/api/v1/users", json=cuerpo, headers=auth(admin)) for _ in range(2))
    )

    assert sorted(r.status_code for r in respuestas) == [201, 409]


# --- Autorización ------------------------------------------------------------------------

ROLES = {
    "admin@example.test": Role.ADMIN,
    "vet@example.test": Role.VETERINARIAN,
    "asistente@example.test": Role.ASSISTANT,
    "recepcion@example.test": Role.RECEPTIONIST,
    "cliente@example.test": Role.CLIENT,
}


async def test_matriz_de_permisos_de_gestion_de_usuarios(api: Api) -> None:
    tokens = {email: await api.usuario(email, frozenset({rol})) for email, rol in ROLES.items()}
    cuerpo = {"full_name": "Nueva Persona", "roles": ["client"]}

    resultados = {}
    for i, (email, token) in enumerate(tokens.items()):
        r = await api.client.post(
            "/api/v1/users", json=cuerpo | {"email": f"nueva{i}@example.test"}, headers=auth(token)
        )
        resultados[ROLES[email]] = r.status_code

    assert resultados == {
        Role.ADMIN: 201,
        Role.VETERINARIAN: 403,
        Role.ASSISTANT: 403,
        Role.RECEPTIONIST: 403,
        Role.CLIENT: 403,
    }
    for email, token in tokens.items():
        r = await api.client.get("/api/v1/auth/me", headers=auth(token))
        assert r.status_code == 200
        assert r.json()["roles"] == [ROLES[email].value]


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer inventado"}, {"Authorization": "Basic YWRtaW46YWRtaW4="}],
    ids=["sin-token", "token-falso", "otro-esquema"],
)
async def test_sin_credenciales_validas_responde_401(api: Api, headers: dict[str, str]) -> None:
    for method, path in [("GET", "/api/v1/auth/me"), ("POST", "/api/v1/users")]:
        r = await api.client.request(method, path, headers=headers, json={})
        assert r.status_code == 401, (method, path)
        assert r.headers["www-authenticate"] == "Bearer"
        assert r.headers["content-type"] == "application/problem+json"


async def test_un_token_firmado_con_otra_clave_es_rechazado(api: Api) -> None:
    import jwt

    falso = jwt.encode(
        {"iss": "vetcare-api", "sub": "x", "typ": "access", "iat": 1, "exp": 4102444800},
        "otra-clave-cualquiera-de-32-caracteres!!",
        algorithm="HS256",
    )
    r = await api.client.get("/api/v1/auth/me", headers=auth(falso))
    assert r.status_code == 401


# --- Errores, auditoría y privacidad ------------------------------------------------------


async def test_login_fallido_no_revela_si_el_correo_existe(api: Api) -> None:
    await api.usuario("admin@example.test", frozenset({Role.ADMIN}))

    existente = await api.client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.test", "password": "otra clave cualquiera", "client": "web"},
    )
    inexistente = await api.client.post(
        "/api/v1/auth/login",
        json={"email": "nadie@example.test", "password": "otra clave cualquiera", "client": "web"},
    )

    assert existente.status_code == inexistente.status_code == 401
    assert existente.json() == inexistente.json()


async def test_recuperar_acceso_responde_igual_exista_o_no(api: Api) -> None:
    await api.usuario("admin@example.test", frozenset({Role.ADMIN}))

    a = await api.client.post("/api/v1/auth/password-reset", json={"email": "admin@example.test"})
    b = await api.client.post("/api/v1/auth/password-reset", json={"email": "nadie@example.test"})

    assert a.status_code == b.status_code == 202
    assert a.content == b.content


async def test_contrasena_debil_devuelve_errores_por_campo(api: Api) -> None:
    await api.servicio.invite_first_admin("admin@example.test", "Admin Inicial")

    r = await api.client.post(
        "/api/v1/auth/invitations/accept",
        json={"token": api.buzon.ultimo_token("admin@example.test"), "password": "corta"},
    )

    assert r.status_code == 422
    assert r.json()["errors"][0]["field"] == "password"


async def test_la_auditoria_y_el_outbox_no_guardan_secretos(api: Api, engine: AsyncEngine) -> None:
    await api.usuario("admin@example.test", frozenset({Role.ADMIN}))
    await api.client.post("/api/v1/auth/password-reset", json={"email": "admin@example.test"})
    token = api.buzon.ultimo_token("admin@example.test")

    async with engine.connect() as connection:
        filas = [
            *(await connection.execute(select(audit_log))).mappings(),
            *(await connection.execute(select(outbox_events))).mappings(),
        ]
        hash_guardado = await connection.scalar(select(users.c.password_hash))

    volcado = repr(filas)
    assert CLAVE not in volcado
    assert token not in volcado
    assert hash_guardado is not None and hash_guardado.startswith("$argon2id$")
    assert hash_guardado not in volcado
    acciones = {f["action"] for f in filas if "action" in f}
    assert {"users.invited", "users.activated", "auth.login_succeeded"} <= acciones
    assert all(f["ip_address"] in (None, "198.51.100.7") for f in filas if "action" in f)


async def _acciones(api: Api) -> list[str]:
    async with api.app.state.engine.connect() as connection:
        return list((await connection.execute(select(audit_log.c.action))).scalars())


# --- Límite de solicitudes ---------------------------------------------------------------


async def test_login_limita_las_solicitudes_por_ip(
    migrated_database: str, engine: AsyncEngine
) -> None:
    async for api in _api(migrated_database, rate_limits=True):
        cuerpo = {"email": "nadie@example.test", "password": "x", "client": "web"}
        codigos = [
            (await api.client.post("/api/v1/auth/login", json=cuerpo)).status_code
            for _ in range(11)
        ]
        bloqueada = await api.client.post("/api/v1/auth/login", json=cuerpo)

        assert codigos[:10] == [401] * 10
        assert codigos[10] == 429
        assert int(bloqueada.headers["retry-after"]) >= 1
        assert bloqueada.json()["code"] == "http_429"
