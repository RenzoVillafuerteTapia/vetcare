# Flujos principales

> Estado: **diseño.** Las plantillas de etapas son configurables en Clinic Setup; estas son las
> plantillas iniciales.

## Citas

```mermaid
sequenceDiagram
    actor C as Cliente (app) o recepción (web)
    participant API as Scheduling
    participant DB as MySQL
    participant W as Worker
    C->>API: POST /appointments (Idempotency-Key)
    API->>API: verificar permiso can_book o appointments:manage
    API->>DB: BEGIN; SELECT recursos FOR UPDATE
    API->>DB: buscar citas activas superpuestas
    alt hay conflicto
        API-->>C: 409 horario no disponible
    else libre
        API->>DB: INSERT cita + evento outbox; COMMIT
        API-->>C: 201 cita (REQUESTED o CONFIRMED)
        W->>DB: leer outbox
        W-->>C: push "solicitud recibida" / "cita confirmada"
    end
```

- Implementado (#25). La reserva bloquea con `SELECT … FOR UPDATE` una fila por recurso
  candidato (`sch_resource_locks`), siempre en el mismo orden, y recalcula la disponibilidad
  con lecturas de lo último confirmado.
- La disponibilidad se calcula y se valida **en el backend**. La web y la app solo muestran los
  huecos que devuelve la API.
- La `Idempotency-Key` evita reservas duplicadas por doble toque o reintentos de red: la misma
  clave con el mismo cuerpo devuelve la cita ya creada.
- El bloqueo por recurso serializa reservas concurrentes sobre el mismo profesional o mesa.
- Recordatorios (fase 3): el worker programará avisos (por defecto 24 h antes) sin enviar dos
  veces el mismo recordatorio para la misma cita.

## Baño y peluquería

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: recepción e ingreso
    RECEIVED --> WAITING
    WAITING --> BATHING: baño y limpieza
    BATHING --> DRYING: secado
    DRYING --> FINISHING: corte, cepillado y acabados
    DRYING --> QUALITY_CHECK: sin acabados
    FINISHING --> QUALITY_CHECK: control de calidad
    QUALITY_CHECK --> READY_FOR_PICKUP: listo para recoger
    READY_FOR_PICKUP --> HANDED_OVER: entregado a tutor con can_pickup
    HANDED_OVER --> [*]
```

Cada transición registra fecha, hora, usuario y nota opcional. El personal puede publicar
mensajes y fotos para el cliente en cualquier etapa. *Listo para recoger* envía un push.

## Cirugía

```mermaid
stateDiagram-v2
    [*] --> PRE_OP_ASSESSMENT: ingreso y evaluación preoperatoria
    PRE_OP_ASSESSMENT --> PRE_OP_PREPARATION
    PRE_OP_PREPARATION --> IN_SURGERY: cirugía en curso
    IN_SURGERY --> ANESTHESIA_RECOVERY: recuperación anestésica
    ANESTHESIA_RECOVERY --> OBSERVATION: observación y monitoreo
    OBSERVATION --> DISCHARGE_AUTHORIZED: alta médica autorizada (solo veterinario)
    DISCHARGE_AUTHORIZED --> READY_FOR_PICKUP
    READY_FOR_PICKUP --> HANDED_OVER
    OBSERVATION --> HOSPITALIZATION: continuar en hospitalización
    HANDED_OVER --> [*]
```

- `DISCHARGE_AUTHORIZED` requiere `tracking:authorize_discharge` (rol veterinario) y una acción
  explícita. No hay transiciones automáticas por tiempo.
- El cliente ve el nombre de la etapa y solo los mensajes que el personal redacta o selecciona.
  El sistema no genera frases como "la cirugía fue exitosa" o "la mascota está estable".
- La plantilla admite etapas adicionales por procedimiento.

## Tratamientos (fase 4)

```mermaid
flowchart LR
    P["Veterinario registra prescripción<br/>(Clinical Records)"] -->|PrescriptionRecorded| T["Plan de tratamiento<br/>pauta, inicio, fin, instrucciones"]
    T --> S["Dosis programadas"]
    S -->|en clínica| A["Administración registrada por personal<br/>origen CLINIC_STAFF"]
    S -->|en casa| O["Dueño marca como realizada<br/>origen OWNER_DECLARED"]
    S -->|vencida sin registro| M["Dosis omitida o incidencia"]
    S -.->|worker| R["Recordatorio al cliente"]
```

La aplicación no recomienda, calcula ni modifica dosis. Una declaración del dueño nunca se
presenta como administración supervisada por la clínica.

## Seguimiento en la app del cliente

```mermaid
sequenceDiagram
    actor D as Dueño (app)
    participant API
    participant SSE as Stream SSE
    D->>API: GET /tracked-services/{id} (JWT)
    API->>API: verificar tutela activa sobre la mascota
    API-->>D: estado, línea de tiempo, mensajes publicados
    D->>API: POST /tracked-services/{id}/stream-tickets
    API-->>D: ticket de un solo uso (60 s)
    D->>SSE: GET /tracked-services/{id}/stream?ticket=…
    SSE-->>D: stage_changed / update_published / completed
```
