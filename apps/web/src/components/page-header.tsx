import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Título de la página con su descripción y, en la misma fila, sus acciones principales: así el
 * contenido empieza más arriba y la pantalla se desplaza menos.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="grid gap-1">
        <h1 className="text-2xl font-medium md:text-3xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
