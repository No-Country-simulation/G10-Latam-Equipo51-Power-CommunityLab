# Conservación, derechos e incidentes

## 1. Cuánto se conserva cada cosa

Los plazos entre corchetes son propuestas: confírmalos y cópialos a las páginas legales de la landing.

| Dato | Dónde vive | Plazo |
|---|---|---|
| Mensajes de entrada | Bucket de OCI (raíz) y `mensajes_entrada` en MongoDB | [90] días tras su periodo |
| Análisis de cada mensaje | `analisis/<archivo>.json` y `analisis` en MongoDB | Igual que el mensaje |
| Curaduría (borradores y estados) | `activos/<slug>/curaduria.json` y `contenido_generado` en MongoDB | [90] días tras el periodo; lo publicado, mientras siga publicado |
| Tickets | `tickets` dentro de la curaduría y en MongoDB | Hasta resolverse, más [30] días |
| Correo del boletín | [Proveedor de correo] | Hasta la baja; después solo la prueba de consentimiento y de baja |
| Registros de nginx | Servidor | [30] días (configurar `logrotate`) |

Hoy el borrado es manual. Automatizarlo es un pendiente de [README.md](README.md).

## 2. Solicitudes de derechos

Llegan a `privacidad@[dominio]`, o las traslada la organización de la comunidad.

1. **Registrar** la solicitud: fecha, quién la pide, qué pide.
2. **Verificar la identidad** sin pedir más datos de los necesarios. Por ejemplo, que escriba desde el correo del boletín o confirme su alias desde la cuenta de la comunidad.
3. **Responder en un máximo de 15 días hábiles.** Si la persona es de una comunidad, avisar a su organización.
4. **Guardar constancia** de la respuesta.

### Pasos técnicos para borrar a una persona

Un mensaje se identifica por su `archivo` y por el autor en `interaccion.autor`.

1. **Encontrar sus mensajes.** Si MongoDB está activo: `db.analisis.distinct("archivo", { autor: "<alias>" })`. Si no, revisar los objetos de la raíz del bucket cuyo `interaccion.autor` coincida. Esa lista es `ARCHIVOS`.
2. **Borrar en el bucket:** cada objeto de entrada y su análisis `analisis/<archivo>.json`.
3. **Curadurías:** en cada `activos/<slug>/curaduria.json`, quitar o anonimizar los activos cuyo `fuente_detalle.archivo` sea uno de esos archivos, y los `tickets` con ese `archivo`. Guardar con `PUT /curaduria/{slug}` para que se refleje también en MongoDB y en la landing.
4. **MongoDB:**

   ```js
   db.mensajes_entrada.deleteMany({ archivo: { $in: ARCHIVOS } })
   db.analisis.deleteMany({ archivo: { $in: ARCHIVOS } })
   db.tickets.deleteMany({ archivo: { $in: ARCHIVOS } })
   db.contenido_generado.deleteMany({ "fuente_detalle.archivo": { $in: ARCHIVOS } })
   ```

5. **Contenido ya publicado fuera** (LinkedIn, X, boletín enviado): retirarlo o editarlo si nombra a la persona y ella lo pide.
6. **Si pidió oposición** (que no se analicen sus mensajes): añadir su alias a una lista de exclusión de la organización. Pendiente técnico: que `/procesar` omita esos autores.

## 3. Incidentes de seguridad

Por ejemplo: acceso no autorizado al panel o al bucket, filtración de la clave de Cohere, o datos expuestos por error.

1. **Contener:** revocar credenciales (`COHERE_API_KEY`, claves de OCI y MongoDB, `AUTH_SECRET`) y cerrar el acceso.
2. **Evaluar** qué datos y qué personas se afectaron.
3. **Avisar** a las organizaciones afectadas en un máximo de **48 horas** (lo exige el acuerdo).
4. **Notificar a la autoridad** cuando la ley lo exija: en la UE, 72 horas; Brasil y México también lo exigen si hay riesgo para las personas.
5. **Avisar a las personas** si hay riesgo alto para ellas.
6. **Documentar** qué pasó, qué se hizo y qué cambia para que no se repita.
