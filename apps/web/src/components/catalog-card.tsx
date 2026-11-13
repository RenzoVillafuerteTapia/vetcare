import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

export type ChipTone = "green" | "blue" | "pink" | "amber" | "gray";

const CHIP_TONES: Record<ChipTone, string> = {
  green: "border-emerald-600/40 text-emerald-700",
  blue: "border-sky-600/40 text-sky-700",
  pink: "border-pink-600/40 text-pink-700",
  amber: "border-amber-600/50 text-amber-800",
  gray: "border-border text-muted-foreground",
};

export interface CatalogChip {
  label: string;
  tone?: ChipTone;
}

interface CatalogCardProps {
  /** Imagen o ícono de la parte superior. */
  media: ReactNode;
  title: string;
  /** Etiqueta destacada en la esquina (p. ej. "Stock bajo"). */
  corner?: { label: string; tone?: "red" | "dark" | "green" } | null;
  chips?: CatalogChip[];
  /** El dato principal, grande (precio, teléfono, raza…). */
  highlight?: ReactNode;
  /** Dato secundario junto al principal, más pequeño. */
  secondary?: ReactNode;
  /** Línea final (p. ej. el stock o los responsables). */
  footer?: ReactNode;
  footerTone?: "ok" | "warn" | "muted";
  /** Toda la tarjeta lleva aquí; si hay acciones, solo la imagen y el título. */
  to?: string;
  actions?: ReactNode;
  className?: string;
}

const CORNER_TONES = {
  red: "bg-destructive text-white",
  dark: "bg-surface-strong text-surface-strong-foreground",
  green: "bg-success text-white",
};

/** Tarjeta de catálogo: imagen arriba, etiquetas, nombre y el dato principal destacado. */
export function CatalogCard({
  media,
  title,
  corner,
  chips = [],
  highlight,
  secondary,
  footer,
  footerTone = "muted",
  to,
  actions,
  className,
}: CatalogCardProps) {
  const top = (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-sidebar">
      {media}
      {corner ? (
        <span
          className={cn(
            "absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm",
            CORNER_TONES[corner.tone ?? "red"],
          )}
        >
          {corner.label}
        </span>
      ) : null}
    </div>
  );
  const body = (
    <div className="grid gap-2 p-4">
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                CHIP_TONES[chip.tone ?? "gray"],
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      <h3 className="line-clamp-2 min-h-[2.5rem] text-sm leading-5 font-semibold text-foreground">
        {title}
      </h3>
      {highlight || secondary ? (
        <p className="flex flex-wrap items-baseline gap-x-2">
          {highlight ? <span className="text-lg font-bold text-primary">{highlight}</span> : null}
          {secondary ? <span className="text-xs text-muted-foreground">{secondary}</span> : null}
        </p>
      ) : null}
      {footer ? (
        <p
          className={cn(
            "text-xs font-semibold",
            footerTone === "ok" && "text-success",
            footerTone === "warn" && "text-destructive",
            footerTone === "muted" && "text-muted-foreground",
          )}
        >
          {footer}
        </p>
      ) : null}
    </div>
  );
  const shell = cn(
    "group grid content-start overflow-hidden rounded-3xl border border-border/70 bg-card transition-shadow hover:shadow-md",
    className,
  );

  if (to && !actions) {
    return (
      <Link
        to={to}
        className={cn(shell, "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50")}
      >
        {top}
        {body}
      </Link>
    );
  }
  return (
    <article className={shell}>
      {to ? (
        <Link to={to} aria-label={title} className="outline-none focus-visible:ring-[3px]">
          {top}
        </Link>
      ) : (
        top
      )}
      {body}
      {actions ? <div className="flex flex-wrap gap-1 px-4 pb-4">{actions}</div> : null}
    </article>
  );
}

/** Rejilla de tarjetas: 2 columnas en el teléfono, hasta 5 en pantallas anchas. */
export function CatalogGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
    >
      {children}
    </ul>
  );
}
