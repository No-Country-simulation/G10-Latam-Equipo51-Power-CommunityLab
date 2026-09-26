# Frontend · Insight Mind

## Qué hay aquí

| Ruta | Qué es | Estado |
|---|---|---|
| **`insightmind-v2/`** | **Insight Mind 2.0. Es la versión de trabajo.** HTML, CSS y JS separados, sin framework ni build | ✅ Actual |
| `InsightMind2.0-html-css-js.html` | Insight Mind 2.0 en un solo archivo, para compartir por link o servir directo | ✅ Actual |
| `InsightMind-gradioV1.html` | Insight Mind V1, con el diseño anterior | 📦 Referencia |
| `communitylab_mockup.html` | Mockup inicial | 📦 Referencia |
| `../static/index.html` | Lo que hoy se sirve en `/ui`. Es la V1 con la conexión a `/upload` | ⚠️ Desactualizado |

## Qué cambia de la V1 a la V2

- **Se dejó atrás Gradio.** La V2 es HTML, CSS y JavaScript puros: sin framework, sin `npm install`,
  sin paso de build. Se abre con cualquier servidor estático.
- **Archivos separados** en lugar de un HTML gigante: `index.html` + `css/styles.css` +
  `js/{api,datos-ejemplo,app}.js`. Varias personas pueden trabajar sin pisarse.
- **Toda la comunicación con el backend vive en `js/api.js`.** Ningún otro archivo usa `fetch`.
- **Rediseño visual completo:** paleta ceniza con acento periwinkle `#8A91CB`, tema claro y oscuro
  en un solo bloque de tokens con `light-dark()`, tipografía Schibsted Grotesk.
- **Responsive real:** menú lateral deslizante en móvil, probado de 390px a 1440px.
- **Accesibilidad:** contraste AA verificado en ambos temas, foco visible, iconos SVG dibujados
  en lugar de emoji.
- **Se quitó la jerga técnica de la interfaz** (`gr.File`, `gr.Slider`, rutas `.json` sueltas).

## Cómo correrlo

No se abre con doble clic: el navegador bloquea las peticiones con `file://`.

```bash
python3 -m http.server 5500 --directory frontend/insightmind-v2
```

Y abrir `http://localhost:5500`.

## Estado de la conexión con el backend

**Hoy Insight Mind 2.0 está en modo mockup**: `modoDemo: true` en `js/api.js`. Funciona completa con datos
simulados, sin necesidad de servidor. El código de conexión ya está escrito y comentado.

Lo que revisamos de la V1 desplegada:

| Llamada | Estado real |
|---|---|
| `POST /upload` → sube el archivo al bucket | ✅ **Funciona.** Ya está en `main.py` |
| `GET /files`, `GET /download/{f}`, `DELETE /files/{f}` | ✅ Existen en `main.py` |
| Webhook de n8n para procesar | ❌ La URL es un placeholder: `https://<tu-n8n>/webhook/procesar-lote` |
| `POST /procesar` con el contrato del brief | ❌ No existe todavía |
| `/semanas`, `/curaduria`, `/publicar`, `/tickets/avisar` | ❌ No existen todavía |

Para encenderlo cuando el backend esté listo:

1. Poner la URL real en `N8N_WEBHOOK_URL` (arriba de `js/api.js`).
2. Cambiar `modoDemo: true` por `false`.

## Para servirlo desde `main.py`

Hoy la línea final de `main.py` sirve `static/` en `/ui`. Para servir Insight Mind 2.0:

```python
app.mount("/ui", StaticFiles(directory="frontend/insightmind-v2", html=True), name="ui")
```

Al quedar en el mismo origen que la API, deja de hacer falta el CORS abierto a `*`.

## Convenciones del código

- Ningún archivo fuera de `api.js` usa `fetch`.
- IDs con guion bajo, nunca con guion: los de guion no funcionan como variables globales en JS.
- Nada de `style="..."` para layout; todo a clases, o se rompe el responsive.
- Colores solo desde tokens (`var(--ink)`, `var(--primary)`), nunca hexadecimales sueltos.
