"""Dependencias de FastAPI para proteger los endpoints de otros contextos.

Los routers usan ``CurrentUser`` o ``require_permission`` y nunca importan el dominio ni la
infraestructura de Identity & Access.
"""

from vetcare.contexts.identity.api.dependencies import CurrentUser, require_permission

__all__ = ["CurrentUser", "require_permission"]
