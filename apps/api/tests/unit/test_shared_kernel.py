import enum
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import ClassVar
from uuid import UUID

from vetcare.platform.outbox import event_payload, outbox_row
from vetcare.shared_kernel.domain import AggregateRoot, DomainEvent
from vetcare.shared_kernel.ids import new_id

MOMENTO = datetime(2026, 10, 29, 15, 0, tzinfo=UTC)


class Especie(enum.StrEnum):
    PERRO = "dog"


@dataclass(frozen=True, kw_only=True)
class MascotaRegistrada(DomainEvent):
    event_type: ClassVar[str] = "pets.pet_registered"

    nombre: str
    especie: Especie
    peso_kg: Decimal
    tutores: tuple[UUID, ...]


@dataclass
class Mascota(AggregateRoot):
    aggregate_type: ClassVar[str] = "pet"

    id: UUID
    nombre: str

    def registrar(self) -> None:
        self.record(
            MascotaRegistrada(
                aggregate_id=self.id,
                occurred_at=MOMENTO,
                nombre=self.nombre,
                especie=Especie.PERRO,
                peso_kg=Decimal("12.50"),
                tutores=(UUID(int=1),),
            )
        )


def test_new_id_es_uuid_v7_ordenable_por_tiempo() -> None:
    ids = [new_id() for _ in range(200)]

    assert all(i.version == 7 for i in ids)
    assert all(i.variant == "specified in RFC 4122" for i in ids)
    assert len(set(ids)) == len(ids)
    # Los 48 bits altos son milisegundos: nunca retroceden.
    marcas = [i.int >> 80 for i in ids]
    assert marcas == sorted(marcas)


def test_el_agregado_entrega_sus_eventos_una_sola_vez() -> None:
    mascota = Mascota(id=new_id(), nombre="Luna")
    mascota.registrar()

    primeros = mascota.pull_events()
    segundos = mascota.pull_events()

    assert [type(e) for e in primeros] == [MascotaRegistrada]
    assert segundos == []


def test_el_agregado_sin_eventos_devuelve_lista_vacia() -> None:
    assert Mascota(id=new_id(), nombre="Toby").pull_events() == []


def test_la_carga_util_es_json_sin_los_campos_del_sobre() -> None:
    mascota = Mascota(id=new_id(), nombre="Luna")
    mascota.registrar()
    (evento,) = mascota.pull_events()

    assert event_payload(evento) == {
        "nombre": "Luna",
        "especie": "dog",
        "peso_kg": "12.50",
        "tutores": ["00000000-0000-0000-0000-000000000001"],
    }


def test_la_fila_del_outbox_conserva_tipo_version_y_agregado() -> None:
    mascota = Mascota(id=new_id(), nombre="Luna")
    mascota.registrar()
    (evento,) = mascota.pull_events()

    fila = outbox_row(evento, Mascota.aggregate_type, MOMENTO)

    assert fila["event_id"] == evento.event_id
    assert fila["event_type"] == "pets.pet_registered"
    assert fila["schema_version"] == 1
    assert fila["aggregate_type"] == "pet"
    assert fila["aggregate_id"] == mascota.id
    assert fila["occurred_at"] == MOMENTO
