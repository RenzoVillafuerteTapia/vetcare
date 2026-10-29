# Hoja de ruta

El MVP comprende las fases 0 a 3. Las fases 4 a 6 están planificadas y no se implementan hasta
nueva indicación. Cada fase cierra con un merge de `develop` a `main` y una etiqueta.

| Fase | Contenido | Versión | Estado |
|---|---|---|---|
| 0 | Descubrimiento, arquitectura y documentación | — | En curso |
| 1 | Fundamentos: monorepo, CI, autenticación, permisos, bases web y móvil | v0.1.0 | Planificado |
| 2 | Clinic Setup, clientes, mascotas, tutela y agenda | v0.2.0 | Planificado |
| 3 | Seguimiento de baños y cirugías, SSE y notificaciones push | v0.3.0 | Planificado |
| 4 | Historial clínico y tratamientos | v0.4.0 | Pendiente |
| 5 | Notificaciones completas, presupuestos, pagos y comprobantes internos | v0.5.0 | Pendiente |
| 6 | Inventario, reportes avanzados e integraciones externas | v0.6.0 | Pendiente |

## Cambios respecto de la propuesta inicial

- **Clinic Setup entra en la fase 2**: la agenda necesita el catálogo de servicios, los recursos
  y el horario de la sede.
- **Un núcleo de Notifications entra en la fase 3** (outbox, tokens de dispositivo, push y
  deduplicación), porque el seguimiento lo necesita. Las preferencias y los demás canales
  quedan en la fase 5.
- **El dashboard de la web se construye al final de la fase 3** y solo muestra indicadores de
  datos ya existentes (citas y servicios). Los indicadores de pagos e inventario se agregan en
  sus fases.

## Pull Requests previstos

### Fase 0

| Rama | Contenido |
|---|---|
| `docs/architecture-overview` | README, CONTRIBUTING, arquitectura, dominio, ADR 0001–0004, plantillas y commitlint |

### Fase 1

| Rama | Contenido |
|---|---|
| `chore/monorepo-bootstrap` | Estructura, Docker Compose (MySQL y API), `.env.example`, API mínima con salud, configuración de calidad |
| `ci/pipelines` | Workflows de la API, web y móvil con filtro por rutas |
| `feature/api-foundation` | Sesión de base de datos asíncrona, Alembic, unidad de trabajo, outbox, errores problem+json, auditoría |
| `feature/identity-access` | Login, refresh con rotación, invitaciones, recuperación, roles, permisos, límite de solicitudes |
| `feature/shared-contracts` | Generación de tipos desde OpenAPI y verificación en CI |
| `feature/web-shell` | Vite, Tailwind, shadcn/ui, layout, login, rutas protegidas |
| `feature/mobile-shell` | Expo Router, login, SecureStore, refresh automático |

### Fase 2

| Rama | Contenido |
|---|---|
| `feature/clinic-setup` | Catálogo de servicios, recursos, horario y plantillas de etapas |
| `feature/pet-management` | Clientes, mascotas, tutela, fotos con URLs firmadas, pantallas web |
| `feature/appointment-scheduling` | Disponibilidad, reservas con bloqueo e idempotencia, estados, recordatorios |
| `feature/web-agenda` | Calendario con FullCalendar por día, semana y mes |
| `feature/mobile-appointments` | Inicio, mascotas, citas: consultar, solicitar, reprogramar, cancelar |
| `test/appointment-use-cases` | Reservas concurrentes contra MySQL y matriz de permisos |

### Fase 3

| Rama | Contenido |
|---|---|
| `feature/service-tracking` | Agregado `TrackedService`, transiciones, publicaciones al cliente, entrega |
| `feature/grooming-workflow` | Plantilla y pantallas web de baño y peluquería |
| `feature/surgery-workflow` | Plantilla de cirugía, alta autorizada por veterinario |
| `feature/notifications-core` | Worker, tokens de dispositivo, push con Expo, reintentos y deduplicación |
| `feature/tracking-sse` | Tickets de stream, SSE y reanudación |
| `feature/mobile-tracking` | Pantalla de seguimiento con línea de tiempo en vivo |
| `feature/web-dashboard` | Panel con datos reales de citas y servicios |

Cada PR se vincula a su Issue (`Closes #N`) con criterios de aceptación verificables.

## Decisiones pendientes

- Cantidad de veterinarios y groomers, horario de la sede y servicios ofrecidos (necesarios antes
  de la fase 2; mientras tanto se usan datos semilla ficticios y configurables).
- Proveedor de correo para invitaciones y recuperación: en desarrollo, un adaptador que escribe
  en consola; en producción se propone AWS SES (requiere ADR y aprobación).
- Dueño, nombre y visibilidad del repositorio en GitHub.
- Cuenta de Expo/EAS y credenciales de FCM y APNs para notificaciones push.
- Fecha objetivo del MVP.
