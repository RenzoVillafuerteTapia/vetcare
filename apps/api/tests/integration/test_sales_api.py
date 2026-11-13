"""Ventas de punta a punta: productos y stock, cobros que descuentan stock y ganancia."""

from datetime import datetime
from decimal import Decimal
from typing import Any

import pytest
from integration_support import Api, auth

from vetcare.contexts.clinic.public import CLINIC_TZ
from vetcare.contexts.identity.domain.permissions import Role

HOY = datetime.now(CLINIC_TZ).date().isoformat()


@pytest.fixture
async def t(api: Api) -> dict[Role, dict[str, str]]:
    return {
        rol: auth(await api.usuario(email, frozenset({rol})))
        for rol, email in {
            Role.ADMIN: "admin@example.test",
            Role.RECEPTIONIST: "recepcion@example.test",
            Role.ASSISTANT: "asistente@example.test",
        }.items()
    }


ANTIPULGAS = {
    "name": "Antipulgas en tabletas",
    "category": "medicine",
    "unit": "tableta",
    "cost_price": "20.00",
    "sale_price": "35.00",
    "min_stock": "3",
    "initial_stock": "10",
}


async def ok(r: Any, status: int = 200) -> Any:
    assert r.status_code == status, r.text
    return r.json()


async def test_inventario_cobros_y_ganancia(api: Api, t: dict[Role, dict[str, str]]) -> None:
    admin, rec, asis = t[Role.ADMIN], t[Role.RECEPTIONIST], t[Role.ASSISTANT]

    # Solo administración crea productos; la recepción y la asistencia los consultan.
    r = await api.client.post("/api/v1/sales/products", json=ANTIPULGAS, headers=rec)
    assert r.status_code == 403
    p = await ok(
        await api.client.post("/api/v1/sales/products", json=ANTIPULGAS, headers=admin), 201
    )
    assert (p["stock"], p["low_stock"]) == ("10.00", False)
    listado = await ok(await api.client.get("/api/v1/sales/products", headers=asis))
    assert [x["name"] for x in listado] == ["Antipulgas en tabletas"]

    # Entrada de 5 a 22 soles: el costo pasa a 22.
    p = await ok(
        await api.client.post(
            f"/api/v1/sales/products/{p['id']}/receive",
            json={"quantity": "5", "unit_cost": "22.00", "note": "Factura 001-123"},
            headers=admin,
        )
    )
    assert (p["stock"], p["cost_price"]) == ("15.00", "22.00")

    # La recepción registra un cobro: 2 tabletas (precio de venta) y una consulta.
    cobro = await ok(
        await api.client.post(
            "/api/v1/sales/charges",
            json={
                "lines": [
                    {"kind": "product", "product_id": p["id"], "quantity": "2"},
                    {"kind": "service", "description": "Consulta general", "unit_price": "50"},
                ],
                "method": "yape",
                "customer_name": "Ana Pérez",
                "pet_name": "Luna",
            },
            headers=rec,
        ),
        201,
    )
    assert (cobro["total"], cobro["status"]) == ("120.00", "registered")
    assert cobro["lines"][0] == {
        "kind": "product",
        "description": "Antipulgas en tabletas",
        "quantity": "2.00",
        "unit_price": "35.00",
        "total": "70.00",
        "product_id": p["id"],
    }
    stock = (await ok(await api.client.get("/api/v1/sales/products", headers=rec)))[0]["stock"]
    assert stock == "13.00"

    # Sin stock suficiente no se registra nada (ni el resto del cobro).
    r = await api.client.post(
        "/api/v1/sales/charges",
        json={
            "lines": [
                {"kind": "other", "description": "Collar", "unit_price": "15"},
                {"kind": "product", "product_id": p["id"], "quantity": "20"},
            ],
            "method": "cash",
        },
        headers=rec,
    )
    assert r.status_code == 409 and r.json()["code"] == "insufficient_stock"
    cobros = await ok(
        await api.client.get("/api/v1/sales/charges", params={"from": HOY, "to": HOY}, headers=rec)
    )
    assert len(cobros) == 1

    # La asistencia no cobra; la recepción no ve la ganancia.
    r = await api.client.post(
        "/api/v1/sales/charges",
        json={
            "lines": [{"kind": "other", "description": "Collar", "unit_price": "15"}],
            "method": "cash",
        },
        headers=asis,
    )
    assert r.status_code == 403
    r = await api.client.get("/api/v1/sales/summary", params={"from": HOY, "to": HOY}, headers=rec)
    assert r.status_code == 403

    # Ganancia: 120 cobrados - 44 de costo (2 tabletas a 22) = 76.
    resumen = await ok(
        await api.client.get(
            "/api/v1/sales/summary", params={"from": HOY, "to": HOY}, headers=admin
        )
    )
    assert (resumen["revenue"], resumen["product_cost"], resumen["profit"]) == (
        "120.00",
        "44.00",
        "76.00",
    )
    assert resumen["by_method"] == [{"method": "yape", "total": "120.00"}]
    assert {k["kind"]: k["total"] for k in resumen["by_kind"]} == {
        "product": "70.00",
        "service": "50.00",
    }
    assert resumen["by_day"] == [{"day": HOY, "total": "120.00"}]
    assert resumen["top_products"][0]["name"] == "Antipulgas en tabletas"

    # Anular: con motivo, el stock vuelve y el cobro deja de sumar.
    r = await api.client.post(
        f"/api/v1/sales/charges/{cobro['id']}/void", json={"reason": "x"}, headers=rec
    )
    assert r.status_code == 422
    anulado = await ok(
        await api.client.post(
            f"/api/v1/sales/charges/{cobro['id']}/void",
            json={"reason": "Se registró dos veces"},
            headers=rec,
        )
    )
    assert (anulado["status"], anulado["void_reason"]) == ("voided", "Se registró dos veces")
    r = await api.client.post(
        f"/api/v1/sales/charges/{cobro['id']}/void", json={"reason": "Otra vez"}, headers=rec
    )
    assert r.status_code == 409
    stock = (await ok(await api.client.get("/api/v1/sales/products", headers=rec)))[0]["stock"]
    assert stock == "15.00"
    resumen = await ok(
        await api.client.get(
            "/api/v1/sales/summary", params={"from": HOY, "to": HOY}, headers=admin
        )
    )
    assert (resumen["revenue"], resumen["count"], resumen["voided"]) == ("0.00", 0, 1)

    # Conteo físico: quedan 3 → stock bajo. Y el historial de movimientos.
    p = await ok(
        await api.client.post(
            f"/api/v1/sales/products/{p['id']}/count", json={"counted": "3"}, headers=admin
        )
    )
    assert (p["stock"], p["low_stock"]) == ("3.00", True)
    movimientos = await ok(
        await api.client.get(f"/api/v1/sales/products/{p['id']}/movements", headers=asis)
    )
    assert [m["kind"] for m in movimientos] == [
        "adjustment",
        "return",
        "sale",
        "purchase",
        "purchase",
    ]
    assert Decimal(movimientos[0]["quantity"]) == Decimal("-12")


async def test_validaciones(api: Api, t: dict[Role, dict[str, str]]) -> None:
    admin = t[Role.ADMIN]
    r = await api.client.post(
        "/api/v1/sales/products", json=ANTIPULGAS | {"sale_price": "-1"}, headers=admin
    )
    assert r.status_code == 422
    r = await api.client.post(
        "/api/v1/sales/charges",
        json={"lines": [{"kind": "service", "description": "Consulta"}], "method": "cash"},
        headers=admin,
    )
    assert r.status_code == 422  # sin precio
    r = await api.client.get(
        "/api/v1/sales/summary", params={"from": HOY, "to": "2020-01-01"}, headers=admin
    )
    assert r.status_code == 422
