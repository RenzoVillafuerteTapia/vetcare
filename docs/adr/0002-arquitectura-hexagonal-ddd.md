# 0002. Arquitectura hexagonal por bounded context

- Estado: Aceptado
- Fecha: 2026-10-28

## Contexto

Las reglas críticas (transiciones de etapas de un servicio, conflictos de agenda, acceso a
expedientes, consistencia de pagos) deben poder probarse sin base de datos ni HTTP, y no deben
duplicarse en la web ni en la app móvil.

## Decisión

Cada contexto tiene cuatro capas: `domain`, `application`, `infrastructure` y `api`.

- El **dominio** es Python puro (dataclasses, value objects inmutables, excepciones de dominio).
  Los agregados protegen sus invariantes y registran eventos de dominio.
- Los **casos de uso** orquestan: cargan agregados por puertos de repositorio, verifican
  permisos con el contexto Identity & Access, invocan el dominio y confirman la unidad de trabajo.
- La **infraestructura** implementa los puertos con SQLAlchemy 2.0 usando mapeo explícito
  entre filas y entidades (no se anotan las entidades con el ORM).
- La capa **api** traduce HTTP ↔ comandos y resultados, con esquemas Pydantic v2.

El acceso a la base de datos es asíncrono (SQLAlchemy async con el driver `asyncmy`), porque la
API mantiene conexiones SSE abiertas y no debe bloquear hilos.

## Alternativas consideradas

- **Entidades como modelos SQLAlchemy**: menos código de mapeo, pero acopla el dominio al ORM y
  dificulta proteger invariantes.
- **Lógica en servicios con modelos anémicos**: rápido de escribir, pero las reglas terminan
  repartidas entre servicios y routers.

## Consecuencias

- Más archivos por funcionalidad (mapeadores, DTOs). Se acepta a cambio de pruebas rápidas del
  dominio y de casos de uso con repositorios en memoria.
- DDD se aplica donde aporta (Scheduling, Service Operations, Clinical, Treatment, Billing).
  Reporting es solo lectura y no tiene modelo de dominio.
