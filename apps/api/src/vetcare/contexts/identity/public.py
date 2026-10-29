"""Contrato público de Identity & Access para los demás contextos.

Los routers de otros contextos protegen sus endpoints con ``CurrentUser`` o
``require_permission`` y nunca importan el dominio ni la infraestructura de este contexto.
"""

from vetcare.contexts.identity.api.dependencies import CurrentUser, require_permission
from vetcare.contexts.identity.domain.model import UserAccount as AuthenticatedUser
from vetcare.contexts.identity.domain.permissions import Permission, Role

__all__ = ["AuthenticatedUser", "CurrentUser", "Permission", "Role", "require_permission"]
