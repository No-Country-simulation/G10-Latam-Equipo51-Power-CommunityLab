# Proveedores que reciben datos (subencargados)

Mantener esta lista al día: el aviso para comunidades y el acuerdo de tratamiento la citan.

| Proveedor | Para qué | Qué datos recibe | Dónde | Garantía | Pendiente |
|---|---|---|---|---|---|
| **Cohere** | Analizar mensajes y redactar borradores | Texto de los mensajes, sin correos ni teléfonos (`backend/privacidad.py`). El nombre del autor solo en casos de éxito y newsletter | [región según el contrato de Cohere] | Términos de la API de Cohere y su DPA | Confirmar si usan los datos de la API para entrenar y desactivarlo. Firmar su DPA |
| **Oracle Cloud Infrastructure** (Object Storage y Compute) | Guardar mensajes, análisis, curadurías y configuración; alojar la landing y el panel | Todo lo anterior; registros de acceso de nginx | [región de OCI] | Oracle Data Processing Agreement | Anotar la región real |
| **MongoDB Atlas** | Consultas del panorama | Copia de entradas, análisis, contenido generado, tickets y lotes (`backend/db.py`) | [región de Atlas] | MongoDB DPA | Anotar la región; valorar no copiar el texto completo de los mensajes |
| **[Proveedor de correo]** | Enviar el boletín (cuando se conecte) | Correo de suscriptores | [región] | Su DPA | Elegirlo: debe permitir doble opt-in y baja con un clic |

**No reciben datos:** Google Fonts (las fuentes se sirven desde nuestro servidor) ni herramientas de analítica (no hay).

## Cómo añadir un proveedor

1. Comprobar que ofrezca un acuerdo de tratamiento de datos y garantías para transferencias internacionales.
2. Añadirlo a esta tabla.
3. Avisar a las organizaciones con 15 días de anticipación (cláusula 6 del acuerdo).
4. Actualizar `frontend/landingpage/legal/comunidad.html` y, si aplica, `privacidad.html`.
