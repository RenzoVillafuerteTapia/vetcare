import pytest
from identity_fakes import Entorno, crear_entorno

from vetcare.contexts.identity.application.services import RequestContext
from vetcare.contexts.identity.domain.audit import AuditAction
from vetcare.contexts.identity.domain.model import UserAccount, UserStatus
from vetcare.contexts.identity.domain.permissions import Role
from vetcare.contexts.identity.domain.tokens import InvalidTokenError, RevocationReason
from vetcare.shared_kernel.errors import (
    AuthenticationError,
    ConflictError,
    PermissionDeniedError,
    ValidationFailedError,
)

CTX = RequestContext(ip_address="203.0.113.10")
CLAVE = "un gato duerme en la ventana"


@pytest.fixture
def e() -> Entorno:
    return crear_entorno()


async def admin_activo(e: Entorno) -> UserAccount:
    admin = await e.servicio.invite_first_admin("admin@example.test", "Admin Inicial")
    await e.servicio.accept_invitation(e.buzon.enviados[-1].token, CLAVE, CTX)
    return e.almacen.users[admin.id]


async def usuario_activo(
    e: Entorno, email: str = "ana@example.test", roles: frozenset[Role] = frozenset({Role.CLIENT})
) -> UserAccount:
    admin = await admin_activo(e) if not e.almacen.users else _un_admin(e)
    user = await e.servicio.invite(admin, email, "Ana Pérez", roles, CTX)
    await e.servicio.accept_invitation(e.buzon.enviados[-1].token, CLAVE, CTX)
    return e.almacen.users[user.id]


def _un_admin(e: Entorno) -> UserAccount:
    return next(u for u in e.almacen.users.values() if Role.ADMIN in u.roles)


def acciones(e: Entorno) -> list[AuditAction]:
    return [a.action for a in e.almacen.audit]


# --- Arranque e invitaciones -------------------------------------------------------------


async def test_el_primer_admin_solo_se_crea_en_una_instalacion_vacia(e: Entorno) -> None:
    await e.servicio.invite_first_admin("admin@example.test", "Admin Inicial")

    with pytest.raises(ConflictError):
        await e.servicio.invite_first_admin("otro@example.test", "Otro Admin")


async def test_la_invitacion_envia_un_enlace_y_activa_la_cuenta(e: Entorno) -> None:
    admin = await admin_activo(e)

    user = await e.servicio.invite(
        admin, "Vet@Example.test", "Dra. Rosa Díaz", frozenset({Role.VETERINARIAN}), CTX
    )
    correo = e.buzon.enviados[-1]
    assert str(correo.to) == "vet@example.test"
    assert "https://web.example.test/activar-cuenta#token=" in correo.body

    await e.servicio.accept_invitation(correo.token, CLAVE, CTX)

    guardado = e.almacen.users[user.id]
    assert guardado.status is UserStatus.ACTIVE
    assert guardado.password_hash != CLAVE
    assert AuditAction.USER_INVITED in acciones(e)
    assert AuditAction.USER_ACTIVATED in acciones(e)


async def test_solo_quien_gestiona_usuarios_puede_invitar(e: Entorno) -> None:
    recepcion = await usuario_activo(e, roles=frozenset({Role.RECEPTIONIST}))

    with pytest.raises(PermissionDeniedError):
        await e.servicio.invite(
            recepcion, "x@example.test", "Alguien Más", frozenset({Role.ADMIN}), CTX
        )


async def test_no_se_invita_dos_veces_el_mismo_correo(e: Entorno) -> None:
    admin = await admin_activo(e)

    with pytest.raises(ConflictError) as error:
        await e.servicio.invite(
            admin, "ADMIN@example.test", "Duplicado", frozenset({Role.ADMIN}), CTX
        )
    assert error.value.code == "email_taken"


async def test_la_invitacion_se_usa_una_sola_vez(e: Entorno) -> None:
    await e.servicio.invite_first_admin("admin@example.test", "Admin Inicial")
    token = e.buzon.enviados[-1].token
    await e.servicio.accept_invitation(token, CLAVE, CTX)

    with pytest.raises(InvalidTokenError):
        await e.servicio.accept_invitation(token, CLAVE, CTX)


async def test_reenviar_invalida_el_enlace_anterior(e: Entorno) -> None:
    admin = await admin_activo(e)
    user = await e.servicio.invite(
        admin, "b@example.test", "Beto Ruiz", frozenset({Role.CLIENT}), CTX
    )
    primero = e.buzon.enviados[-1].token

    await e.servicio.resend_invitation(admin, user.id, CTX)

    with pytest.raises(InvalidTokenError):
        await e.servicio.accept_invitation(primero, CLAVE, CTX)
    await e.servicio.accept_invitation(e.buzon.enviados[-1].token, CLAVE, CTX)


async def test_la_invitacion_vence_a_los_siete_dias(e: Entorno) -> None:
    await e.servicio.invite_first_admin("admin@example.test", "Admin Inicial")
    e.reloj.avanzar(days=7, seconds=1)

    with pytest.raises(InvalidTokenError):
        await e.servicio.accept_invitation(e.buzon.enviados[-1].token, CLAVE, CTX)


async def test_una_contrasena_debil_no_consume_la_invitacion(e: Entorno) -> None:
    await e.servicio.invite_first_admin("admin@example.test", "Admin Inicial")
    token = e.buzon.enviados[-1].token

    with pytest.raises(ValidationFailedError):
        await e.servicio.accept_invitation(token, "corta", CTX)
    await e.servicio.accept_invitation(token, CLAVE, CTX)


async def test_si_falla_el_correo_la_invitacion_queda_registrada(e: Entorno) -> None:
    admin = await admin_activo(e)
    e.buzon.fallar = True

    user = await e.servicio.invite(
        admin, "c@example.test", "Carla Soto", frozenset({Role.CLIENT}), CTX
    )

    assert e.almacen.users[user.id].status is UserStatus.INVITED


# --- Inicio de sesión --------------------------------------------------------------------


async def test_login_correcto_entrega_tokens_y_audita(e: Entorno) -> None:
    user = await usuario_activo(e)

    tokens = await e.servicio.login("ANA@example.test", CLAVE, CTX)

    assert tokens.access.token == f"access:{user.id}"
    assert tokens.refresh_token
    assert acciones(e)[-1] is AuditAction.LOGIN_SUCCEEDED
    assert e.almacen.audit[-1].ip_address == "203.0.113.10"


@pytest.mark.parametrize(
    ("email", "clave"),
    [
        ("ana@example.test", "otra clave cualquiera"),
        ("nadie@example.test", CLAVE),
        ("no-es-correo", CLAVE),
    ],
)
async def test_login_fallido_usa_siempre_el_mismo_mensaje(
    e: Entorno, email: str, clave: str
) -> None:
    await usuario_activo(e)

    with pytest.raises(AuthenticationError) as error:
        await e.servicio.login(email, clave, CTX)
    assert error.value.message == "Correo o contraseña incorrectos."


async def test_una_cuenta_invitada_no_puede_ingresar(e: Entorno) -> None:
    admin = await admin_activo(e)
    await e.servicio.invite(admin, "d@example.test", "Diego Ramos", frozenset({Role.CLIENT}), CTX)

    with pytest.raises(AuthenticationError):
        await e.servicio.login("d@example.test", CLAVE, CTX)


async def test_cinco_fallos_bloquean_aunque_luego_use_la_clave_correcta(e: Entorno) -> None:
    await usuario_activo(e)
    for _ in range(5):
        with pytest.raises(AuthenticationError):
            await e.servicio.login("ana@example.test", "clave equivocada 123", CTX)

    with pytest.raises(AuthenticationError):
        await e.servicio.login("ana@example.test", CLAVE, CTX)
    assert AuditAction.ACCOUNT_LOCKED in acciones(e)

    e.reloj.avanzar(minutes=15)
    await e.servicio.login("ana@example.test", CLAVE, CTX)


async def test_login_actualiza_un_hash_antiguo(e: Entorno) -> None:
    user = await usuario_activo(e)
    e.almacen.users[user.id].password_hash = f"v1:{CLAVE}"

    await e.servicio.login("ana@example.test", CLAVE, CTX)

    assert e.almacen.users[user.id].password_hash == f"v2:{CLAVE}"


# --- Refresh y cierre de sesión ----------------------------------------------------------


async def test_refresh_rota_el_token(e: Entorno) -> None:
    await usuario_activo(e)
    inicial = await e.servicio.login("ana@example.test", CLAVE, CTX)

    rotado = await e.servicio.refresh(inicial.refresh_token, CTX)

    assert rotado.refresh_token != inicial.refresh_token
    await e.servicio.refresh(rotado.refresh_token, CTX)


async def test_reutilizar_un_refresh_rotado_revoca_la_sesion(e: Entorno) -> None:
    await usuario_activo(e)
    inicial = await e.servicio.login("ana@example.test", CLAVE, CTX)
    legitimo = await e.servicio.refresh(inicial.refresh_token, CTX)

    with pytest.raises(AuthenticationError):
        await e.servicio.refresh(inicial.refresh_token, CTX)

    with pytest.raises(AuthenticationError):
        await e.servicio.refresh(legitimo.refresh_token, CTX)
    (familia,) = e.almacen.families.values()
    assert familia.revocation_reason is RevocationReason.REUSE_DETECTED
    assert AuditAction.REFRESH_REUSE_DETECTED in acciones(e)


async def test_refresh_desconocido_es_rechazado(e: Entorno) -> None:
    with pytest.raises(AuthenticationError):
        await e.servicio.refresh("inventado", CTX)


async def test_logout_revoca_el_refresh(e: Entorno) -> None:
    await usuario_activo(e)
    tokens = await e.servicio.login("ana@example.test", CLAVE, CTX)

    await e.servicio.logout(tokens.refresh_token, CTX)

    with pytest.raises(AuthenticationError):
        await e.servicio.refresh(tokens.refresh_token, CTX)
    assert acciones(e)[-1] is AuditAction.LOGOUT


async def test_una_cuenta_deshabilitada_pierde_el_acceso_inmediatamente(e: Entorno) -> None:
    user = await usuario_activo(e)
    tokens = await e.servicio.login("ana@example.test", CLAVE, CTX)
    e.almacen.users[user.id].disable()

    with pytest.raises(AuthenticationError):
        await e.servicio.authenticate(tokens.access.token)
    with pytest.raises(AuthenticationError):
        await e.servicio.refresh(tokens.refresh_token, CTX)


# --- Recuperación de acceso --------------------------------------------------------------


async def test_recuperar_acceso_cambia_la_clave_y_cierra_las_sesiones(e: Entorno) -> None:
    await usuario_activo(e)
    sesion = await e.servicio.login("ana@example.test", CLAVE, CTX)

    await e.servicio.request_password_reset("ana@example.test", CTX)
    correo = e.buzon.enviados[-1]
    assert "restablecer-contrasena#token=" in correo.body
    nueva = "otra frase larga y segura"
    await e.servicio.reset_password(correo.token, nueva, CTX)

    with pytest.raises(AuthenticationError):
        await e.servicio.refresh(sesion.refresh_token, CTX)
    with pytest.raises(AuthenticationError):
        await e.servicio.login("ana@example.test", CLAVE, CTX)
    await e.servicio.login("ana@example.test", nueva, CTX)


async def test_recuperar_acceso_de_un_correo_inexistente_no_envia_nada(e: Entorno) -> None:
    await admin_activo(e)
    enviados = len(e.buzon.enviados)

    await e.servicio.request_password_reset("nadie@example.test", CTX)
    await e.servicio.request_password_reset("no es un correo", CTX)

    assert len(e.buzon.enviados) == enviados


async def test_el_enlace_de_recuperacion_vence_en_treinta_minutos(e: Entorno) -> None:
    await usuario_activo(e)
    await e.servicio.request_password_reset("ana@example.test", CTX)
    e.reloj.avanzar(minutes=31)

    with pytest.raises(InvalidTokenError):
        await e.servicio.reset_password(
            e.buzon.enviados[-1].token, "otra frase larga y segura", CTX
        )


async def test_un_token_de_invitacion_no_sirve_para_recuperar_la_clave(e: Entorno) -> None:
    admin = await admin_activo(e)
    await e.servicio.invite(admin, "f@example.test", "Fabio León", frozenset({Role.CLIENT}), CTX)

    with pytest.raises(InvalidTokenError):
        await e.servicio.reset_password(e.buzon.enviados[-1].token, CLAVE, CTX)


async def test_la_auditoria_no_guarda_secretos(e: Entorno) -> None:
    await usuario_activo(e)
    tokens = await e.servicio.login("ana@example.test", CLAVE, CTX)
    await e.servicio.request_password_reset("ana@example.test", CTX)

    volcado = repr(e.almacen.audit)
    assert CLAVE not in volcado
    assert tokens.refresh_token not in volcado
    assert e.buzon.enviados[-1].token not in volcado


async def test_la_recepcion_invita_clientes_pero_no_personal(e: Entorno) -> None:
    recepcion = await usuario_activo(e, "rec@example.test", frozenset({Role.RECEPTIONIST}))

    cliente = await e.servicio.invite_client(recepcion, "nuevo@example.test", "Nuevo Cliente", CTX)

    assert cliente.roles == frozenset({Role.CLIENT})
    with pytest.raises(PermissionDeniedError):
        await e.servicio.invite(recepcion, "x@example.test", "Otro", frozenset({Role.CLIENT}), CTX)
    asistente = await usuario_activo(e, "asis@example.test", frozenset({Role.ASSISTANT}))
    with pytest.raises(PermissionDeniedError):
        await e.servicio.invite_client(asistente, "y@example.test", "Y Cliente", CTX)
