<!-- ═══════════════════════════════ 0 · ENCABEZADO ═══════════════════════════════ -->

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/p1-portada-oscuro.webp">
  <img src="docs/assets/readme/p1-portada-claro.webp" width="100%" alt="Insight Mind · De ruido a señal. La IA propone, tu equipo decide. Burbujas de papel que se ordenan en una hoja periwinkle que sostiene una mano.">
</picture>

<h1 align="center">InsightMind · Community Lab</h1>

<p align="center">
  Convierte los mensajes de una comunidad de aprendizaje en contenido listo para publicar,<br>
  en tickets de apoyo y en una lectura semanal de cómo se siente la gente.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Cohere-command--r-39594D" alt="Cohere command-r">
  <img src="https://img.shields.io/badge/OCI-Object_Storage-F80000?logo=oracle&logoColor=white" alt="OCI Object Storage">
  <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/nginx-HTTPS-009639?logo=nginx&logoColor=white" alt="nginx con HTTPS">
  <img src="https://img.shields.io/badge/Oracle_Linux-9-F80000?logo=oracle&logoColor=white" alt="Oracle Linux 9">
  <img src="https://img.shields.io/badge/HTML_·_CSS_·_JS-sin_framework-E34F26?logo=html5&logoColor=white" alt="HTML, CSS y JS sin framework">
</p>

<p align="center">
  <a href="https://insightmind.duckdns.org/landing/"><strong>Ver la landing</strong></a> ·
  <a href="#pruébalo"><strong>Instalar</strong></a> ·
  <a href="#equipo"><strong>Equipo</strong></a>
</p>

<p align="center">
  <sub>Hackathon <strong>Oracle Next Education (ONE)</strong> × <strong>No Country</strong> · G10 Latam · Equipo 51</sub>
</p>

---

<!-- ═══════════════════════════════ 1 · EL PROBLEMA ═══════════════════════════════ -->

## El problema

Una comunidad de aprendizaje habla todo el día. En Discord, en foros, en formularios. Ahí están los primeros empleos, las certificaciones aprobadas, las dudas que se repiten y las personas que llevan semanas atoradas.

Casi todo se pierde en el historial. Leerlo a mano le cuesta horas al equipo de comunidad, y las señales que importan, como alguien que no puede entrar a su curso y está por rendirse, llegan tarde o no llegan.

<p align="center">
  <img src="docs/assets/readme/p2-ruido.webp" width="100%" alt="Cientos de burbujas de papel grafito amontonadas; unas pocas burbujas periwinkle quedan medio escondidas entre ellas.">
</p>

---

<!-- ═══════════════════════════ 2 · ESCUCHA DONDE YA CONVERSA ═══════════════════════════ -->

## Escucha donde ya conversa tu comunidad

Nadie tiene que exportar ni copiar mensajes. Eliges un periodo y InsightMind lee el canal de **Slack** de tu comunidad:

1. **Lee el canal** de las últimas 1, 6, 12 o 24 horas.
2. **Se queda con lo que importa.** Prioriza preguntas, problemas, reclamos y logros, y agrupa las preguntas repetidas para que una duda frecuente no ocupe diez lugares. Elige **hasta 20 mensajes** por importación.
3. **Pone nombre a cada voz.** Muestra al autor con su nombre de Slack, no con un identificador.
4. **Lo deja listo para la IA.** Guarda cada mensaje en OCI con el mismo formato que cualquier otra entrada, y desde ahí sigue el flujo de siempre.

Esta preselección ocurre **en nuestro servidor, sin IA**: el canal completo nunca se envía a un proveedor externo. Al modelo solo llegan los mensajes elegidos.

¿Tu comunidad no está en Slack? Hay otras dos entradas, y ambas siguen exactamente el mismo camino:
- **Sube archivos JSON.**
- **Pega la conversación tal cual.** Sirve el formato «Nombre: mensaje» o el que copias de Discord. InsightMind la separa en mensajes por su cuenta.

---

<!-- ═══════════════════════════ 3 · UN MENSAJE, CUATRO DESTINOS ═══════════════════════════ -->

## Un mensaje, cuatro destinos

InsightMind lee cada mensaje, entiende qué es y decide qué hacer con él. Estos son mensajes reales del dataset de ejemplo (`input_examples/`):

| Llega | InsightMind entiende | Y produce |
|---|---|---|
| *«Después de seis meses de aprendizaje conseguí mi primera entrevista para Analista de Datos…»*<br><sub>Ana Ribeiro · testimonio</sub> | Positivo y relevante | **Éxito** → post de LinkedIn, hilo de X y destaque para el newsletter |
| *«¿Cuál es la mejor forma de optimizar un proceso ETL que carga más de un millón de registros diarios?»*<br><sub>Tiago Mendes · pregunta técnica</sub> | Una duda que otros también tienen | **FAQ** → un tip paso a paso, marcado para validación de un mentor |
| *«Intento acceder al curso y recibo un error 403 en todas las lecciones.»*<br><sub>María Soto · problema de acceso</sub> | Negativo y urgente | **Ticket** → se abre con severidad y se avisa al equipo por Discord |
| Saludos, conversación sin contexto, ruido | Relevancia baja | **Descarte** → no se genera contenido ni se gastan llamadas de generación |

Lo que no encaja en ninguna ruta no se pierde: queda como **insight** y alimenta el [Panorama](#el-panorama).

<p align="center">
  <img src="docs/assets/readme/p3-destinos.webp" width="100%" alt="Un mensaje de papel pasa por el análisis y se reparte en cuatro destinos: éxito (score 70 o más), FAQ, ticket y descarte (score menor a 40).">
</p>

---

<!-- ═══════════════════════════ 3 · LA IA PROPONE, TU EQUIPO DECIDE ═══════════════════════════ -->

## La IA propone, tu equipo decide

Nada se publica solo. La curaduría humana no es un paso extra: es parte del mecanismo.

- **Todo pasa por revisión.** Cada pieza se puede leer, editar, volver a generar por separado o descartar antes de publicarse.
- **Publicar pide confirmación.** Una pieza solo se da por publicada si el guardado en OCI responde bien. «Deshacer» también se guarda.
- **Nadie aparece sin permiso.** Antes de publicar un post o un newsletter que nombra a alguien, el equipo debe confirmar con un clic que esa persona lo autorizó. En las FAQs confirma que no hay datos personales.
- **Una sola voz de marca.** El equipo escribe su guía de voz una vez y elige reglas rápidas: *Sin hashtags, Sin emojis, Formal, Cercano…* Cada regla se traduce en una instrucción para el modelo. «Sin hashtags» y «Sin emojis» además pasan por un filtro posterior, porque un modelo puede ignorar una instrucción, pero un filtro no.
- **Operación en lote.** Tickets y piezas se seleccionan y se envían de a muchos, o de uno en uno.
- **Tus ediciones están a salvo.** Si vuelves a procesar el lote, nada de lo que editaste, pusiste en cola o publicaste se sobrescribe.
- **Llega a donde está tu audiencia.** Las FAQs y los destaques aprobados aparecen solos en la landing pública.

<table>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/assets/readme/p4a-decide.webp" width="100%" alt="Una mano elige la única tarjeta periwinkle de una pila de tarjetas grises."><br>
      <b>La IA propone, tú decides</b><br>
      <sub>Nada se publica sin una persona que lo apruebe.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/assets/readme/p4b-embudo.webp" width="100%" alt="Un embudo de papel recibe muchas burbujas grises y entrega tres tarjetas periwinkle."><br>
      <b>El embudo mide al modelo</b><br>
      <sub>Cuántas piezas se aprueban sin tocar el texto.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/assets/readme/p4c-personas.webp" width="100%" alt="Una multitud de figuras de papel; una se aparta y a su lado hay un marcador periwinkle."><br>
      <b>Personas, no marca</b><br>
      <sub>Avisa a tiempo cuando alguien se está quedando atrás.</sub>
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/assets/readme/p7-curaduria.webp" width="100%" alt="Panel de curaduría: posts de LinkedIn generados con su score, el mensaje que los originó y los botones para publicar, guardar, acortar, alargar, volver a generar o descartar.">
</p>

<p align="center"><sub>La curaduría: cada pieza muestra de qué mensaje salió y se puede editar, acortar, alargar o volver a generar antes de publicarla.</sub></p>

---

<!-- ═══════════════════════════════ 4 · EL PANORAMA ═══════════════════════════════ -->

## El Panorama

La pantalla de entrada no es un formulario. Es una lectura de la comunidad que responde cinco preguntas que hoy nadie del equipo puede contestar sin abrir Discord a mano:

| Pregunta | Qué la responde |
|---|---|
| ¿Cómo viene el ánimo y hacia dónde va? | El pulso de la comunidad, semana contra semana |
| ¿Qué tema creció esta semana? | Temas en ascenso |
| ¿Dónde duele? | Un termómetro por tema |
| ¿Sirve de algo la IA? | El embudo de producción: de lo que llegó a lo que se publicó, y cuánto se aprobó sin tocar el texto |
| **¿A quién hay que llamar hoy?** | Las voces que alimentan el contenido y los miembros que acumulan mensajes negativos |

Dos ideas lo distinguen de una herramienta de marca:

- **El embudo mide al modelo.** Si sube el porcentaje de piezas aprobadas sin editar, los prompts mejoraron. Es una métrica de calidad, no de vanidad.
- **La lista de riesgo mide personas, no marca.** Avisa cuando alguien lleva semanas atorado y está por irse.

<p align="center">
  <img src="docs/assets/readme/p6-panorama.webp" width="100%" alt="Panorama de la comunidad: métricas de la semana y el pulso con mensajes positivos arriba y negativos abajo.">
</p>

<sub>«Temas en ascenso» y «Dónde duele» se completan cuando el análisis devuelva temas; mientras tanto usan datos de ejemplo (ver [Próximos pasos](#próximos-pasos)).</sub>

---

<!-- ═══════════════════════════ 5 · ESCUCHAR, NO VIGILAR ═══════════════════════════ -->

## Escuchar, no vigilar

Los miembros de una comunidad no eligieron usar InsightMind. Por eso la privacidad está en el diseño, no en una nota al pie.

| Principio | Cómo se cumple |
|---|---|
| **A la IA solo llega lo necesario** | Los correos y teléfonos se reemplazan por `[correo]` y `[teléfono]` antes de llamar a Cohere. El análisis no envía el nombre del autor, y las FAQs se redactan sin él. El original queda intacto en el bucket |
| **Lo que no se elige, no sale** | La preselección de Slack ocurre en nuestro servidor: el canal completo nunca llega a un proveedor externo |
| **Nadie aparece sin permiso** | Para publicar contenido con el nombre de una persona hay que confirmar su autorización con un clic obligatorio |
| **Lo público no expone a nadie** | La landing solo recibe piezas publicadas, sin autores, sin tickets y sin el mensaje original |
| **Cero rastreo en la landing** | Sin cookies y sin recursos de terceros: hasta las fuentes se sirven desde nuestro servidor, así que no hace falta un banner de cookies |
| **Honestidad sobre la IA** | La landing avisa que las FAQs y el newsletter se redactan con IA y los revisa una persona |
| **Seguro por defecto** | HTTPS en todo el tráfico, sesión en cookie `HttpOnly` y `SameSite=Strict`, y todo el contenido de la comunidad se escapa antes de mostrarse, así que un mensaje malicioso no puede ejecutar código en el panel |

**Documentación legal incluida.** Se tomó como base el RGPD, con apartados para México, Brasil, Colombia, Argentina y Chile:
- **Páginas públicas en la landing:** aviso de privacidad, aviso para miembros de comunidades, términos de uso y política de cookies.
- **Documentos internos:** un acuerdo de tratamiento de datos para cada organización, el registro de proveedores y los procedimientos de conservación, derechos e incidentes.

<sub>Son plantillas para un proyecto académico, no asesoría legal. Lo que falta antes de operar con datos reales está en [`docs/legal/README.md`](docs/legal/README.md).</sub>

<p align="center">
  <img src="docs/assets/readme/p7-autorizacion.webp" width="100%" alt="Modal «Publicar en LinkedIn Page» con la casilla obligatoria marcada: «Asegúrate de que se cuente con la autorización de este usuario para la publicación».">
</p>

<p align="center"><sub>Sin la casilla marcada, el botón «Publicar ahora» no se activa.</sub></p>

---

<!-- ═══════════════════════════ 6 · RECORRIDO POR EL PRODUCTO ═══════════════════════════ -->

## Recorrido por el producto

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/readme/p7-analisis.webp" width="100%" alt="Ejecución del grafo de procesos: validar, limpiar y enmascarar datos personales, analizar, agrupar preguntas, router, consolidar, guardar en OCI y generar."><br>
      <b>Análisis paso a paso</b><br>
      <sub>El grafo de procesos muestra cada etapa mientras ocurre, desde enmascarar datos personales hasta guardar en OCI.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/readme/p7-tickets.webp" width="100%" alt="Tickets internos con severidad, autor, canal y resumen, seleccionados en lote, con botones para avisar en Discord y en Slack."><br>
      <b>Tickets en lote</b><br>
      <sub>Las quejas y los problemas se convierten en tickets que se avisan al equipo por Discord o Slack.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/readme/p7-voz.webp" width="100%" alt="Ajustes: guía de voz con texto libre y chips de estilo, umbrales de decisión y cuentas vinculadas."><br>
      <b>Una sola voz de marca</b><br>
      <sub>Guía de voz, chips de estilo y umbrales de decisión en una sola pantalla.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/readme/p7-faq.webp" width="100%" alt="Sección de preguntas frecuentes de la landing pública, con el aviso de que se redactan con IA y las revisa una persona."><br>
      <b>Publicado en la landing</b><br>
      <sub>Las FAQs aprobadas llegan solas a la landing, con el aviso de que se redactan con IA.</sub>
    </td>
  </tr>
</table>

---


<!-- ═══════════════════════════ 6 · CUMPLIMIENTO DEL BRIEF ═══════════════════════════ -->

## Cumplimiento del brief

| Requisito del MVP | Cómo lo resolvemos | |
|---|---|:---:|
| Ingesta de interacciones | Tres entradas: **importación directa desde Slack** (`POST /slack/ingestar`), carga de JSON (`POST /upload`) y conversación pegada en crudo (`POST /ingesta/texto`). Todas dejan los mensajes en OCI, y `POST /procesar` analiza solo lo nuevo o lo modificado | ✅ |
| Análisis con LLM | Cohere `command-r-08-2024` clasifica siempre el tipo por el contenido (y corrige la etiqueta de entrada si no coincide), y asigna sentimiento, un score de 0 a 100 y una justificación en una frase | ✅ |
| Al menos 2 formatos de contenido | Cuatro: post de LinkedIn, hilo de X, Tip / FAQ y destaque de newsletter. Además, tickets de apoyo | ✅ |
| Orquestación con routing condicional | Árbol de decisión en Python (`calcular_ruta()`) con cinco rutas | ✅ |
| Integración con OCI Object Storage | El bucket es la fuente de verdad: entradas, caché de análisis, curaduría por semana y guía de voz | ✅ |
| Mínimo 3 transformaciones demostrables | 60 mensajes de ejemplo y 5 casos de ticket en `input_examples/` | ✅ |
| Repositorio documentado con diagrama | Este README, con diagramas de arquitectura, secuencia y decisión | ✅ |
| Interfaz o panel de curaduría | Panel propio: revisar, editar, volver a generar, aprobar y publicar | ✅ |
| Puntuación de relevancia | Score de 0 a 100 que decide el descarte (menos de 40) y el éxito (70 o más) | ✅ |
| Tono por canal | Instrucciones por formato combinadas con la guía de voz del equipo | ✅ |

**Más allá del MVP:** importación desde Slack con preselección local de hasta 20 mensajes, despliegue en OCI Compute con nginx y HTTPS, login con sesión firmada, Panorama sobre MongoDB, landing pública conectada a la curaduría, avisos a Discord y Slack, caché que evita llamadas repetidas al modelo, un contador de consumo de Cohere, y [privacidad por diseño](#escuchar-no-vigilar) con documentación legal.

---

<!-- ═══════════════════════════ 7 · ARQUITECTURA Y DECISIONES ═══════════════════════════ -->

## Arquitectura

<p align="center">
  <img src="docs/assets/readme/p8-arquitectura.webp" width="100%" alt="Maqueta de papel: una caja sellada con una sola puerta periwinkle, conectada a tres bloques. Un servidor cerrado con una única entrada.">
</p>

<p align="center"><sub>Una sola puerta: HTTPS por el 443. Todo lo demás vive dentro de la VM.</sub></p>

```mermaid
flowchart LR
    U["Usuario<br/>(navegador)"] -->|"HTTPS :443<br/>insightmind.duckdns.org"| NGX
    U -.->|"HTTP :80 → 301 a HTTPS"| NGX

    subgraph VM["VM Oracle Linux 9 (OCI)"]
        NGX["nginx<br/>TLS con Let's Encrypt<br/>front estático + proxy /api/"]
        API["FastAPI + uvicorn<br/>127.0.0.1:8000<br/>login + sesión por cookie"]
        MDB[("MongoDB<br/>127.0.0.1:27017<br/>opcional")]
        NGX -->|"/api/ → proxy_pass"| API
        API --> MDB
    end

    API -->|"SDK de OCI"| BKT[("Object Storage<br/>fuente de verdad")]
    API -->|"HTTPS"| COH["Cohere API<br/>command-r-08-2024"]
    SLK["Slack API<br/>conversations.history"] -->|"ingesta: hasta 20 mensajes"| API
    API -->|"webhooks de tickets"| SD["Discord · Slack"]
```

### Stack

| Capa | Tecnología |
|---|---|
| API y lógica | Python · FastAPI · uvicorn · Pydantic |
| Modelo de lenguaje | Cohere `command-r-08-2024` |
| Almacenamiento | OCI Object Storage (fuente de verdad) |
| Analítica | MongoDB (proyección para consultas) |
| Interfaz y landing | HTML, CSS y JavaScript, sin framework ni build |
| Servidor web y proxy | nginx: HTTPS en el puerto 443 con certificado de Let's Encrypt, redirección de 80 a 443, proxy inverso de `/api/`, HSTS y cabeceras de seguridad, límite de intentos en el login |
| Infraestructura | OCI Compute · Oracle Linux 9 · systemd · SELinux |
| Fuentes de mensajes | Slack (API de conversaciones, con bot) · carga de archivos JSON |
| Notificaciones | Webhooks de Discord y Slack |
| Gestión del equipo | GitHub · Trello · Notion · Discord · FigJam |

### Decisiones que tomamos

**Un panel propio y no Streamlit ni Gradio.** El brief admite un panel de curaduría. Lo construimos en HTML, CSS y JavaScript para tener libertad de diseño (modales de confirmación, tarjetas por plataforma, filtros por tarjeta), un responsive real para revisar desde el celular y cero dependencias de build.

**El bucket manda; Mongo consulta.** OCI Object Storage guarda todo lo que importa. MongoDB es una copia para consultas: si se cae, el flujo principal sigue y solo el Panorama se degrada, con un aviso que explica el motivo.

**No pagar dos veces por lo mismo.** Cada análisis se guarda con el `etag` del archivo y el modelo usado. Reprocesar un lote ya analizado cuesta cero llamadas a Cohere, y lo ya generado o editado no se vuelve a generar.

**Un loader que no miente.** La barra avanza hasta el 70 % y se detiene hasta que el servidor responde. Una animación que termina antes que el proceso deja la pantalla diciendo «listo» mientras está congelada. Nos pasó en una prueba y lo corregimos.

**Cifrado y cerrado por defecto.** Lo único público es nginx, en HTTPS por el puerto 443 con certificado de Let's Encrypt; el puerto 80 solo redirige a HTTPS. FastAPI y MongoDB escuchan en `127.0.0.1` y no se exponen. La API exige sesión salvo en `/auth/*` y `/publico/*`.

### Flujo de procesamiento y caché

El bucket es la **fuente de verdad**. MongoDB es una proyección para consultas y puede apagarse sin que el flujo se caiga.

```mermaid
sequenceDiagram
    actor U as Usuario
    participant F as Front
    participant A as FastAPI
    participant B as Bucket OCI
    participant C as Cohere
    participant M as MongoDB

    U->>F: Subir mensajes
    F->>A: POST /upload
    A->>B: guarda mensaje_XXXX.json
    U->>F: Procesar con IA
    F->>A: POST /procesar
    A->>B: lista objetos (con etag)
    loop cada mensaje
        A->>B: lee analisis/<archivo>.json
        alt mismo etag y mismo modelo
            Note over A: reutiliza, 0 llamadas a Cohere
        else nuevo o modificado
            A->>C: analiza sentimiento y score
            A->>B: guarda analisis/<archivo>.json
        end
    end
    A->>M: replica solo lo nuevo
    A-->>F: mensajes (con etag, slug y nuevo=true/false)
    F->>A: GET /curaduria/slug (uno por periodo)
    Note over F: reconcilia por huella: solo genera lo nuevo o cambiado
    F->>A: POST /generar (solo pendientes)
    A->>C: genera texto con la guía de voz
    U->>F: Guardar para después
    F->>A: PUT /curaduria/slug (uno por periodo)
    A->>B: guarda activos/slug/curaduria.json
```

<details>
<summary><strong>Ingesta desde Slack: permisos, selección y formato</strong></summary>

`POST /slack/ingestar` lee el canal configurado con `conversations.history`, paginando hasta 1000 mensajes del periodo elegido (1, 6, 12 o 24 horas). Después:

1. **Descarta lo que no es conversación:** entradas y salidas del canal, mensajes de bots, mensajes borrados y textos vacíos.
2. **Puntúa localmente**, sin IA. Suma puntos a los logros (*conseguí, aprobé, certificado, contratado…*), a los problemas (*error, no funciona, bloqueado, urgente…*) y a las preguntas, y premia las dudas que se repiten.
3. **Deduplica:** si dos mensajes comparten la mayoría de sus palabras, solo uno ocupa un lugar.
4. **Elige hasta 20** y resuelve el nombre de cada autor con `users.info`. Si no puede, conserva su ID para no perder la trazabilidad.
5. **Guarda cada uno** en `slack-ingesta/` del bucket con el formato estándar de entrada, más `fecha` y un bloque `metadata_slack` (`ts`, `permalink`, repeticiones aproximadas y prioridad de la preselección).

Luego, «Procesar con IA» los analiza como a cualquier otro mensaje. No hay un segundo motor de análisis.

**Permisos del bot de Slack:** `channels:history` (canales públicos), `groups:history` (privados) y `users:read` (nombres). El bot debe estar agregado al canal.

**Errores controlados:** si falta el token o el canal, responde `503`. Si Slack rechaza la lectura (permisos o ID), responde `502` con el motivo y sin exponer el token. Un periodo sin mensajes relevantes termina sin generar archivos.

</details>

<details>
<summary><strong>Qué evita el reprocesamiento</strong></summary>

| Mecanismo | Dónde | Qué evita |
|---|---|---|
| Caché de análisis, clave `etag` + `modelo` | `analisis/<archivo>.json` | Volver a llamar a Cohere por un mensaje ya analizado |
| Huella del activo, `formato + archivo + etag` | `curaduria.json` y front | Volver a generar contenido ya generado |
| Protección de ediciones | `reconciliar()` en `app.js` | Pisar un texto editado, en cola o publicado |
| `forzar=true` en `/procesar` y `/generar` | API | Reprocesar a propósito |
| «Volver a generar» (`texto_previo`) | `/generar` | Regenera **solo ese** activo |

- La **newsletter** resume todo el lote: cambia al entrar mensajes nuevos y se regenera.
- Un cambio en la guía de voz **no** regenera el contenido ya generado.
- Un lote puede mezclar periodos (`Semana_01`, `Semana_05`…): cada mensaje, activo y ticket se guarda bajo el slug de **su propio periodo** (`2026-semana-05`).

</details>

<details>
<summary><strong>Guía de voz</strong></summary>

`PUT /config/voz` guarda `{ texto, chips }` en `config/voz.json`. Cada chip (Sin hashtags, Sin emojis, Formal, Cercano…) se traduce en una regla imperativa al final del prompt, donde más pesa. «Sin hashtags» y «Sin emojis» además se garantizan con un filtro posterior.

</details>

---

<!-- ═══════════════════════════════ 8 · ÁRBOL DE DECISIÓN ═══════════════════════════════ -->

## Árbol de decisión

Cada mensaje recibe de Cohere un `sentimiento` (positivo, neutral o negativo) y un `score` de 0 a 100 que mide qué tan relevante o accionable es. Con eso, `calcular_ruta()` en `backend/analizador_sentimiento.py` decide su destino.

```mermaid
flowchart TD
    A["Mensaje analizado<br/>tipo + sentimiento + score"] --> B{"score < 40?"}
    B -->|sí| D["descartado"]
    B -->|no| C{"sentimiento negativo<br/>o tipo queja / problema_acceso?"}
    C -->|sí| T["ticket<br/>aviso a Discord o Slack"]
    C -->|no| E{"tipo testimonio o logro,<br/>sentimiento positivo<br/>y score ≥ 70?"}
    E -->|sí| X["éxito<br/>LinkedIn + hilo X + newsletter"]
    E -->|no| F{"tipo pregunta_tecnica?"}
    F -->|sí| Q["faq<br/>Tip / FAQ"]
    F -->|no| I["insight"]
```

<details>
<summary><strong>Parámetros y reglas de generación</strong></summary>

| Parámetro | Valor | Dónde |
|---|---|---|
| `UMBRAL_DESCARTE` | **40** | `backend/analizador_sentimiento.py` |
| `UMBRAL_EXITO` | **70** | `backend/analizador_sentimiento.py` |
| Sentimiento → número | positivo = 0.8, neutral = 0, negativo = -0.6 | `_sent_num()` |
| Ticket por sentimiento | número ≤ -0.4 (es decir, «negativo») | `calcular_ruta()` |
| Éxito por sentimiento | número ≥ 0.6 (es decir, «positivo») | `calcular_ruta()` |
| Severidad del ticket | **Alta** si número ≤ -0.6, si no **Media** | `db.guardar_ticket()` |

Tipos válidos: `testimonio`, `logro`, `pregunta_tecnica`, `queja`, `problema_acceso`, `feedback`, `conversacion`.

**La IA decide el tipo, no quien armó el dataset.** Si el JSON trae `tipo`, Cohere lo recibe solo como pista: clasifica cada mensaje por su contenido, con una definición explícita de cada tipo, y puede corregir la pista. Cada análisis devuelve `tipo`, `tipo_pista` y `tipo_corregido`, y el panel marca los mensajes cuya etiqueta corrigió. Un tipo fuera de la lista no se inventa: se usa la pista o `conversacion`. El prompt trata el mensaje como datos, así que no obedece instrucciones escritas dentro de él.

Qué se genera por ruta (`construir()` en `js/app.js`):

- **éxito** → un post de LinkedIn por mensaje; **hilo de X** solo para el de mayor score.
- **faq** → Tip / FAQ para los **2** de mayor score.
- **newsletter** → 1 por lote.
- **ticket** → ticket en estado `Abierto`, con aviso opcional a Discord.

Los umbrales aparecen en **Ajustes → Umbrales de decisión** y el front puede recalcular el lote. Los valores del backend están fijos en el código: si cambias uno, cámbialo también en el front.

</details>

---

<!-- ═══════════════════════════ 9 · DATOS: BUCKET Y MONGODB ═══════════════════════════ -->

## Datos

### Bucket de OCI (fuente de verdad)

```text
<BUCKET_NAME>/
├── mensaje_0001.json                  # entradas: una interacción por archivo
├── analisis/
│   └── mensaje_0001.json              # caché del análisis (etag + modelo + resultado)
├── activos/
│   └── 2026-semana-05/
│       └── curaduria.json             # activos generados y curados + tickets del periodo
├── slack-ingesta/
│   └── 20261024-153000-01-<ts>.json   # mensajes importados desde Slack (mismo formato de entrada)
└── config/
    ├── voz.json                       # { "texto": "...", "chips": ["Sin hashtags", ...] }
    └── cohere_uso.json                # contador aproximado de llamadas a Cohere
```

Los prefijos `analisis/`, `activos/` y `config/` son **reservados**: `/procesar` no los trata como mensajes de entrada.

Forma de un mensaje de entrada:

```json
{
  "origen_comunidad": "Discord_Grupo_ONE_G10",
  "periodo_referencia": "Semana_02",
  "interaccion": {
    "autor": "María Soto",
    "canal": "#ayuda",
    "tipo": "problema_acceso",
    "texto": "Intento acceder al curso y recibo un error 403 en todas las lecciones."
  }
}
```

### MongoDB (opcional)

Sin `MONGO_URI` la app funciona solo con el bucket. Si Mongo falla, las operaciones no hacen nada y se pausan 60 s antes de reintentar. Nunca tumban el flujo principal.

<details>
<summary><strong>Colecciones, sincronización y diagnóstico del Panorama</strong></summary>

| Colección | Contenido | Índice |
|---|---|---|
| `mensajes_entrada` | JSON de entrada tal cual baja del bucket (+ `archivo`, `etag`) | `periodo_referencia`, `origen_comunidad` |
| `analisis` | Resultado del análisis por mensaje | `slug`, `ruta` |
| `contenido_generado` | Activos (LinkedIn, X, FAQ, newsletter) | `slug`, `formato`, `estado` |
| `tickets` | Mensajes enrutados a ticket (`_id = slug:archivo`) | `slug`, `estado` |
| `lotes` | Resumen de cada procesamiento (slug, totales, caché) | — |
| `config` | Guía de voz (`_id = "voz"`) | — |

Los tickets se crean como `Abierto` solo la primera vez; un nuevo procesamiento no pisa estados ya gestionados.

`./deploy/sincronizar_mongo.sh` carga a Mongo lo que ya está en el bucket (entradas, análisis, curadurías y voz). Es idempotente.

**Panorama con cifras simuladas.** `GET /dashboard` lee solo de MongoDB y, si no puede, el front dibuja una serie de ejemplo. El aviso amarillo indica el motivo exacto:

| Motivo en el aviso | Causa | Qué hacer |
|---|---|---|
| `MONGO_URI no está configurada` | Falta la variable | Definir `MONGO_URI=mongodb://usuario:clave@127.0.0.1:27017/` y reiniciar |
| `No se pudo conectar a MongoDB` | `mongod` caído, credenciales o puerto erróneos | `systemctl status mongod`; probar la URI con `mongosh` |
| `MongoDB no tiene análisis todavía` | Mongo vacío: `/procesar` solo replica lo que analiza en ese momento | `./deploy/sincronizar_mongo.sh` |
| `No hay datos del periodo …` | El periodo pedido no existe en Mongo | Elegir otra semana en el selector |

</details>

---

<!-- ═══════════════════════════════ 10 · API ═══════════════════════════════ -->

## API

Todas las rutas exigen sesión, salvo `/auth/*` y `/publico/*`. Swagger queda disponible en `/docs` en desarrollo; en producción nginx lo bloquea.

<details>
<summary><strong>Ver todas las rutas</strong></summary>

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/upload` | Sube un mensaje al bucket |
| POST | `/ingesta/texto` | Convierte una conversación pegada («Nombre: mensaje» o el formato de Discord) en archivos de entrada, sin tipo |
| GET | `/files` | Lista los objetos del bucket |
| GET | `/download/{filename}` | Descarga un objeto |
| DELETE | `/files/{filename}` | Borra un objeto |
| POST | `/procesar?forzar=false` | Analiza mensajes nuevos o modificados; devuelve cada uno con `etag`, `slug` y `nuevo` |
| POST | `/generar` | Genera contenido con la guía de voz; reutiliza lo ya generado por `huella` |
| GET / PUT | `/config/voz` | Lee o guarda la guía de voz (texto + chips) |
| GET / PUT | `/curaduria/{slug}` | Lee o guarda la curaduría de un periodo |
| GET | `/semanas` | Lista los periodos disponibles en el bucket |
| GET | `/semanas/{slug}` | Detalle y métricas de un periodo |
| GET | `/slack/config` | Indica si Slack está configurado y la etiqueta del canal. Nunca expone el token ni el ID real |
| POST | `/slack/ingestar` | Importa el canal de Slack (`{"horas": 1 \| 6 \| 12 \| 24}`), preselecciona hasta 20 mensajes y los guarda en OCI |
| POST | `/tickets/avisar` | Envía el aviso de un ticket a Discord o Slack |
| GET | `/dashboard` | Datos del Panorama (lee de MongoDB) |
| GET / PUT | `/cohere/uso` | Consumo estimado de Cohere en el mes y su límite |
| GET | `/conexiones` | Estado de las plataformas conectadas |
| PUT | `/conexiones/{plataforma}` | Conecta o desconecta una plataforma |
| POST | `/publicar-redes` | Publica en LinkedIn con su API o prepara el modo asistido para X |
| POST | `/sincronizar` | Replica el bucket a MongoDB |
| POST | `/auth/login` · `/auth/logout` | Inicia o cierra sesión. Pública |
| GET | `/auth/me` | Usuario de la sesión actual, o 401. Pública |
| GET | `/publico/faqs` | FAQs publicadas, sin tickets ni datos de autores. Pública |
| GET | `/publico/newsletter` | Destaques de newsletter publicados. Pública |

nginx además bloquea `DELETE`, `/files`, `/download`, `/sincronizar` y `/docs`.

</details>

---

<!-- ═══════════════════════════════ 11 · PRUÉBALO ═══════════════════════════════ -->

## Pruébalo

**Requisitos:** Python 3.11 o superior (verificado con 3.14), acceso a un bucket de OCI y una clave de Cohere.

```bash
git clone https://github.com/No-Country-simulation/G10-Latam-Equipo51-Power-CommunityLab.git
cd G10-Latam-Equipo51-Power-CommunityLab
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # completa COHERE_API_KEY y BUCKET_NAME
oci setup config                  # si aún no tienes ~/.oci/config
python -m backend.auth crear <usuario>
SERVIR_UI=1 uvicorn main:app --host 127.0.0.1 --port 8000
```

Abre <http://127.0.0.1:8000/ui/> e inicia sesión. Para probar, sube los mensajes de `input_examples/` y pulsa **Procesar con IA**.

<details>
<summary><strong>Variables de entorno (<code>.env</code>)</strong></summary>

Copia `.env.example` a `.env`. Está en `.gitignore`: **nunca lo subas al repositorio.**

| Variable | Obligatoria | Descripción |
|---|---|---|
| `COHERE_API_KEY` | Sí | Clave de la API de Cohere |
| `BUCKET_NAME` | Sí | Nombre del bucket de OCI Object Storage |
| `AUTH_SECRET` | Sí (lo genera `crear`) | Clave con la que se firman las sesiones. Si cambia, se cierran todas |
| `MONGO_URI` | No | Cadena de conexión. Sin ella no se usa Mongo |
| `MONGO_DB` | No | Base de datos de Mongo (por defecto `insightmind`) |
| `SLACK_BOT_TOKEN` | Para Slack | Token del bot (`xoxb-…`) con el que se lee el canal |
| `SLACK_CHANNEL_ID` | Para Slack | ID del canal que se importa |
| `SLACK_CHANNEL_LABEL` | No | Nombre que ve el front en lugar del ID real (por defecto `Canal-slack`) |
| `DISCORD_WEBHOOK_URL` | No | Webhook para avisos de tickets en Discord |
| `SLACK_WEBHOOK_URL` | No | Webhook para avisos de tickets en Slack |
| `COHERE_LIMITE_MENSUAL` | No | Límite del contador de llamadas (por defecto 1000) |
| `LINKEDIN_ACCESS_TOKEN` · `LINKEDIN_ORG_ID` | No | Publicación en LinkedIn |
| `TWITTER_API_KEY` y relacionadas | No | Modo asistido para X |
| `AUTH_USERS_FILE` | No | Archivo de usuarios (por defecto `data/usuarios.json`, fuera de git) |
| `AUTH_SESSION_HOURS` | No | Duración de la sesión (por defecto 12) |
| `AUTH_COOKIE_SECURE` | No | `true` en producción (HTTPS), para que la cookie solo viaje cifrada. `false` solo en desarrollo local por HTTP. Activarla en el servidor es un pendiente de [`docs/legal/README.md`](docs/legal/README.md) |
| `CORS_ORIGINS` | No | Vacío por defecto (mismo origen vía nginx). Solo para desarrollo con otro puerto |
| `SERVIR_UI` | No | `1` para que FastAPI sirva el front en `/ui` (desarrollo sin nginx) |

Credenciales de OCI: el SDK lee `~/.oci/config` del usuario que ejecuta la app.

</details>

<details>
<summary><strong>Pruebas</strong></summary>

No necesitan OCI ni red: Cohere y el bucket se simulan.

```bash
python pruebas/prueba_ia_clasifica.py   # la IA clasifica y corrige la pista de tipo
python pruebas/prueba_privacidad.py     # correos y teléfonos no llegan a la IA
python pruebas/prueba_publico.py        # la landing no expone autores ni tickets
python pruebas/prueba_conexiones.py
python pruebas/prueba_dashboard.py
```

</details>

---

<!-- ═══════════════════════════ 12 · DESPLIEGUE EN OCI ═══════════════════════════ -->

## Despliegue en OCI

Corre en una VM Oracle Linux 9 (x86_64 o ARM64 / Ampere A1) y se publica en **<https://insightmind.duckdns.org>**. nginx atiende HTTPS en el puerto 443 con certificado de Let's Encrypt, sirve el panel y la landing, y pasa `/api/` a FastAPI, que queda en `127.0.0.1:8000`.

| Puerto | Uso | Abierto al público |
|---|---|---|
| 443 | HTTPS: panel, landing y API vía nginx | Sí |
| 80 | Solo redirige a HTTPS (301) | Sí |
| 22 | Administración por SSH | Solo para administrar la VM |
| 8000 · 27017 | FastAPI y MongoDB | No, solo `127.0.0.1` |

<details>
<summary><strong>1 · Paquetes, código y credenciales de OCI</strong></summary>

```bash
sudo dnf install -y git python3.11 python3.11-pip

sudo mkdir -p /opt/insightmind && sudo chown opc:opc /opt/insightmind
git clone https://github.com/No-Country-simulation/G10-Latam-Equipo51-Power-CommunityLab.git /opt/insightmind
cd /opt/insightmind

python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env && chmod 600 .env && nano .env
```

```bash
mkdir -p ~/.oci && chmod 700 ~/.oci
# copia aquí `config` y tu llave privada (.pem), o ejecuta: oci setup config
chmod 600 ~/.oci/config ~/.oci/*.pem
```

Comprueba el acceso al bucket antes de seguir:

```bash
python -c "import oci; c=oci.config.from_file(); print(oci.object_storage.ObjectStorageClient(c).get_namespace().data)"
```

</details>

<details>
<summary><strong>2 · MongoDB (opcional)</strong></summary>

Instálalo en la misma VM y déjalo **solo en localhost**.

```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo <<'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF

sudo dnf install -y mongodb-org
sudo systemctl enable --now mongod
```

Sin autenticación solo es válido con `bindIp: 127.0.0.1` y `MONGO_URI=mongodb://127.0.0.1:27017/`. Para activarla, crea un usuario:

```javascript
// mongosh
use insightmind
db.createUser({ user: "insightmind", pwd: "<PASSWORD>", roles: [{ role: "readWrite", db: "insightmind" }] })
```

```yaml
# /etc/mongod.conf
net:
  bindIp: 127.0.0.1
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod
# .env → MONGO_URI=mongodb://insightmind:<PASSWORD>@127.0.0.1:27017/insightmind
```

Con la API arriba, una sola vez: `./deploy/sincronizar_mongo.sh`. Sincroniza directo, sin login, y muestra los periodos que verá el Panorama.

</details>

<details>
<summary><strong>3 · Usuario, nginx, systemd y SELinux</strong></summary>

```bash
cd /opt/insightmind && source venv/bin/activate

# Primer usuario: pide una contraseña de 8+ caracteres y genera AUTH_SECRET en .env
python -m backend.auth crear <usuario>

# nginx + front + SELinux + unidad systemd del backend
./deploy/desplegar.sh --systemd
```

Cada vez que cambies el front, vuelve a ejecutar `./deploy/desplegar.sh`.

Administrar usuarios: `python -m backend.auth listar | crear <u> | borrar <u>`. `crear` sobre un usuario existente cambia su contraseña. Borrar un usuario invalida su sesión de inmediato.

Logs del servicio: `journalctl -u insightmind -f`.

</details>

<details>
<summary><strong>4 · HTTPS, nginx y cómo se protege el login</strong></summary>

| Pieza | Quién la sirve | Dónde escucha |
|---|---|---|
| Panel (`index.html`, `css/`, `js/`) y landing | nginx, desde `/var/www/insightmind` | `:443` (HTTPS) · `:80` redirige |
| API FastAPI | uvicorn | `127.0.0.1:8000` (solo vía nginx en `/api/`) |
| MongoDB | `mongod` | `127.0.0.1:27017` |

**Dominio y certificado.** El dominio `insightmind.duckdns.org` es gratuito (DuckDNS) y apunta a la IP pública reservada en OCI. El certificado es de Let's Encrypt, emitido con `sudo certbot --nginx -d insightmind.duckdns.org`, que configura el 443 y la redirección desde el 80. Se renueva solo con el temporizador de certbot (`sudo certbot renew --dry-run` para probarlo). El puerto 80 debe seguir abierto para que la renovación funcione.

Abre en `firewalld` y en la Security List de OCI los puertos 80 y 443. Nunca 8000 ni 27017.

- Todo el tráfico va cifrado: el puerto 80 responde `301` a HTTPS y nginx envía `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: same-origin`.
- `/` sirve el front estático: sin sesión solo se ve el login; los datos viven detrás.
- `/api/` quita el prefijo y hace proxy a `127.0.0.1:8000`; admite `GET`, `POST` y `PUT`.
- `/api/auth/login` tiene límite de 10 peticiones por minuto por IP, además del bloqueo de la API.
- Responde `404` en `/api/docs`, `/api/redoc`, `/api/openapi.json`, `/api/sincronizar`, `/api/download*` y `/api/files*`.

**Login:** contraseñas con hash PBKDF2-SHA256, sesión en cookie firmada con HMAC (`HttpOnly`, `SameSite=Strict`, 12 h) y bloqueo de 60 s tras 5 intentos fallidos por IP y usuario. Sin dependencias nuevas.

</details>

<details>
<summary><strong>5 · Comprobaciones</strong></summary>

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://insightmind.duckdns.org/                # 301: redirige a HTTPS
curl -s -o /dev/null -w '%{http_code}\n' https://insightmind.duckdns.org/               # 200: front
curl -s -o /dev/null -w '%{http_code}\n' https://insightmind.duckdns.org/api/config/voz # 401: sin sesión
curl -s -o /dev/null -w '%{http_code}\n' https://insightmind.duckdns.org/api/docs       # 404: bloqueado
sudo ss -tlnp | grep -E ':(8000|27017)\b'                                                # solo en 127.0.0.1
```

</details>

<details>
<summary><strong>6 · Límites conocidos</strong></summary>

- Hay un solo nivel de acceso: cualquier usuario con login puede usar todas las rutas permitidas, incluidas las que consumen créditos de Cohere.
- Las sesiones no tienen estado en el servidor: para cerrarlas todas hay que cambiar `AUTH_SECRET` o borrar al usuario.
- El límite de intentos de la API vive en memoria y se reinicia con el servicio.

</details>

---

<!-- ═══════════════════════════ 13 · ESTRUCTURA DEL REPO ═══════════════════════════ -->

## Estructura del repositorio

<details>
<summary><strong>Ver árbol</strong></summary>

```text
.
├── main.py                        # FastAPI: archivos, ingesta de Slack, /procesar, tickets, curaduría, semanas, conexiones
├── requirements.txt
├── .env.example
├── input_examples/                # 60 mensajes de ejemplo + TICKETS/ con 5 casos de ticket
├── pruebas/                       # pruebas sin OCI ni red: clasificación, privacidad, landing, conexiones, dashboard
├── docs/legal/                    # acuerdo de tratamiento de datos, proveedores, procedimientos y pendientes
├── deploy/
│   ├── desplegar.sh               # front + nginx + SELinux (+ systemd con --systemd)
│   ├── sincronizar_mongo.sh       # replica el bucket a MongoDB
│   ├── nginx/insightmind.conf     # HTTPS :443 + redirección de :80, proxy /api/
│   └── systemd/insightmind.service
├── backend/
│   ├── auth.py                    # login, sesión por cookie, middleware, CLI de usuarios
│   ├── analizador_sentimiento.py  # Cohere + calcular_ruta() + umbrales
│   ├── cache_analisis.py          # caché del análisis (etag + modelo)
│   ├── generador_contenido.py     # instrucciones por formato + reglas de estilo
│   ├── config_voz.py              # guía de voz: texto, chips y reglas
│   ├── contexto.py                # slug por mensaje y por lote
│   ├── curaduria.py               # lee y escribe activos/<slug>/curaduria.json
│   ├── gestor_semanas.py          # periodos disponibles y su detalle
│   ├── gestor_conexiones.py       # estado de las plataformas conectadas
│   ├── gestor_publicaciones.py    # publicación en LinkedIn y modo asistido para X
│   ├── cohere_uso.py              # contador aproximado de llamadas a Cohere
│   ├── db.py                      # MongoDB (opcional, tolerante a fallos)
│   ├── sync_mongo.py              # sincronización bucket → MongoDB
│   ├── oci_storage.py             # cliente único de Object Storage y prefijos
│   ├── rutas_contenido.py         # /generar, /config/voz, /sincronizar
│   ├── rutas_dashboard.py         # /dashboard (Panorama)
│   ├── privacidad.py              # enmascara correos y teléfonos antes de enviar texto a la IA
│   ├── ingesta_texto.py           # /ingesta/texto: conversación pegada → archivos de entrada
│   └── rutas_publico.py           # /publico/faqs y /publico/newsletter
└── frontend/
    ├── insightmind-v2/            # el panel: Panorama, ingesta, curaduría, tickets, ajustes
    │   ├── index.html
    │   ├── css/styles.css
    │   └── js/                    # api.js (único que habla con el backend), auth.js, app.js, dashboard.js
    └── landingpage/               # landing pública: producto, planes, FAQs y newsletter
        ├── legal/                 # privacidad, aviso para comunidades, términos y cookies
        └── fuentes/               # tipografías propias (SIL OFL): ningún tercero recibe la visita
```

</details>

---

<!-- ═══════════════════════════════ 14 · PRÓXIMOS PASOS ═══════════════════════════════ -->

## Próximos pasos

- **Slack sin repeticiones ni sorpresas.** No volver a importar un mensaje ya importado (usando su `ts` de Slack como identificador) y mostrar una vista previa con cuántos mensajes se encontraron, se eligieron y se descartaron antes de confirmar.
- **Temas y palabras clave en el análisis.** Dos campos más en la misma llamada a Cohere activan los bloques del Panorama que hoy usan datos de ejemplo.
- **Roles de usuario.** Separar quien cura de quien administra.
- **Cookie de sesión segura en producción.** Con HTTPS ya activo, falta poner `AUTH_COOKIE_SECURE=true` en el servidor para que la cookie solo viaje cifrada. Es el primer bloqueante de [`docs/legal/README.md`](docs/legal/README.md).
- **Privacidad operable.** Guardar quién confirmó cada autorización y cuándo, enviar los casos de éxito a la IA con un marcador `{nombre}` en lugar del nombre real, y borrar automáticamente según los plazos de conservación.
- **Umbrales editables y persistidos** en el backend, no solo en el front.
- **Instance principals de OCI** en lugar de `~/.oci/config`, y un usuario de sistema dedicado.
- **Pruebas del flujo completo** `/procesar` → `/generar` con OCI y Cohere simulados.

---

<!-- ═══════════════════════════════ 15 · EQUIPO ═══════════════════════════════ -->

## Equipo

<p align="center">
  Equipo 51 · G10 Latam · Hackathon <strong>Oracle Next Education (ONE)</strong> × <strong>No Country</strong><br>
  <sub>Siete personas de cinco países: producto, diseño, backend, datos, IA y cloud.</sub>
</p>

<table>
  <tr>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/jorge-gonzalez.webp" width="112" height="112" alt="Jorge González"><br>
      <b>Jorge<br>González</b><br>
      <sub>Backend Developer</sub><br>
      <img src="https://flagcdn.com/20x15/ve.png" width="20" height="15" alt="Venezuela"> <sub>Venezuela</sub><br><br>
      <a href="https://www.linkedin.com/in/jorgeg08/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
      <a href="https://github.com/LowDagger"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a>
    </td>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/greco-briones.webp" width="112" height="112" alt="Greco Briones"><br>
      <b>Greco<br>Briones</b><br>
      <sub>Database Administrator</sub><br>
      <img src="https://flagcdn.com/20x15/cl.png" width="20" height="15" alt="Chile"> <sub>Chile</sub><br><br>
      <a href="https://www.linkedin.com/in/grecobrionesf"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
      <a href="https://github.com/gbriones1234"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a>
    </td>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/ivan-canto.webp" width="112" height="112" alt="Iván Canto"><br>
      <b>Iván<br>Canto</b><br>
      <sub>Backend Developer</sub><br>
      <img src="https://flagcdn.com/20x15/mx.png" width="20" height="15" alt="México"> <sub>México</sub><br><br>
      <a href="https://www.linkedin.com/in/ivan-antonio-canto-osorio-5189192bb/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
      <a href="https://github.com/ivan02-c"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a>
    </td>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/carlos-patino.webp" width="112" height="112" alt="Carlos Patiño"><br>
      <b>Carlos<br>Patiño</b><br>
      <sub>Full Stack Developer</sub><br>
      <img src="https://flagcdn.com/20x15/py.png" width="20" height="15" alt="Paraguay"> <sub>Paraguay</sub><br><br>
      <a href="https://www.linkedin.com/in/carlospatino89"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
      <a href="https://github.com/carlitox-dev"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/zaida-gil.webp" width="112" height="112" alt="Zaida Milena Gil Mendoza"><br>
      <b>Zaida Milena<br>Gil Mendoza</b><br>
      <sub>Full Stack Developer</sub><br>
      <img src="https://flagcdn.com/20x15/co.png" width="20" height="15" alt="Colombia"> <sub>Colombia</sub><br><br>
      <a href="https://www.linkedin.com/in/zaida-milena-68b5231b1/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
      <a href="https://github.com/ZagI123"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a>
    </td>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/santiago-hernandez.webp" width="112" height="112" alt="Santiago Arturo Hernández Jiménez"><br>
      <b>Santiago Arturo<br>Hernández Jiménez</b><br>
      <sub>Team Lead · Automation Specialist ·<br>Senior Product Designer</sub><br>
      <img src="https://flagcdn.com/20x15/mx.png" width="20" height="15" alt="México"> <sub>México</sub><br><br>
      <a href="https://www.linkedin.com/in/santhdz-uxui/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
      <a href="https://github.com/SantHdz"><img src="https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white" alt="GitHub"></a>
    </td>
    <td align="center" valign="top" width="25%">
      <img src="docs/assets/readme/equipo/jesus-guillen.webp" width="112" height="112" alt="Jesús Guillén"><br>
      <b>Jesús<br>Guillén</b><br>
      <sub>Data Analyst</sub><br>
      <img src="https://flagcdn.com/20x15/ve.png" width="20" height="15" alt="Venezuela"> <sub>Venezuela</sub><br><br>
      <sub>&nbsp;</sub>
    </td>
    <td width="25%"></td>
  </tr>
</table>

### Enlaces del proyecto

| | |
|---|---|
| Landing | [insightmind.duckdns.org/landing](https://insightmind.duckdns.org/landing/) |
| Repositorio | [No-Country-simulation/G10-Latam-Equipo51-Power-CommunityLab](https://github.com/No-Country-simulation/G10-Latam-Equipo51-Power-CommunityLab) |

---


## Licencia

Proyecto académico desarrollado con fines educativos para el **Hackathon Oracle Next Education (ONE) G10**, organizado por **Oracle**, **Alura Latam** y **No Country**.

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/p11-cierre-oscuro.webp">
  <img src="docs/assets/readme/p11-cierre-claro.webp" width="100%" alt="Gracias por leer. La hoja periwinkle ya publicada, rodeada de burbujas en calma. Hecho por el Equipo 51.">
</picture>
