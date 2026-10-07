# Panorama · el dashboard sobre MongoDB

> Para el frente de Data Analysis.
> **El endpoint ya está escrito y probado:** `GET /dashboard`, en
> `backend/rutas_dashboard.py`. Lo que todavía se ve en pantalla son cifras
> simuladas, porque falta que el front consuma el endpoint (último apartado).

## Qué agrega esta rama

Una sección nueva, **Panorama**, dentro del panel que ya existe. No cambia el flujo de
ingesta, análisis ni curaduría: solo agrega una entrada en el menú y una pantalla.

| Pregunta que responde | Bloque |
|---|---|
| ¿Cómo viene el ánimo y hacia dónde va? | Pulso de la comunidad |
| ¿Qué tema creció esta semana? | Temas en ascenso |
| ¿Dónde duele? | Termómetro por tema |
| ¿Sirve de algo la IA? | Embudo de producción |
| ¿A quién hay que llamar hoy? | Voces y miembros en riesgo |

Archivos nuevos: `js/dashboard.js` (agregaciones y dibujo) y `js/datos-dashboard.js`
(la serie simulada de 180 días). Los cambios en `index.html`, `css/styles.css`,
`js/app.js` y `js/api.js` son aditivos.

## Qué de esto corre hoy con nuestro MongoDB

**Algo más de la mitad.**

| Bloque | ¿Hoy? | Qué falta |
|---|---|---|
| Métricas clave | **Sí**, comparando semana contra semana | — |
| Pulso | **Parcial** | No hay fecha por mensaje: queda por semana, no por día |
| Temas en ascenso | **No** | El análisis no extrae temas |
| Termómetro por tema | **No** | Lo mismo |
| Palabras bajo vigilancia | **No** | El análisis no extrae palabras clave |
| Embudo de producción | **Parcial** | Faltan `ediciones` y los tiempos de curaduría |
| Desempeño por destino | **Parcial** | Falta la mediana de horas |
| Voces y miembros en riesgo | **Sí** | — |
| Filtro por canal | **Sí** | Usa `analisis.canal` y `fuente_detalle.interaccion.canal` |

### Por qué fallan los que fallan

Tres bloques mueren por **una sola causa**: `analizar_interaccion()` devuelve `tipo`,
`sentimiento`, `score` y `por_que`, pero **no temas ni palabras clave**. Sin eso no hay
nada que agrupar.

El Pulso muere por otra causa distinta: **no existe una fecha por mensaje**. La entrada
trae `periodo_referencia: "Semana_01"` y nada más. El campo `actualizado` de Mongo es la
hora en que se replicó, no cuándo ocurrió el mensaje: todos los de un lote comparten el
mismo valor, así que usarlo como fecha dibujaría una sola barra por procesamiento.

---

## Los cambios que lo activan

### 1. Pedirle temas y palabras clave a Cohere · desbloquea 3 bloques

Dos campos más en el JSON que **ya se pide**. No cuesta una llamada extra ni un peso más.

En `backend/analizador_sentimiento.py`, dentro de `PROMPT_CON_TIPO` y `PROMPT_SIN_TIPO`:

```python
{{
  "sentimiento": "positivo|neutral|negativo",
  "score": <entero 0-100>,
  "temas": ["máximo 2, en Title Case, del estilo 'Acceso a laboratorios'"],
  "claves": ["3 a 5 términos literales del mensaje, en minúscula"],
  "por_que": "una frase breve"
}}
```

En `_parsear_respuesta()`:

```python
"temas":  [t for t in (ia.get("temas")  or []) if isinstance(t, str)][:2],
"claves": [c.lower() for c in (ia.get("claves") or []) if isinstance(c, str)][:5],
```

Y agregarlos al dict que devuelve `analizar_interaccion()`. Como `guardar_analisis()`
hace `{**mensaje}`, llegan solos a la colección `analisis`.

> **Normaliza los temas contra una lista corta y estable.** Si el modelo escribe hoy
> "Acceso a laboratorios" y mañana "Acceso a los labs", la tendencia se parte en dos
> series y deja de medir nada. Es el error más fácil de cometer aquí.

### 2. Una fecha por mensaje · desbloquea el eje de tiempo real

Lo ideal es que la entrada la traiga:

```json
"interaccion": { "autor": "...", "canal": "...", "fecha": "2026-10-03T14:02:00Z", ... }
```

Si no se puede tocar el formato, el Pulso se queda **por semana** usando `slug`. Se ve
bien y es honesto; pierde el detalle diario y el selector de 7 / 30 / 90 días pasa a ser
un selector de semanas.

### 3. Dos campos en el activo · desbloquea 3 métricas del embudo

Al aprobar o publicar, guardar también `fecha_publicado` y `ediciones` (un contador, no
el booleano `editado` que ya existe). Sin eso el embudo igual funciona: solo pierde
"tiempo mediano de curaduría", "ediciones por pieza" y la mediana por destino.

### 4. El canal en el activo · ya está resuelto

En una revisión anterior dije que `contenido_generado` no guardaba el canal. **Me
equivoqué:** `rutas_contenido._fuente_detalle()` ya guarda
`fuente_detalle.interaccion.canal` en cada pieza. El endpoint filtra por ahí y no
hace falta ningún campo nuevo.

### 5. Índices

```js
db.analisis.createIndex({ slug: 1, canal: 1 })
db.analisis.createIndex({ autor: 1, slug: 1 })
db.analisis.createIndex({ temas: 1, slug: 1 })        // cuando existan
db.contenido_generado.createIndex({ slug: 1, estado: 1 })
```

---

## Pipelines contra nuestras colecciones reales

`slug` es el periodo, por ejemplo `"2026-semana-05"`.

### Métricas clave · semana contra semana

```js
db.analisis.aggregate([
  { $match: { slug: { $in: [slugActual, slugPrevio] } } },
  { $group: {
      _id: "$slug",
      total:         { $sum: 1 },
      positivas:     { $sum: { $cond: [{ $eq: ["$sentimiento", "positivo"] }, 1, 0] } },
      negativas:     { $sum: { $cond: [{ $eq: ["$sentimiento", "negativo"] }, 1, 0] } },
      aprovechables: { $sum: { $cond: [{ $ne: ["$ruta", "descartado"] }, 1, 0] } }
  }},
  { $addFields: {
      indice_sentimiento: { $round: [{ $multiply: [
        { $divide: [{ $subtract: ["$positivas", "$negativas"] }, "$total"] }, 100] }, 0] }
  }}
])
```

### Pulso · una columna por semana

```js
db.analisis.aggregate([
  { $group: {
      _id: "$slug",
      total:     { $sum: 1 },
      positivas: { $sum: { $cond: [{ $eq: ["$sentimiento", "positivo"] }, 1, 0] } },
      negativas: { $sum: { $cond: [{ $eq: ["$sentimiento", "negativo"] }, 1, 0] } }
  }},
  { $addFields: { neutrales: { $subtract: ["$total", { $add: ["$positivas", "$negativas"] }] } } },
  { $sort: { _id: 1 } }
])
```

### Embudo de producción

```js
db.analisis.aggregate([
  { $match: { slug } },
  { $facet: {
      analizadas:    [{ $count: "n" }],
      aprovechables: [{ $match: { ruta: { $ne: "descartado" } } }, { $count: "n" }],
      tickets:       [{ $match: { ruta: "ticket" } }, { $count: "n" }]
  }}
])

db.contenido_generado.aggregate([
  { $match: { slug } },
  { $facet: {
      generadas:  [{ $count: "n" }],
      aprobadas:  [{ $match: { estado: { $in: ["Listo", "Publicado"] } } }, { $count: "n" }],
      publicadas: [{ $match: { estado: "Publicado" } }, { $count: "n" }],
      sin_editar: [{ $match: { estado: { $in: ["Listo", "Publicado"] }, editado: { $ne: true } } },
                   { $count: "n" }]
  }}
])
```

### Desempeño por destino

```js
db.contenido_generado.aggregate([
  { $match: { slug } },
  { $group: {
      _id: "$formato",
      generadas:  { $sum: 1 },
      publicadas: { $sum: { $cond: [{ $eq: ["$estado", "Publicado"] }, 1, 0] } },
      editadas:   { $sum: { $cond: ["$editado", 1, 0] } }
  }},
  { $sort: { publicadas: -1 } }
])
```

### Voces y miembros en riesgo

```js
db.analisis.aggregate([
  { $match: { slug, ruta: "exito" } },
  { $group: { _id: "$autor", n: { $sum: 1 }, canales: { $addToSet: "$canal" } } },
  { $sort: { n: -1 } }, { $limit: 5 }
])

db.analisis.aggregate([
  { $match: { slug, sentimiento: "negativo" } },
  { $group: { _id: "$autor", n: { $sum: 1 }, canales: { $addToSet: "$canal" } } },
  { $match: { n: { $gte: 2 } } },
  { $sort: { n: -1 } }, { $limit: 5 }
])
```

> El umbral baja de 4 a 2 respecto a la maqueta: una semana tiene muchos menos mensajes
> que una ventana de 30 días.

### Temas en ascenso · cuando exista el campo

```js
db.analisis.aggregate([
  { $match: { slug: { $in: [slugActual, slugPrevio] } } },
  { $unwind: "$temas" },
  { $group: {
      _id: { tema: "$temas", periodo: "$slug" },
      n: { $sum: 1 }, sentimiento: { $avg: "$sent" }
  }},
  { $group: {
      _id: "$_id.tema",
      actual: { $sum: { $cond: [{ $eq: ["$_id.periodo", slugActual] }, "$n", 0] } },
      previo: { $sum: { $cond: [{ $eq: ["$_id.periodo", slugPrevio] }, "$n", 0] } },
      sentimiento: { $max: { $cond: [{ $eq: ["$_id.periodo", slugActual] }, "$sentimiento", null] } }
  }},
  { $match: { actual: { $gt: 0 } } },
  { $addFields: { variacion: { $cond: [{ $eq: ["$previo", 0] }, null,
      { $round: [{ $multiply: [{ $subtract: [
        { $divide: ["$actual", "$previo"] }, 1] }, 100] }, 0] }] } } },
  { $sort: { variacion: -1 } }, { $limit: 7 }
])
```

`variacion: null` significa tema nuevo, y el panel lo marca con una etiqueta en vez de
imprimir un porcentaje. **No lo quites:** dividir entre cero nos dio "+9.745 %" en la
primera versión.

---

## Un aviso sobre el sentimiento

Hoy tiene **tres valores**: `positivo` = 0.8, `neutral` = 0, `negativo` = -0.6.

Todo lo que cuenta mensajes (índice de sentimiento, pulso, voces, riesgo) funciona igual.
Lo que promedia —el termómetro por tema— queda mucho más grueso: con tres valores los
temas se agrupan en tres alturas y el gráfico pierde matiz. Es utilizable, pero si se le
pide a Cohere un número de -1 a 1 en lugar de una etiqueta, mejora bastante y no cuesta
nada más.

---

---

## El endpoint: `GET /dashboard`

Ya está escrito en **`backend/rutas_dashboard.py`** y conectado en `main.py`. Sigue la
convención del repo: un módulo por endpoint, con su propio `APIRouter`, igual que
`rutas_contenido.py`.

### Parámetros

| Parámetro | Obligatorio | Qué hace |
|---|---|---|
| `slug` | No | Periodo a mirar (`2026-semana-05`). Por defecto, el más reciente |
| `canal` | No | Canal exacto (`#soporte-labs`) o `todos` |

### Qué devuelve

```json
{
  "periodo":   { "actual": "2026-semana-05", "previo": "2026-semana-04",
                 "disponibles": ["2026-semana-04", "2026-semana-05"] },
  "canal": "todos",
  "canales": ["#dudas-langgraph", "#general", "#logros-y-empleos", "#soporte-labs"],
  "cobertura": { "metricas": true, "pulso": true, "embudo": true, "plataformas": true,
                 "voces": true, "riesgo": true,
                 "temas": false, "termometro": false, "claves": false,
                 "granularidad": "semana" },
  "metricas":    { "actual": {...}, "previo": {...}, "supuesto_min_por_pieza": 22 },
  "pulso":       [ { "periodo": "...", "total": 6, "positivas": 1, "neutrales": 2, "negativas": 3 } ],
  "temas":       [ { "tema": "...", "n": 3, "variacion": null, "nuevo": true, "sentimiento": -0.6 } ],
  "termometro":  [ { "tema": "...", "n": 3, "sentimiento": -0.6 } ],
  "claves":      [ { "termino": "tenancy", "menciones": 2, "previo": 0, "sentimiento": -0.6 } ],
  "embudo":      { "analizadas": 6, "aprovechables": 5, "tickets": 3, "generadas": 3,
                   "aprobadas": 2, "publicadas": 2, "pct_sin_editar": 50 },
  "plataformas": [ { "formato": "Post de LinkedIn", "generadas": 2, "publicadas": 2,
                     "tasa": 100, "pct_edit": 50 } ],
  "voces":       [ { "autor": "Ana Ribeiro", "n": 1, "canales": ["#logros-y-empleos"] } ],
  "riesgo":      [ { "autor": "Diego Fuentes", "n": 2, "canales": ["#soporte-labs"] } ]
}
```

### `cobertura` es la clave para no confundir a nadie

Dice **por periodo** qué bloques tienen datos. Si `temas` viene en `false` no es un
error: es que el análisis todavía no guardaba ese campo **en esa semana**. Se consulta
por periodo y no en toda la colección a propósito: el día que se active la extracción
de temas, las semanas viejas seguirán sin tenerlos, y el front debe poder decir
"falta activar" en vez de dejar un panel vacío sin explicación.

`granularidad: "semana"` avisa que el pulso es semanal. Cuando exista una fecha por
mensaje, pasará a `"dia"` y el front no necesita cambiar.

### Respuestas de error

| Código | Cuándo |
|---|---|
| `503` | `MONGO_URI` sin configurar, o Mongo inalcanzable |
| `404` | No hay análisis en MongoDB todavía (corre `POST /sincronizar`) |
| `404` | El `slug` pedido no existe; el mensaje lista los disponibles |

Nunca propaga un error del driver al navegador.

### Probarlo sin MongoDB

```bash
pip install mongomock
python pruebas/prueba_dashboard.py
```

Levanta un Mongo en memoria con documentos de la forma exacta que escribe `db.py` y
corre las ocho agregaciones. **Así se validaron los pipelines de este documento.**

---

## Lo único que falta: que el front lo consuma

`js/dashboard.js` todavía calcula las agregaciones en el navegador sobre la serie
simulada. **Cada función lleva anotado arriba el nombre del pipeline que la
sustituye.** Para conectar:

1. En `visualizarDashboard()`, pedir `await API.dashboard(slug, canal)`.
2. Si responde, dibujar eso; si falla, quedarse con la serie simulada.
3. Ocultar el aviso `#panorama_simulado` cuando los datos sean reales.
4. Usar `cobertura` para marcar los bloques que todavía no tienen datos.

**El panel nunca habla con MongoDB directamente.** Pide agregaciones ya resueltas:
mandar miles de documentos al navegador para sumarlos ahí no escala y rompe el trato
que tenemos con `api.js`, donde vive toda la comunicación con el backend.
