from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field

from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.identity.public.http import CurrentUser
from vetcare.contexts.sales.application.services import (
    ChargeRequest,
    LineRequest,
    ProductData,
    SalesService,
)
from vetcare.contexts.sales.domain.model import (
    Charge,
    ChargeStatus,
    LineKind,
    MovementKind,
    PaymentMethod,
    Product,
    ProductCategory,
    StockMovement,
    Summary,
)
from vetcare.platform.errors import problem_responses

router = APIRouter(prefix="/sales", tags=["Ventas"])


def sales(request: Request) -> SalesService:
    service: SalesService = request.app.state.sales
    return service


Sales = Annotated[SalesService, Depends(sales)]

_READ = problem_responses({401: "No autenticado", 403: "Sin permiso", 404: "No existe"})
_WRITE = problem_responses(
    {
        401: "No autenticado",
        403: "Sin permiso",
        404: "No existe",
        409: "Stock insuficiente, cobro ya anulado o modificación concurrente",
        422: "Datos inválidos",
    }
)

Money = Annotated[Decimal, Field(ge=0, le=Decimal("999999.99"), decimal_places=2)]
Quantity = Annotated[Decimal, Field(gt=0, le=Decimal("99999"), decimal_places=2)]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Productos ------------------------------------------------------------------------------


class ProductFields(_Request):
    name: str = Field(min_length=2, max_length=120)
    category: ProductCategory
    unit: str = Field(min_length=1, max_length=20, description="Tableta, frasco, bolsa, ml…")
    cost_price: Money
    sale_price: Money
    min_stock: Annotated[Decimal, Field(ge=0, le=Decimal("99999"), decimal_places=2)] = Decimal(0)
    sku: str | None = Field(default=None, max_length=40)

    def data(self) -> ProductData:
        return ProductData(
            name=self.name,
            category=self.category,
            unit=self.unit,
            cost_price=self.cost_price,
            sale_price=self.sale_price,
            min_stock=self.min_stock,
            sku=self.sku,
        )


class CreateProductRequest(ProductFields):
    initial_stock: Annotated[Decimal, Field(ge=0, le=Decimal("99999"), decimal_places=2)] = Decimal(
        0
    )


class UpdateProductRequest(ProductFields):
    active: bool = True


class ProductResponse(BaseModel):
    id: UUID
    name: str
    sku: str | None
    category: ProductCategory
    unit: str
    cost_price: Decimal
    sale_price: Decimal
    stock: Decimal
    min_stock: Decimal
    low_stock: bool
    active: bool

    @classmethod
    def of(cls, p: Product) -> "ProductResponse":
        return cls(
            id=p.id,
            name=p.name,
            sku=p.sku,
            category=p.category,
            unit=p.unit,
            cost_price=p.cost_price,
            sale_price=p.sale_price,
            stock=p.stock,
            min_stock=p.min_stock,
            low_stock=p.low_stock,
            active=p.active,
        )


class ReceiveRequest(_Request):
    quantity: Quantity
    unit_cost: Money | None = Field(
        default=None, description="Costo unitario pagado; si se indica, pasa a ser el costo."
    )
    note: str | None = Field(default=None, max_length=200)


class UseRequest(_Request):
    quantity: Quantity
    note: str | None = Field(default=None, max_length=200)


class CountRequest(_Request):
    counted: Annotated[Decimal, Field(ge=0, le=Decimal("99999"), decimal_places=2)]
    note: str | None = Field(default=None, max_length=200)


class MovementResponse(BaseModel):
    id: UUID
    at: datetime
    kind: MovementKind
    quantity: Decimal
    stock_after: Decimal
    unit_cost: Decimal | None
    note: str | None
    charge_id: UUID | None

    @classmethod
    def of(cls, m: StockMovement) -> "MovementResponse":
        return cls(
            id=m.id,
            at=m.at,
            kind=m.kind,
            quantity=m.quantity,
            stock_after=m.stock_after,
            unit_cost=m.unit_cost,
            note=m.note,
            charge_id=m.charge_id,
        )


@router.get("/products", summary="Productos con su stock", responses=_READ)
async def list_products(
    user: CurrentUser,
    service: Sales,
    q: Annotated[str | None, Query(max_length=100, description="Nombre o código.")] = None,
    include_inactive: bool = False,
) -> list[ProductResponse]:
    return [ProductResponse.of(p) for p in await service.products(user, q, include_inactive)]


@router.post(
    "/products",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un producto",
    responses=_WRITE,
)
async def create_product(
    body: CreateProductRequest, user: CurrentUser, service: Sales
) -> ProductResponse:
    return ProductResponse.of(await service.create_product(user, body.data(), body.initial_stock))


@router.put("/products/{product_id}", summary="Editar un producto", responses=_WRITE)
async def update_product(
    product_id: UUID, body: UpdateProductRequest, user: CurrentUser, service: Sales
) -> ProductResponse:
    return ProductResponse.of(
        await service.update_product(user, product_id, body.data(), body.active)
    )


@router.post("/products/{product_id}/receive", summary="Entrada de mercadería", responses=_WRITE)
async def receive(
    product_id: UUID, body: ReceiveRequest, user: CurrentUser, service: Sales
) -> ProductResponse:
    return ProductResponse.of(
        await service.receive(user, product_id, body.quantity, body.unit_cost, body.note)
    )


@router.post("/products/{product_id}/use", summary="Uso interno", responses=_WRITE)
async def use_internally(
    product_id: UUID, body: UseRequest, user: CurrentUser, service: Sales
) -> ProductResponse:
    return ProductResponse.of(
        await service.use_internally(user, product_id, body.quantity, body.note)
    )


@router.post("/products/{product_id}/count", summary="Ajuste por conteo", responses=_WRITE)
async def count(
    product_id: UUID, body: CountRequest, user: CurrentUser, service: Sales
) -> ProductResponse:
    return ProductResponse.of(await service.count(user, product_id, body.counted, body.note))


@router.get(
    "/products/{product_id}/movements",
    summary="Movimientos de stock, del más reciente",
    responses=_READ,
)
async def movements(product_id: UUID, user: CurrentUser, service: Sales) -> list[MovementResponse]:
    return [MovementResponse.of(m) for m in await service.movements(user, product_id)]


# --- Cobros ---------------------------------------------------------------------------------


class LineRequestBody(_Request):
    kind: LineKind
    quantity: Quantity = Decimal(1)
    description: str | None = Field(default=None, max_length=150)
    unit_price: Money | None = Field(
        default=None, description="Para productos, opcional: por defecto el precio de venta."
    )
    product_id: UUID | None = None
    service_type_id: UUID | None = None


class ChargeRequestBody(_Request):
    lines: list[LineRequestBody] = Field(min_length=1, max_length=50)
    method: PaymentMethod
    customer_name: str | None = Field(default=None, max_length=150)
    pet_name: str | None = Field(default=None, max_length=60)
    client_id: UUID | None = None
    appointment_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


class VoidRequest(_Request):
    reason: str = Field(min_length=3, max_length=300)


class ChargeLineResponse(BaseModel):
    kind: LineKind
    description: str
    quantity: Decimal
    unit_price: Decimal
    total: Decimal
    product_id: UUID | None


class ChargeResponse(BaseModel):
    id: UUID
    at: datetime
    method: PaymentMethod
    status: ChargeStatus
    total: Decimal
    lines: list[ChargeLineResponse]
    customer_name: str | None
    pet_name: str | None
    notes: str | None
    void_reason: str | None

    @classmethod
    def of(cls, c: Charge) -> "ChargeResponse":
        return cls(
            id=c.id,
            at=c.at,
            method=c.method,
            status=c.status,
            total=c.total,
            lines=[
                ChargeLineResponse(
                    kind=line.kind,
                    description=line.description,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    total=line.total,
                    product_id=line.product_id,
                )
                for line in c.lines
            ],
            customer_name=c.customer_name,
            pet_name=c.pet_name,
            notes=c.notes,
            void_reason=c.void_reason,
        )


def _period(start: date, end: date) -> tuple[datetime, datetime]:
    """Días locales de la sede, `to` inclusive."""
    return (
        datetime.combine(start, time(0), CLINIC_TZ),
        datetime.combine(end + timedelta(days=1), time(0), CLINIC_TZ),
    )


@router.post(
    "/charges",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un cobro",
    description="Solo registra lo cobrado; no procesa pagos. Descuenta el stock de los "
    "productos vendidos.",
    responses=_WRITE,
)
async def register_charge(
    body: ChargeRequestBody, user: CurrentUser, service: Sales
) -> ChargeResponse:
    request = ChargeRequest(
        lines=[
            LineRequest(
                kind=line.kind,
                quantity=line.quantity,
                description=line.description,
                unit_price=line.unit_price,
                product_id=line.product_id,
                service_type_id=line.service_type_id,
            )
            for line in body.lines
        ],
        method=body.method,
        customer_name=body.customer_name,
        pet_name=body.pet_name,
        client_id=body.client_id,
        appointment_id=body.appointment_id,
        notes=body.notes,
    )
    return ChargeResponse.of(await service.register_charge(user, request))


@router.post(
    "/charges/{charge_id}/void",
    summary="Anular un cobro",
    description="Con motivo. Los productos vuelven al stock.",
    responses=_WRITE,
)
async def void_charge(
    charge_id: UUID, body: VoidRequest, user: CurrentUser, service: Sales
) -> ChargeResponse:
    return ChargeResponse.of(await service.void_charge(user, charge_id, body.reason))


@router.get("/charges", summary="Cobros de un periodo", responses=_READ)
async def list_charges(
    user: CurrentUser,
    service: Sales,
    from_: Annotated[date, Query(alias="from", description="Día local, AAAA-MM-DD.")],
    to: Annotated[date, Query(description="Día local, inclusive.")],
) -> list[ChargeResponse]:
    start, end = _period(from_, to)
    return [ChargeResponse.of(c) for c in await service.charges(user, start, end)]


class MethodTotal(BaseModel):
    method: PaymentMethod
    total: Decimal


class KindTotal(BaseModel):
    kind: LineKind
    total: Decimal


class DayTotal(BaseModel):
    day: date
    total: Decimal


class TopProduct(BaseModel):
    name: str
    quantity: Decimal
    total: Decimal


class SummaryResponse(BaseModel):
    revenue: Decimal = Field(description="Total cobrado, sin los cobros anulados.")
    product_cost: Decimal = Field(description="Costo de los productos vendidos.")
    profit: Decimal = Field(description="Ganancia bruta: ingresos menos costo de productos.")
    count: int
    voided: int
    by_method: list[MethodTotal]
    by_kind: list[KindTotal]
    by_day: list[DayTotal]
    top_products: list[TopProduct]

    @classmethod
    def of(cls, s: Summary) -> "SummaryResponse":
        return cls(
            revenue=s.revenue,
            product_cost=s.product_cost,
            profit=s.profit,
            count=s.count,
            voided=s.voided,
            by_method=[MethodTotal(method=m, total=t) for m, t in s.by_method.items()],
            by_kind=[KindTotal(kind=k, total=t) for k, t in s.by_kind.items()],
            by_day=[DayTotal(day=date.fromisoformat(d), total=t) for d, t in s.by_day.items()],
            top_products=[
                TopProduct(name=name, quantity=qty, total=total)
                for name, qty, total in s.top_products
            ],
        )


@router.get(
    "/summary",
    summary="Ingresos, costo y ganancia de un periodo",
    responses=_READ,
)
async def summary(
    user: CurrentUser,
    service: Sales,
    from_: Annotated[date, Query(alias="from", description="Día local, AAAA-MM-DD.")],
    to: Annotated[date, Query(description="Día local, inclusive.")],
) -> SummaryResponse:
    start, end = _period(from_, to)
    result = await service.summary(
        user, start, end, lambda at: at.astimezone(CLINIC_TZ).date().isoformat()
    )
    return SummaryResponse.of(result)
