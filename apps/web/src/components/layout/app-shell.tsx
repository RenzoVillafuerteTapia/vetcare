import type { Permission } from "@vetcare/shared";
import { House, LogOut, Menu, PawPrint, UserPlus, X, type LucideIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { useSession, useSessionManager } from "@/features/auth/session-context";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

/** Solo secciones que existen. Cada fase agrega las suyas. */
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: House },
  { to: "/usuarios/invitar", label: "Invitar usuario", icon: UserPlus, permission: "users:manage" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administración",
  veterinarian: "Veterinaria",
  assistant: "Asistencia",
  receptionist: "Recepción",
  client: "Cliente",
};

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <PawPrint className="size-4" aria-hidden />
      </span>
      <span className="font-semibold tracking-tight">VetCare</span>
    </div>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession();
  const permissions = session.status === "authenticated" ? session.user.permissions : [];
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  return (
    <nav aria-label="Principal" className="grid gap-1">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-secondary text-secondary-foreground",
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu() {
  const session = useSession();
  const manager = useSessionManager();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  if (session.status !== "authenticated") {
    return null;
  }
  const { user } = session;

  const logout = async () => {
    setLeaving(true);
    try {
      await manager.logout();
    } finally {
      await navigate("/login", { replace: true });
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm leading-tight font-medium">{user.full_name}</p>
        <p className="text-xs text-muted-foreground">
          {user.roles.map((role) => ROLE_LABELS[role] ?? role).join(", ")}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={logout} disabled={leaving}>
        <LogOut aria-hidden />
        Salir
      </Button>
    </div>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r bg-sidebar p-4 md:flex md:flex-col md:gap-6">
        <Brand />
        <Navigation />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Dialog.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menú">
                  <Menu aria-hidden />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 bg-sidebar p-4 shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
                  <div className="flex items-center justify-between">
                    <Dialog.Title asChild>
                      <div>
                        <Brand />
                      </div>
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <Button variant="ghost" size="icon" aria-label="Cerrar menú">
                        <X aria-hidden />
                      </Button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="sr-only">Navegación principal</Dialog.Description>
                  <Navigation onNavigate={() => setMenuOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <Brand />
          </div>
          <div className="hidden md:block" />
          <UserMenu />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
