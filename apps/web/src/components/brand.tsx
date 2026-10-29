import { PawPrint } from "lucide-react";

import { cn } from "@/lib/utils";

export function Brand({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-2xl",
          inverted ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <PawPrint className="size-5" aria-hidden />
      </span>
      <span className="font-display text-xl font-medium tracking-tight">VetCare</span>
    </div>
  );
}
