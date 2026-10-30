import { ShieldX } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function ForbiddenPage() {
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-16 text-center">
      <ShieldX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">No tienes acceso a esta sección</h1>
      <p className="text-muted-foreground">
        Si crees que deberías tenerlo, pide al administrador que revise tus roles.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
