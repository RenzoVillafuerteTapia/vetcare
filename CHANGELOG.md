# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Corregido

- La web de administración rechaza las cuentas de cliente (que usan la app móvil) y revoca la sesión que abrieron.
- La barra lateral y el encabezado de la web quedan fijos; solo se desplaza el contenido.
- Los campos de texto de la web y la app tienen un relleno y un borde que se distinguen del fondo.

### Agregado

- Clinic Setup: catálogo de servicios, recursos agendables con horario semanal y bloqueos, horario de atención y feriados de la sede (America/Lima), con permisos por rol y contrato público `ClinicCatalog` para la agenda.
- Comando `python -m vetcare.cli seed-clinic` con una configuración ficticia de la sede.
- Customers & Pets: clientes con documento y teléfono validados, mascotas con historial de peso, tutela con dueños y responsables autorizados (al menos un dueño siempre), acceso por tutela con aislamiento entre clientes, búsqueda paginada, invitación del cliente a la app y contrato público `PetAccess`.
- Identity: `invite_client`, para que la recepción invite clientes sin `users:manage`.

### Cambiado

- `identity.public` expone solo tipos del dominio; las dependencias HTTP pasan a `identity.public.http`.

## [0.1.0] - 2026-10-29

Fase 1: fundamentos. Primera versión con la API, la web de administración y la app móvil de
clientes conectadas por contratos tipados. Todavía no incluye funcionalidades operativas (agenda,
mascotas, seguimiento): llegan en las fases 2 y 3.

### Cambiado

- Los Pull Requests se fusionan con merge commit en lugar de squash, para conservar cada commit en el historial de `develop`. Los PRs #9 a #13 se fusionaron con squash; sus commits individuales siguen visibles en cada PR.

### Agregado

- Documentación de arquitectura, bounded contexts, modelo de dominio y flujos principales.
- ADR 0001 a 0004: monolito modular, arquitectura hexagonal, outbox transaccional y SSE con push.
- Convenciones de contribución, plantillas de Issues y Pull Requests, y validación de Conventional Commits.
- Estructura del monorepo, Docker Compose con MySQL 8.4 y la API, y `.env.example`.
- API mínima con configuración por entorno, CORS restringido y `GET /api/v1/health`.
- Workflow de CI de la API: Ruff, mypy, pytest y cobertura, solo cuando cambia `apps/api`.
- Shared kernel: `AggregateRoot`, `DomainEvent`, errores de dominio, `Clock`, puerto `UnitOfWork` e identificadores UUID v7.
- Persistencia asíncrona con SQLAlchemy y asyncmy, unidad de trabajo con outbox transaccional y Alembic con la migración de `outbox_events`.
- Errores HTTP en formato problem+json (RFC 9457) con mensajes de validación en español.
- `GET /api/v1/health/ready`, que verifica la conexión a MySQL.
- Pruebas de arquitectura que verifican las reglas de dependencia entre capas, y pruebas de integración contra MySQL en local y en CI.
- Identity & Access: invitaciones por correo, activación, login con access token JWT y refresh token rotativo (cookie HttpOnly para la web, cuerpo para la app móvil), detección de reutilización, cierre de sesión, recuperación de contraseña, bloqueo tras intentos fallidos, roles y permisos explícitos, límite de solicitudes y auditoría de accesos.
- Comando `python -m vetcare.cli create-admin` para crear el primer administrador.
- Contrato OpenAPI exportable sin servidor (`python -m vetcare.cli export-openapi`) con los errores documentados como `application/problem+json`.
- Paquete `@vetcare/shared` (npm workspaces): contrato versionado, tipos generados con openapi-typescript, cliente tipado con openapi-fetch y utilidades para errores; workflow `Contratos` que detecta contratos desactualizados.
- Web de administración (`apps/web`): Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind + shadcn/ui; inicio de sesión, recuperación de contraseña, activación de cuentas invitadas, renovación de sesión serializada entre pestañas, rutas protegidas por permiso, layout adaptable e invitación de usuarios; workflow `Web` con lint, formato, tipos, pruebas y build.
- App móvil de clientes (`apps/mobile`): Expo SDK 58, Expo Router, TanStack Query, React Hook Form + Zod; refresh token en SecureStore, recuperación de sesión al abrir la app, renovación serializada, solo para el rol cliente, inicio de sesión, recuperación de contraseña e inicio con el sistema de diseño; workflow `Móvil` con lint, formato, tipos, pruebas y bundle de Android.
- Sistema de diseño (`docs/design`): tipografía Fredoka y Nunito servida desde el proyecto, esquinas amplias, botones y etiquetas tipo píldora, tarjeta destacada oscura y paleta verde azulada.

[Sin publicar]: https://github.com/RenzoVillafuerteTapia/vetcare/compare/v0.1.0...develop
[0.1.0]: https://github.com/RenzoVillafuerteTapia/vetcare/releases/tag/v0.1.0
