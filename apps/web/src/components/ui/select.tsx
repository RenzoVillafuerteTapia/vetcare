import type * as React from "react";

import { cn } from "@/lib/utils";

/** Lista desplegable nativa con la forma de los campos de texto. */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-11 w-full min-w-0 rounded-2xl border border-input bg-field px-4 text-base transition-[color,box-shadow,background-color] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:bg-destructive/5 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
