import { CalendarClock, Scissors, Stethoscope } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/features/auth/session-context";

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
  const firstName =
    session.status === "authenticated" ? (session.user.full_name.split(" ")[0] ?? "") : "";

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="El panel operativo se mostrará aquí a medida que se habiliten los módulos."
      />
      <section aria-labelledby="proximos" className="grid gap-4">
        <h2 id="proximos" className="text-sm font-medium text-muted-foreground">
          Módulos en preparación
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {UPCOMING.map(({ icon: Icon, title, description, phase }) => (
            <Card key={title} className="gap-3">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {phase}
                  </span>
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
