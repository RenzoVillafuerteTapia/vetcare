import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { SessionManager } from "@/features/auth/session";
import { SessionProvider } from "@/features/auth/session-provider";
import { API_URL } from "@/lib/env";

import { createQueryClient } from "./query-client";
import { createRouter } from "./router";

export function App() {
  const [session] = useState(() => new SessionManager(API_URL));
  const [queryClient] = useState(() => createQueryClient(session));
  const [router] = useState(createRouter);

  return (
    <SessionProvider manager={session}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
