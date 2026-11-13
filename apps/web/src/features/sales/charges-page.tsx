import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Plus, Receipt, Trash2, TrendingUp } from "lucide-react";
import { useId, useState } from "react";

import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/query-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { limaTime, limaToday } from "@/features/agenda/time";
import { usePermission, useSessionManager } from "@/features/auth/session-context";
import { errorMessage, unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import {
  chargesKey,
  KIND_LABELS,
  METHOD_LABELS,
  money,
  productsKey,
  qty,
  SALES,
  summaryKey,
  type Charge,
  type LineKind,
  type PaymentMethod,
  type Summary,
} from "./labels";

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Últimos 7 días",
  month: "Este mes",
};

function periodRange(period: Period, today: string): { from: string; to: string } {
  const day = new Date(`${today}T12:00:00Z`);
  if (period === "week") {
    day.setUTCDate(day.getUTCDate() - 6);
    return { from: day.toISOString().slice(0, 10), to: today };
  }
  if (period === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: today, to: today };
}

/** Cobros registrados (no se procesa ningún pago) y la ganancia del periodo. */
export function ChargesPage() {
  const { api } = useSessionManager();
  const canSeeReports = usePermission("reports:read");
  const [today] = useState(() => limaToday());
  const [period, setPeriod] = useState<Period>("today");
  const [registering, setRegistering] = useState(false);
  const [voiding, setVoiding] = useState<Charge | null>(null);
  const { from, to } = periodRange(period, today);

  const charges = useQuery({
    queryKey: chargesKey(from, to),
    queryFn: () => unwrap(api.GET("/api/v1/sales/charges", { params: { query: { from, to } } })),
  });
  const summary = useQuery({
    queryKey: summaryKey(from, to),
    queryFn: () => unwrap(api.GET("/api/v1/sales/summary", { params: { query: { from, to } } })),
    enabled: canSeeReports,
  });

  return (
    <>
      <PageHeader
        title="Cobros"
        description="Registra lo que cobras para llevar el control de ingresos y ganancias."
        actions={
          <Button onClick={() => setRegistering(true)}>
            <Plus aria-hidden /> Registrar cobro
          </Button>
        }
      />

      <div role="tablist" aria-label="Periodo" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <Button
            key={p}
            role="tab"
            aria-selected={period === p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
      </div>

      {canSeeReports ? <SummaryCards summary={summary.data} loading={summary.isPending} /> : null}

      <h2 className="mt-6 mb-3 text-lg font-medium">Detalle</h2>
      {charges.isPending ? (
        <LoadingState label="Cargando los cobros…" />
      ) : charges.isError ? (
        <ErrorState error={charges.error} onRetry={() => void charges.refetch()} />
      ) : charges.data.length === 0 ? (
        <EmptyState title="No hay cobros en este periodo">
          <Button onClick={() => setRegistering(true)}>
            <Receipt aria-hidden /> Registrar el primero
          </Button>
        </EmptyState>
      ) : (
        <ul className="grid gap-2" aria-label="Cobros">
          {charges.data.map((c) => (
            <li key={c.id}>
              <Card
                className={cn(
                  "flex-row flex-wrap items-center justify-between gap-3 p-4",
                  c.status === "voided" && "opacity-60",
                )}
              >
                <div className="grid gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {c.customer_name ?? "Cliente sin nombre"}
                      {c.pet_name ? ` · ${c.pet_name}` : ""}
                    </span>
                    <Badge variant="soft">{METHOD_LABELS[c.method]}</Badge>
                    {c.status === "voided" ? (
                      <Badge className="border-destructive/40 text-destructive">Anulado</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {period === "today" ? limaTime(c.at) : `${c.at.slice(0, 10)} ${limaTime(c.at)}`}{" "}
                    · {c.lines.map((l) => `${qty(l.quantity)} × ${l.description}`).join(", ")}
                  </p>
                  {c.void_reason ? (
                    <p className="text-xs text-destructive">Motivo: {c.void_reason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn("text-lg font-medium", c.status === "voided" && "line-through")}
                  >
                    {money(c.total)}
                  </span>
                  {c.status === "registered" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Anular el cobro de ${money(c.total)}`}
                      onClick={() => setVoiding(c)}
                    >
                      <Ban aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={registering} onOpenChange={setRegistering}>
        {registering ? <ChargeDialog onDone={() => setRegistering(false)} /> : null}
      </Dialog>
      <Dialog open={voiding !== null} onOpenChange={(open) => !open && setVoiding(null)}>
        {voiding ? <VoidDialog charge={voiding} onDone={() => setVoiding(null)} /> : null}
      </Dialog>
    </>
  );
}

export function SummaryCards({ summary, loading }: { summary?: Summary; loading: boolean }) {
  if (loading || !summary) return <LoadingState label="Calculando…" />;
  const margin = Number(summary.revenue) > 0 ? Number(summary.profit) / Number(summary.revenue) : 0;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground">Ingresos</p>
          <p className="text-2xl font-medium">{money(summary.revenue)}</p>
          <p className="text-xs text-muted-foreground">
            {summary.count} {summary.count === 1 ? "cobro" : "cobros"}
            {summary.voided ? ` · ${summary.voided} anulado(s)` : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground">Costo de productos</p>
          <p className="text-2xl font-medium">{money(summary.product_cost)}</p>
        </Card>
        <Card className="border-primary/40 bg-secondary p-4">
          <p className="flex items-center gap-1 text-xs font-semibold text-secondary-foreground">
            <TrendingUp className="size-3.5" aria-hidden /> Ganancia
          </p>
          <p className="text-2xl font-medium">{money(summary.profit)}</p>
          <p className="text-xs text-muted-foreground">Margen {Math.round(margin * 100)}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground">Por medio de pago</p>
          {summary.by_method.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="text-sm">
              {summary.by_method.map((m) => (
                <li key={m.method} className="flex justify-between gap-2">
                  <span>{METHOD_LABELS[m.method]}</span>
                  <span className="font-semibold">{money(m.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        La ganancia es bruta: ingresos menos el costo de los productos vendidos. No descuenta
        sueldos, alquiler ni otros gastos.
      </p>
    </div>
  );
}

interface DraftLine {
  key: number;
  kind: LineKind;
  productId: string;
  serviceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function ChargeDialog({ onDone }: { onDone: () => void }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const methodId = useId();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [customer, setCustomer] = useState("");
  const [pet, setPet] = useState("");
  const [notes, setNotes] = useState("");
  const [next, setNext] = useState(1);

  const products = useQuery({
    queryKey: productsKey("", false),
    queryFn: () => unwrap(api.GET("/api/v1/sales/products")),
  });
  const services = useQuery({
    queryKey: ["clinic", "service-types"],
    queryFn: () => unwrap(api.GET("/api/v1/clinic/service-types")),
  });

  const add = (kind: LineKind) => {
    setLines([
      ...lines,
      {
        key: next,
        kind,
        productId: "",
        serviceId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
    setNext(next + 1);
  };
  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/sales/charges", {
          body: {
            lines: lines.map((l) => ({
              kind: l.kind,
              quantity: l.quantity || "1",
              unit_price: l.unitPrice || null,
              description: l.description || null,
              product_id: l.kind === "product" ? l.productId || null : null,
              service_type_id: l.kind === "service" ? l.serviceId || null : null,
            })),
            method,
            customer_name: customer.trim() || null,
            pet_name: pet.trim() || null,
            notes: notes.trim() || null,
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SALES });
      onDone();
    },
  });

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Registrar cobro</DialogTitle>
        <DialogDescription>
          Solo se registra lo cobrado; los productos se descuentan del stock.
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
            label="Cliente (opcional)"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
          <FormField
            label="Mascota (opcional)"
            value={pet}
            onChange={(e) => setPet(e.target.value)}
          />
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">Conceptos</legend>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Agrega un servicio, producto u otro concepto.
            </p>
          ) : null}
          {lines.map((l, index) => (
            <div
              key={l.key}
              className="grid items-end gap-2 rounded-2xl bg-sidebar p-3 sm:grid-cols-[1fr_6rem_8rem_auto]"
              aria-label={`Concepto ${index + 1}`}
              role="group"
            >
              {l.kind === "product" ? (
                <div className="grid gap-1">
                  <Label htmlFor={`p-${l.key}`}>Producto</Label>
                  <Select
                    id={`p-${l.key}`}
                    value={l.productId}
                    onChange={(e) => {
                      const product = products.data?.find((p) => p.id === e.target.value);
                      update(l.key, {
                        productId: e.target.value,
                        unitPrice: product?.sale_price ?? "",
                      });
                    }}
                  >
                    <option value="">Elige un producto</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.id} value={p.id} disabled={Number(p.stock) <= 0}>
                        {p.name} ({qty(p.stock)} {p.unit})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : l.kind === "service" ? (
                <div className="grid gap-1">
                  <Label htmlFor={`s-${l.key}`}>Servicio</Label>
                  <Select
                    id={`s-${l.key}`}
                    value={l.serviceId}
                    onChange={(e) => {
                      const service = services.data?.find((s) => s.id === e.target.value);
                      update(l.key, {
                        serviceId: e.target.value,
                        description: service?.name ?? "",
                      });
                    }}
                  >
                    <option value="">Elige un servicio</option>
                    {(services.data ?? [])
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </Select>
                </div>
              ) : (
                <div className="grid gap-1">
                  <Label htmlFor={`o-${l.key}`}>Concepto</Label>
                  <Input
                    id={`o-${l.key}`}
                    value={l.description}
                    placeholder="Ej.: Certificado de salud"
                    onChange={(e) => update(l.key, { description: e.target.value })}
                  />
                </div>
              )}
              <div className="grid gap-1">
                <Label htmlFor={`q-${l.key}`}>Cantidad</Label>
                <Input
                  id={`q-${l.key}`}
                  type="number"
                  min="0"
                  step="1"
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`u-${l.key}`}>Precio (S/)</Label>
                <Input
                  id={`u-${l.key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.unitPrice}
                  onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Quitar el concepto ${index + 1}`}
                onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(["service", "product", "other"] as LineKind[]).map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => add(kind)}
              >
                <Plus aria-hidden /> {KIND_LABELS[kind]}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={methodId}>Medio de pago</Label>
            <Select
              id={methodId}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notas-cobro">Notas (opcional)</Label>
            <Textarea
              id="notas-cobro"
              rows={1}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <p className="text-lg">
            Total: <strong>{money(total)}</strong>
          </p>
          <Button type="submit" disabled={save.isPending || lines.length === 0}>
            <Receipt aria-hidden /> Registrar cobro
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function VoidDialog({ charge, onDone }: { charge: Charge; onDone: () => void }) {
  const { api } = useSessionManager();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const voidCharge = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/sales/charges/{charge_id}/void", {
          params: { path: { charge_id: charge.id } },
          body: { reason },
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
        <DialogTitle>Anular el cobro de {money(charge.total)}</DialogTitle>
        <DialogDescription>
          Deja de sumar en los ingresos y los productos vuelven al stock. No se puede deshacer.
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          voidCharge.mutate();
        }}
      >
        {voidCharge.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(voidCharge.error)}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          label="Motivo"
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button
            type="submit"
            variant="destructive"
            disabled={voidCharge.isPending || reason.trim().length < 3}
          >
            Anular cobro
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
