"""Contrato público de Scheduling: consultas de solo lectura para otros contextos."""

from vetcare.contexts.scheduling.application.queries import AppointmentDirectory, AppointmentSummary

__all__ = ["AppointmentDirectory", "AppointmentSummary"]
