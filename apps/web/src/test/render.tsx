import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { createQueryClient } from "@/app/query-client";
import { routes } from "@/app/router";
import { SessionManager } from "@/features/auth/session";
import { SessionProvider } from "@/features/auth/session-provider";

/** Monta la app completa en una ruta, con la API simulada. */
export function renderApp(path: string, fetch: (request: Request) => Promise<Response>) {
  const session = new SessionManager("http://api.test", fetch);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <SessionProvider manager={session}>
      <QueryClientProvider client={createQueryClient(session)}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
  return { ...result, router, session };
}
