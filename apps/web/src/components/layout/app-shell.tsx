import type { Permission } from "@vetcare/shared";
import { House, LogOut, Menu, UserPlus, X, type LucideIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

import { Brand } from "@/components/brand";
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

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession();
  const permissions = session.status === "authenticated" ? session.user.permissions : [];
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  return (
    <nav aria-label="Principal" className="grid gap-1.5">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
              isActive &&
                "bg-surface-strong text-surface-strong-foreground hover:bg-surface-strong hover:text-surface-strong-foreground",
            )
          }
        >
          <Icon className="size-[1.125rem]" aria-hidden />
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
      <div className="hidden items-center gap-3 rounded-full bg-card py-1.5 pr-4 pl-1.5 sm:flex">
        <span
          className="flex size-9 items-center justify-center rounded-full bg-primary font-display text-sm font-medium text-primary-foreground"
          aria-hidden
        >
          {initials(user.full_name)}
        </span>
        <div className="grid">
          <span className="text-sm leading-tight font-semibold">{user.full_name}</span>
          <span className="text-xs text-muted-foreground">
            {user.roles.map((role) => ROLE_LABELS[role] ?? role).join(", ")}
          </span>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={logout} disabled={leaving}>
        <LogOut aria-hidden />
        Salir
      </Button>
    </div>
  );
}

/**
 * Fondo neutro con la navegación; el contenido va en un panel claro de esquinas amplias.
 * La barra lateral y el encabezado quedan fijos: solo se desplaza el contenido.
 */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-sidebar md:grid md:grid-cols-[16rem_1fr]">
      <aside className="hidden overflow-y-auto p-5 md:flex md:flex-col md:gap-8">
        <Brand className="px-2 pt-1" />
        <Navigation />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 md:h-14 md:px-2">
          <div className="flex items-center gap-2 md:hidden">
            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Dialog.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menú">
                  <Menu aria-hidden />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed inset-y-2 left-2 z-50 flex w-72 flex-col gap-8 rounded-[2rem] bg-sidebar p-5 shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
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
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-4 py-8 md:rounded-[2rem] md:px-10 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
