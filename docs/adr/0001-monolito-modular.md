# 0001. Monolito modular en lugar de microservicios

- Estado: Aceptado
- Fecha: 2026-10-28

## Contexto

La plataforma atiende a una veterinaria de una sede, con un equipo de desarrollo pequeño. Los
contextos (agenda, seguimiento, clínica, facturación…) comparten transacciones frecuentes: al
hacer check-in de una cita se crea el seguimiento del servicio; al entregar la mascota se
generan cargos. El volumen esperado es bajo (decenas de citas por día).

## Decisión

Una sola aplicación FastAPI (`apps/api`) desplegada como un artefacto, con una base de datos
MySQL. Los *bounded contexts* son paquetes con límites forzados por reglas de importación
y comunicación por puertos públicos y eventos. Las tablas llevan prefijo por contexto
(`sch_appointments`, `ops_tracked_services`…) y no se hacen *joins* entre contextos fuera de
los modelos de lectura de Reporting.

## Alternativas consideradas

- **Microservicios**: aislamiento fuerte, pero agrega red, transacciones distribuidas, despliegues
  múltiples y observabilidad compleja sin un beneficio de escala que lo justifique.
- **Monolito por capas sin contextos**: más simple al inicio, pero las reglas se mezclan y
  extraer un módulo después sería costoso.

## Consecuencias

- Transacciones locales simples y un único despliegue en EC2.
- La separación futura de un contexto exige un nuevo ADR con su justificación; los límites y el
  outbox reducen ese costo.
- Hace falta disciplina: la prueba de imports en CI es obligatoria.
