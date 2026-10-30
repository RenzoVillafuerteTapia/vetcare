from datetime import UTC, date, datetime, time, timedelta

import pytest

from vetcare.contexts.clinic.domain.model import (
    ClinicCalendar,
    Duration,
    Resource,
    ResourceKind,
    ServiceCategory,
    ServiceCode,
    ServiceType,
    TimeOff,
)
from vetcare.contexts.clinic.domain.schedule import CLINIC_TZ, TimeRange, Weekday, WeeklySchedule
from vetcare.shared_kernel.errors import ConflictError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id

LUNES = date(2026, 11, 2)  # lunes


def lima(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), CLINIC_TZ)


def franja(inicio: str, fin: str) -> TimeRange:
    return TimeRange(time.fromisoformat(inicio), time.fromisoformat(fin))


HORARIO = WeeklySchedule.build(
    [
        (Weekday.MONDAY, franja("09:00", "13:00")),
        (Weekday.MONDAY, franja("14:00", "19:00")),
        (Weekday.SATURDAY, franja("09:00", "14:00")),
    ]
)


# --- Horarios ---------------------------------------------------------------------------------


def test_la_franja_debe_terminar_despues_de_empezar() -> None:
    with pytest.raises(ValidationFailedError):
        franja("10:00", "10:00")


def test_las_franjas_van_en_multiplos_de_cinco_minutos() -> None:
    with pytest.raises(ValidationFailedError):
        franja("09:03", "10:00")


def test_un_horario_no_admite_franjas_superpuestas_el_mismo_dia() -> None:
    with pytest.raises(ValidationFailedError) as error:
        WeeklySchedule.build(
            [
                (Weekday.TUESDAY, franja("09:00", "12:00")),
                (Weekday.TUESDAY, franja("11:30", "13:00")),
            ]
        )
    assert "martes" in error.value.errors[0].message


def test_franjas_contiguas_si_se_admiten() -> None:
    WeeklySchedule.build(
        [(Weekday.TUESDAY, franja("09:00", "12:00")), (Weekday.TUESDAY, franja("12:00", "13:00"))]
    )


@pytest.mark.parametrize(
    ("inicio", "fin", "cubre"),
    [
        (lima(LUNES, 9), lima(LUNES, 9, 30), True),
        (lima(LUNES, 12, 30), lima(LUNES, 13), True),  # termina justo al cierre
        (lima(LUNES, 12, 30), lima(LUNES, 13, 30), False),  # cruza el almuerzo
        (lima(LUNES, 8, 30), lima(LUNES, 9, 30), False),  # empieza antes de abrir
        (lima(LUNES + timedelta(days=1), 10), lima(LUNES + timedelta(days=1), 11), False),
        (lima(LUNES, 18, 30), lima(LUNES + timedelta(days=1), 0, 30), False),  # cruza medianoche
    ],
)
def test_el_horario_cubre_intervalos_en_hora_local(
    inicio: datetime, fin: datetime, cubre: bool
) -> None:
    assert HORARIO.covers(inicio, fin) is cubre


def test_compara_en_hora_de_lima_aunque_llegue_en_utc() -> None:
    # 14:00 UTC = 09:00 en Lima (UTC-5).
    inicio = datetime(2026, 11, 2, 14, 0, tzinfo=UTC)
    assert HORARIO.covers(inicio, inicio + timedelta(minutes=30))
    assert not HORARIO.covers(inicio - timedelta(hours=1), inicio)


# --- Catálogo ---------------------------------------------------------------------------------


def servicio(**cambios: object) -> ServiceType:
    datos: dict[str, object] = {
        "id": new_id(),
        "code": ServiceCode("bano-y-corte"),
        "name": "Baño y corte",
        "category": ServiceCategory.GROOMING,
        "duration": Duration(90),
        "required_resources": frozenset({ResourceKind.GROOMER, ResourceKind.GROOMING_STATION}),
        "bookable_by_client": True,
    }
    datos.update(cambios)
    return ServiceType(**datos)  # type: ignore[arg-type]


def test_el_codigo_se_normaliza() -> None:
    assert ServiceCode("  Bano-Y-Corte ").value == "bano-y-corte"


@pytest.mark.parametrize("codigo", ["a", "baño", "con espacio", "-empieza", "x" * 41])
def test_codigos_invalidos(codigo: str) -> None:
    with pytest.raises(ValidationFailedError):
        ServiceCode(codigo)


@pytest.mark.parametrize("minutos", [0, 3, 601, 62])
def test_duraciones_invalidas(minutos: int) -> None:
    with pytest.raises(ValidationFailedError):
        Duration(minutos)


def test_un_servicio_ocupa_al_menos_un_recurso() -> None:
    with pytest.raises(ValidationFailedError) as error:
        servicio(required_resources=frozenset())
    assert error.value.errors[0].field == "required_resources"


def test_actualizar_valida_igual_que_crear_y_no_cambia_el_codigo() -> None:
    s = servicio()
    with pytest.raises(ValidationFailedError):
        s.update(
            name="X",
            category=ServiceCategory.GROOMING,
            duration=Duration(60),
            required_resources=frozenset({ResourceKind.GROOMER}),
            bookable_by_client=True,
            description="",
        )
    assert s.name == "Baño y corte"

    s.update(
        name="  Baño   completo ",
        category=ServiceCategory.GROOMING,
        duration=Duration(60),
        required_resources=frozenset({ResourceKind.GROOMER}),
        bookable_by_client=False,
        description="",
    )
    assert (s.name, s.duration.minutes, s.code.value) == ("Baño completo", 60, "bano-y-corte")


def test_el_cliente_solo_ve_servicios_activos_y_reservables() -> None:
    assert servicio().visible_to_clients
    assert not servicio(bookable_by_client=False).visible_to_clients
    inactivo = servicio()
    inactivo.set_active(False)
    assert not inactivo.visible_to_clients


# --- Recursos ---------------------------------------------------------------------------------


def recurso(kind: ResourceKind = ResourceKind.GROOMER) -> Resource:
    return Resource(id=new_id(), kind=kind, name="Groomer 1", schedule=HORARIO)


def test_solo_un_profesional_se_vincula_a_una_cuenta() -> None:
    recurso(ResourceKind.VETERINARIAN).link_user(new_id())
    with pytest.raises(ValidationFailedError):
        recurso(ResourceKind.GROOMING_STATION).link_user(new_id())


def test_disponibilidad_segun_horario_bloqueos_y_estado() -> None:
    r = recurso()
    assert r.is_available(lima(LUNES, 10), lima(LUNES, 11))

    r.add_time_off(
        TimeOff(id=new_id(), start=lima(LUNES, 10, 30), end=lima(LUNES, 12), reason="Capacitación")
    )
    assert not r.is_available(lima(LUNES, 10), lima(LUNES, 11))
    assert r.is_available(lima(LUNES, 9), lima(LUNES, 10, 30))  # termina cuando empieza el bloqueo

    r.set_active(False)
    assert not r.is_available(lima(LUNES, 9), lima(LUNES, 10))


def test_los_bloqueos_no_se_superponen() -> None:
    r = recurso()
    r.add_time_off(TimeOff(id=new_id(), start=lima(LUNES, 9), end=lima(LUNES, 12), reason=""))
    with pytest.raises(ConflictError):
        r.add_time_off(TimeOff(id=new_id(), start=lima(LUNES, 11), end=lima(LUNES, 13), reason=""))


def test_quitar_un_bloqueo_inexistente_es_un_conflicto() -> None:
    with pytest.raises(ConflictError):
        recurso().remove_time_off(new_id())


def test_un_bloqueo_requiere_inicio_antes_del_fin() -> None:
    with pytest.raises(ValidationFailedError):
        TimeOff(id=new_id(), start=lima(LUNES, 12), end=lima(LUNES, 11), reason="")


# --- Calendario de la sede --------------------------------------------------------------------


def test_la_sede_cierra_los_feriados() -> None:
    calendario = ClinicCalendar(opening_hours=HORARIO)
    assert calendario.is_open(lima(LUNES, 10), lima(LUNES, 11))

    calendario.add_holiday(LUNES, "Todos los Santos (trasladado)")
    assert not calendario.is_open(lima(LUNES, 10), lima(LUNES, 11))

    with pytest.raises(ConflictError):
        calendario.add_holiday(LUNES, "Repetido")
    calendario.remove_holiday(LUNES)
    assert calendario.is_open(lima(LUNES, 10), lima(LUNES, 11))
