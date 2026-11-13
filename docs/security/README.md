# Seguridad y privacidad

> Estado: **autenticación, roles, permisos, límite de solicitudes y auditoría de accesos
> implementados.** Las demás medidas se marcan como pendientes en cada sección; cada PR que
> agregue una medida actualiza este documento.

## Modelo de permisos

La autorización se decide **siempre en el backend**, en dos niveles:

1. **Permiso por rol**: el rol del usuario incluye el permiso de la operación.
2. **Relación con el recurso**: un cliente solo accede a mascotas donde tiene una tutela activa,
   y solo a lo que esa tutela permite (`can_book`, `can_pickup`, `can_view_clinical`).

Matriz de las fases 1 a 3, definida en
`apps/api/src/vetcare/contexts/identity/domain/permissions.py`. `✓` permitido, `—` denegado.

| Permiso del personal | Admin | Veterinario | Asistente | Recepción |
|---|---|---|---|---|
| `users:manage` | ✓ | — | — | — |
| `clinic_setup:manage` | ✓ | — | — | — |
| `clients:manage` | ✓ | ✓ | — | ✓ |
| `pets:read` | ✓ | ✓ | ✓ | ✓ |
| `pets:manage` | ✓ | ✓ | — | ✓ |
| `guardianships:manage` | ✓ | — | — | ✓ |
| `appointments:read` | ✓ | ✓ | ✓ | ✓ |
| `appointments:manage` | ✓ | ✓ | — | ✓ |
| `tracking:read` | ✓ | ✓ | ✓ | ✓ |
| `tracking:advance` | ✓ | ✓ | ✓ | — |
| `tracking:publish_update` | ✓ | ✓ | ✓ | — |
| `tracking:authorize_discharge` | — | ✓ | — | — |
| `tracking:hand_over` | ✓ | ✓ | ✓ | ✓ |
| `audit:read` | ✓ | — | — | — |
| `inventory:read` | ✓ | ✓ | ✓ | ✓ |
| `inventory:manage` | ✓ | — | — | — |
| `charges:manage` | ✓ | ✓ | — | ✓ |
| `reports:read` | ✓ | — | — | — |

El rol **cliente** solo tiene permisos `own:*`, que valen únicamente sobre las mascotas con las
que tiene una tutela activa (lo verifica el contexto dueño del dato):

| Permiso del cliente | Alcance |
|---|---|
| `own:profile:manage` | Ver su ficha y corregir su teléfono y dirección |
| `own:pets:read` | Perfil de sus mascotas y lo que la veterinaria comparta; si es `OWNER`, cambiar la foto |
| `own:guardianships:manage` | Agregar o revocar responsables autorizados, solo si es `OWNER` |
| `own:appointments:manage` | Consultar, solicitar, reprogramar y cancelar sus citas |
| `own:tracking:read` | Seguimiento de sus servicios, solo lo publicado para el cliente |
| `own:notifications:manage` | Registrar y dar de baja los teléfonos donde recibe avisos push |

- El administrador **no** tiene permisos clínicos (por ejemplo, autorizar un alta).
- Una cuenta no puede combinar el rol cliente con roles del personal.
- Una cuenta invitada o deshabilitada no tiene permisos efectivos.
- Las pruebas verifican la matriz en el dominio y, por HTTP, contra cada rol.
- **Aislamiento entre clientes** (implementado en Customers & Pets): un cliente solo accede a
  mascotas con tutela activa; lo ajeno responde 404. No ve notas internas, y ve alergias solo
  con permiso clínico. Las pruebas de integración lo verifican con dos clientes reales.

## Sesiones y contraseñas

Implementado:

- Contraseñas con argon2id (parámetros por defecto de argon2-cffi). Se vuelven a hashear al
  iniciar sesión si los parámetros cambian.
- Contraseñas de 10 a 128 caracteres; se rechazan las muy comunes, las de uno o dos caracteres
  repetidos y las que contienen el correo.
- Access token JWT HS256 de 15 min firmado con `VETCARE_JWT_SECRET` (mínimo 32 caracteres), con
  `iss`, `sub`, `typ`, `iat`, `exp` y `jti`.
- Refresh token opaco de 256 bits guardado solo como hash SHA-256, con rotación en cada uso. Si
  se presenta uno ya rotado, se revoca toda la sesión y queda en la auditoría.
- Cambiar la contraseña revoca todas las sesiones abiertas.
- Bloqueo de 15 min tras 5 intentos fallidos, guardado en la base de datos.
- Mensajes de error iguales para correo inexistente, contraseña errónea, cuenta bloqueada o
  deshabilitada. Cuando la cuenta no existe se calcula igualmente un hash, para igualar los tiempos.
- Límite de solicitudes por IP en login, refresh, activación y recuperación. Es **en memoria por
  proceso**: con varios workers, el límite efectivo se multiplica por su número.

Registro de auditoría (`iam_audit_log`): inicios de sesión correctos y fallidos, bloqueos,
cierres de sesión, reutilización de refresh tokens, invitaciones, activaciones y recuperación de
contraseña, con actor, objetivo, IP y momento. Nunca guarda contraseñas, tokens ni hashes.

## Archivos y documentos

> Implementado para las fotos de mascotas (#23). Los documentos clínicos llegan en la fase 4.

- Bucket S3 privado, sin acceso público, con cifrado en reposo (SSE-S3). La API entrega **URLs
  firmadas de corta duración** (5 min) solo después de verificar el acceso: van dentro de la
  respuesta de la mascota, que ya exige permiso del personal o una tutela activa.
- En desarrollo y pruebas los archivos se guardan en disco y la propia API sirve las URLs
  firmadas (`/api/v1/files/…`, HMAC-SHA256 con vencimiento). Firma inválida, vencida o archivo
  inexistente responden lo mismo (403). En `production` la API no arranca con este adaptador.
- Las claves de objeto no contienen nombres ni datos personales: `pets/<id>/<id>.<ext>`. El
  nombre del archivo que sube el usuario se descarta.
- Se validan tipo y tamaño de archivo: el formato se reconoce por el contenido (JPG, PNG o
  WebP), no por el nombre ni por el tipo que declara el cliente, y el límite es 5 MB. Las
  imágenes se sirven con `Content-Disposition: inline` y `X-Content-Type-Options: nosniff`.
- Al reemplazar o quitar una foto se borra el archivo anterior.
- Pendiente: las imágenes se guardan tal como llegan, con sus metadatos EXIF (que pueden incluir
  la ubicación donde se tomó la foto). Quitarlos requiere procesar la imagen en el servidor.

## Notificaciones

Push y correos usan textos genéricos. Nunca incluyen diagnósticos, procedimientos ni enlaces
directos a documentos; el detalle se ve en la app después de autenticarse.

- Un aviso de cita solo lleva el nombre de la mascota y la fecha: ni el servicio ni el motivo.
- Un aviso de seguimiento dice que hay novedades, nunca el texto del avance. En la app, un
  responsable sin `can_view_clinical` ve las etapas pero no los textos de los avances.
- El alta de una cirugía requiere `tracking:authorize_discharge` (solo el rol veterinario).
- El token de Expo identifica al teléfono, no a la persona. Si otra cuenta inicia sesión en el
  mismo teléfono, el token pasa a esa cuenta; al cerrar sesión, la app lo da de baja antes de
  revocar la sesión. Los tokens que Expo marca como no registrados se borran.
- Al tocar un aviso, la app solo abre rutas conocidas (`/citas/{id}`), y la pantalla vuelve a
  pedir los datos con la sesión del usuario.
- `VETCARE_EXPO_ACCESS_TOKEN` (opcional) es un secreto y vive fuera del repositorio. Las
  credenciales de FCM y APNs se cargan en EAS, nunca en el repositorio.

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
