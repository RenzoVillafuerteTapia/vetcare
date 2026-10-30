import { SearchX } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto grid min-h-svh max-w-md content-center justify-items-center gap-3 px-4 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">No encontramos esta página</h1>
      <Button asChild variant="outline">
        <Link to="/">Ir al inicio</Link>
      </Button>
    </div>
  );
}
