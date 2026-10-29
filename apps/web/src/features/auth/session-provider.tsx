import { useEffect, type ReactNode } from "react";

import type { SessionManager } from "./session";
import { SessionContext } from "./session-context";

/** Expone la sesión y, al montar, intenta recuperarla con la cookie del refresh token. */
export function SessionProvider({
  manager,
  children,
}: {
  manager: SessionManager;
  children: ReactNode;
}) {
  useEffect(() => {
    void manager.restore();
  }, [manager]);
  return <SessionContext value={manager}>{children}</SessionContext>;
}
