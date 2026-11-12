import { NavLink, Outlet } from "react-router";

import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/configuracion/servicios", label: "Servicios" },
  { to: "/configuracion/recursos", label: "Recursos" },
  { to: "/configuracion/horario", label: "Horario y feriados" },
];

export function ClinicSetupLayout() {
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Configuración"
        actions={
          <nav aria-label="Configuración" className="flex flex-wrap gap-2">
            {TABS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "rounded-full bg-sidebar px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "bg-secondary text-secondary-foreground",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        }
      />
      <Outlet />
    </div>
  );
}
