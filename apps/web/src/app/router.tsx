import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { AppShell } from "@/components/layout/app-shell";
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from "@/features/auth/guards";
import { LoginPage } from "@/features/auth/login-page";
import { HomePage } from "@/features/home/home-page";
import { NotFoundPage } from "@/features/home/not-found-page";

export const routes: RouteObject[] = [
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        path: "/recuperar-contrasena",
        lazy: async () => ({
          Component: (await import("@/features/auth/forgot-password-page")).ForgotPasswordPage,
        }),
      },
    ],
  },
  // Los enlaces de los correos funcionan con o sin sesión abierta. Las páginas poco frecuentes se
  // cargan bajo demanda para que el inicio de sesión descargue menos.
  {
    path: "/activar-cuenta",
    lazy: async () => {
      const { SetPasswordPage } = await import("@/features/auth/set-password-page");
      return { Component: () => <SetPasswordPage mode="activate" /> };
    },
  },
  {
    path: "/restablecer-contrasena",
    lazy: async () => {
      const { SetPasswordPage } = await import("@/features/auth/set-password-page");
      return { Component: () => <SetPasswordPage mode="reset" /> };
    },
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequirePermission permission="users:manage" />,
            children: [
              {
                path: "/usuarios/invitar",
                lazy: async () => ({
                  Component: (await import("@/features/users/invite-user-page")).InviteUserPage,
                }),
              },
            ],
          },
          {
            element: <RequirePermission permission="pets:read" />,
            children: [
              {
                path: "/clientes",
                lazy: async () => ({
                  Component: (await import("@/features/customers/clients-page")).ClientsPage,
                }),
              },
              {
                path: "/clientes/:clientId",
                lazy: async () => ({
                  Component: (await import("@/features/customers/client-page")).ClientPage,
                }),
              },
              {
                path: "/mascotas/:petId",
                lazy: async () => ({
                  Component: (await import("@/features/customers/pet-page")).PetPage,
                }),
              },
            ],
          },
          {
            element: <RequirePermission permission="clinic_setup:manage" />,
            children: [
              {
                path: "/configuracion",
                lazy: async () => ({
                  Component: (await import("@/features/clinic-setup/clinic-setup-layout"))
                    .ClinicSetupLayout,
                }),
                children: [
                  { index: true, element: <Navigate to="servicios" replace /> },
                  {
                    path: "servicios",
                    lazy: async () => ({
                      Component: (await import("@/features/clinic-setup/service-types-page"))
                        .ServiceTypesPage,
                    }),
                  },
                  {
                    path: "recursos",
                    lazy: async () => ({
                      Component: (await import("@/features/clinic-setup/resources-page"))
                        .ResourcesPage,
                    }),
                  },
                  {
                    path: "horario",
                    lazy: async () => ({
                      Component: (await import("@/features/clinic-setup/calendar-page"))
                        .CalendarPage,
                    }),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
