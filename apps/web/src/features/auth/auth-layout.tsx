import { PawPrint } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

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
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-sidebar px-4 py-10">
      <div className="flex items-center gap-2 text-primary">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PawPrint className="size-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">VetCare</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg leading-none font-semibold">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
