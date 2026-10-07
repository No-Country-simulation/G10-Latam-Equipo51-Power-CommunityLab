# Qué se agregó y por qué · rama `front/panel-v2`

> Registro para el equipo. Todo lo de aquí **suma**: no se borró ni se modificó
> ninguna línea del flujo que ya funcionaba.

## Resumen en una línea

Se agrega el **Panorama**, un dashboard de la comunidad, y el endpoint
`GET /dashboard` que lo alimentará desde MongoDB.

## Lo que NO se tocó

Importa decirlo primero, porque en días pasados hubo confusión con una rama que
sí arrastraba código viejo. Esta no:

- El flujo de ingesta, análisis y curaduría.
- La reconciliación por huellas y `/generar`.
- El aviso de tickets a Discord (`avisar()` quedó intacta).
- `modoDemo`, que sigue en `false`.
- El `mount` de `main.py`, que sigue apuntando a `frontend/insightmind-v2`.

El diff del front contra `main` es de **978 líneas añadidas y 0 borradas**.

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `frontend/insightmind-v2/js/dashboard.js` | Agregaciones y dibujo del Panorama |
| `frontend/insightmind-v2/js/datos-dashboard.js` | Serie simulada de 180 días, para verlo sin backend |
| `frontend/insightmind-v2/PANORAMA.md` | Modelo de datos, pipelines y contrato del endpoint |
| `backend/rutas_dashboard.py` | El endpoint `GET /dashboard` |
| `pruebas/prueba_dashboard.py` | Prueba de los pipelines contra un Mongo en memoria |

## Archivos modificados, todo aditivo

| Archivo | Cambio |
|---|---|
| `frontend/insightmind-v2/index.html` | +103: dos iconos, la entrada "Panorama" en el menú, la sección y dos `<script>` |
| `frontend/insightmind-v2/css/styles.css` | +142: los estilos del Panorama y tres tokens de gráfico en los cuatro bloques de tema |
| `frontend/insightmind-v2/js/app.js` | **+5**: una entrada en `META` y la llamada a `visualizarDashboard()` |
| `frontend/insightmind-v2/js/api.js` | +12: el método `API.dashboard(slug, canal)` |
| `main.py` | +2: importa e incluye `router_dashboard` |

## Decisiones que conviene conocer

**El Panorama no es la pantalla de inicio.** Se entra por "Procesar lote" como
siempre. Cambiarlo es una línea al final de `app.js`, pero no se hizo sin
consultarlo.

**Las cifras que se ven son simuladas, y la pantalla lo dice.** El panel corre con
`modoDemo: false`, así que sin el aviso alguien podría creer que son reales.

**El botón "Avisar" de miembros en riesgo no duplica lógica.** Marca los tickets
pendientes de esa persona y delega en `avisar("discord")`, la función que ya
existía. Si cambia allá, cambia aquí.

**Los gráficos no usan librerías.** Son cajas del navegador y `<polyline>` en SVG,
con el color tomado de los mismos tokens que el resto del panel. Por eso los temas
claro y oscuro se resuelven solos y no hay un segundo sistema de color que mantener.

**La serie simulada tiene semilla fija.** Las cifras no cambian entre una carga y
otra: nadie quiere que los números bailen delante del jurado.

**Un módulo por endpoint.** `backend/rutas_dashboard.py` tiene su propio
`APIRouter` y un solo endpoint, igual que `rutas_contenido.py`. Si mañana hace
falta `/dashboard/claves`, va en su propio módulo.

## Correcciones de cosas que yo mismo había dicho mal

Las anoto porque alguna llegó al equipo como tarea pendiente y no lo es:

1. **El canal en los activos ya existía.** Dije que había que agregar
   `canal_origen` a `contenido_generado`. Falso: `rutas_contenido._fuente_detalle()`
   ya guarda `fuente_detalle.interaccion.canal`. El endpoint filtra por ahí y no
   hace falta ningún campo nuevo.
2. **La nota al pie del Panorama nombraba colecciones inexistentes**
   (`interacciones`, `activos`). Las reales son `analisis` y `contenido_generado`.
3. **`cobertura` se calculaba sobre toda la colección**, así que una semana sin
   temas reportaba que sí los tenía. Ahora se consulta por periodo.
4. **`api.js` declaraba tres métodos para endpoints que no existen**
   (`claves`, `vigilarClave`, `dejarClave`). Se quitaron: las palabras vigiladas
   vienen dentro de la respuesta de `/dashboard`.

## Qué falta para que el dashboard muestre datos reales

| Paso | Estado | Quién |
|---|---|---|
| `GET /dashboard` con las ocho agregaciones | **Hecho y probado** | — |
| Que el front consuma el endpoint | Pendiente, ~2 h | Front |
| `temas` y `claves` en el análisis | Pendiente, ~1 h | Backend |
| Versionar la llave de la caché al cambiar el prompt | Pendiente, 1 línea | Backend |
| Fecha por mensaje (para pulso diario en vez de semanal) | Opcional | Definición de entrada |

Con los dos primeros pasos, **cinco de los ocho bloques** muestran datos reales sin
tocar una sola colección. Detalle completo en `PANORAMA.md`.

### La trampa de la caché

`cache_analisis.py` guarda cada análisis con la llave `etag` + `modelo`. Si se
agregan `temas` y `claves` al prompt **sin** cambiar esa llave, los mensajes ya
analizados se seguirán sirviendo de caché sin los campos nuevos, y parecerá un bug
del dashboard. La solución es versionar:

```python
COHERE_MODEL = "command-r-08-2024"
VERSION_ANALISIS = "v2"                       # súbela cuando cambie el prompt
MODELO_CACHE = f"{COHERE_MODEL}+{VERSION_ANALISIS}"
```

Y usar `MODELO_CACHE` en `cache_analisis.cargar()` y `.guardar()`.
