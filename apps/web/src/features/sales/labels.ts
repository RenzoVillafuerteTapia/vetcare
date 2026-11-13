import type { Schemas } from "@vetcare/shared";

export type Product = Schemas["ProductResponse"];
export type Charge = Schemas["ChargeResponse"];
export type Summary = Schemas["SummaryResponse"];
export type Movement = Schemas["MovementResponse"];
export type ProductCategory = Schemas["ProductCategory"];
export type PaymentMethod = Schemas["PaymentMethod"];
export type LineKind = Schemas["LineKind"];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  medicine: "Medicamento",
  food: "Alimento",
  accessory: "Accesorio",
  hygiene: "Higiene",
  supply: "Insumo",
  other: "Otro",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
};

export const KIND_LABELS: Record<LineKind, string> = {
  service: "Servicio",
  product: "Producto",
  other: "Otro",
};

export const MOVEMENT_LABELS: Record<Movement["kind"], string> = {
  purchase: "Entrada",
  sale: "Venta",
  internal_use: "Uso interno",
  adjustment: "Ajuste por conteo",
  return: "Devolución",
};

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

/** "S/ 120.00". La API envía los montos como texto decimal. */
export const money = (value: string | number) => soles.format(Number(value));

/** Cantidades sin ceros de más: "2", "1.5". */
export const qty = (value: string | number) =>
  Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** Claves de TanStack Query. Invalidar `SALES` refresca inventario, cobros y resúmenes. */
export const SALES = ["sales"] as const;
export const productsKey = (q: string, inactive: boolean) =>
  [...SALES, "products", q, inactive] as const;
export const chargesKey = (from: string, to: string) => [...SALES, "charges", from, to] as const;
export const summaryKey = (from: string, to: string) => [...SALES, "summary", from, to] as const;
