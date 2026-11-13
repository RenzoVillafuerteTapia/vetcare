import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bone,
  CircleAlert,
  Droplets,
  History,
  Package,
  PackagePlus,
  Pencil,
  Pill,
  Plus,
  Search,
  Syringe,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";

import { CatalogCard, CatalogGrid } from "@/components/catalog-card";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatStamp } from "@/features/agenda/time";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

import {
  CATEGORY_LABELS,
  money,
  MOVEMENT_LABELS,
  productsKey,
  qty,
  SALES,
  type Product,
  type ProductCategory,
} from "./labels";

const CATEGORY_ICONS: Record<ProductCategory, LucideIcon> = {
  medicine: Pill,
  food: Bone,
  accessory: Tag,
  hygiene: Droplets,
  supply: Syringe,
  other: Package,
};

const CATEGORY_TONES: Record<ProductCategory, string> = {
  medicine: "bg-sky-100 text-sky-700",
  food: "bg-amber-100 text-amber-700",
  accessory: "bg-pink-100 text-pink-700",
  hygiene: "bg-emerald-100 text-emerald-700",
  supply: "bg-violet-100 text-violet-700",
  other: "bg-muted text-muted-foreground",
};

type StockAction = "receive" | "use" | "count";

/** Inventario: productos con su stock, precios y movimientos. */
export function InventoryPage() {
  const { api } = useSessionManager();
  const canManage = usePermission("inventory:manage");
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const q = useDebounced(search, 250);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [stock, setStock] = useState<{ product: Product; action: StockAction } | null>(null);
  const [history, setHistory] = useState<Product | null>(null);

  const products = useQuery({
    queryKey: productsKey(q, canManage),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/sales/products", {
          params: { query: { ...(q ? { q } : {}), include_inactive: canManage } },
        }),
      ),
  });
  const all = products.data ?? [];
  const low = all.filter((p) => p.low_stock);
  const shown = onlyLow ? low : all;
  const value = all.reduce((sum, p) => sum + Number(p.stock) * Number(p.cost_price), 0);

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Medicamentos, alimentos y accesorios con su stock y precios."
        actions={
          canManage ? (
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Nuevo producto
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground">Productos activos</p>
          <p className="text-2xl font-medium">{all.filter((p) => p.active).length}</p>
        </Card>
        <Card className={cn("p-4", low.length > 0 && "border-destructive/40")}>
          <p className="text-xs font-semibold text-muted-foreground">Con stock bajo</p>
          <p className={cn("text-2xl font-medium", low.length > 0 && "text-destructive")}>
            {low.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground">Valor del stock (al costo)</p>
          <p className="text-2xl font-medium">{money(value)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search
            className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Buscar productos"
            placeholder="Buscar por nombre o código"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={onlyLow ? "default" : "outline"}
          aria-pressed={onlyLow}
          onClick={() => setOnlyLow(!onlyLow)}
        >
          <CircleAlert aria-hidden /> Solo stock bajo
        </Button>
      </div>

      {products.isPending ? (
        <LoadingState label="Cargando el inventario…" />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState title={all.length === 0 ? "Todavía no hay productos" : "Sin resultados"}>
          {canManage && all.length === 0 ? (
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Agregar el primero
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <CatalogGrid label="Productos">
          {shown.map((p) => {
            const margin = Number(p.sale_price) - Number(p.cost_price);
            const marginPct =
              Number(p.cost_price) > 0 ? Math.round((margin / Number(p.cost_price)) * 100) : null;
            const Icon = CATEGORY_ICONS[p.category];
            return (
              <li key={p.id}>
                <CatalogCard
                  className={cn(!p.active && "opacity-60")}
                  media={
                    <span
                      className={cn(
                        "flex size-24 items-center justify-center rounded-3xl",
                        CATEGORY_TONES[p.category],
                      )}
                    >
                      <Icon className="size-12" aria-hidden />
                    </span>
                  }
                  corner={
                    !p.active
                      ? { label: "Desactivado", tone: "dark" }
                      : p.low_stock
                        ? { label: "Stock bajo", tone: "red" }
                        : marginPct !== null
                          ? { label: `+${marginPct}%`, tone: "green" }
                          : null
                  }
                  chips={[
                    { label: CATEGORY_LABELS[p.category], tone: "green" },
                    { label: p.unit, tone: "blue" },
                    ...(p.sku ? [{ label: p.sku, tone: "pink" as const }] : []),
                  ]}
                  title={p.name}
                  highlight={money(p.sale_price)}
                  secondary={`Costo ${money(p.cost_price)}`}
                  footer={`Stock: ${qty(p.stock)} ${p.unit} · mínimo ${qty(p.min_stock)}`}
                  footerTone={p.low_stock ? "warn" : "ok"}
                  actions={
                    <>
                      {canManage ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStock({ product: p, action: "receive" })}
                          >
                            <PackagePlus aria-hidden /> Entrada
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStock({ product: p, action: "count" })}
                          >
                            Ajustar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Editar ${p.name}`}
                            onClick={() => setEditing(p)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Movimientos de ${p.name}`}
                        onClick={() => setHistory(p)}
                      >
                        <History aria-hidden />
                      </Button>
                    </>
                  }
                />
              </li>
            );
          })}
        </CatalogGrid>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <ProductDialog
            product={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
      <Dialog open={stock !== null} onOpenChange={(open) => !open && setStock(null)}>
        {stock ? <StockDialog {...stock} onDone={() => setStock(null)} /> : null}
      </Dialog>
      <Dialog open={history !== null} onOpenChange={(open) => !open && setHistory(null)}>
        {history ? <HistoryDialog product={history} /> : null}
      </Dialog>
    </>
  );
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[];

function ProductDialog({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const categoryId = useId();
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? ("medicine" as ProductCategory),
    unit: product?.unit ?? "unidad",
    cost_price: product?.cost_price ?? "",
    sale_price: product?.sale_price ?? "",
    min_stock: product?.min_stock ?? "0",
    initial_stock: "0",
    active: product?.active ?? true,
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const save = useMutation({
    mutationFn: () => {
      const fields = {
        name: form.name,
        sku: form.sku.trim() || null,
        category: form.category,
        unit: form.unit,
        cost_price: form.cost_price || "0",
        sale_price: form.sale_price || "0",
        min_stock: form.min_stock || "0",
      };
      return product
        ? unwrap(
            api.PUT("/api/v1/sales/products/{product_id}", {
              params: { path: { product_id: product.id } },
              body: { ...fields, active: form.active },
            }),
          )
        : unwrap(
            api.POST("/api/v1/sales/products", {
              body: { ...fields, initial_stock: form.initial_stock || "0" },
            }),
          );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SALES });
      onDone();
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{product ? `Editar ${product.name}` : "Nuevo producto"}</DialogTitle>
        <DialogDescription>
          El costo es lo que paga la veterinaria; la venta, lo que paga el cliente.
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(save.error)}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Nombre" required value={form.name} onChange={set("name")} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={categoryId}>Categoría</Label>
            <Select id={categoryId} value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <FormField
            label="Unidad"
            hint="tableta, frasco, bolsa…"
            value={form.unit}
            onChange={set("unit")}
          />
          <FormField label="Código (opcional)" value={form.sku} onChange={set("sku")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Costo (S/)"
            type="number"
            step="0.01"
            min="0"
            value={form.cost_price}
            onChange={set("cost_price")}
          />
          <FormField
            label="Precio de venta (S/)"
            type="number"
            step="0.01"
            min="0"
            value={form.sale_price}
            onChange={set("sale_price")}
          />
          <FormField
            label="Stock mínimo"
            hint="Avisa al llegar a este número."
            type="number"
            step="1"
            min="0"
            value={form.min_stock}
            onChange={set("min_stock")}
          />
        </div>
        {product ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Activo (aparece al registrar cobros)
          </label>
        ) : (
          <FormField
            label="Stock inicial"
            type="number"
            step="1"
            min="0"
            value={form.initial_stock}
            onChange={set("initial_stock")}
          />
        )}
        <DialogFooter>
          <Button type="submit" disabled={save.isPending}>
            {product ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

const STOCK_TITLES: Record<StockAction, string> = {
  receive: "Entrada de mercadería",
  use: "Uso interno",
  count: "Ajuste por conteo",
};

function StockDialog({
  product,
  action,
  onDone,
}: {
  product: Product;
  action: StockAction;
  onDone: () => void;
}) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(action === "count" ? product.stock : "");
  const [cost, setCost] = useState(product.cost_price);
  const [note, setNote] = useState("");
  const path = { params: { path: { product_id: product.id } } };

  const save = useMutation({
    mutationFn: () =>
      action === "receive"
        ? unwrap(
            api.POST("/api/v1/sales/products/{product_id}/receive", {
              ...path,
              body: { quantity: amount, unit_cost: cost || null, note: note || null },
            }),
          )
        : action === "count"
          ? unwrap(
              api.POST("/api/v1/sales/products/{product_id}/count", {
                ...path,
                body: { counted: amount, note: note || null },
              }),
            )
          : unwrap(
              api.POST("/api/v1/sales/products/{product_id}/use", {
                ...path,
                body: { quantity: amount, note: note || null },
              }),
            ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SALES });
      onDone();
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{STOCK_TITLES[action]}</DialogTitle>
        <DialogDescription>
          {product.name}: hay {qty(product.stock)} {product.unit}.
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(save.error)}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={
              action === "count"
                ? `Cantidad contada (${product.unit})`
                : `Cantidad (${product.unit})`
            }
            type="number"
            step="1"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {action === "receive" ? (
            <FormField
              label="Costo unitario (S/)"
              hint="Pasa a ser el costo del producto."
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          ) : null}
        </div>
        <FormField
          label="Nota (opcional)"
          placeholder={action === "receive" ? "Ej.: Factura 001-123" : "Ej.: Conteo mensual"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button type="submit" disabled={save.isPending || !amount}>
            Guardar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function HistoryDialog({ product }: { product: Product }) {
  const { api } = useSessionManager();
  const movements = useQuery({
    queryKey: [...SALES, "movements", product.id],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/sales/products/{product_id}/movements", {
          params: { path: { product_id: product.id } },
        }),
      ),
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Movimientos de {product.name}</DialogTitle>
        <DialogDescription>Los últimos 50, del más reciente.</DialogDescription>
      </DialogHeader>
      {movements.isPending ? (
        <LoadingState label="Cargando…" />
      ) : movements.isError ? (
        <ErrorState error={movements.error} />
      ) : movements.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
      ) : (
        <ul className="grid gap-2">
          {movements.data.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
              <div>
                <span className="font-semibold">{MOVEMENT_LABELS[m.kind]}</span>
                <span className="ml-2 text-xs text-muted-foreground">{formatStamp(m.at)}</span>
                {m.note ? <div className="text-xs text-muted-foreground">{m.note}</div> : null}
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "font-semibold",
                    Number(m.quantity) < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {Number(m.quantity) > 0 ? "+" : ""}
                  {qty(m.quantity)}
                </span>
                <div className="text-xs text-muted-foreground">queda {qty(m.stock_after)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  );
}
