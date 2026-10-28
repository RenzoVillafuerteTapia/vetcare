# 0003. Outbox transaccional en MySQL y worker propio

- Estado: Aceptado
- Fecha: 2026-10-28

## Contexto

Varios efectos dependen de que algo ocurra en el dominio: notificar al cliente cuando su mascota
está lista, actualizar en vivo la pantalla de seguimiento, programar recordatorios. Si se envían
dentro de la petición HTTP, una falla deja estados inconsistentes (se notificó algo que no se
guardó, o se guardó sin notificar). El stack no incluye un broker de mensajes ni Redis.

## Decisión

- Los agregados registran eventos de dominio. La unidad de trabajo los guarda en la tabla
  `outbox_events` **en la misma transacción** que el cambio de estado.
- Cada evento tiene un identificador único, tipo, versión de esquema, agregado de origen y una
  carga útil sin secretos.
- Un proceso **worker** (`python -m vetcare.worker`, mismo código que la API) lee el outbox en
  orden, despacha a los manejadores suscritos (notificaciones, recordatorios) y registra el
  resultado por manejador. Los manejadores son idempotentes: la clave de deduplicación es
  `(event_id, handler)`.
- Los fallos se reintentan con espera exponencial y un máximo de intentos; luego quedan en
  estado `failed` para revisión.
- El worker también ejecuta tareas programadas (recordatorios de citas y de tratamientos).

## Alternativas consideradas

- **Celery o RQ con Redis**: maduro, pero agrega dos componentes fuera del stack aprobado.
- **BackgroundTasks de FastAPI**: se pierden si el proceso se reinicia y no garantizan entrega.

## Consecuencias

- Entrega *al menos una vez*; por eso los manejadores deben ser idempotentes.
- Latencia de segundos (intervalo de sondeo configurable), suficiente para este dominio.
- Si en el futuro la carga lo exige, el outbox puede publicarse a un broker sin cambiar el dominio.
