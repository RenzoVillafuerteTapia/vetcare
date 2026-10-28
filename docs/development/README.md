# Desarrollo local

> Estado: **bootstrap.** Hoy se levantan MySQL y una API mínima con `GET /api/v1/health`.
> La web, la app móvil y los contratos compartidos se agregan en la fase 1.

## Requisitos

- Docker y Docker Compose. La API corre en un contenedor con Python 3.12.
- Node.js 22 LTS y npm (para la web, la app móvil y `packages/shared`, cuando existan).
- Opcional: Python 3.12 local para el editor y para ejecutar pruebas fuera de Docker.

## Primeros pasos

```bash
bash scripts/setup-hooks.sh       # valida Conventional Commits en cada commit
cp .env.example .env              # luego cambia las claves de MySQL
docker compose up --build
```

- API: <http://localhost:8000/api/v1/health>
- Documentación OpenAPI: <http://localhost:8000/api/docs> (desactivada en producción)
- MySQL: `localhost:3306` con el usuario de `.env`

## Estructura

```
apps/api        API FastAPI (ver apps/api/README.md)
apps/web        web de administración (pendiente)
apps/mobile     app de clientes (pendiente)
packages/shared tipos generados desde OpenAPI (pendiente)
docs/           documentación técnica
```

## Variables de entorno

Todas están documentadas en [`.env.example`](../../.env.example). Las variables de la API llevan el
prefijo `VETCARE_`.

| Variable | Descripción |
|---|---|
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Credenciales del contenedor MySQL local |
| `MYSQL_PORT`, `API_PORT` | Puertos publicados en el equipo |
| `VETCARE_ENVIRONMENT` | `local`, `test`, `staging` o `production` |
| `VETCARE_CORS_ORIGINS` | Lista JSON de orígenes permitidos |

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `define MYSQL_DATABASE en .env` al levantar | Falta el archivo `.env`; cópialo desde `.env.example` |
| El puerto 3306 u 8000 está ocupado | Cambia `MYSQL_PORT` o `API_PORT` en `.env` |
| `open //./pipe/dockerDesktopLinuxEngine` en Windows | Docker Desktop no está iniciado |
| La API no ve un cambio de dependencias | Reconstruye la imagen: `docker compose build api` |
