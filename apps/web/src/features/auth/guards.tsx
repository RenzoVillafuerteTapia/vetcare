import type { Permission } from "@vetcare/shared";
import { Navigate, Outlet, useLocation } from "react-router";

import { FullPageSpinner } from "@/components/full-page-spinner";
import { ForbiddenPage } from "@/features/home/forbidden-page";

import { usePermission, useSession } from "./session-context";

/** Solo deja pasar con sesión; si no, va al login y vuelve a la ruta pedida al ingresar. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.status === "loading") {
    return <FullPageSpinner label="Verificando tu sesión…" />;
  }
  if (session.status === "anonymous") {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname, reason: session.reason }} />
    );
  }
  return <Outlet />;
}

/** Los usuarios con sesión no ven el login ni los formularios de acceso. */
export function RedirectIfAuthenticated() {
  const session = useSession();
  if (session.status === "loading") {
    return <FullPageSpinner label="Cargando…" />;
  }
  return session.status === "authenticated" ? <Navigate to="/" replace /> : <Outlet />;
}

/** Oculta una sección a quien no tiene el permiso. La API lo vuelve a verificar. */
export function RequirePermission({ permission }: { permission: Permission }) {
  return usePermission(permission) ? <Outlet /> : <ForbiddenPage />;
}
