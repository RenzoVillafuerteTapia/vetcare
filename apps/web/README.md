# apps/web

Web de administración de la veterinaria (React + TypeScript + Vite).

> Estado: **base de la aplicación y configuración de la clínica.** Tiene inicio de sesión,
> recuperación de contraseña, activación de cuentas invitadas, layout adaptable con navegación
> por permisos, invitación de usuarios, la sección Configuración (servicios, recursos, horario
> y feriados), la sección Clientes (clientes, mascotas con foto, peso y responsables autorizados)
> y la Agenda (calendario por día, semana y mes, y ciclo de vida de las citas). El seguimiento
> llega en la fase 3.

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
├── components/       componentes compartidos (layout, campos de formulario, estados de consulta)
│   └── ui/           componentes de shadcn/ui adaptados al sistema de diseño (docs/design)
├── features/
│   ├── agenda/       calendario (FullCalendar), alta de citas y cambios de estado
│   ├── auth/         sesión, guardias de rutas, login, recuperación y activación
│   ├── clinic-setup/ servicios, recursos con horario y bloqueos, horario y feriados de la sede
│   ├── customers/    clientes, sus mascotas, peso y responsables autorizados
│   ├── home/         inicio, acceso denegado y página no encontrada
│   └── users/        invitación de usuarios
├── lib/              utilidades (errores de la API y de formularios, entorno, clases CSS)
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
npm run e2e          --workspace @vetcare/web   # Playwright, contra la API real
```

Las pruebas montan la aplicación completa con un `fetch` simulado (`src/test/fake-api.ts`):
verifican lo que el usuario ve y lo que se envía a la API, sin depender de un servidor.

## Agenda

- Las horas se muestran siempre en la hora de la sede (America/Lima), sin importar la zona del
  navegador. El calendario trabaja en "UTC" con horas de pared de Lima; la conversión está en
  `src/features/agenda/time.ts`.
- Al agendar solo se ofrecen los horarios libres que informa la API. Si el horario se ocupa
  mientras se llena el formulario, la API responde 409 y se vuelven a pedir los libres.
- Cada intento de agendar lleva una `Idempotency-Key`: reintentar no duplica la cita.

## Recorridos de extremo a extremo

Los recorridos de `e2e/` usan Playwright contra la API real, con el navegador en otra zona
horaria a propósito. Crean sus propios datos (un cliente y una mascota ficticios por ejecución).

```bash
docker compose up -d
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… bash scripts/e2e-bootstrap.sh   # en la raíz, una vez
npx playwright install chromium                                        # una vez
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run e2e --workspace @vetcare/web
```

`e2e-bootstrap.sh` aplica las migraciones, carga la sede ficticia y, en una base sin usuarios,
crea y activa al administrador con esas credenciales. Si la base ya tiene usuarios, usa en
`E2E_ADMIN_*` las de un administrador existente. Sin esas variables, los recorridos se omiten.
