import { useEffect, type ReactNode } from "react";

import { SessionContext } from "./context";
import type { SessionManager } from "./session";

/** Expone la sesión: al montar intenta recuperarla con el refresh token guardado. */
export function SessionProvider({
  manager,
  children,
}: {
  manager: SessionManager;
  children: ReactNode;
}) {
  useEffect(() => {
    void manager.restore();
    // Al desmontar la app se detiene la renovación programada.
    return () => manager.dispose();
  }, [manager]);
  return <SessionContext value={manager}>{children}</SessionContext>;
}
