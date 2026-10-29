# Estrategia de pruebas

> Estado: **estrategia definida; CI activo para commits y la API.** Los comandos de cada
> aplicación están en su README (por ahora, [apps/api](../../apps/api/README.md)).

## Capas

| Capa | Qué prueba | Herramientas | Base de datos |
|---|---|---|---|
| Dominio | Invariantes de agregados, VOs, transiciones de estado | pytest | No |
| Casos de uso | Orquestación, permisos, eventos emitidos | pytest + repositorios en memoria | No |
| Integración | Repositorios, migraciones, bloqueos, outbox | pytest-asyncio + MySQL 8 en contenedor | Sí |
| API | Contratos HTTP, códigos de error, **matriz de autorización** | httpx `AsyncClient` | Sí |
| Arquitectura | Reglas de dependencia entre capas y contextos | prueba de imports propia | No |
| Web | Componentes y flujos críticos | Vitest + React Testing Library | No (API simulada) |
| Móvil | Pantallas y flujos críticos | Jest + React Native Testing Library | No (API simulada) |
| Extremo a extremo | Recorridos principales con la API real | Playwright | Sí |

## Prioridades

Escenarios que siempre deben tener pruebas, positivas y negativas:

1. **Citas sin conflictos**: superposición, límites exactos (fin = inicio), reservas
   concurrentes reales contra MySQL, idempotencia.
2. **Aislamiento entre clientes**: un cliente no ve, reserva ni hace stream de mascotas ajenas;
   la respuesta es 404, no 403.
3. **Transiciones de servicios**: transiciones no permitidas, etapas clínicas sin permiso,
   modificación después de la entrega, conflicto de versión.
4. **Acceso a expedientes** (fase 4) y **consistencia de pagos** (fase 5).
5. **Permisos**: cada endpoint probado con cada rol.

## Cobertura

- Dominio y casos de uso: objetivo ≥ 90 %.
- Total de la API: el CI falla por debajo de 80 %.
- La cobertura no reemplaza los escenarios prioritarios: se revisan en cada PR.

## CI

Un workflow por aplicación. Cada uno detecta si cambiaron los archivos de su aplicación y, si
no cambiaron, omite el job sin fallar, para que pueda ser un check obligatorio en `main` y `develop`.

| Workflow | Check | Estado | Qué ejecuta |
|---|---|---|---|
| `commitlint.yml` | `commitlint` | Activo, obligatorio | Conventional Commits en cada PR |
| `api.yml` | `api` | Activo | Ruff (lint y formato), mypy estricto, pytest con cobertura mínima de 80 % |
| API: integración | — | Pendiente (`feature/api-foundation`) | MySQL 8 como *service container*, migraciones pendientes |
| Web | — | Pendiente (`feature/web-shell`) | ESLint, Prettier, `tsc`, Vitest, build |
| Móvil | — | Pendiente (`feature/mobile-shell`) | ESLint, `tsc`, Jest |
| Contratos | — | Pendiente (`feature/shared-contracts`) | Los tipos de `packages/shared` coinciden con el OpenAPI |

Cada workflow nuevo se agrega en el PR que crea su aplicación, para no tener pipelines que
validen código inexistente.

Los resultados se reportan tal como salen: una prueba omitida o fallida se indica en el PR.
