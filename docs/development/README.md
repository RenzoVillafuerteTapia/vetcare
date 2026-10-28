# Desarrollo local

> Estado: **pendiente.** Esta guía se completa con el bootstrap del monorepo
> (`chore/monorepo-bootstrap`).

## Requisitos previstos

- Docker y Docker Compose (la API y MySQL se ejecutan en contenedores con Python 3.12).
- Node.js 22 LTS y npm, para la web, la app móvil y `packages/shared`.
- Opcional: Python 3.12 local para el editor y para ejecutar pruebas fuera de Docker.
- Expo Go o un emulador Android / iOS para la app móvil.

## Primeros pasos después de clonar

```bash
bash scripts/setup-hooks.sh
```
