# Acuerdo de tratamiento de datos (plantilla)

> Plantilla para firmar con cada organización que conecte su comunidad a Insight Mind. Reemplaza lo que está entre corchetes. Debe revisarla un abogado antes de usarla con datos reales.

**Entre:**

- **[Nombre de la organización]**, con domicilio en [domicilio], representada por [nombre y cargo] (en adelante, **el Responsable**), y
- **el equipo de Insight Mind**, proyecto académico del Hackathon ONE G10 [razón social cuando exista], con contacto en privacidad@[dominio] (en adelante, **el Encargado**).

Fecha: [fecha]. Vigencia: mientras el Responsable use Insight Mind, y hasta que se cumpla la cláusula 10.

---

## 1. Objeto

El Encargado trata datos personales de la comunidad [nombre de la comunidad] **por cuenta y siguiendo las instrucciones del Responsable**, para prestarle el servicio Insight Mind: analizar mensajes, proponer contenido y medir el pulso de la comunidad.

## 2. Datos y personas

- **Personas:** miembros de la comunidad que publican en los espacios conectados.
- **Datos:** nombre o alias, canal, periodo y texto de mensajes publicados en espacios abiertos.
- **Excluidos:** mensajes privados, datos de pago, contraseñas y datos sensibles. El Responsable no conectará espacios donde sean previsibles datos sensibles o de menores sin avisar antes al Encargado y documentar la base legal.

## 3. Finalidades permitidas

Análisis automatizado (sentimiento, tipo, temas, relevancia), redacción de borradores (FAQs, publicaciones, boletín), tickets de apoyo y panorama agregado. El Encargado **no** usará los datos para fines propios, no los venderá ni los usará para perfilar o tomar decisiones sobre personas.

## 4. Obligaciones del Responsable

1. Contar con una base legal para el tratamiento e **informar a los miembros** antes del primer análisis, con el [Aviso para miembros de comunidades](../../frontend/landingpage/legal/comunidad.html) o uno equivalente.
2. Obtener el **consentimiento** de una persona antes de publicar su nombre o su historia.
3. Revisar y aprobar todo contenido antes de publicarlo.
4. Trasladar al Encargado, sin demora, las solicitudes de derechos que le lleguen.

## 5. Obligaciones del Encargado

1. Tratar los datos solo según estas instrucciones, y avisar si una instrucción le parece contraria a la ley.
2. Asegurar que quienes acceden estén obligados a confidencialidad.
3. Aplicar las medidas de seguridad del anexo A.
4. Ayudar al Responsable a responder solicitudes de derechos en un plazo máximo de **10 días hábiles**.
5. Notificar al Responsable cualquier incidente de seguridad que afecte los datos **en un máximo de 48 horas** desde que lo conozca.
6. Poner a disposición la información necesaria para demostrar el cumplimiento.

## 6. Subencargados

El Responsable autoriza a los proveedores listados en [PROVEEDORES.md](PROVEEDORES.md): Cohere, Oracle Cloud Infrastructure y MongoDB Atlas. El Encargado avisará con **15 días** de anticipación antes de añadir o cambiar uno, y el Responsable podrá oponerse.

## 7. Transferencias internacionales

Los subencargados pueden tratar datos fuera del país del Responsable. Las transferencias se amparan en las garantías contractuales de cada proveedor (cláusulas contractuales tipo u otras equivalentes reconocidas por la ley aplicable).

## 8. Conservación

Según la tabla de [PROCEDIMIENTOS.md](PROCEDIMIENTOS.md), salvo que el Responsable indique plazos más cortos.

## 9. Responsabilidad

Cada parte responde de sus propios incumplimientos. [Límites de responsabilidad por definir con asesoría legal.]

## 10. Fin del servicio

Al terminar, el Encargado **devolverá o suprimirá** los datos, a elección del Responsable, en un máximo de **30 días**, y confirmará por escrito la supresión, salvo que la ley obligue a conservar alguno.

---

## Anexo A. Medidas de seguridad

- Acceso al panel con usuario personal, contraseña y sesión `HttpOnly` / `SameSite=Strict` de 12 horas.
- HTTPS en todo el tráfico (Let's Encrypt), con redirección desde `http://`.
- Minimización: correos y teléfonos se enmascaran antes de enviarse al proveedor de IA; el nombre del autor no se envía para analizar ni para redactar FAQs.
- Aprobación humana obligatoria antes de publicar; confirmación de permiso para contenido que nombra personas.
- La API pública solo expone contenido publicado, sin datos de autores.
- Almacenamiento en Oracle Cloud Infrastructure con acceso restringido por credenciales.
- Copias del contenido en MongoDB limitadas a lo necesario para el panorama.

**Firmas**

| Por el Responsable | Por el Encargado |
|---|---|
| [Nombre, cargo, fecha] | [Nombre, fecha] |
