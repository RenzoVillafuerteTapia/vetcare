# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

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
