import {
  createApiClient,
  type ApiClient,
  type CurrentUser,
  type Permission,
} from "@vetcare/shared";

import { ApiError, unwrap } from "@/lib/api-error";

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous"; reason?: "expired" | "logged_out" }
  | { status: "authenticated"; user: CurrentUser };

type Listener = () => void;

/** Margen para renovar el access token antes de que venza. */
const REFRESH_MARGIN_MS = 60_000;
const LOCK_NAME = "vetcare-session-refresh";

/**
 * Sesión de la web de administración.
 *
 * - El access token vive solo en memoria (no en localStorage) para reducir el impacto de un XSS.
 * - El refresh token viaja en una cookie HttpOnly que la API rota en cada uso. Como reutilizar un
 *   refresh token ya rotado revoca la sesión, las renovaciones se serializan: una sola a la vez en
 *   esta pestaña y, con la Web Locks API, entre pestañas.
 */
export class SessionManager {
  readonly api: ApiClient;
  private state: SessionState = { status: "loading" };
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<Listener>();

  constructor(baseUrl: string, fetchImpl?: (input: Request) => Promise<Response>) {
    this.api = createApiClient({
      baseUrl,
      credentials: "include",
      getAccessToken: () => this.accessToken,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  // --- Suscripción para useSyncExternalStore -----------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionState => this.state;

  hasPermission(permission: Permission): boolean {
    return (
      this.state.status === "authenticated" && this.state.user.permissions.includes(permission)
    );
  }

  // --- Operaciones -------------------------------------------------------------------------

  /** Al cargar la página: recupera la sesión con la cookie, si existe. */
  async restore(): Promise<void> {
    const ok = await this.refresh();
    if (!ok && this.state.status === "loading") {
      this.setState({ status: "anonymous" });
    }
  }

  /** Lanza `ApiError` si las credenciales no son válidas; la UI muestra su mensaje. */
  async login(email: string, password: string): Promise<void> {
    const tokens = await unwrap(
      this.api.POST("/api/v1/auth/login", { body: { email, password, client: "web" } }),
    );
    await this.startSession(tokens.access_token, tokens.expires_in);
  }

  async logout(): Promise<void> {
    try {
      await this.api.POST("/api/v1/auth/logout", { body: {} });
    } finally {
      this.endSession("logged_out");
    }
  }

  /** Renueva el access token. Varias llamadas simultáneas comparten la misma renovación. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.withCrossTabLock(() => this.doRefresh()).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** La API respondió 401 a una consulta: intenta renovar una vez; si no, la sesión terminó. */
  async handleUnauthorized(): Promise<boolean> {
    const ok = await this.refresh();
    if (!ok) {
      this.endSession("expired");
    }
    return ok;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.listeners.clear();
  }

  // --- Internos ----------------------------------------------------------------------------

  private async doRefresh(): Promise<boolean> {
    try {
      const tokens = await unwrap(
        this.api.POST("/api/v1/auth/refresh", { body: { client: "web" } }),
      );
      await this.startSession(tokens.access_token, tokens.expires_in);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && this.state.status !== "loading") {
        this.endSession("expired");
      }
      return false;
    }
  }

  private async startSession(accessToken: string, expiresInSeconds: number): Promise<void> {
    this.accessToken = accessToken;
    const user = await unwrap(this.api.GET("/api/v1/auth/me"));
    this.setState({ status: "authenticated", user });
    clearTimeout(this.timer);
    const delay = Math.max(expiresInSeconds * 1000 - REFRESH_MARGIN_MS, 5_000);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  private endSession(reason: "expired" | "logged_out"): void {
    clearTimeout(this.timer);
    this.accessToken = null;
    this.setState({ status: "anonymous", reason });
  }

  private async withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks ? locks.request(LOCK_NAME, task) : task();
  }

  private setState(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
