"""Casos de uso de Ventas: inventario, cobros y resumen de ganancias.

Quién puede qué (docs/security/README.md):
- `inventory:read`: ver productos, stock y movimientos.
- `inventory:manage`: crear y editar productos, registrar entradas, usos internos y conteos.
- `charges:manage`: registrar y anular cobros, y ver los cobros de un periodo.
- `reports:read`: resumen de ingresos, costo y ganancia.
"""

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from vetcare.contexts.identity.public import AuthenticatedUser, Permission
from vetcare.contexts.sales.application.ports import SalesUnitOfWork
from vetcare.contexts.sales.domain.model import (
    Charge,
    ChargeStatus,
    LineKind,
    PaymentMethod,
    Product,
    ProductCategory,
    StockMovement,
    Summary,
    new_line,
)
from vetcare.shared_kernel.clock import Clock
from vetcare.shared_kernel.errors import (
    FieldError,
    NotFoundError,
    PermissionDeniedError,
    ValidationFailedError,
)
from vetcare.shared_kernel.ids import new_id

PRODUCT_NOT_FOUND = "No encontramos ese producto."
CHARGE_NOT_FOUND = "No encontramos ese cobro."
MAX_PERIOD_DAYS = 370


def _require(actor: AuthenticatedUser, permission: Permission) -> None:
    if not actor.has_permission(permission):
        raise PermissionDeniedError("No tienes permiso para realizar esta operación.")


@dataclass(frozen=True)
class ProductData:
    name: str
    category: ProductCategory
    unit: str
    cost_price: Decimal
    sale_price: Decimal
    min_stock: Decimal
    sku: str | None = None


@dataclass(frozen=True)
class LineRequest:
    kind: LineKind
    quantity: Decimal
    description: str | None = None
    unit_price: Decimal | None = None
    product_id: UUID | None = None
    service_type_id: UUID | None = None


@dataclass(frozen=True)
class ChargeRequest:
    lines: list[LineRequest]
    method: PaymentMethod
    customer_name: str | None = None
    pet_name: str | None = None
    client_id: UUID | None = None
    appointment_id: UUID | None = None
    notes: str | None = None


class SalesService:
    def __init__(self, uow_factory: Callable[[], SalesUnitOfWork], clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    # --- Inventario ---------------------------------------------------------------------

    async def products(
        self, actor: AuthenticatedUser, text: str | None = None, include_inactive: bool = False
    ) -> list[Product]:
        _require(actor, Permission.INVENTORY_READ)
        async with self._uow_factory() as uow:
            return await uow.products.search(text, include_inactive=include_inactive)

    async def product(self, actor: AuthenticatedUser, product_id: UUID) -> Product:
        _require(actor, Permission.INVENTORY_READ)
        async with self._uow_factory() as uow:
            product = await uow.products.get(product_id)
        if product is None:
            raise NotFoundError(PRODUCT_NOT_FOUND)
        return product

    async def movements(
        self, actor: AuthenticatedUser, product_id: UUID, limit: int = 50
    ) -> list[StockMovement]:
        _require(actor, Permission.INVENTORY_READ)
        async with self._uow_factory() as uow:
            if await uow.products.get(product_id) is None:
                raise NotFoundError(PRODUCT_NOT_FOUND)
            return await uow.products.movements(product_id, limit)

    async def create_product(
        self, actor: AuthenticatedUser, data: ProductData, initial_stock: Decimal
    ) -> Product:
        _require(actor, Permission.INVENTORY_MANAGE)
        now = self._clock.now()
        product = Product(
            id=new_id(),
            name=data.name,
            category=data.category,
            unit=data.unit,
            cost_price=data.cost_price,
            sale_price=data.sale_price,
            stock=Decimal("0"),
            min_stock=data.min_stock,
            sku=data.sku,
            created_at=now,
        )
        if initial_stock > 0:
            product.receive(initial_stock, data.cost_price, actor.id, now, "Stock inicial")
        async with self._uow_factory() as uow:
            await uow.products.add(product)
            await uow.commit()
        return product

    async def update_product(
        self, actor: AuthenticatedUser, product_id: UUID, data: ProductData, active: bool
    ) -> Product:
        _require(actor, Permission.INVENTORY_MANAGE)

        def apply(p: Product) -> None:
            updated = Product(
                id=p.id,
                name=data.name,
                category=data.category,
                unit=data.unit,
                cost_price=data.cost_price,
                sale_price=data.sale_price,
                stock=p.stock,
                min_stock=data.min_stock,
                sku=data.sku,
                created_at=p.created_at,
            )
            p.name, p.category, p.unit, p.sku = (
                updated.name,
                updated.category,
                updated.unit,
                updated.sku,
            )
            p.cost_price, p.sale_price, p.min_stock = (
                updated.cost_price,
                updated.sale_price,
                updated.min_stock,
            )
            p.active = active

        return await self._change_product(product_id, apply)

    async def receive(
        self,
        actor: AuthenticatedUser,
        product_id: UUID,
        qty: Decimal,
        unit_cost: Decimal | None,
        note: str | None,
    ) -> Product:
        _require(actor, Permission.INVENTORY_MANAGE)
        return await self._change_product(
            product_id, lambda p: p.receive(qty, unit_cost, actor.id, self._clock.now(), note)
        )

    async def use_internally(
        self, actor: AuthenticatedUser, product_id: UUID, qty: Decimal, note: str | None
    ) -> Product:
        _require(actor, Permission.INVENTORY_MANAGE)
        return await self._change_product(
            product_id, lambda p: p.use_internally(qty, actor.id, self._clock.now(), note)
        )

    async def count(
        self, actor: AuthenticatedUser, product_id: UUID, counted: Decimal, note: str | None
    ) -> Product:
        _require(actor, Permission.INVENTORY_MANAGE)
        return await self._change_product(
            product_id, lambda p: p.count(counted, actor.id, self._clock.now(), note)
        )

    async def _change_product(self, product_id: UUID, apply: Callable[[Product], None]) -> Product:
        async with self._uow_factory() as uow:
            product = await uow.products.get(product_id, for_update=True)
            if product is None:
                raise NotFoundError(PRODUCT_NOT_FOUND)
            apply(product)
            await uow.products.save(product)
            await uow.commit()
        return product

    # --- Cobros -------------------------------------------------------------------------

    async def register_charge(self, actor: AuthenticatedUser, request: ChargeRequest) -> Charge:
        """Registra un cobro y descuenta el stock de sus productos en la misma transacción."""
        _require(actor, Permission.CHARGES_MANAGE)
        now = self._clock.now()
        charge_id = new_id()
        product_ids = sorted({line.product_id for line in request.lines if line.product_id})
        async with self._uow_factory() as uow:
            # Se bloquean en orden: dos cobros simultáneos del mismo producto no se pisan.
            products = await uow.products.get_many_for_update(product_ids)
            lines = []
            for line in request.lines:
                if line.kind is LineKind.PRODUCT:
                    product = products.get(line.product_id) if line.product_id else None
                    if product is None:
                        message = "Elige un producto existente."
                        raise ValidationFailedError(message, [FieldError("lines", message)])
                    lines.append(
                        new_line(
                            LineKind.PRODUCT,
                            product.name,
                            line.quantity,
                            line.unit_price if line.unit_price is not None else product.sale_price,
                            unit_cost=product.cost_price,
                            product_id=product.id,
                        )
                    )
                    product.sell(line.quantity, charge_id, actor.id, now)
                else:
                    if line.unit_price is None:
                        message = "Indica el precio de cada concepto."
                        raise ValidationFailedError(message, [FieldError("lines", message)])
                    lines.append(
                        new_line(
                            line.kind,
                            line.description or "",
                            line.quantity,
                            line.unit_price,
                            service_type_id=line.service_type_id,
                        )
                    )
            charge = Charge(
                id=charge_id,
                at=now,
                by=actor.id,
                lines=lines,
                method=request.method,
                client_id=request.client_id,
                customer_name=request.customer_name,
                pet_name=request.pet_name,
                appointment_id=request.appointment_id,
                notes=request.notes,
            )
            for product in products.values():
                await uow.products.save(product)
            await uow.charges.add(charge)
            await uow.commit()
        return charge

    async def void_charge(self, actor: AuthenticatedUser, charge_id: UUID, reason: str) -> Charge:
        """Anula el cobro y devuelve al stock los productos vendidos."""
        _require(actor, Permission.CHARGES_MANAGE)
        now = self._clock.now()
        async with self._uow_factory() as uow:
            charge = await uow.charges.get(charge_id, for_update=True)
            if charge is None:
                raise NotFoundError(CHARGE_NOT_FOUND)
            charge.void(actor.id, now, reason)
            ids = sorted({line.product_id for line in charge.lines if line.product_id})
            products = await uow.products.get_many_for_update(ids)
            for line in charge.lines:
                if line.product_id and line.product_id in products:
                    products[line.product_id].give_back(line.quantity, charge.id, actor.id, now)
            for product in products.values():
                await uow.products.save(product)
            await uow.charges.save(charge)
            await uow.commit()
        return charge

    async def charges(
        self, actor: AuthenticatedUser, start: datetime, end: datetime
    ) -> list[Charge]:
        _require(actor, Permission.CHARGES_MANAGE)
        self._check_period(start, end)
        async with self._uow_factory() as uow:
            return await uow.charges.between(start, end)

    async def summary(
        self,
        actor: AuthenticatedUser,
        start: datetime,
        end: datetime,
        day_of: Callable[[datetime], str],
    ) -> Summary:
        _require(actor, Permission.REPORTS_READ)
        self._check_period(start, end)
        async with self._uow_factory() as uow:
            charges = await uow.charges.between(start, end)
        valid = [c for c in charges if c.status is ChargeStatus.REGISTERED]
        by_method: dict[PaymentMethod, Decimal] = defaultdict(lambda: Decimal("0.00"))
        by_kind: dict[LineKind, Decimal] = defaultdict(lambda: Decimal("0.00"))
        by_day: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
        products: dict[str, list[Decimal]] = defaultdict(lambda: [Decimal("0"), Decimal("0")])
        for charge in valid:
            by_method[charge.method] += charge.total
            by_day[day_of(charge.at)] += charge.total
            for line in charge.lines:
                by_kind[line.kind] += line.total
                if line.kind is LineKind.PRODUCT:
                    products[line.description][0] += line.quantity
                    products[line.description][1] += line.total
        top = sorted(products.items(), key=lambda item: item[1][1], reverse=True)[:5]
        return Summary(
            revenue=sum((c.total for c in valid), Decimal("0.00")),
            product_cost=sum((c.cost for c in valid), Decimal("0.00")),
            count=len(valid),
            voided=len(charges) - len(valid),
            by_method=dict(by_method),
            by_kind=dict(by_kind),
            by_day=dict(sorted(by_day.items())),
            top_products=[(name, qty, total) for name, (qty, total) in top],
        )

    @staticmethod
    def _check_period(start: datetime, end: datetime) -> None:
        if end <= start or (end - start).days > MAX_PERIOD_DAYS:
            message = "Elige un periodo válido de hasta un año."
            raise ValidationFailedError(message, [FieldError("to", message)])
