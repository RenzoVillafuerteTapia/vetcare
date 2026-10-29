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
