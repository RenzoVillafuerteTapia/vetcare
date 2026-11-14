import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  PackageSearch,
  PawPrint,
  Radio,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STATUS_LABELS, STATUS_STYLES } from "@/features/agenda/labels";
import { limaTime, limaToday } from "@/features/agenda/time";
import { usePermission, useSession, useSessionManager } from "@/features/auth/session-context";
import { METHOD_LABELS, money, productsKey, qty, summaryKey } from "@/features/sales/labels";
import { unwrap } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const longDate = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function nextDayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Panel del día: lo que pasa hoy en la veterinaria, según los permisos de cada persona. */
export function HomePage() {
  const session = useSession();
  const { api } = useSessionManager();
  const seesAgenda = usePermission("appointments:read");
  const seesTracking = usePermission("tracking:read");
  const seesReports = usePermission("reports:read");
  const seesInventory = usePermission("inventory:read");
  const [now] = useState(() => new Date());
  const today = limaToday(now);

  const appointments = useQuery({
    queryKey: ["home", "appointments", today],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/appointments", {
          params: {
            query: { from: `${today}T00:00:00-05:00`, to: `${nextDayOf(today)}T00:00:00-05:00` },
          },
        }),
      ),
    enabled: seesAgenda,
    refetchInterval: 30_000,
  });
  const tracking = useQuery({
    queryKey: ["tracking", "board"],
    queryFn: () => unwrap(api.GET("/api/v1/tracked-services")),
    enabled: seesTracking,
    refetchInterval: 10_000,
  });
  const summary = useQuery({
    queryKey: summaryKey(today, today),
    queryFn: () =>
      unwrap(api.GET("/api/v1/sales/summary", { params: { query: { from: today, to: today } } })),
    enabled: seesReports,
  });
  const products = useQuery({
    queryKey: productsKey("", false),
    queryFn: () => unwrap(api.GET("/api/v1/sales/products")),
    enabled: seesInventory,
  });

  if (session.status !== "authenticated") return null;
  const firstName = session.user.full_name.split(" ")[0] ?? "";

  const todays = (appointments.data ?? []).filter((a) => a.status !== "cancelled");
  const pendingConfirm = todays.filter((a) => a.status === "requested").length;
  const upcoming = todays
    .filter((a) => a.status === "requested" || a.status === "confirmed")
    .sort((a, b) => a.start.localeCompare(b.start));
  const active = (tracking.data ?? []).filter((t) => t.status !== "handed_over");
  const ready = active.filter((t) => t.status === "ready");
  const low = (products.data ?? []).filter((p) => p.low_stock);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-medium md:text-4xl">Hola, {firstName}</h1>
        <p className="text-muted-foreground first-letter:uppercase">
          {longDate.format(now)}. Esto es lo que pasa hoy en la veterinaria.
        </p>
      </header>

      <section
        aria-label="Indicadores del día"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {seesAgenda ? (
          <Kpi
            icon={CalendarDays}
            label="Citas de hoy"
            value={appointments.isPending ? "…" : String(todays.length)}
            hint={pendingConfirm ? `${pendingConfirm} por confirmar` : "Ninguna por confirmar"}
            to="/agenda"
          />
        ) : null}
        {seesTracking ? (
          <Kpi
            icon={Radio}
            label="En atención"
            value={tracking.isPending ? "…" : String(active.length - ready.length)}
            hint={ready.length ? `${ready.length} lista(s) para recoger` : "Ninguna lista todavía"}
            to="/seguimiento"
            highlight={ready.length > 0}
          />
        ) : null}
        {seesReports ? (
          <Kpi
            icon={TrendingUp}
            label="Ingresos de hoy"
            value={summary.data ? money(summary.data.revenue) : "…"}
            hint={summary.data ? `Ganancia ${money(summary.data.profit)}` : ""}
            to="/cobros"
          />
        ) : null}
        {seesInventory ? (
          <Kpi
            icon={PackageSearch}
            label="Stock bajo"
            value={products.isPending ? "…" : String(low.length)}
            hint={low.length ? "Productos por reponer" : "Todo en orden"}
            to="/inventario"
            warning={low.length > 0}
          />
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {seesAgenda ? (
          <Panel title="Próximas citas de hoy" to="/agenda" action="Ver la agenda">
            {upcoming.length === 0 ? (
              <Empty>No quedan citas pendientes hoy.</Empty>
            ) : (
              <ul className="grid gap-2">
                {upcoming.slice(0, 6).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-2xl bg-sidebar px-3 py-2"
                  >
                    <span className="w-12 text-sm font-semibold tabular-nums">
                      {limaTime(a.start)}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      <span className="font-semibold">{a.pet_name}</span> · {a.service_name}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        STATUS_STYLES[a.status],
                      )}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        {seesTracking ? (
          <Panel title="En la veterinaria ahora" to="/seguimiento" action="Ir al seguimiento">
            {active.length === 0 ? (
              <Empty>No hay mascotas en atención.</Empty>
            ) : (
              <ul className="grid gap-2">
                {active.map((t) => {
                  const current = t.stages.find((s) => s.state === "current");
                  const done = t.stages.filter((s) => s.state !== "pending").length;
                  return (
                    <li key={t.id} className="grid gap-1.5 rounded-2xl bg-sidebar px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <PawPrint className="mr-1 inline size-3.5" aria-hidden />
                          <span className="font-semibold">{t.pet_name}</span> · {t.service_name}
                        </span>
                        {t.status === "ready" ? (
                          <Badge variant="soft">Lista para recoger</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{current?.label}</span>
                        )}
                      </div>
                      <div className="flex gap-1" aria-hidden>
                        {t.stages.map((s, i) => (
                          <span
                            key={s.code}
                            className={cn(
                              "h-1.5 flex-1 rounded-full",
                              i < done ? "bg-primary" : "bg-border",
                            )}
                          />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        ) : null}

        {seesReports && summary.data && summary.data.by_method.length > 0 ? (
          <Panel title="Cobros de hoy por medio de pago" to="/cobros" action="Ver los cobros">
            <ul className="grid gap-1 text-sm">
              {summary.data.by_method.map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span>{METHOD_LABELS[m.method]}</span>
                  <span className="font-semibold">{money(m.total)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {seesInventory && low.length > 0 ? (
          <Panel title="Productos por reponer" to="/inventario" action="Ir al inventario">
            <ul className="grid gap-2">
              {low.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <CircleAlert className="size-4 text-destructive" aria-hidden />
                    {p.name}
                  </span>
                  <span className="font-semibold text-destructive">
                    {qty(p.stock)} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  to,
  highlight = false,
  warning = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  to: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "grid gap-2 rounded-3xl border bg-card p-5 transition-colors hover:border-primary/40",
        highlight && "border-primary/50 bg-secondary",
        warning && "border-destructive/40",
      )}
    >
      <span className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
        {label}
        <Icon className={cn("size-5", warning ? "text-destructive" : "text-primary")} aria-hidden />
      </span>
      <span className={cn("text-3xl font-medium", warning && "text-destructive")}>{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </Link>
  );
}

function Panel({
  title,
  to,
  action,
  children,
}: {
  title: string;
  to: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid content-start gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <Link to={to} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {action} <ArrowRight aria-hidden />
        </Link>
      </div>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
