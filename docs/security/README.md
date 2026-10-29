# Seguridad y privacidad

> Estado: **diseño.** Las medidas se implementan desde la fase 1; cada PR que agregue una medida
> actualiza este documento.

## Modelo de permisos

La autorización se decide **siempre en el backend**, en dos niveles:

1. **Permiso por rol**: el rol del usuario incluye el permiso de la operación.
2. **Relación con el recurso**: un cliente solo accede a mascotas donde tiene una tutela activa,
   y solo a lo que esa tutela permite (`can_book`, `can_pickup`, `can_view_clinical`).

Matriz inicial (fases 1 a 3). `✓` permitido, `—` denegado, `propio` solo sobre sus mascotas.

| Permiso | Admin | Veterinario | Asistente | Recepción | Cliente |
|---|---|---|---|---|---|
| `users:manage` | ✓ | — | — | — | — |
| `clinic_setup:manage` | ✓ | — | — | — | — |
| `clients:manage` | ✓ | ✓ | — | ✓ | — |
| `pets:read` | ✓ | ✓ | ✓ | ✓ | propio |
| `pets:manage` | ✓ | ✓ | — | ✓ | — |
| `guardianships:manage` | ✓ | — | — | ✓ | propio (solo `OWNER`) |
| `appointments:read` | ✓ | ✓ | ✓ | ✓ | propio |
| `appointments:manage` | ✓ | ✓ | — | ✓ | propio (solicitar, reprogramar, cancelar) |
| `tracking:read` | ✓ | ✓ | ✓ | ✓ | propio (solo lo publicado) |
| `tracking:advance` | ✓ | ✓ | ✓ | — | — |
| `tracking:publish_update` | ✓ | ✓ | ✓ | — | — |
| `tracking:authorize_discharge` | — | ✓ | — | — | — |
| `tracking:hand_over` | ✓ | ✓ | ✓ | ✓ | — |
| `audit:read` | ✓ | — | — | — | — |

El administrador **no** tiene permisos clínicos por defecto (por ejemplo, autorizar un alta).
Los permisos son constantes en el código y la matriz se prueba de forma automática.

## Sesiones y contraseñas

- Contraseñas con argon2id. Mínimo 10 caracteres; se rechazan contraseñas muy comunes.
- Access token JWT de 15 min firmado con una clave del entorno. Refresh token opaco, guardado
  como hash, con rotación y detección de reutilización.
- Bloqueo temporal tras intentos fallidos repetidos y límite de solicitudes en `login`,
  `password-reset` e `invitations`.

## Archivos y documentos

- Bucket S3 privado, sin acceso público. La API entrega **URLs firmadas de corta duración**
  (5 min) solo después de verificar el acceso.
- Las claves de objeto no contienen nombres ni datos personales.
- Se validan tipo y tamaño de archivo; las imágenes se sirven con `Content-Disposition`
  controlado.

## Notificaciones

Push y correos usan textos genéricos. Nunca incluyen diagnósticos, procedimientos ni enlaces
directos a documentos; el detalle se ve en la app después de autenticarse.

## Secretos

- Nunca se guardan en el repositorio. `.env.example` documenta las variables sin valores reales.
- En AWS, los secretos se guardan en el entorno de la instancia o en un gestor de secretos.
- Los registros y la auditoría nunca guardan contraseñas, tokens ni URLs firmadas.

## CORS y cabeceras

- CORS con lista explícita de orígenes (la web de administración); sin comodines con credenciales.
- Cabeceras de seguridad: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`.

## Protección de datos personales (Ley N.° 29733)

- Finalidad y consentimiento informados al aceptar la invitación; registro de la versión aceptada.
- Derechos ARCO (acceso, rectificación, cancelación, oposición) atendidos por la veterinaria;
  el sistema permite exportar y anonimizar los datos de un cliente.
- Minimización: solo se piden los datos necesarios para la atención.
- La inscripción del banco de datos ante la Autoridad Nacional de Protección de Datos Personales
  es un trámite legal de la veterinaria, fuera del alcance del software.
- Fixtures, pruebas y entornos de demostración usan solo datos ficticios.

## Copias de seguridad

Respaldos automáticos de RDS con retención mínima de 7 días, versionado del bucket S3 y un
procedimiento de restauración probado. Se documentará en `docs/development/` al preparar el despliegue.
