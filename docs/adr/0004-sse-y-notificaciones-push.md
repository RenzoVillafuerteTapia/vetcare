# 0004. SSE para seguimiento en tiempo real y push para eventos importantes

- Estado: Aceptado
- Fecha: 2026-10-28

## Contexto

El dueño debe ver avanzar el baño o la cirugía de su mascota sin cerrar y abrir la app, y recibir
un aviso aunque la app esté cerrada cuando la mascota está lista para recoger o se autoriza el alta.
La comunicación es unidireccional: el servidor informa, el cliente solo lee.

## Decisión

**Tiempo real con Server-Sent Events (SSE)** mientras la pantalla de seguimiento está abierta:

- `GET /api/v1/tracked-services/{id}/stream` emite eventos `stage_changed`, `update_published`
  y `completed`, con `id` incremental para reanudar con `Last-Event-ID` tras una reconexión.
- Al conectar, el cliente primero obtiene el estado completo por REST; el stream solo envía
  cambios. Cada 20 s se envía un comentario de *keep-alive*.
- **Autenticación del stream**: el `EventSource` del navegador no permite encabezados y React
  Native no tiene `EventSource` nativo. El cliente pide un **ticket de stream** con su JWT
  (`POST /api/v1/tracked-services/{id}/stream-tickets`): opaco, de un solo uso, válido 60 s y
  limitado a ese servicio y usuario. Se envía como parámetro `ticket` y no contiene datos personales.
  El acceso se vuelve a verificar al abrir el stream.
- **Difusión**: cada proceso de la API tiene un único sondeador del outbox que reparte los
  eventos de seguimiento a las conexiones abiertas en ese proceso. Funciona con varios workers de
  uvicorn sin broker.
- En la app móvil se usa la librería `react-native-sse`.

**Notificaciones push con Expo Notifications** para eventos importantes (cita confirmada o
reprogramada, servicio iniciado, listo para recoger, alta autorizada). Las envía el worker
desde el outbox. El texto del push es genérico (“Hay una actualización del servicio de Luna”) y
nunca incluye información clínica; el detalle se ve dentro de la app autenticada.

## Alternativas consideradas

- **WebSockets**: bidireccional, más complejo de autenticar, balancear y depurar; no se necesita
  enviar datos desde el cliente.
- **Sondeo periódico**: simple, pero con más carga y latencia visible. Se usa como respaldo:
  si el stream falla repetidamente, la app consulta por REST cada 30 s.
- **Solo push**: no sirve para la vista en vivo y depende de servicios externos.

## Consecuencias

- El balanceador y el proxy inverso deben desactivar el *buffering* y permitir conexiones largas.
- Push depende del servicio de Expo y de credenciales de FCM y APNs, que se gestionan fuera del
  repositorio.
- Se agrega la dependencia `react-native-sse` a la app móvil.
