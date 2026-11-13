from collections import defaultdict
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from vetcare.contexts.sales.domain.model import (
    Charge,
    ChargeLine,
    ChargeStatus,
    LineKind,
    MovementKind,
    PaymentMethod,
    Product,
    ProductCategory,
    StockMovement,
)
from vetcare.contexts.sales.infrastructure.tables import (
    charge_lines,
    charges,
    products,
    stock_movements,
)
from vetcare.shared_kernel.errors import ConflictError

CONCURRENT = ConflictError(
    "Otra persona modificó este registro. Recarga e intenta de nuevo.",
    code="concurrent_modification",
)


def _naive(value: datetime | None) -> datetime | None:
    return value.astimezone(UTC).replace(tzinfo=None) if value else None


def _aware(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=UTC) if value else None


def _movement(r: Any) -> StockMovement:
    return StockMovement(
        id=r.id,
        product_id=r.product_id,
        at=_aware(r.at),  # type: ignore[arg-type]
        by=r.by,
        kind=MovementKind(r.kind),
        quantity=r.quantity,
        stock_after=r.stock_after,
        unit_cost=r.unit_cost,
        note=r.note,
        charge_id=r.charge_id,
    )


class SqlProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, product_id: UUID, *, for_update: bool = False) -> Product | None:
        query = select(products).where(products.c.id == product_id)
        if for_update:
            query = query.with_for_update()
        found = await self._load(query)
        return found[0] if found else None

    async def get_many_for_update(self, product_ids: list[UUID]) -> dict[UUID, Product]:
        if not product_ids:
            return {}
        found = await self._load(
            select(products)
            .where(products.c.id.in_(product_ids))
            .order_by(products.c.id)
            .with_for_update()
        )
        return {p.id: p for p in found}

    async def search(self, text: str | None, *, include_inactive: bool) -> list[Product]:
        query = select(products).order_by(products.c.name)
        if not include_inactive:
            query = query.where(products.c.active.is_(True))
        if text and text.strip():
            like = f"%{text.strip()}%"
            query = query.where(or_(products.c.name.ilike(like), products.c.sku.ilike(like)))
        return await self._load(query)

    async def add(self, product: Product) -> None:
        await self._session.execute(insert(products).values(**self._values(product)))
        await self._write_movements(product)

    async def save(self, product: Product) -> None:
        result = await self._session.execute(
            update(products)
            .where(products.c.id == product.id, products.c.version == product.version)
            .values(**self._values(product) | {"version": product.version + 1})
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise CONCURRENT
        await self._write_movements(product)
        product.version += 1

    async def movements(self, product_id: UUID, limit: int) -> list[StockMovement]:
        rows = await self._session.execute(
            select(stock_movements)
            .where(stock_movements.c.product_id == product_id)
            .order_by(stock_movements.c.at.desc())
            .limit(limit)
        )
        return [_movement(r) for r in rows]

    async def _write_movements(self, product: Product) -> None:
        # Solo los movimientos nuevos de esta operación (los guardados no se cargan).
        rows = [
            {
                "id": m.id,
                "product_id": m.product_id,
                "at": _naive(m.at),
                "by": m.by,
                "kind": m.kind.value,
                "quantity": m.quantity,
                "stock_after": m.stock_after,
                "unit_cost": m.unit_cost,
                "note": m.note,
                "charge_id": m.charge_id,
            }
            for m in product.movements
        ]
        if rows:
            await self._session.execute(insert(stock_movements), rows)
        product.movements.clear()

    async def _load(self, query: Select[Any]) -> list[Product]:
        return [
            Product(
                id=r.id,
                name=r.name,
                category=ProductCategory(r.category),
                unit=r.unit,
                cost_price=r.cost_price,
                sale_price=r.sale_price,
                stock=r.stock,
                min_stock=r.min_stock,
                sku=r.sku,
                active=r.active,
                created_at=_aware(r.created_at),  # type: ignore[arg-type]
                version=r.version,
            )
            for r in await self._session.execute(query)
        ]

    @staticmethod
    def _values(p: Product) -> dict[str, Any]:
        return {
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "category": p.category.value,
            "unit": p.unit,
            "cost_price": p.cost_price,
            "sale_price": p.sale_price,
            "stock": p.stock,
            "min_stock": p.min_stock,
            "active": p.active,
            "created_at": _naive(p.created_at),
            "version": p.version,
        }


class SqlChargeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, charge_id: UUID, *, for_update: bool = False) -> Charge | None:
        query = select(charges).where(charges.c.id == charge_id)
        if for_update:
            query = query.with_for_update()
        found = await self._load(query)
        return found[0] if found else None

    async def between(self, start: datetime, end: datetime) -> list[Charge]:
        return await self._load(
            select(charges)
            .where(charges.c.at >= _naive(start), charges.c.at < _naive(end))
            .order_by(charges.c.at.desc())
        )

    async def add(self, charge: Charge) -> None:
        await self._session.execute(insert(charges).values(**self._values(charge)))
        await self._session.execute(
            insert(charge_lines),
            [
                {
                    "charge_id": charge.id,
                    "position": i,
                    "kind": line.kind.value,
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                    "unit_cost": line.unit_cost,
                    "product_id": line.product_id,
                    "service_type_id": line.service_type_id,
                }
                for i, line in enumerate(charge.lines)
            ],
        )

    async def save(self, charge: Charge) -> None:
        # Las líneas no cambian después de registrar el cobro: solo su estado.
        result = await self._session.execute(
            update(charges)
            .where(charges.c.id == charge.id, charges.c.version == charge.version)
            .values(**self._values(charge) | {"version": charge.version + 1})
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise CONCURRENT
        charge.version += 1

    async def _load(self, query: Select[Any]) -> list[Charge]:
        rows = (await self._session.execute(query)).all()
        if not rows:
            return []
        lines: dict[UUID, list[ChargeLine]] = defaultdict(list)
        for line in await self._session.execute(
            select(charge_lines)
            .where(charge_lines.c.charge_id.in_([r.id for r in rows]))
            .order_by(charge_lines.c.charge_id, charge_lines.c.position)
        ):
            lines[line.charge_id].append(
                ChargeLine(
                    kind=LineKind(line.kind),
                    description=line.description,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    unit_cost=line.unit_cost,
                    product_id=line.product_id,
                    service_type_id=line.service_type_id,
                )
            )
        return [
            Charge(
                id=r.id,
                at=_aware(r.at),  # type: ignore[arg-type]
                by=r.by,
                lines=lines[r.id],
                method=PaymentMethod(r.method),
                status=ChargeStatus(r.status),
                client_id=r.client_id,
                customer_name=r.customer_name,
                pet_name=r.pet_name,
                appointment_id=r.appointment_id,
                notes=r.notes,
                voided_at=_aware(r.voided_at),
                voided_by=r.voided_by,
                void_reason=r.void_reason,
                version=r.version,
            )
            for r in rows
        ]

    @staticmethod
    def _values(c: Charge) -> dict[str, Any]:
        return {
            "id": c.id,
            "at": _naive(c.at),
            "by": c.by,
            "method": c.method.value,
            "status": c.status.value,
            "total": c.total,
            "client_id": c.client_id,
            "customer_name": c.customer_name,
            "pet_name": c.pet_name,
            "appointment_id": c.appointment_id,
            "notes": c.notes,
            "voided_at": _naive(c.voided_at),
            "voided_by": c.voided_by,
            "void_reason": c.void_reason,
            "version": c.version,
        }
