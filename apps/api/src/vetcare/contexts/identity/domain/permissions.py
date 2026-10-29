"""Roles y permisos explícitos (docs/security/README.md).

Los permisos son constantes de código y versionadas con él. Un rol solo tiene los permisos que
aparecen aquí: no hay comodines ni herencia entre roles.
"""

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    VETERINARIAN = "veterinarian"
    ASSISTANT = "assistant"
    RECEPTIONIST = "receptionist"
    CLIENT = "client"


class Permission(StrEnum):
    USERS_MANAGE = "users:manage"
    CLINIC_SETUP_MANAGE = "clinic_setup:manage"
    CLIENTS_MANAGE = "clients:manage"
    PETS_READ = "pets:read"
    PETS_MANAGE = "pets:manage"
    GUARDIANSHIPS_MANAGE = "guardianships:manage"
    APPOINTMENTS_READ = "appointments:read"
    APPOINTMENTS_MANAGE = "appointments:manage"
    TRACKING_READ = "tracking:read"
    TRACKING_ADVANCE = "tracking:advance"
    TRACKING_PUBLISH_UPDATE = "tracking:publish_update"
    TRACKING_AUTHORIZE_DISCHARGE = "tracking:authorize_discharge"
    TRACKING_HAND_OVER = "tracking:hand_over"
    AUDIT_READ = "audit:read"
    # Permisos de un cliente sobre lo propio. El contexto dueño del dato verifica además la
    # relación (tutela) con el recurso concreto.
    OWN_PETS_READ = "own:pets:read"
    OWN_GUARDIANSHIPS_MANAGE = "own:guardianships:manage"
    OWN_APPOINTMENTS_MANAGE = "own:appointments:manage"
    OWN_TRACKING_READ = "own:tracking:read"


P = Permission

ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.ADMIN: frozenset(
        {
            P.USERS_MANAGE,
            P.CLINIC_SETUP_MANAGE,
            P.CLIENTS_MANAGE,
            P.PETS_READ,
            P.PETS_MANAGE,
            P.GUARDIANSHIPS_MANAGE,
            P.APPOINTMENTS_READ,
            P.APPOINTMENTS_MANAGE,
            P.TRACKING_READ,
            P.TRACKING_ADVANCE,
            P.TRACKING_PUBLISH_UPDATE,
            P.TRACKING_HAND_OVER,
            P.AUDIT_READ,
        }
    ),
    Role.VETERINARIAN: frozenset(
        {
            P.CLIENTS_MANAGE,
            P.PETS_READ,
            P.PETS_MANAGE,
            P.APPOINTMENTS_READ,
            P.APPOINTMENTS_MANAGE,
            P.TRACKING_READ,
            P.TRACKING_ADVANCE,
            P.TRACKING_PUBLISH_UPDATE,
            P.TRACKING_AUTHORIZE_DISCHARGE,
            P.TRACKING_HAND_OVER,
        }
    ),
    Role.ASSISTANT: frozenset(
        {
            P.PETS_READ,
            P.APPOINTMENTS_READ,
            P.TRACKING_READ,
            P.TRACKING_ADVANCE,
            P.TRACKING_PUBLISH_UPDATE,
            P.TRACKING_HAND_OVER,
        }
    ),
    Role.RECEPTIONIST: frozenset(
        {
            P.CLIENTS_MANAGE,
            P.PETS_READ,
            P.PETS_MANAGE,
            P.GUARDIANSHIPS_MANAGE,
            P.APPOINTMENTS_READ,
            P.APPOINTMENTS_MANAGE,
            P.TRACKING_READ,
            P.TRACKING_HAND_OVER,
        }
    ),
    Role.CLIENT: frozenset(
        {
            P.OWN_PETS_READ,
            P.OWN_GUARDIANSHIPS_MANAGE,
            P.OWN_APPOINTMENTS_MANAGE,
            P.OWN_TRACKING_READ,
        }
    ),
}

STAFF_ROLES = frozenset({Role.ADMIN, Role.VETERINARIAN, Role.ASSISTANT, Role.RECEPTIONIST})


def permissions_for(roles: frozenset[Role]) -> frozenset[Permission]:
    return frozenset().union(*(ROLE_PERMISSIONS[role] for role in roles))
