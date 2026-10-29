import { PawPrint } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";

/** Acceso: panel de marca a la izquierda en escritorio y formulario a la derecha. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-svh bg-sidebar p-3 lg:grid-cols-[1.05fr_1fr] lg:gap-3">
      <aside className="relative hidden overflow-hidden rounded-[2rem] bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Brand inverted />
        <div className="relative z-10 grid max-w-md gap-5">
          <p className="font-display text-5xl leading-[1.05] font-medium tracking-tight">
            El cuidado diario, hecho simple.
          </p>
          <p className="text-lg text-primary-foreground/85">
            Agenda, seguimiento de servicios y atención clínica de la veterinaria en un solo lugar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="glass">Agenda y citas</Badge>
            <Badge variant="glass">Seguimiento en vivo</Badge>
            <Badge variant="glass">Historial clínico</Badge>
          </div>
        </div>
        <PawPrint
          className="absolute -right-16 -bottom-20 size-96 rotate-[-18deg] text-white/10"
          strokeWidth={1.25}
          aria-hidden
        />
      </aside>

      <main className="flex flex-col items-center justify-center gap-8 px-4 py-10">
        <Brand className="lg:hidden" />
        <div className="w-full max-w-sm">
          <div className="mb-8 grid gap-2">
            <h1 className="text-4xl font-medium">{title}</h1>
            {description ? <p className="text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
