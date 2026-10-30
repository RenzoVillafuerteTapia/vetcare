# API

> Estado: **autenticación y gestión de usuarios implementadas.** La referencia completa de
> endpoints es la documentación OpenAPI generada por FastAPI (`/api/docs`); este documento fija
> las reglas comunes.

## Convenciones

- Prefijo y versión: `/api/v1`. Un cambio incompatible requiere una nueva versión o un
  período de transición documentado.
- JSON con nombres en `snake_case`. Fechas en ISO 8601 con zona (`2026-11-03T15:00:00-05:00`);
  el servidor guarda en UTC.
- Montos como cadena decimal con dos decimales y moneda explícita: `{"amount": "85.00", "currency": "PEN"}`.
- Listados paginados con `?page=` y `?page_size=` (máximo 100), respuesta
  `{ "items": [...], "total": n, "page": p, "page_size": s }`.
- Identificadores UUID v7 (ordenables por tiempo) en la API.

## Autenticación

| Endpoint | Acceso | Uso |
|---|---|---|
| `POST /api/v1/auth/login` | Público, 10/min por IP | Correo, contraseña y `client` (`web` o `mobile`) → `access_token` (15 min) y refresh token (30 días) |
| `POST /api/v1/auth/refresh` | Público, 30/min por IP | Rota el refresh token. Presentar uno ya rotado revoca toda la sesión |
| `POST /api/v1/auth/logout` | Público | Revoca la sesión del refresh token y borra la cookie |
| `GET /api/v1/auth/me` | Autenticado | Usuario actual, roles y permisos efectivos |
| `POST /api/v1/auth/invitations/accept` | Público, 10/min por IP | `token` y `password`: activa la cuenta invitada |
| `POST /api/v1/auth/password-reset` | Público, 5 cada 5 min por IP | Envía un enlace de 30 min. Responde 202 exista o no la cuenta |
| `POST /api/v1/auth/password-reset/confirm` | Público, 10/min por IP | `token` y `password`: cambia la contraseña y cierra todas las sesiones |
| `POST /api/v1/users` | `users:manage` | Invita a un empleado o cliente (`email`, `full_name`, `roles`). El enlace dura 7 días |
| `POST /api/v1/users/{id}/invitation` | `users:manage` | Reenvía la invitación e invalida el enlace anterior |

- El `access_token` va en `Authorization: Bearer …`. La cuenta se consulta en cada solicitud:
  una cuenta deshabilitada pierde el acceso de inmediato.
- Con `client: "web"`, el refresh token viaja solo en la cookie `vetcare_refresh`
  (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` en staging y producción).
  Con `client: "mobile"`, viaja en el cuerpo y la app lo guarda en Expo SecureStore.
- Los tokens de invitación y recuperación viajan en el cuerpo, nunca en la URL de la API. En el
  enlace del correo van en el fragmento (`#token=…`), que el navegador no envía al servidor.
- Las cuentas se crean solo por invitación. El primer administrador se crea con
  `python -m vetcare.cli create-admin` (ver `docs/development`).

## Configuración de la clínica

| Endpoint | Acceso | Uso |
|---|---|---|
| `GET /api/v1/clinic/service-types` | Autenticado | Personal: catálogo completo. Cliente: solo servicios activos y reservables |
| `POST /api/v1/clinic/service-types` | `clinic_setup:manage` | Crear un servicio (`code` único) |
| `PUT /api/v1/clinic/service-types/{id}` | `clinic_setup:manage` | Actualizar (el código no cambia) |
| `PATCH /api/v1/clinic/service-types/{id}/active` | `clinic_setup:manage` | Activar o desactivar |
| `GET /api/v1/clinic/resources` | Personal | Recursos con horario semanal y bloqueos |
| `POST /api/v1/clinic/resources` | `clinic_setup:manage` | Crear un recurso |
| `PUT /api/v1/clinic/resources/{id}` | `clinic_setup:manage` | Nombre, horario, cuenta vinculada y estado |
| `POST /api/v1/clinic/resources/{id}/time-off` | `clinic_setup:manage` | Bloquear (fechas con zona horaria obligatoria) |
| `DELETE /api/v1/clinic/resources/{id}/time-off/{time_off_id}` | `clinic_setup:manage` | Quitar un bloqueo |
| `GET /api/v1/clinic/calendar` | Autenticado | Horario de atención y feriados |
| `PUT /api/v1/clinic/calendar/opening-hours` | `clinic_setup:manage` | Fijar el horario de atención |
| `POST /api/v1/clinic/calendar/holidays` | `clinic_setup:manage` | Registrar un feriado |
| `DELETE /api/v1/clinic/calendar/holidays/{día}` | `clinic_setup:manage` | Quitar un feriado |

## Clientes y mascotas

| Endpoint | Acceso | Uso |
|---|---|---|
| `GET /api/v1/clients?q=&page=&page_size=` | Personal | Buscar por nombre, documento, correo o teléfono, paginado |
| `POST /api/v1/clients` | `clients:manage` | Registrar (documento y correo únicos) |
| `GET /api/v1/clients/{id}` · `PUT` | Personal · `clients:manage` | Ficha y actualización |
| `POST /api/v1/clients/{id}/invitation` | `clients:manage` | Crear la cuenta del cliente y enviarle la invitación a la app |
| `GET /api/v1/clients/{id}/pets` | Personal | Mascotas del cliente |
| `POST /api/v1/clients/{id}/pets` | `pets:manage` | Registrar una mascota con el cliente como dueño |
| `GET /api/v1/pets/{id}` | Personal o tutela activa | Perfil; para el cliente sin notas internas y alergias según permiso |
| `PUT /api/v1/pets/{id}` · `PATCH …/status` · `POST …/weights` | `pets:manage` | Perfil, estado y peso |
| `POST /api/v1/pets/{id}/guardians` · `PUT`/`DELETE …/guardians/{client_id}` | `guardianships:manage` | Dueños y responsables autorizados |
| `GET /api/v1/me/pets` | Cliente | Mascotas donde el cliente autenticado tiene tutela |

## Agenda

| Endpoint | Acceso | Uso |
|---|---|---|
| `GET /api/v1/scheduling/availability?service_type_id=&date=` | Personal o cliente | Horarios libres de un servicio en un día (el cliente, solo servicios reservables) |
| `POST /api/v1/appointments` | `appointments:manage` o cliente con tutela `book` | Personal: cita confirmada. Cliente: solicitud. Acepta `Idempotency-Key` |
| `GET /api/v1/appointments?from=&to=&resource_id=&status=` | Personal | Agenda de un periodo (hasta 62 días) |
| `GET /api/v1/appointments/{id}` | Personal o tutela activa | Detalle; para el cliente sin notas internas ni historial |
| `POST /api/v1/appointments/{id}/reschedule` · `/cancel` | Personal o cliente con tutela `book` | El cliente, con 2 h de antelación si ya está confirmada |
| `POST /api/v1/appointments/{id}/confirm` · `/check-in` · `/complete` · `/no-show` | `appointments:manage` | Ciclo de vida |
| `GET /api/v1/me/appointments` | Cliente | Citas de sus mascotas: próximas y de los últimos 90 días |

Errores propios: `slot_unavailable` (409, el horario se ocupó o no cabe),
`invalid_appointment_transition` (409), `client_change_too_late` (409),
`idempotency_key_reused` (409, misma clave con otro cuerpo).

Los horarios semanales usan hora local de Lima (`{"weekday": 0, "start": "09:00", "end": "13:00"}`,
con 0 = lunes). Los instantes (bloqueos y, más adelante, citas) viajan en ISO 8601 con zona y se
devuelven en UTC.

## Errores

Formato [RFC 9457 (problem+json)](https://www.rfc-editor.org/rfc/rfc9457):

```json
{
  "type": "/errors/appointment-conflict",
  "title": "El horario ya no está disponible",
  "status": 409,
  "code": "appointment_conflict",
  "detail": "El profesional tiene otra cita entre 10:00 y 10:30.",
  "errors": []
}
```

| Código HTTP | Cuándo |
|---|---|
| 400 | Solicitud mal formada |
| 401 | Sin autenticación, token vencido o credenciales inválidas (incluye `WWW-Authenticate: Bearer`) |
| 403 | Autenticado sin permiso para la operación |
| 404 | El recurso no existe **o el usuario no tiene relación con él** (no se revela su existencia) |
| 409 | Conflicto de negocio: horario ocupado, transición inválida, versión desactualizada |
| 422 | Errores de validación de campos, en `errors[]` con `field` y `message` en español |
| 429 | Límite de solicitudes excedido (incluye `Retry-After` en segundos) |

## Idempotencia

Las operaciones de creación sensibles a duplicados (reservas, pagos, entregas) aceptan el
encabezado `Idempotency-Key`. Repetir la clave con el mismo cuerpo devuelve la respuesta original;
con un cuerpo distinto devuelve 409.

## Contratos para web y móvil

`packages/shared` versiona el contrato (`openapi.json`) y los tipos TypeScript generados desde
él (`src/schema.d.ts`), además de un cliente HTTP tipado. Ningún cliente define a mano los tipos
de las respuestas. Ver [packages/shared/README.md](../../packages/shared/README.md).

- El contrato se exporta sin servidor ni base de datos: `python -m vetcare.cli export-openapi`.
- Todas las respuestas de error se documentan como `application/problem+json` con el esquema
  `ProblemDetails`, incluidas las 422 de validación (FastAPI documenta otro formato por defecto
  y la API lo reemplaza para que el contrato coincida con las respuestas reales).
- El CI falla si un PR cambia la API sin actualizar `packages/shared`.
