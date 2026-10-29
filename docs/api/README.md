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

`packages/shared` genera los tipos TypeScript desde el OpenAPI exportado por la API. Ningún
cliente define a mano los tipos de las respuestas.
