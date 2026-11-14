# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [0.2.0] - 2026-11-14

Fase 2 completa y casi toda la fase 3: configuración de la clínica, clientes y mascotas, agenda sin conflictos, seguimiento en vivo de baños y cirugías y avisos push. Se adelantan inventario, cobros registrados y ganancias. La app móvil se rediseña. Queda pendiente el envío en tiempo real por SSE (hoy se actualiza cada 10 s).

### Corregido

- Web: en Inventario, Mascotas y Clientes solo se desplaza la rejilla de tarjetas; el título, los indicadores y el buscador quedan fijos (24 tarjetas por página).
- La web de administración rechaza las cuentas de cliente (que usan la app móvil) y revoca la sesión que abrieron.
- La barra lateral y el encabezado de la web quedan fijos; solo se desplaza el contenido.
- Los campos de texto de la web y la app tienen un relleno y un borde que se distinguen del fondo.

### Agregado

- Comando `python -m vetcare.cli seed-demo`: carga en local una veterinaria en marcha (tres veterinarios, 40 clientes con sus mascotas, citas de un mes, seguimientos en curso, inventario y cobros) con datos ficticios; se niega a repetirse y a correr fuera de local o test.
- Web: en el perfil de la mascota, las alergias a la vista en una tarjeta propia (se agregan o quitan con un toque, con atajos para las más comunes) y un botón para volver.
- Clinic Setup: catálogo de servicios, recursos agendables con horario semanal y bloqueos, horario de atención y feriados de la sede (America/Lima), con permisos por rol y contrato público `ClinicCatalog` para la agenda.
- Comando `python -m vetcare.cli seed-clinic` con una configuración ficticia de la sede.
- Customers & Pets: clientes con documento y teléfono validados, mascotas con historial de peso, tutela con dueños y responsables autorizados (al menos un dueño siempre), acceso por tutela con aislamiento entre clientes, búsqueda paginada, invitación del cliente a la app y contrato público `PetAccess`.
- Identity: `invite_client`, para que la recepción invite clientes sin `users:manage`.
- Agenda: disponibilidad por servicio y día, reservas sin superposición con bloqueo por recurso, asignación automática o elegida de recursos, `Idempotency-Key`, solicitudes del cliente con confirmación de la clínica, reprogramación y cancelación con antelación mínima, llegada, atención completada e inasistencia, con historial y eventos en el outbox.
- Web: carrusel de fotos en el panel de acceso, que se pausa al pasar el mouse o al enfocarlo y respeta la preferencia de movimiento reducido.
- Web: sección Configuración (solo con `clinic_setup:manage`) con el catálogo de servicios (alta, edición, activar y desactivar), los recursos de la agenda con su horario semanal y sus bloqueos, y el horario de atención y los feriados de la sede; los errores de la API se muestran junto al campo.
- Web: sección Clientes (con `pets:read`): búsqueda paginada, alta y edición de clientes, invitación a la app, ficha del cliente con sus mascotas, y perfil de la mascota con foto (subir, cambiar y quitar), edición, estado, historial de peso y gestión de dueños y responsables autorizados con sus permisos. Las acciones se muestran según `clients:manage`, `pets:manage` y `guardianships:manage`.
- Fotos de mascotas: puerto `FileStorage` con almacenamiento en disco (desarrollo y pruebas) y S3 privado (producción), subida validada por contenido (JPG, PNG o WebP de hasta 5 MB), claves sin datos personales y URLs firmadas de 5 minutos que solo recibe quien puede ver la mascota.
- Web: sección Agenda (con `appointments:read`) con FullCalendar: vistas por día, semana y mes en hora de Lima, filtro por recurso, alta de citas entre los horarios libres (con `Idempotency-Key`), y confirmar, reprogramar, cancelar y registrar llegada, atención completada o inasistencia desde el detalle. Los conflictos y rechazos de la API se muestran en el diálogo.
- Horarios hasta la medianoche: una franja que termina a las 00:00 termina a las 24:00, así que la sede y cada recurso pueden atender hasta el cierre del día o las 24 horas (de 00:00 a 00:00). La agenda de la web muestra el rango de horas del horario de atención de la sede. Las citas siguen sin cruzar la medianoche.
- Primer recorrido de extremo a extremo con Playwright (agendar, ver y cancelar una cita contra la API real), con `scripts/e2e-bootstrap.sh` y el workflow `e2e.yml`.
- App móvil: barra inferior con cinco pestañas (Inicio, Mascotas, Citas, Clínica y Cuenta) y pantallas divididas en secciones para desplazarse menos: perfil de la mascota (datos, citas, peso y tutores), citas próximas e historial, solicitud en tres pasos, horario de la sede (abierto o cerrado ahora, feriados) y servicios, datos de contacto y cambio de contraseña. El dueño sube la foto de su mascota con la cámara o la galería.
- App móvil: las citas se actualizan solas cada 30 s con la app abierta (y al volver a ella), y se puede deslizar hacia abajo para actualizar en Inicio y Citas: el cliente ve al momento cuando la veterinaria confirma, reprograma o cancela.
- API: `GET`/`PUT /me/profile` (teléfono y dirección del cliente, permiso `own:profile:manage`), `POST /auth/password` (cambio con la actual; cierra las demás sesiones) y foto de la mascota por su dueño (`can_change_photo` en la respuesta).
- App móvil: inicio con la próxima cita y las mascotas vinculadas (con estados vacíos útiles), perfil de la mascota con la información compartida, y citas: próximas y anteriores, detalle, solicitud entre los horarios libres (con `Idempotency-Key`), reprogramación y cancelación con la antelación mínima. Las horas se muestran siempre en la hora de la sede.
- Avisos push: cuando la clínica confirma, reprograma o cancela una cita, el dueño recibe un aviso en su teléfono y al tocarlo se abre la cita. El worker del outbox (`python -m vetcare.worker`) entrega cada evento una sola vez por manejador, reintenta con espera exponencial y deja en `failed` lo que no pudo enviar. Incluye `PUT /me/devices` y `POST /me/devices/unregister` (permiso `own:notifications:manage`), emisor de Expo y emisor de consola para desarrollo. Recibirlos en un teléfono requiere el proyecto de EAS y las credenciales de FCM/APNs.
- Veterinario de confianza: al solicitar o reprogramar una cita en la app, el dueño elige al profesional (o "Cualquiera") y solo ve sus horarios libres; se propone el que atendió a la mascota la última vez, y las citas muestran quién atiende. API: `GET /scheduling/professionals` y `professional_id` en la disponibilidad.
- Seguimiento de servicios (fase 3): una cita con la llegada registrada inicia su seguimiento por etapas (baño y peluquería, cirugía u otra atención). El personal avanza etapas sin pisarse (`from_stage`), publica avances para el dueño y entrega la mascota; el alta de una cirugía la autoriza un veterinario. Web: sección Seguimiento con el tablero y el botón para iniciarlo desde la cita. App: "En la veterinaria" en el inicio y la línea de tiempo en vivo (cada 10 s). Avisos push al iniciar, al quedar lista o con el alta y con cada avance.
- App móvil: elegir la hora como en el cine. Se ve el día completo agrupado por mañana, tarde y noche, con leyenda y conteo de libres; los horarios ocupados se ven oscuros y no se pueden elegir. API: `include_unavailable` en la disponibilidad marca cada horario como `free`, `taken` o `too_soon`.
- Ventas (web y API): inventario de productos con costo, precio de venta, stock mínimo y movimientos (entradas, uso interno, ajustes por conteo); registro de cobros por servicios, productos y otros conceptos con su medio de pago (efectivo, tarjeta, Yape, Plin o transferencia), que descuenta el stock y se anula con motivo; y resumen de ingresos, costo y ganancia por periodo. Permisos `inventory:read`, `inventory:manage`, `charges:manage` y `reports:read`.
- Web: el inicio es un panel con datos reales del día (citas, mascotas en atención y listas, ingresos y ganancia, stock bajo) en lugar de la portada de la fase 1.
- Web: sección Mascotas con todas las mascotas (búsqueda por nombre o dueño y filtro por especie). Mascotas, Clientes e Inventario se muestran como tarjetas de catálogo: imagen o ícono, etiqueta destacada (alergias, usa la app, stock bajo o margen), chips, nombre y el dato principal resaltado. API: `GET /pets`.

### Cambiado

- App móvil rediseñada: fondo gris azulado, tarjetas muy redondeadas, barra inferior flotante con la pestaña activa en amarillo, chips oscuros para lo activo, perfil de la mascota con portada (foto, nombre, especie y raza, edad y sexo) y tarjetas de peso con su evolución y de próxima cita.
- Los eventos de cita pasan a la versión 2 del esquema: agregan `pet_name` y, al reprogramar, `by_client`.
- Las conexiones a MySQL usan aislamiento READ COMMITTED (ver `docs/architecture/overview.md`).
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

[Sin publicar]: https://github.com/RenzoVillafuerteTapia/vetcare/compare/v0.2.0...develop
[0.2.0]: https://github.com/RenzoVillafuerteTapia/vetcare/releases/tag/v0.2.0
[0.1.0]: https://github.com/RenzoVillafuerteTapia/vetcare/releases/tag/v0.1.0
