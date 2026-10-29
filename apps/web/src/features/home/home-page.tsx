import { ArrowRight, CalendarClock, PawPrint, Scissors, Stethoscope, UserPlus } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermission, useSession } from "@/features/auth/session-context";

/** Lo que llega en las próximas fases. Se reemplaza por indicadores reales al construirlos. */
const UPCOMING = [
  {
    icon: CalendarClock,
    title: "Agenda y citas",
    description: "Citas del día, confirmaciones y disponibilidad por profesional.",
    phase: "Fase 2",
  },
  {
    icon: Scissors,
    title: "Baños y peluquería",
    description: "Seguimiento por etapas, visible para el dueño en tiempo real.",
    phase: "Fase 3",
  },
  {
    icon: Stethoscope,
    title: "Cirugías y hospitalización",
    description: "Evolución del procedimiento y alta autorizada por el veterinario.",
    phase: "Fase 3",
  },
];

export function HomePage() {
  const session = useSession();
  const canManageUsers = usePermission("users:manage");
  const firstName =
    session.status === "authenticated" ? (session.user.full_name.split(" ")[0] ?? "") : "";

  return (
    <div className="grid gap-8">
      <header className="grid gap-1.5">
        <h1 className="text-4xl font-medium md:text-5xl">Hola, {firstName}</h1>
        <p className="text-lg text-muted-foreground">Este es el punto de partida de tu jornada.</p>
      </header>

      <section className="relative overflow-hidden rounded-[2rem] bg-surface-strong p-7 text-surface-strong-foreground md:p-9">
        <div className="relative z-10 grid max-w-xl gap-4">
          <Badge variant="glass" className="w-fit">
            <PawPrint aria-hidden />
            Fase 1 · Fundamentos
          </Badge>
          <h2 className="text-3xl font-medium">El panel operativo se arma por etapas</h2>
          <p className="text-surface-strong-foreground/80">
            Aquí aparecerán las citas del día, las mascotas en servicio y las que están listas para
            recoger, con datos reales a medida que se habilite cada módulo.
          </p>
          {canManageUsers ? (
            <Button asChild variant="secondary" className="w-fit">
              <Link to="/usuarios/invitar">
                <UserPlus aria-hidden />
                Invitar al equipo
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
        <PawPrint
          className="absolute -right-10 -bottom-14 size-72 rotate-[-18deg] text-white/[0.07]"
          strokeWidth={1.25}
          aria-hidden
        />
      </section>

      <section aria-labelledby="proximos" className="grid gap-4">
        <h2 id="proximos" className="text-xl font-medium">
          Módulos en preparación
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {UPCOMING.map(({ icon: Icon, title, description, phase }) => (
            <article key={title} className="grid content-start gap-4 rounded-3xl bg-sidebar p-6">
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-card text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <Badge>{phase}</Badge>
              </div>
              <div className="grid gap-1">
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
