# Panel de curaduría V2 · HTML + CSS + JavaScript

Front del panel de Insight Mind. Sin frameworks, sin build, sin `npm install`.

## Estructura

```
panel/
├── index.html          # estructura de todas las secciones
├── css/
│   └── styles.css      # variables de tema, componentes, responsive
└── js/
    ├── api.js          # ÚNICO archivo que habla con el backend
    ├── datos-ejemplo.js# lote simulado + semanas anteriores (modo demo)
    └── app.js          # navegación, render y acciones
```

## Cómo correrlo

No se abre con doble clic (el navegador bloquea las peticiones con `file://`). Levanta un servidor:

```bash
python3 -m http.server 5500 --directory frontend/panel-v2
```

Y abre `http://localhost:5500`.

## Modo demo

`js/api.js` arranca con `modoDemo: true`: el panel funciona completo con los datos de
`datos-ejemplo.js`, sin backend. Así el front avanza sin esperar a la API.

Cuando `POST /procesar` esté listo, cambia la bandera:

```js
const API = {
  base: "http://localhost:8000",
  modoDemo: false,   // ← aquí
```

## Contrato con el backend

| Método y ruta | Para qué |
|---|---|
| `POST /procesar` | Manda el lote, devuelve el paquete completo (formato del brief) |
| `GET /semanas` | Lista de semanas en el bucket de OCI |
| `GET /semanas/{slug}` | Paquete de una semana anterior |
| `PUT /curaduria/{slug}` | Guarda el estado de los activos |
| `POST /publicar` | Publica un activo en su plataforma |
| `POST /tickets/avisar` | Manda tickets al webhook de Discord o Slack |
| `PUT /config/voz` | Guarda la guía de voz y los chips de estilo |
| `GET /conexiones` · `PUT /conexiones/{plataforma}` | Estado de las cuentas vinculadas |

**Regla:** ningún archivo fuera de `api.js` puede usar `fetch`. Si una pantalla necesita datos
nuevos, se agrega el método en `api.js` y desde ahí se consume.

## Servirlo desde FastAPI

En producción, el mismo servidor sirve la API y el panel. En `api/main.py`:

```python
from fastapi.staticfiles import StaticFiles

app.mount("/panel", StaticFiles(directory="panel", html=True), name="panel")
```

El panel queda en `http://localhost:8000/panel`. Al estar en el mismo origen, no hace falta CORS.

Si prefieren tenerlos separados durante el desarrollo, agreguen CORS en la API:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Convenciones

- **Tema claro y oscuro** con variables CSS en `:root`. No escribas colores fijos: usa
  `var(--ink)`, `var(--primary)`, etc., o se rompe uno de los dos temas.
- **Responsive** en tres cortes: 1100px (tablet), 800px (móvil) y 420px. Las tablas llevan
  scroll propio; el cuerpo de la página nunca se desplaza en horizontal.
- **IDs con guion bajo**, nunca con guion. `btn_procesar` sí, `btn-procesar` no: los ids con
  guion no funcionan como variables globales en JavaScript.
- **Textos en español**, incluidos los comentarios del código.
- El estado vive en el objeto `E` de `app.js` y se respalda en `localStorage` para que la demo
  sobreviva a un refresh. En producción, la fuente de verdad es OCI.
