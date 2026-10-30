import type { Permission } from "@vetcare/shared";
import { createContext, use, useSyncExternalStore } from "react";

import type { SessionManager, SessionState } from "./session";

export const SessionContext = createContext<SessionManager | null>(null);

export function useSessionManager(): SessionManager {
  const manager = use(SessionContext);
  if (!manager) {
    throw new Error("useSessionManager debe usarse dentro de <SessionProvider>.");
  }
  return manager;
}

export function useSession(): SessionState {
  const manager = useSessionManager();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot);
}

export function usePermission(permission: Permission): boolean {
  const session = useSession();
  return session.status === "authenticated" && session.user.permissions.includes(permission);
}
