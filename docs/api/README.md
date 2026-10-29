# API

> Estado: **convenciones definidas, sin endpoints implementados.** La referencia de endpoints
> será la documentación OpenAPI generada por FastAPI (`/api/docs`); este documento fija las reglas
> comunes.

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

| Endpoint | Uso |
|---|---|
| `POST /api/v1/auth/login` | Email y contraseña → `access_token` (15 min) y `refresh_token` (30 días, rotativo) |
| `POST /api/v1/auth/refresh` | Rota el refresh token; reutilizar uno revocado invalida toda la sesión |
| `POST /api/v1/auth/logout` | Revoca la familia de refresh tokens |
| `POST /api/v1/auth/invitations/{token}/accept` | El cliente o el empleado invitado fija su contraseña |
| `POST /api/v1/auth/password-reset` | Solicita recuperación; la respuesta es igual exista o no el correo |

El `access_token` va en `Authorization: Bearer …`. La web guarda el refresh token en una cookie
`HttpOnly`, `Secure`, `SameSite=Strict` limitada a `/api/v1/auth`; la app móvil lo guarda en
Expo SecureStore.

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
| 401 | Sin autenticación o token vencido |
| 403 | Autenticado sin permiso para la operación |
| 404 | El recurso no existe **o el usuario no tiene relación con él** (no se revela su existencia) |
| 409 | Conflicto de negocio: horario ocupado, transición inválida, versión desactualizada |
| 422 | Errores de validación de campos, en `errors[]` con `field` y `message` en español |
| 429 | Límite de solicitudes excedido |

## Idempotencia

Las operaciones de creación sensibles a duplicados (reservas, pagos, entregas) aceptan el
encabezado `Idempotency-Key`. Repetir la clave con el mismo cuerpo devuelve la respuesta original;
con un cuerpo distinto devuelve 409.

## Contratos para web y móvil

`packages/shared` genera los tipos TypeScript desde el OpenAPI exportado por la API. Ningún
cliente define a mano los tipos de las respuestas.
