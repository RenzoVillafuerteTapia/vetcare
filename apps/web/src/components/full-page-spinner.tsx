import { LoaderCircle } from "lucide-react";

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
