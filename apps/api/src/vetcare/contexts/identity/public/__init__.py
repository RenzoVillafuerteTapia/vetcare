"""Contrato público de Identity & Access para los demás contextos.

Este módulo solo expone tipos del dominio, sin dependencias de frameworks: lo pueden usar las
capas de aplicación. Los routers HTTP usan ``identity.public.http``.
"""

from vetcare.contexts.identity.domain.model import UserAccount as AuthenticatedUser
from vetcare.contexts.identity.domain.permissions import Permission, Role

__all__ = ["AuthenticatedUser", "Permission", "Role"]
