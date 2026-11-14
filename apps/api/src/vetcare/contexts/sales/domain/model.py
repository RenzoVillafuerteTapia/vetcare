"""Ventas: productos con stock y cobros registrados (no se procesa ningún pago).

- Un producto tiene precio de costo y de venta. Su stock cambia solo con movimientos: entrada
  de mercadería, venta (desde un cobro), uso interno, ajuste por conteo o devolución (al anular
  un cobro). Nunca queda negativo.
- Un cobro registra lo que pagó un cliente: líneas de servicios, productos u otros conceptos, y
  el medio de pago. Las líneas de producto guardan el costo del momento, así la ganancia de un
  periodo no cambia si después sube el costo.
- Un cobro no se edita ni se borra: se anula con un motivo y su stock vuelve.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from vetcare.shared_kernel.domain import AggregateRoot
from vetcare.shared_kernel.errors import ConflictError, FieldError, ValidationFailedError
from vetcare.shared_kernel.ids import new_id

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999.99")


def _invalid(field_name: str, message: str) -> ValidationFailedError:
    return ValidationFailedError(message, [FieldError(field_name, message)])


def money(value: Decimal, field_name: str) -> Decimal:
    if value < 0 or value > MAX_AMOUNT:
        raise _invalid(field_name, "Ingresa un monto entre 0 y 999 999.99.")
    return value.quantize(CENT)


def quantity(value: Decimal, field_name: str = "quantity") -> Decimal:
    if value <= 0 or value > Decimal("99999"):
        raise _invalid(field_name, "Ingresa una cantidad mayor que 0.")
    return value.quantize(CENT)


class ProductCategory(StrEnum):
    MEDICINE = "medicine"
    FOOD = "food"
    ACCESSORY = "accessory"
    HYGIENE = "hygiene"
    SUPPLY = "supply"
    OTHER = "other"


class MovementKind(StrEnum):
    PURCHASE = "purchase"
    SALE = "sale"
    INTERNAL_USE = "internal_use"
    ADJUSTMENT = "adjustment"
    RETURN = "return"


@dataclass(frozen=True)
class StockMovement:
    id: UUID
    product_id: UUID
    at: datetime
    by: UUID
    kind: MovementKind
    # Con signo: positivo entra, negativo sale.
    quantity: Decimal
    stock_after: Decimal
    unit_cost: Decimal | None = None
    note: str | None = None
    charge_id: UUID | None = None


@dataclass
class Product(AggregateRoot):
    aggregate_type: ClassVar[str] = "product"

    id: UUID
    name: str
    category: ProductCategory
    unit: str
    cost_price: Decimal
    sale_price: Decimal
    stock: Decimal
    min_stock: Decimal
    created_at: datetime
    sku: str | None = None
    active: bool = True
    movements: list[StockMovement] = field(default_factory=list)
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        self.name = self.name.strip()
        if not 2 <= len(self.name) <= 120:
            raise _invalid("name", "Ingresa el nombre del producto (2 a 120 caracteres).")
        self.unit = self.unit.strip()
        if not 1 <= len(self.unit) <= 20:
            raise _invalid("unit", "Ingresa la unidad (p. ej. tableta, frasco, bolsa).")
        self.sku = (self.sku or "").strip() or None
        self.cost_price = money(self.cost_price, "cost_price")
        self.sale_price = money(self.sale_price, "sale_price")
        if self.min_stock < 0:
            raise _invalid("min_stock", "El stock mínimo no puede ser negativo.")
        self.min_stock = self.min_stock.quantize(CENT)

    @property
    def low_stock(self) -> bool:
        return self.active and self.stock <= self.min_stock

    def _move(
        self,
        kind: MovementKind,
        delta: Decimal,
        by: UUID,
        now: datetime,
        *,
        unit_cost: Decimal | None = None,
        note: str | None = None,
        charge_id: UUID | None = None,
    ) -> StockMovement:
        after = self.stock + delta
        if after < 0:
            raise ConflictError(
                f"No hay stock suficiente de {self.name}: quedan {self.stock.normalize():f} "
                f"{self.unit}.",
                code="insufficient_stock",
            )
        self.stock = after
        movement = StockMovement(
            id=new_id(),
            product_id=self.id,
            at=now,
            by=by,
            kind=kind,
            quantity=delta,
            stock_after=after,
            unit_cost=unit_cost,
            note=(note or "").strip()[:200] or None,
            charge_id=charge_id,
        )
        self.movements.append(movement)
        return movement

    def receive(
        self, qty: Decimal, unit_cost: Decimal | None, by: UUID, now: datetime, note: str | None
    ) -> None:
        """Entrada de mercadería. Con costo, actualiza el costo del producto al último pagado."""
        cost = money(unit_cost, "unit_cost") if unit_cost is not None else None
        self._move(MovementKind.PURCHASE, quantity(qty), by, now, unit_cost=cost, note=note)
        if cost is not None:
            self.cost_price = cost

    def use_internally(self, qty: Decimal, by: UUID, now: datetime, note: str | None) -> None:
        self._move(MovementKind.INTERNAL_USE, -quantity(qty), by, now, note=note)

    def count(self, counted: Decimal, by: UUID, now: datetime, note: str | None) -> None:
        """Ajuste por conteo físico: el stock pasa a ser lo contado."""
        if counted < 0:
            raise _invalid("counted", "El conteo no puede ser negativo.")
        delta = counted.quantize(CENT) - self.stock
        if delta == 0:
            return
        self._move(MovementKind.ADJUSTMENT, delta, by, now, note=note or "Conteo físico")

    def sell(self, qty: Decimal, charge_id: UUID, by: UUID, now: datetime) -> None:
        if not self.active:
            raise ConflictError(f"{self.name} está desactivado.", code="product_inactive")
        self._move(MovementKind.SALE, -quantity(qty), by, now, charge_id=charge_id)

    def give_back(self, qty: Decimal, charge_id: UUID, by: UUID, now: datetime) -> None:
        self._move(MovementKind.RETURN, quantity(qty), by, now, charge_id=charge_id)


class LineKind(StrEnum):
    SERVICE = "service"
    PRODUCT = "product"
    OTHER = "other"


class PaymentMethod(StrEnum):
    CASH = "cash"
    CARD = "card"
    YAPE = "yape"
    PLIN = "plin"
    TRANSFER = "transfer"


class ChargeStatus(StrEnum):
    REGISTERED = "registered"
    VOIDED = "voided"


@dataclass(frozen=True)
class ChargeLine:
    kind: LineKind
    description: str
    quantity: Decimal
    unit_price: Decimal
    # Costo unitario al momento del cobro (solo productos): base de la ganancia.
    unit_cost: Decimal = Decimal("0.00")
    product_id: UUID | None = None
    service_type_id: UUID | None = None

    @property
    def total(self) -> Decimal:
        return (self.quantity * self.unit_price).quantize(CENT)

    @property
    def cost(self) -> Decimal:
        return (self.quantity * self.unit_cost).quantize(CENT)


@dataclass
class Charge(AggregateRoot):
    aggregate_type: ClassVar[str] = "charge"

    id: UUID
    at: datetime
    by: UUID
    lines: list[ChargeLine]
    method: PaymentMethod
    status: ChargeStatus = ChargeStatus.REGISTERED
    client_id: UUID | None = None
    customer_name: str | None = None
    pet_name: str | None = None
    appointment_id: UUID | None = None
    notes: str | None = None
    voided_at: datetime | None = None
    voided_by: UUID | None = None
    void_reason: str | None = None
    version: int = field(default=0, compare=False)

    def __post_init__(self) -> None:
        if not self.lines:
            raise _invalid("lines", "Agrega al menos un concepto al cobro.")
        if len(self.lines) > 50:
            raise _invalid("lines", "Usa como máximo 50 conceptos.")
        self.customer_name = (self.customer_name or "").strip()[:150] or None
        self.pet_name = (self.pet_name or "").strip()[:60] or None
        self.notes = (self.notes or "").strip()[:500] or None

    @property
    def total(self) -> Decimal:
        return sum((line.total for line in self.lines), Decimal("0.00"))

    @property
    def cost(self) -> Decimal:
        return sum((line.cost for line in self.lines), Decimal("0.00"))

    def void(self, by: UUID, now: datetime, reason: str) -> None:
        if self.status is ChargeStatus.VOIDED:
            raise ConflictError("El cobro ya está anulado.", code="charge_voided")
        clean = reason.strip()
        if len(clean) < 3:
            raise _invalid("reason", "Escribe el motivo de la anulación.")
        self.status = ChargeStatus.VOIDED
        self.voided_at = now
        self.voided_by = by
        self.void_reason = clean[:300]


def new_line(
    kind: LineKind,
    description: str,
    qty: Decimal,
    unit_price: Decimal,
    *,
    unit_cost: Decimal = Decimal("0.00"),
    product_id: UUID | None = None,
    service_type_id: UUID | None = None,
) -> ChargeLine:
    text = description.strip()
    if not 2 <= len(text) <= 150:
        raise _invalid("lines", "Cada concepto necesita una descripción (2 a 150 caracteres).")
    return ChargeLine(
        kind=kind,
        description=text,
        quantity=quantity(qty, "lines"),
        unit_price=money(unit_price, "lines"),
        unit_cost=unit_cost.quantize(CENT),
        product_id=product_id,
        service_type_id=service_type_id,
    )


@dataclass(frozen=True)
class Summary:
    """Resumen de un periodo. La ganancia es bruta: ingresos menos el costo de los productos
    vendidos (no descuenta sueldos, alquiler ni otros gastos)."""

    revenue: Decimal
    product_cost: Decimal
    count: int
    voided: int
    by_method: dict[PaymentMethod, Decimal]
    by_kind: dict[LineKind, Decimal]
    by_day: dict[str, Decimal]
    top_products: list[tuple[str, Decimal, Decimal]]

    @property
    def profit(self) -> Decimal:
        return self.revenue - self.product_cost
