from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from vetcare.contexts.scheduling.domain.appointment import (
    Appointment,
    AppointmentCancelled,
    AppointmentConfirmed,
    AppointmentRequested,
    AppointmentRescheduled,
    AppointmentStatus,
    Channel,
    HistoryAction,
    SchedulingPolicy,
    TimeSlot,
)
from vetcare.contexts.scheduling.domain.availability import Availability
from vetcare.shared_kernel.errors import ConflictError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id

# Lunes 2 de noviembre de 2026, 10:00 en Lima = 15:00 UTC.
INICIO = datetime(2026, 11, 2, 15, 0, tzinfo=UTC)
POLITICA = SchedulingPolicy()
QUIEN = new_id()


def franja(desde_min: int, minutos: int) -> TimeSlot:
    return TimeSlot.starting(INICIO + timedelta(minutes=desde_min), minutos)


def cita(
    canal: Channel = Channel.STAFF, ahora: datetime = INICIO - timedelta(days=1)
) -> Appointment:
    return Appointment.book(
        pet_id=new_id(),
        pet_name="Luna",
        client_id=new_id(),
        service_type_id=new_id(),
        service_name="Baño",
        slot=franja(0, 60),
        resource_ids=frozenset({new_id()}),
        channel=canal,
        by=QUIEN,
        now=ahora,
    )


# --- Franjas ------------------------------------------------------------------------------------


def test_franjas_que_solo_se_tocan_no_se_superponen() -> None:
    assert not franja(0, 60).overlaps(franja(60, 30))
    assert franja(0, 60).overlaps(franja(59, 30))
    assert franja(0, 60).overlaps(franja(-30, 31))


def test_una_franja_requiere_fin_posterior_al_inicio() -> None:
    with pytest.raises(ValidationFailedError):
        TimeSlot(INICIO, INICIO)


# --- Ciclo de vida -------------------------------------------------------------------------------


def test_el_personal_agenda_confirmado_y_el_cliente_solicita() -> None:
    personal = cita(Channel.STAFF)
    cliente = cita(Channel.CLIENT)

    assert personal.status is AppointmentStatus.CONFIRMED
    assert [type(e) for e in personal.pull_events()] == [AppointmentConfirmed]
    assert cliente.status is AppointmentStatus.REQUESTED
    assert [type(e) for e in cliente.pull_events()] == [AppointmentRequested]


def test_recorrido_completo_con_historial() -> None:
    c = cita(Channel.CLIENT)
    c.confirm(QUIEN, INICIO - timedelta(hours=5))
    c.check_in(QUIEN, INICIO - timedelta(minutes=10))
    c.complete(QUIEN, INICIO + timedelta(minutes=55))

    assert c.status is AppointmentStatus.COMPLETED
    assert [h.action for h in c.history] == [
        HistoryAction.REQUESTED,
        HistoryAction.CONFIRMED,
        HistoryAction.CHECKED_IN,
        HistoryAction.COMPLETED,
    ]


@pytest.mark.parametrize(
    ("accion", "estado_final"),
    [
        (lambda c: c.complete(QUIEN, INICIO), "completar"),
        (lambda c: c.confirm(QUIEN, INICIO), "confirmar"),
    ],
)
def test_transiciones_invalidas(accion: object, estado_final: str) -> None:
    c = cita(Channel.STAFF)  # confirmada
    with pytest.raises(ConflictError) as error:
        accion(c)  # type: ignore[operator]
    assert error.value.code == "invalid_appointment_transition"
    assert estado_final in error.value.message


def test_una_cita_cancelada_no_se_modifica() -> None:
    c = cita()
    c.cancel(QUIEN, INICIO - timedelta(days=1), "  Viaje ", by_client=False, policy=POLITICA)

    assert c.cancellation_reason == "Viaje"
    with pytest.raises(ConflictError):
        c.reschedule(
            franja(120, 60), c.resource_ids, QUIEN, INICIO, by_client=False, policy=POLITICA
        )
    with pytest.raises(ConflictError):
        c.check_in(QUIEN, INICIO)


def test_la_llegada_se_registra_desde_dos_horas_antes() -> None:
    c = cita()
    with pytest.raises(ConflictError):
        c.check_in(QUIEN, INICIO - timedelta(hours=3))
    c.check_in(QUIEN, INICIO - timedelta(hours=1))


def test_la_inasistencia_solo_despues_de_la_hora() -> None:
    c = cita()
    with pytest.raises(ConflictError):
        c.mark_no_show(QUIEN, INICIO - timedelta(minutes=1))
    c.mark_no_show(QUIEN, INICIO + timedelta(minutes=20))
    assert c.status is AppointmentStatus.NO_SHOW


def test_el_cliente_cambia_solo_con_anticipacion_y_vuelve_a_solicitud() -> None:
    c = cita(Channel.STAFF)

    with pytest.raises(ConflictError) as error:
        c.cancel(QUIEN, INICIO - timedelta(hours=1), None, by_client=True, policy=POLITICA)
    assert error.value.code == "client_change_too_late"

    c.reschedule(
        franja(120, 60),
        c.resource_ids,
        QUIEN,
        INICIO - timedelta(hours=3),
        by_client=True,
        policy=POLITICA,
    )
    assert c.status is AppointmentStatus.REQUESTED
    assert any(isinstance(e, AppointmentRescheduled) for e in c.pull_events())


def test_el_cliente_puede_retirar_una_solicitud_sin_anticipacion() -> None:
    c = cita(Channel.CLIENT)
    c.cancel(QUIEN, INICIO - timedelta(minutes=5), None, by_client=True, policy=POLITICA)
    assert isinstance(c.pull_events()[-1], AppointmentCancelled)


# --- Disponibilidad ------------------------------------------------------------------------------


@dataclass(frozen=True)
class Recurso:
    id: UUID
    abre: datetime
    cierra: datetime

    def is_available(self, start: datetime, end: datetime) -> bool:
        return self.abre <= start and end <= self.cierra


def siempre_abierto(_start: datetime, _end: datetime) -> bool:
    return True


def test_asigna_un_recurso_libre_por_cada_tipo_requerido() -> None:
    groomer_1, groomer_2 = (
        Recurso(new_id(), INICIO, INICIO + timedelta(hours=8)) for _ in range(2)
    )
    mesa = Recurso(new_id(), INICIO, INICIO + timedelta(hours=8))
    disponibilidad = Availability(
        candidates={"groomer": [groomer_1, groomer_2], "grooming_station": [mesa]},
        busy={groomer_1.id: [franja(0, 60)]},
        is_open=siempre_abierto,
    )

    assert disponibilidad.assign(franja(0, 60)) == frozenset({groomer_2.id, mesa.id})
    assert disponibilidad.assign(franja(0, 60), {"groomer": groomer_1.id}) is None
    assert disponibilidad.assign(franja(60, 60), {"groomer": groomer_1.id}) == frozenset(
        {groomer_1.id, mesa.id}
    )


def test_lista_horarios_respetando_ocupacion_cierre_y_antelacion() -> None:
    groomer = Recurso(new_id(), INICIO, INICIO + timedelta(hours=3))
    disponibilidad = Availability(
        candidates={"groomer": [groomer]},
        busy={groomer.id: [franja(60, 60)]},
        is_open=siempre_abierto,
    )

    opciones = disponibilidad.slots(
        day_start=INICIO,
        day_end=INICIO + timedelta(hours=4),
        duration_minutes=60,
        step_minutes=30,
        not_before=INICIO + timedelta(minutes=1),
    )

    # 10:00 queda antes de la antelación; 10:30 a 11:30 chocan con la cita de 11:00; 13:00 en
    # adelante supera el horario del groomer (hasta las 13:00).
    assert [o.slot.start - INICIO for o in opciones] == [timedelta(hours=2)]


def test_sin_sede_abierta_no_hay_horarios() -> None:
    groomer = Recurso(new_id(), INICIO, INICIO + timedelta(hours=8))
    disponibilidad = Availability(
        candidates={"groomer": [groomer]}, busy={}, is_open=lambda _s, _e: False
    )
    assert disponibilidad.assign(franja(0, 60)) is None
