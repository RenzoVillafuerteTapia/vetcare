import {
  createApiClient,
  type ApiClient,
  type CurrentUser,
  type ProblemDetails,
} from "@vetcare/shared";

import { ApiError, unwrap } from "@/lib/api-error";

import type { TokenStore } from "./token-store";

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous"; reason?: "expired" | "logged_out" }
  | { status: "authenticated"; user: CurrentUser };

type Listener = () => void;

const REFRESH_MARGIN_MS = 60_000;

const STAFF_ACCOUNT: ProblemDetails = {
  type: "/errors/staff-account",
  title: "Cuenta del personal",
  status: 403,
  code: "staff_account",
  detail:
    "Esta app es para dueños y responsables de mascotas. El personal ingresa por la web de administración.",
};

/**
 * Sesión de la app de clientes.
 *
 * - El access token vive solo en memoria.
 * - El refresh token se guarda en SecureStore. La API lo rota en cada uso y reutilizar uno ya
 *   rotado revoca la sesión, así que las renovaciones se serializan y el token nuevo se guarda
 *   antes de usar el access token.
 * - La app es exclusiva para el rol cliente: una cuenta del personal no puede iniciar sesión aquí.
 */
export class SessionManager {
  readonly api: ApiClient;
  private state: SessionState = { status: "loading" };
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<Listener>();

  constructor(
    baseUrl: string,
    private readonly store: TokenStore,
    fetchImpl?: (input: Request) => Promise<Response>,
  ) {
    this.api = createApiClient({
      baseUrl,
      getAccessToken: () => this.accessToken,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionState => this.state;

  /** Al abrir la app: recupera la sesión con el refresh token guardado, si existe. */
  async restore(): Promise<void> {
    const ok = (await this.store.get()) ? await this.refresh() : false;
    if (!ok && this.state.status === "loading") {
      this.setState({ status: "anonymous" });
    }
  }

  /** Lanza `ApiError` si las credenciales no son válidas o la cuenta es del personal. */
  async login(email: string, password: string): Promise<void> {
    const tokens = await unwrap(
      this.api.POST("/api/v1/auth/login", { body: { email, password, client: "mobile" } }),
    );
    if (!tokens.refresh_token) {
      throw new ApiError({
        type: "/errors/unexpected",
        title: "Respuesta inesperada del servidor",
        status: 500,
        code: "missing_refresh_token",
      });
    }
    await this.store.set(tokens.refresh_token);
    await this.startSession(tokens.access_token, tokens.expires_in);
  }

  async logout(reason: "expired" | "logged_out" = "logged_out"): Promise<void> {
    const refreshToken = await this.store.get();
    try {
      if (refreshToken) {
        await this.api.POST("/api/v1/auth/logout", { body: { refresh_token: refreshToken } });
      }
    } catch {
      // Sin red: la sesión se cierra igual en el dispositivo.
    } finally {
      await this.endSession(reason);
    }
  }

  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async handleUnauthorized(): Promise<boolean> {
    const ok = await this.refresh();
    if (!ok) {
      await this.endSession("expired");
    }
    return ok;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.listeners.clear();
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.store.get();
    if (!refreshToken) {
      return false;
    }
    try {
      const tokens = await unwrap(
        this.api.POST("/api/v1/auth/refresh", {
          body: { client: "mobile", refresh_token: refreshToken },
        }),
      );
      if (tokens.refresh_token) {
        await this.store.set(tokens.refresh_token);
      }
      await this.startSession(tokens.access_token, tokens.expires_in);
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await this.endSession(this.state.status === "loading" ? undefined : "expired");
      }
      return false;
    }
  }

  private async startSession(accessToken: string, expiresInSeconds: number): Promise<void> {
    this.accessToken = accessToken;
    const user = await unwrap(this.api.GET("/api/v1/auth/me"));
    if (!user.roles.includes("client")) {
      await this.logout("logged_out");
      throw new ApiError(STAFF_ACCOUNT);
    }
    this.setState({ status: "authenticated", user });
    clearTimeout(this.timer);
    const delay = Math.max(expiresInSeconds * 1000 - REFRESH_MARGIN_MS, 5_000);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  private async endSession(reason?: "expired" | "logged_out"): Promise<void> {
    clearTimeout(this.timer);
    this.accessToken = null;
    await this.store.clear();
    this.setState(reason ? { status: "anonymous", reason } : { status: "anonymous" });
  }

  private setState(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
