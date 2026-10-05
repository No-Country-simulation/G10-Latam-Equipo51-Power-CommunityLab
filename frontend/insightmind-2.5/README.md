# Insight Mind 2.5 · Panorama

> **Esto es una maqueta de consulta, no una versión para integrar todavía.**
> Funciona sola, con datos simulados. No toca nada de `insightmind-v2`.
> Para: el frente de Data Analysis. Objetivo: decidir qué falta para activarla.

## Qué es

Un dashboard analítico sobre MongoDB. Responde cinco preguntas que hoy nadie del
equipo puede contestar sin abrir Discord a mano:

| Pregunta | Bloque |
|---|---|
| ¿Cómo viene el ánimo y hacia dónde va? | Pulso |
| ¿Qué tema creció? | Temas en ascenso |
| ¿Dónde duele? | Termómetro por tema |
| ¿Sirve de algo la IA? | Embudo de producción |
| ¿A quién hay que llamar hoy? | Voces y miembros en riesgo |

## Cómo verla

```bash
node frontend/insightmind-2.5/servidor.js
```

Y abre <http://localhost:5500>. Arranca en el Panorama. No necesita backend ni
MongoDB: usa una serie simulada de 180 días (`js/datos-dashboard.js`) que imita
documento por documento lo que debería devolver la base.

---

## Lo importante: qué de esto funciona hoy con nuestro MongoDB

Revisado contra `backend/db.py` y `backend/analizador_sentimiento.py` tal como
están en `main` hoy. **Sirve algo más de la mitad.**

| Bloque del Panorama | ¿Se puede hoy? | Qué falta |
|---|---|---|
| Métricas clave (5 tarjetas) | **Sí**, pero comparando semana contra semana, no 30 días contra 30 | — |
| Pulso | **Parcial** | No hay fecha por mensaje: el gráfico queda por semana, no por día |
| Temas en ascenso | **No** | El análisis no extrae temas |
| Termómetro por tema | **No** | Lo mismo |
| Palabras bajo vigilancia | **No** | El análisis no extrae palabras clave |
| Embudo de producción | **Parcial** | Faltan `ediciones` y los tiempos de curaduría |
| Desempeño por destino | **Parcial** | Falta la mediana de horas |
| Voces y miembros en riesgo | **Sí** | — |
| Filtro por canal | **Parcial** | `analisis.canal` existe; `contenido_generado` no guarda el canal |

### Por qué fallan los que fallan

Tres de los ocho bloques mueren por **una sola causa**: `analizar_interaccion()`
devuelve `tipo`, `sentimiento`, `score` y `por_que`, pero **no temas ni palabras
clave**. Sin eso no hay nada que agrupar.

El Pulso muere por otra causa distinta: **no existe una fecha por mensaje**. El
JSON de entrada trae `periodo_referencia: "Semana_01"` y nada más. El campo
`actualizado` de Mongo es la hora en que se replicó, no cuándo ocurrió el
mensaje: todos los de un lote comparten el mismo valor, así que usarlo como
fecha dibujaría una sola barra por procesamiento.

---

## Los cuatro cambios que lo activan

Ninguno es grande. El primero es el que más desbloquea.

### 1. Pedirle temas y palabras clave a Cohere · desbloquea 3 bloques

En `backend/analizador_sentimiento.py`, dos campos más en el JSON que ya se pide.
**No cuesta una llamada extra**: es la misma petición que ya se hace.

```python
# en PROMPT_CON_TIPO y PROMPT_SIN_TIPO
{{
  "sentimiento": "positivo|neutral|negativo",
  "score": <entero 0-100>,
  "temas": ["máximo 2, en Title Case, del estilo 'Acceso a laboratorios'"],
  "claves": ["3 a 5 términos literales del mensaje, en minúscula"],
  "por_que": "una frase breve"
}}
```

```python
# en _parsear_respuesta()
"temas":  [t for t in (ia.get("temas")  or []) if isinstance(t, str)][:2],
"claves": [c.lower() for c in (ia.get("claves") or []) if isinstance(c, str)][:5],
```

Y agregar ambos al dict que devuelve `analizar_interaccion()`. Como se guardan en
`analisis` con `{**mensaje}`, llegan solos a Mongo.

> Conviene normalizar los temas contra una lista corta y estable. Si el modelo
> escribe hoy "Acceso a laboratorios" y mañana "Acceso a los labs", el gráfico de
> tendencia se parte en dos series y deja de medir nada.

### 2. Una fecha por mensaje · desbloquea el eje de tiempo real

Lo ideal es que el JSON de entrada traiga la fecha del mensaje:

```json
"interaccion": { "autor": "...", "canal": "...", "fecha": "2026-10-03T14:02:00Z", ... }
```

Si no se puede tocar el formato de entrada, el Pulso se queda **por semana**
usando `slug`. Se ve bien y es honesto; simplemente pierde el detalle diario y
el selector de 7 / 30 / 90 días pasa a ser un selector de semanas.

### 3. Dos campos en el activo · desbloquea 3 métricas del embudo

Al aprobar o publicar desde el panel, guardar también:

- `fecha_publicado` cuando `estado` pasa a `Publicado`
- `ediciones`: un contador, no el booleano `editado` que ya existe

Con eso salen "tiempo mediano de curaduría" y "ediciones por pieza". Sin eso,
el embudo igual funciona: solo pierde esas dos cifras y la mediana por destino.

### 4. El canal en el activo · desbloquea el filtro por canal completo

`contenido_generado` no guarda de qué canal vino la pieza. En `guardar_generado()`
y `guardar_curaduria()`, copiar el `canal` del mensaje fuente:

```python
"canal_origen": mensaje.get("canal"),
```

Sin esto, filtrar el Panorama por canal deja las métricas de producción en cero.
**Ya nos pasó** al construir la maqueta: fue un bug real, no una hipótesis.

### 5. Índices

```js
db.analisis.createIndex({ slug: 1, canal: 1 })
db.analisis.createIndex({ autor: 1, slug: 1 })
db.analisis.createIndex({ "temas": 1, slug: 1 })      // cuando existan
db.contenido_generado.createIndex({ slug: 1, estado: 1 })
```

---

## Pipelines que ya corren hoy, contra nuestras colecciones

Escritos contra `analisis` y `contenido_generado` tal como están. `slug` es el
periodo, por ejemplo `"2026-semana-05"`.

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
// quién origina más casos de éxito
db.analisis.aggregate([
  { $match: { slug, ruta: "exito" } },
  { $group: { _id: "$autor", n: { $sum: 1 }, canales: { $addToSet: "$canal" } } },
  { $sort: { n: -1 } }, { $limit: 5 }
])

// quién acumula mensajes negativos
db.analisis.aggregate([
  { $match: { slug, sentimiento: "negativo" } },
  { $group: { _id: "$autor", n: { $sum: 1 }, canales: { $addToSet: "$canal" } } },
  { $match: { n: { $gte: 2 } } },
  { $sort: { n: -1 } }, { $limit: 5 }
])
```

> El umbral baja de 4 a 2 respecto a la maqueta: una semana tiene muchos menos
> mensajes que una ventana de 30 días.

### Temas y palabras clave · cuando existan los campos

```js
db.analisis.aggregate([
  { $match: { slug: { $in: [slugActual, slugPrevio] } } },
  { $unwind: "$temas" },
  { $group: {
      _id: { tema: "$temas", periodo: "$slug" },
      n:   { $sum: 1 },
      sentimiento: { $avg: "$sent" }
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

`variacion: null` significa tema nuevo, y el panel lo marca con una etiqueta en
vez de imprimir un porcentaje. **No lo quites:** dividir entre cero nos dio
"+9.745 %" en la primera versión de la maqueta.

---

## Un aviso sobre el sentimiento

Hoy el sentimiento tiene **tres valores**: `positivo` = 0.8, `neutral` = 0,
`negativo` = -0.6. La maqueta asume una escala continua de -1 a 1.

Todo lo que cuenta mensajes (índice de sentimiento, pulso, voces, riesgo)
funciona igual. Lo que promedia (el termómetro por tema) queda mucho más grueso:
con tres valores, los temas se agrupan en tres alturas y el gráfico pierde
matiz. Es utilizable, pero si se le pide a Cohere un número de -1 a 1 en lugar
de una etiqueta, el termómetro mejora mucho y no cuesta nada más.

---

## Cómo conectarlo cuando esté listo

`js/dashboard.js` calcula hoy las agregaciones en el navegador sobre la serie
simulada. Cada función lleva anotado arriba el nombre del pipeline que la
sustituye. Al conectar:

1. Exponer `GET /dashboard?rango=...&canal=...` en FastAPI con los pipelines de arriba.
2. En `js/api.js` ya está declarado el método `API.dashboard(rango, canal)`.
3. Borrar las funciones de agregación de `dashboard.js` y pintar lo que llega.

**El panel nunca habla con MongoDB directamente.** Pide agregaciones ya resueltas:
mandar cuatro mil documentos al navegador para sumarlos ahí no escala y no es el
trato que tenemos con `api.js`.

---

## Qué NO hace esta carpeta

- No reemplaza a `insightmind-v2`. Es una copia aparte para consultar.
- No está conectada al backend: `api.js` arranca con `modoDemo: true`.
- No incluye la reconciliación por huellas ni `/generar` que ya tiene la v2.
  Si se decide integrar el Panorama, se porta **el Panorama a la v2**, no al revés.
