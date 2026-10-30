# Registros de decisiones de arquitectura (ADR)

Cada decisión importante se registra en un archivo `NNNN-titulo.md` con contexto, decisión,
alternativas y consecuencias. Un ADR aceptado no se edita: si cambia la decisión, se crea uno
nuevo que lo reemplaza.

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-monolito-modular.md) | Monolito modular en lugar de microservicios | Aceptado |
| [0002](0002-arquitectura-hexagonal-ddd.md) | Arquitectura hexagonal por bounded context | Aceptado |
| [0003](0003-outbox-transaccional.md) | Outbox transaccional en MySQL y worker propio | Aceptado |
| [0004](0004-sse-y-notificaciones-push.md) | SSE para seguimiento en tiempo real y push para eventos importantes | Aceptado |
