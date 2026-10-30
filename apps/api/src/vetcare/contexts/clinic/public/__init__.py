"""Contrato público de Clinic Setup: consultas de solo lectura para otros contextos."""

from vetcare.contexts.clinic.application.queries import ClinicCatalog, ResourceView, ServiceTypeView
from vetcare.contexts.clinic.domain.model import ResourceKind, ServiceCategory
from vetcare.contexts.clinic.domain.schedule import CLINIC_TZ

__all__ = [
    "CLINIC_TZ",
    "ClinicCatalog",
    "ResourceKind",
    "ResourceView",
    "ServiceCategory",
    "ServiceTypeView",
]
