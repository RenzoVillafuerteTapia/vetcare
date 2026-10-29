# apps/web

Web de administración de la veterinaria (React + TypeScript + Vite).

> Estado: **base de la aplicación.** Tiene inicio de sesión, recuperación de contraseña,
> activación de cuentas invitadas, layout adaptable con navegación por permisos e invitación de
> usuarios. Los módulos operativos (agenda, mascotas, seguimiento) llegan en las fases 2 y 3.

## Ejecutar

```bash
npm install                      # en la raíz del monorepo (workspaces)
docker compose up -d             # la API en http://localhost:8000
cp apps/web/.env.example apps/web/.env.local
npm run web:dev                  # http://localhost:5173
```

La API debe permitir el origen de la web con `VETCARE_CORS_ORIGINS=["http://localhost:5173"]`
(viene así en `.env.example`).

## Estructura

```
src/
├── app/              composición: router, cliente de TanStack Query, raíz de la app
├── components/       componentes compartidos (layout, campos de formulario)
│   └── ui/           componentes de shadcn/ui adaptados al sistema de diseño (docs/design)
├── features/
│   ├── auth/         sesión, guardias de rutas, login, recuperación y activación
│   ├── home/         inicio, acceso denegado y página no encontrada
│   └── users/        invitación de usuarios
├── lib/              utilidades (errores de la API, entorno, clases CSS)
└── test/             ayudas de pruebas (API simulada, render de la app)
```

## Sesión

- El **access token** vive solo en memoria; nunca en `localStorage`.
- El **refresh token** viaja en la cookie `HttpOnly` que pone la API; la web no puede leerlo.
- Al cargar la página se recupera la sesión con la cookie. El access token se renueva un minuto
  antes de vencer y, si una consulta recibe 401, se intenta renovar una vez.
- Las renovaciones se **serializan**: una a la vez por pestaña y entre pestañas con la Web Locks
  API. Si dos renovaciones usaran el mismo refresh token, la API lo trataría como reutilización y
  cerraría la sesión.
- Los permisos de la API (`/auth/me`) deciden qué secciones se muestran. Es solo comodidad: la
  API vuelve a verificar cada operación.

## Comandos

```bash
npm run dev          --workspace @vetcare/web
npm run build        --workspace @vetcare/web
npm run lint         --workspace @vetcare/web
npm run format:check --workspace @vetcare/web
npm run typecheck    --workspace @vetcare/web
npm test             --workspace @vetcare/web
```

Las pruebas montan la aplicación completa con un `fetch` simulado (`src/test/fake-api.ts`):
verifican lo que el usuario ve y lo que se envía a la API, sin depender de un servidor.
