from datetime import UTC, datetime, timedelta

import pytest

from vetcare.contexts.identity.domain.model import (
    Email,
    LockoutPolicy,
    UserAccount,
    UserActivated,
    UserInvited,
    UserLockedOut,
    UserStatus,
)
from vetcare.contexts.identity.domain.password_policy import validate_password
from vetcare.contexts.identity.domain.permissions import (
    ROLE_PERMISSIONS,
    Permission,
    Role,
    permissions_for,
)
from vetcare.contexts.identity.domain.tokens import (
    InvalidTokenError,
    OneTimeToken,
    RefreshTokenFamily,
    RefreshTokenReuseDetected,
    RevocationReason,
    TokenPurpose,
)
from vetcare.shared_kernel.errors import ConflictError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id

AHORA = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)


def invitado(roles: frozenset[Role] = frozenset({Role.RECEPTIONIST})) -> UserAccount:
    return UserAccount.invite(
        id=new_id(), email=Email("ana@example.test"), full_name="Ana Pérez", roles=roles, now=AHORA
    )


def activo() -> UserAccount:
    user = invitado()
    user.activate("hash", AHORA)
    user.pull_events()
    return user


# --- Email -------------------------------------------------------------------------------


def test_el_correo_se_normaliza_en_minusculas() -> None:
    assert Email("  Ana.Perez@Example.TEST ").value == "ana.perez@example.test"


@pytest.mark.parametrize("valor", ["", "ana", "ana@", "@example.test", "ana @x.test", "a@b"])
def test_correos_invalidos(valor: str) -> None:
    with pytest.raises(ValidationFailedError):
        Email(valor)


# --- Permisos ------------------------------------------------------------------------------


def test_cada_rol_tiene_permisos_definidos() -> None:
    assert set(ROLE_PERMISSIONS) == set(Role)


def test_el_administrador_no_tiene_permisos_clinicos() -> None:
    assert Permission.TRACKING_AUTHORIZE_DISCHARGE not in ROLE_PERMISSIONS[Role.ADMIN]


def test_solo_el_veterinario_autoriza_altas() -> None:
    con_permiso = {
        r for r, ps in ROLE_PERMISSIONS.items() if Permission.TRACKING_AUTHORIZE_DISCHARGE in ps
    }
    assert con_permiso == {Role.VETERINARIAN}


def test_el_cliente_solo_tiene_permisos_sobre_lo_propio() -> None:
    assert all(p.value.startswith("own:") for p in ROLE_PERMISSIONS[Role.CLIENT])


def test_los_permisos_de_varios_roles_se_suman() -> None:
    combinados = permissions_for(frozenset({Role.ASSISTANT, Role.RECEPTIONIST}))
    assert Permission.TRACKING_ADVANCE in combinados
    assert Permission.APPOINTMENTS_MANAGE in combinados


# --- Cuenta ------------------------------------------------------------------------------


def test_invitar_deja_la_cuenta_pendiente_y_registra_el_evento() -> None:
    user = invitado()

    assert user.status is UserStatus.INVITED
    assert user.password_hash is None
    assert [type(e) for e in user.pull_events()] == [UserInvited]


def test_una_cuenta_invitada_no_tiene_permisos_efectivos() -> None:
    assert not invitado().has_permission(Permission.PETS_READ)


def test_no_se_mezcla_el_rol_cliente_con_roles_del_personal() -> None:
    with pytest.raises(ValidationFailedError) as error:
        invitado(frozenset({Role.CLIENT, Role.ADMIN}))
    assert error.value.errors[0].field == "roles"


def test_invitar_sin_roles_ni_nombre_lista_ambos_errores() -> None:
    with pytest.raises(ValidationFailedError) as error:
        UserAccount.invite(
            id=new_id(), email=Email("a@x.test"), full_name=" ", roles=frozenset(), now=AHORA
        )
    assert {e.field for e in error.value.errors} == {"full_name", "roles"}


def test_activar_una_vez() -> None:
    user = invitado()
    user.pull_events()
    user.activate("hash", AHORA)

    assert user.status is UserStatus.ACTIVE
    assert [type(e) for e in user.pull_events()] == [UserActivated]
    with pytest.raises(ConflictError):
        user.activate("otro", AHORA)


def test_cinco_intentos_fallidos_bloquean_quince_minutos() -> None:
    user = activo()
    politica = LockoutPolicy()

    for _ in range(4):
        user.record_failed_login(AHORA, politica)
    assert user.can_log_in(AHORA)

    user.record_failed_login(AHORA, politica)

    assert not user.can_log_in(AHORA)
    assert user.can_log_in(AHORA + timedelta(minutes=15))
    assert [type(e) for e in user.pull_events()] == [UserLockedOut]


def test_los_intentos_durante_el_bloqueo_no_lo_extienden() -> None:
    user = activo()
    for _ in range(5):
        user.record_failed_login(AHORA, LockoutPolicy())
    bloqueo = user.locked_until

    user.record_failed_login(AHORA + timedelta(minutes=5), LockoutPolicy())

    assert user.locked_until == bloqueo


def test_un_ingreso_correcto_reinicia_los_intentos() -> None:
    user = activo()
    user.record_failed_login(AHORA, LockoutPolicy())
    user.record_successful_login(AHORA)

    assert user.failed_login_attempts == 0
    assert user.last_login_at == AHORA


def test_una_cuenta_deshabilitada_no_puede_ingresar() -> None:
    user = activo()
    user.disable()
    assert not user.can_log_in(AHORA)


# --- Contraseñas -------------------------------------------------------------------------


def test_contrasena_valida() -> None:
    validate_password("un gato duerme en la ventana", Email("ana@example.test"))


@pytest.mark.parametrize(
    ("password", "mensaje"),
    [
        ("corta123", "al menos 10"),
        ("x" * 129, "como máximo 128"),
        ("contraseña123", "demasiado común"),
        ("aaaaaaaaaaaa", "demasiado común"),
        ("mi-correo-ana.perez-2026", "tu correo"),
    ],
)
def test_contrasenas_rechazadas(password: str, mensaje: str) -> None:
    with pytest.raises(ValidationFailedError) as error:
        validate_password(password, Email("ana.perez@example.test"))
    assert any(mensaje in e.message for e in error.value.errors)


# --- Tokens de un solo uso ---------------------------------------------------------------


def token(purpose: TokenPurpose = TokenPurpose.INVITATION) -> OneTimeToken:
    return OneTimeToken.issue(
        id=new_id(), user_id=new_id(), purpose=purpose, token_hash="h", now=AHORA
    )


def test_el_token_se_usa_una_sola_vez() -> None:
    t = token()
    t.consume(TokenPurpose.INVITATION, AHORA)
    with pytest.raises(InvalidTokenError):
        t.consume(TokenPurpose.INVITATION, AHORA)


def test_el_token_vence() -> None:
    t = token(TokenPurpose.PASSWORD_RESET)
    with pytest.raises(InvalidTokenError):
        t.consume(TokenPurpose.PASSWORD_RESET, AHORA + timedelta(minutes=31))


def test_un_token_no_sirve_para_otro_proposito() -> None:
    with pytest.raises(InvalidTokenError):
        token(TokenPurpose.INVITATION).consume(TokenPurpose.PASSWORD_RESET, AHORA)


# --- Refresh tokens ----------------------------------------------------------------------


def familia() -> RefreshTokenFamily:
    return RefreshTokenFamily.start(id=new_id(), user_id=new_id(), token_hash="t1", now=AHORA)


def test_rotar_reemplaza_el_token_vigente_y_devuelve_el_retirado() -> None:
    f = familia()
    retirado = f.rotate("t1", "t2", AHORA)

    assert retirado == "t1"
    assert f.current_token_hash == "t2"


def test_no_se_rota_con_un_token_distinto_del_vigente() -> None:
    with pytest.raises(InvalidTokenError):
        familia().rotate("otro", "t2", AHORA)


def test_no_se_rota_una_familia_vencida_o_revocada() -> None:
    vencida = familia()
    with pytest.raises(InvalidTokenError):
        vencida.rotate("t1", "t2", AHORA + timedelta(days=31))

    revocada = familia()
    revocada.revoke(RevocationReason.LOGOUT, AHORA)
    with pytest.raises(InvalidTokenError):
        revocada.rotate("t1", "t2", AHORA)


def test_revocar_por_reutilizacion_emite_un_evento() -> None:
    f = familia()
    f.revoke(RevocationReason.REUSE_DETECTED, AHORA)
    f.revoke(RevocationReason.LOGOUT, AHORA)

    assert f.revocation_reason is RevocationReason.REUSE_DETECTED
    assert [type(e) for e in f.pull_events()] == [RefreshTokenReuseDetected]
