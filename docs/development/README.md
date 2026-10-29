# Desarrollo local

> Estado: **base técnica de la API.** Se levantan MySQL y la API con verificación de salud,
> migraciones y pruebas de integración. La web, la app móvil y los contratos compartidos se
> agregan en la fase 1.

## Requisitos

- Docker y Docker Compose. La API corre en un contenedor con Python 3.12.
- Node.js 22.12 o superior y npm (workspaces). `npm install` en la raíz instala `packages/shared`.
- Opcional: Python 3.12 local para el editor y para ejecutar pruebas fuera de Docker.

## Primeros pasos

```bash
bash scripts/setup-hooks.sh       # valida Conventional Commits en cada commit
cp .env.example .env              # luego cambia las claves de MySQL y VETCARE_JWT_SECRET
docker compose up --build
docker compose run --rm api alembic upgrade head
```

### Primer administrador

Las cuentas se crean solo por invitación. En una base vacía, crea la invitación del primer
administrador:

```bash
docker compose exec api python -m vetcare.cli create-admin --email admin@ejemplo.test --name "Nombre Apellido"
```

En desarrollo los correos no se envían: aparecen en el registro de la API
(`docker compose logs api`) con el enlace de activación. El token del enlace (`#token=…`) se
envía a `POST /api/v1/auth/invitations/accept` junto con la contraseña elegida, desde
`/api/docs` mientras no exista la web. El comando se niega a funcionar si ya hay usuarios.

- API: <http://localhost:8000/api/v1/health> (proceso vivo) y
  <http://localhost:8000/api/v1/health/ready> (base de datos disponible)
- Documentación OpenAPI: <http://localhost:8000/api/docs> (desactivada en producción)
- MySQL: `localhost:3306` (o el `MYSQL_PORT` de `.env`) con el usuario de `.env`. La primera vez
  que se crea el volumen también se crea la base `<MYSQL_DATABASE>_test` para las pruebas de
  integración (script en `docker/mysql/init/`).

## Estructura

```
apps/api        API FastAPI (ver apps/api/README.md)
apps/web        web de administración (pendiente)
apps/mobile     app de clientes (pendiente)
packages/shared contrato OpenAPI, tipos generados y cliente HTTP tipado
docs/           documentación técnica
```

## Contratos compartidos

Después de cambiar un endpoint, un esquema o un error de la API:

```bash
bash scripts/update-contracts.sh
```

y commitea `packages/shared/openapi.json` y `packages/shared/src/schema.d.ts` en el mismo PR.

## Variables de entorno

Todas están documentadas en [`.env.example`](../../.env.example). Las variables de la API llevan el
prefijo `VETCARE_`.

| Variable | Descripción |
|---|---|
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Credenciales del contenedor MySQL local |
| `MYSQL_PORT`, `API_PORT` | Puertos publicados en el equipo |
| `VETCARE_ENVIRONMENT` | `local`, `test`, `staging` o `production` |
| `VETCARE_CORS_ORIGINS` | Lista JSON de orígenes permitidos |
| `VETCARE_DATABASE_URL` | URL de SQLAlchemy (`mysql+asyncmy://…`). En Docker Compose se arma con las variables de MySQL |
| `VETCARE_JWT_SECRET` | Clave de firma de los access tokens, mínimo 32 caracteres. Sin ella los endpoints de autenticación no están disponibles |
| `VETCARE_PUBLIC_WEB_URL` | Base de los enlaces de activación y recuperación de los correos |
| `VETCARE_TEST_DATABASE_URL` | Base para las pruebas de integración. En Docker Compose apunta a `<MYSQL_DATABASE>_test` |

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `define MYSQL_DATABASE en .env` al levantar | Falta el archivo `.env`; cópialo desde `.env.example` |
| El puerto 3306 u 8000 está ocupado | Cambia `MYSQL_PORT` o `API_PORT` en `.env` |
| `open //./pipe/dockerDesktopLinuxEngine` en Windows | Docker Desktop no está iniciado |
| La API no ve un cambio de dependencias | Reconstruye la imagen: `docker compose build api` |
| Las pruebas de integración fallan por `Unknown database '..._test'` | El volumen se creó antes de existir el script de inicialización. Recréalo (borra los datos locales): `docker compose down -v` |
| `/health/ready` responde 503 | MySQL no está disponible o `VETCARE_DATABASE_URL` no está definida |
