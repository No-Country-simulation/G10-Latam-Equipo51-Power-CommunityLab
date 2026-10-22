# G10-Latam-Equipo51-Power-CommunityLab

# InsightMind · Community Lab

> **Versión 1 del README.** El proyecto funciona de punta a punta, pero hay partes pendientes. Cada sección indica si describe lo que **ya existe** o lo que está **propuesto**.

InsightMind toma los mensajes de una comunidad (Discord, Slack…), los analiza con IA, decide qué hacer con cada uno y prepara el contenido para publicar:

- **Éxitos** → posts de LinkedIn, hilo de X y destaque de newsletter.
- **Preguntas técnicas** → tips / FAQ.
- **Quejas y problemas** → tickets con aviso al equipo por Slack o Discord.
- **Lo irrelevante** → se descarta.

El equipo revisa, edita y publica desde una interfaz web. La voz de marca (tono, reglas de estilo) se configura una vez y se aplica a todo lo que se genera.

---

## Contenido

1. [Estado actual](#1-estado-actual)
2. [Arquitectura](#2-arquitectura)
3. [Flujo de procesamiento y caché](#3-flujo-de-procesamiento-y-caché)
4. [Árbol de decisión (umbrales)](#4-árbol-de-decisión-umbrales)
5. [Datos: bucket de OCI y MongoDB](#5-datos-bucket-de-oci-y-mongodb)
6. [API](#6-api)
7. [Configuración (`.env`)](#7-configuración-env)
8. [Ejecución local](#8-ejecución-local)
9. [Despliegue en Oracle Linux 9 (OCI)](#9-despliegue-en-oracle-linux-9-oci)
10. [Front y backend con nginx, y login](#10-front-y-backend-separados-con-nginx-y-login)
11. [Estructura del repositorio](#11-estructura-del-repositorio)
12. [Pendientes](#12-pendientes)

---

## 1. Estado actual

| Área | Estado |
|---|---|
| Ingesta de mensajes JSON al bucket (`/upload`) | Listo |
| Análisis de sentimiento y score con Cohere, con caché | Listo |
| Árbol de decisión (descartar / ticket / éxito / FAQ / insight) | Listo |
| Generación de contenido con guía de voz (texto + chips) | Listo |
| Curaduría guardada por periodo (`activos/<slug>/curaduria.json`) | Listo |
| Réplica consultable en MongoDB (opcional) | Listo |
| Avisos de tickets  Discord | Listo |
| Despliegue en una sola máquina (nginx sirve el front, FastAPI queda en 127.0.0.1) | Listo |
| Separar front y backend con nginx en localhost (HTTP, sin dominio) | Listo: ver sección 10 |
| Login de usuarios (cookie de sesión, sin dominio ni HTTPS) | Listo: ver sección 10 |
| Landing pública conectada a la curaduría (FAQs y newsletter publicados) | Listo: ver `frontend/landingpage/README.md` |
| Cumplimiento legal básico (avisos, términos, minimización de datos hacia la IA) | Listo para el prototipo; pendientes en `docs/legal/README.md` |
| Publicación real en LinkedIn / X | Pendiente (hoy se prepara el contenido) |

---

## 2. Arquitectura

### 2.1 Despliegue (nginx + FastAPI, todo en localhost, HTTP)

```mermaid
flowchart LR
    U["Usuario<br/>(navegador)"] -->|"HTTP localhost:80"| NGX

    subgraph VM["VM Oracle Linux 9 (OCI)"]
        NGX["nginx<br/>front estático + proxy /api/"]
        API["FastAPI + uvicorn<br/>127.0.0.1:8000<br/>login + sesión por cookie"]
        MDB[("MongoDB<br/>127.0.0.1:27017<br/>opcional")]
        NGX -->|"/api/ → proxy_pass"| API
        API --> MDB
    end

    API -->|"SDK de OCI"| BKT[("Object Storage<br/>fuente de verdad")]
    API -->|"HTTPS"| COH["Cohere API<br/>command-r-08-2024"]
    API -->|"webhooks"| SD["Discord"]
```

Reglas de red:

- nginx escucha solo en `127.0.0.1:80`. Sin dominio y sin certificado: es HTTP.
- uvicorn escucha solo en `127.0.0.1:8000` y MongoDB en `127.0.0.1:27017`. Ninguno se abre en `firewalld` ni en la Security List / NSG de OCI.
- Para entrar desde tu equipo a la VM sin abrir puertos: `ssh -L 8080:127.0.0.1:80 opc@<ip>` y abre <http://localhost:8080/>.
- Toda la API exige sesión (cookie) salvo `/auth/*`. Ver sección 10.

---

## 3. Flujo de procesamiento y caché

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

### Qué evita el reprocesamiento

| Mecanismo | Dónde | Qué evita |
|---|---|---|
| Caché de análisis, clave `etag` + `modelo` | `analisis/<archivo>.json` | Volver a llamar a Cohere por un mensaje ya analizado |
| Huella del activo, `formato + archivo + etag` | `curaduria.json` y front | Volver a generar contenido ya generado |
| Protección de ediciones | `reconciliar()` en `app.js` | Pisar un texto editado, en cola o publicado |
| `forzar=true` en `/procesar` y `/generar` | API | Reprocesar a propósito |
| "Volver a generar" (`texto_previo`) | `/generar` | Regenera **solo ese** activo |

Notas:

- La **newsletter** resume todo el lote: cambia al entrar mensajes nuevos y se regenera.
- Un cambio en la guía de voz **no** regenera el contenido ya generado.
- Un lote puede mezclar periodos (`Semana_01`, `Semana_05`…): cada mensaje, activo y ticket se guarda bajo el slug de **su propio periodo** (`2026-semana-05`).

### Guía de voz

`PUT /config/voz` guarda `{ texto, chips }` en `config/voz.json`. Cada chip (Sin hashtags, Sin emojis, Formal, Cercano…) se traduce a una regla imperativa en el prompt. "Sin hashtags" y "Sin emojis" además se garantizan con un filtro posterior, porque el modelo podría ignorarlos.

---

## 4. Árbol de decisión (umbrales)

Cada mensaje recibe de Cohere un `sentimiento` (positivo / neutral / negativo) y un `score` de 0 a 100 (qué tan relevante o accionable es). Con eso se calcula su ruta (`calcular_ruta()` en `backend/analizador_sentimiento.py`).

```mermaid
flowchart TD
    A["Mensaje analizado<br/>tipo + sentimiento + score"] --> B{"score < 40?"}
    B -->|sí| D["descartado"]
    B -->|no| C{"sentimiento negativo<br/>o tipo queja / problema_acceso?"}
    C -->|sí| T["ticket<br/>aviso a Slack / Discord"]
    C -->|no| E{"tipo testimonio o logro,<br/>sentimiento positivo<br/>y score ≥ 70?"}
    E -->|sí| X["éxito<br/>LinkedIn + hilo X + newsletter"]
    E -->|no| F{"tipo pregunta_tecnica?"}
    F -->|sí| Q["faq<br/>Tip / FAQ"]
    F -->|no| I["insight"]
```

| Parámetro | Valor | Dónde |
|---|---|---|
| `UMBRAL_DESCARTE` | **40** | `backend/analizador_sentimiento.py` |
| `UMBRAL_EXITO` | **70** | `backend/analizador_sentimiento.py` |
| Sentimiento → número | positivo = 0.8, neutral = 0, negativo = -0.6 | `_sent_num()` |
| Ticket por sentimiento | número ≤ -0.4 (es decir, "negativo") | `calcular_ruta()` |
| Éxito por sentimiento | número ≥ 0.6 (es decir, "positivo") | `calcular_ruta()` |
| Severidad del ticket | **Alta** si número ≤ -0.6, si no **Media** | `db.guardar_ticket()` |

Tipos válidos: `testimonio`, `logro`, `pregunta_tecnica`, `queja`, `problema_acceso`, `feedback`, `conversacion`. Si el JSON de entrada ya trae `tipo`, se respeta y Cohere solo evalúa sentimiento y score.

Qué se genera por ruta (`construir()` en `js/app.js`):

- **éxito** → un post de LinkedIn por mensaje; **hilo de X** solo para el de mayor score.
- **faq** → Tip / FAQ para los **2** de mayor score.
- **newsletter** → 1 por lote.
- **ticket** → ticket en estado `Abierto`, con aviso opcional a Slack o Discord.

Los umbrales aparecen en **Ajustes → Umbrales de decisión** y el front puede recalcular el lote. Los valores del backend están fijos en el código, así que si cambias uno, cámbialo también en el front.

---

## 5. Datos: bucket de OCI y MongoDB

### 5.1 Bucket (fuente de verdad)

```text
<BUCKET_NAME>/
├── mensaje_0001.json                  # entradas: una interacción por archivo
├── mensaje_0002.json
├── analisis/
│   └── mensaje_0001.json              # caché del análisis (etag + modelo + resultado)
├── activos/
│   └── 2026-semana-05/
│       └── curaduria.json             # activos generados/curados + tickets de ese periodo
└── config/
    └── voz.json                       # { "texto": "...", "chips": ["Sin hashtags", ...] }
```

Los prefijos `analisis/`, `activos/` y `config/` son **reservados**: `/procesar` no los trata como mensajes de entrada.

Forma de un mensaje de entrada (ver `input_examples/`):

```json
{
  "origen_comunidad": "Discord",
  "periodo_referencia": "Semana_05",
  "interaccion": {
    "autor": "Ana",
    "canal": "general",
    "tipo": "testimonio",
    "texto": "Conseguí mi primer empleo gracias al bootcamp."
  }
}
```

### 5.2 MongoDB (opcional, para consultas y un segundo front)

Sin `MONGO_URI` la app funciona solo con el bucket. Si Mongo falla, las operaciones son no-op y se pausan 60 s antes de reintentar. Nunca tumban el flujo principal.

| Colección | Contenido | Índice |
|---|---|---|
| `mensajes_entrada` | JSON de entrada tal cual baja del bucket (+ `archivo`, `etag`) | `periodo_referencia`, `origen_comunidad` |
| `analisis` | Resultado del análisis por mensaje | `slug`, `ruta` |
| `contenido_generado` | Activos (LinkedIn, X, FAQ, newsletter) | `slug`, `formato`, `estado` |
| `tickets` | Mensajes enrutados a ticket (`_id = slug:archivo`) | `slug`, `estado` |
| `lotes` | Resumen de cada procesamiento (slug, totales, caché) | — |
| `config` | Guía de voz (`_id = "voz"`) | — |

Los tickets se crean como `Abierto` solo la primera vez; un nuevo procesamiento no pisa estados ya gestionados.

`POST /sincronizar` carga a Mongo lo que ya está en el bucket (entradas, análisis, curadurías y voz). Es idempotente.

**Panorama con cifras simuladas.** `GET /dashboard` lee solo de MongoDB y, si no puede, el front dibuja una serie de ejemplo. El aviso amarillo del Panorama indica el motivo exacto:

| Motivo en el aviso | Causa | Qué hacer |
|---|---|---|
| `MONGO_URI no está configurada` | Falta la variable (ojo: en `.env.example` la línea trae un `###` que la deja vacía) | Definir `MONGO_URI=mongodb://usuario:clave@127.0.0.1:27017/` y reiniciar |
| `No se pudo conectar a MongoDB` | `mongod` caído, credenciales o puerto erróneos | `systemctl status mongod`; probar la URI con `mongosh` |
| `MongoDB no tiene análisis todavía` | Mongo vacío: `/procesar` solo replica lo que analiza en ese momento; lo que ya estaba en caché del bucket no se replica | `./deploy/sincronizar_mongo.sh` |
| `No hay datos del periodo …` | El periodo pedido no existe en Mongo | Elegir otra semana en el selector |

---

## 6. API

Documentación interactiva en `/docs` (Swagger) cuando el backend es accesible.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/files` | Lista los objetos del bucket |
| POST | `/upload` | Sube un archivo al bucket |
| GET | `/download/{filename}` | Descarga un objeto |
| DELETE | `/files/{filename}` | Borra un objeto |
| POST | `/procesar?forzar=false` | Analiza mensajes nuevos o modificados; devuelve cada mensaje con `etag`, `slug` y `nuevo` |
| POST | `/generar` | Genera contenido con la guía de voz; reutiliza lo ya generado por `huella` |
| GET / PUT | `/config/voz` | Lee o guarda la guía de voz (texto + chips) |
| GET | `/curaduria/{slug}` | Lee la curaduría de un periodo (404 si no existe) |
| PUT | `/curaduria/{slug}` | Guarda la curaduría de un periodo |
| POST | `/tickets/avisar` | Envía un aviso a `slack` o `discord` |
| POST | `/sincronizar` | Replica el bucket a MongoDB |
| POST | `/auth/login` | Inicia sesión (`{usuario, password}`) y entrega la cookie. Pública |
| POST | `/auth/logout` | Cierra la sesión. Pública |
| GET | `/auth/me` | Usuario de la sesión actual, o 401. Pública |
| GET | `/publico/faqs` | Landing: activos "Tip / FAQ" con estado `Publicado` de todas las curadurías, sin tickets ni datos de autores. Pública |
| GET | `/publico/newsletter` | Landing: activos "Destaque de newsletter" con estado `Publicado`, misma forma. Pública |

> Todas las rutas, salvo `/auth/*` y `/publico/*`, exigen sesión. Además nginx no deja pasar `DELETE`, `/files`, `/download`, `/sincronizar` ni `/docs`. Ver sección 10.

---

## 7. Configuración (`.env`)

Copia `.env.example` a `.env` (está en `.gitignore`; **nunca lo subas al repositorio**).

| Variable | Obligatoria | Descripción |
|---|---|---|
| `COHERE_API_KEY` | Sí | Clave de la API de Cohere |
| `BUCKET_NAME` | Sí | Nombre del bucket de OCI Object Storage |
| `MONGO_URI` | No | Cadena de conexión. Sin ella no se usa Mongo |
| `MONGO_DB` | No | Base de datos de Mongo (por defecto `insightmind`) |
| `SLACK_WEBHOOK_URL` | No | Webhook para avisos de tickets |
| `DISCORD_WEBHOOK_URL` | No | Webhook para avisos de tickets |
| `AUTH_SECRET` | Sí (lo genera `crear`) | Clave con la que se firman las sesiones. Si cambia, se cierran todas |
| `AUTH_USERS_FILE` | No | Archivo de usuarios (por defecto `data/usuarios.json`, fuera de git) |
| `AUTH_SESSION_HOURS` | No | Duración de la sesión (por defecto 12) |
| `AUTH_COOKIE_SECURE` | No | `false` con HTTP (por defecto). `true` solo si algún día hay HTTPS |
| `CORS_ORIGINS` | No | Vacío por defecto (mismo origen vía nginx). Solo para desarrollo con otro puerto |
| `SERVIR_UI` | No | `1` para que FastAPI sirva el front en `/ui` (desarrollo sin nginx) |

Credenciales de OCI: el SDK lee `~/.oci/config` (`oci.config.from_file()`) del usuario que ejecuta la app. Si cambia el usuario, cambia el archivo.

---

## 8. Ejecución local

Requisitos: **Python 3.14 o superior** (el código usa tipos como `str | None`), acceso a un bucket de OCI y una clave de Cohere.

```bash
git clone https://github.com/gbriones1234/<repo>.git
cd <repo>
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # completa COHERE_API_KEY y BUCKET_NAME
oci setup config            # si aún no tienes ~/.oci/config

python -m backend.auth crear <usuario>      # primer usuario (pide contraseña, genera AUTH_SECRET)

SERVIR_UI=1 uvicorn main:app --host 127.0.0.1 --port 8000     # desarrollo sin nginx
```

- Interfaz (sin nginx): <http://127.0.0.1:8000/ui/> (pide login)
- Con nginx: <http://localhost/> (sección 10)
- Swagger: <http://127.0.0.1:8000/docs> (requiere haber iniciado sesión en ese mismo host)

---

## 9. Despliegue en Oracle Linux 9 (OCI)

Ejemplo sobre una VM Oracle Linux 9 (sirve igual en x86_64 o ARM64 / Ampere A1), con el usuario `opc`. Estos pasos dejan el backend corriendo; el front y el login con nginx están en la sección 10, que es el despliegue recomendado.

### 9.1 Paquetes y código

```bash
sudo dnf install -y git python3.11 python3.11-pip

sudo mkdir -p /opt/insightmind && sudo chown opc:opc /opt/insightmind
git clone https://github.com/gbriones1234/<repo>.git /opt/insightmind
cd /opt/insightmind

python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env && chmod 600 .env && nano .env
```

### 9.2 Credenciales de OCI

```bash
mkdir -p ~/.oci && chmod 700 ~/.oci
# copia aquí `config` y tu llave privada (.pem), o ejecuta: oci setup config
chmod 600 ~/.oci/config ~/.oci/*.pem
```

Comprueba el acceso al bucket antes de seguir:

```bash
python -c "import oci; c=oci.config.from_file(); print(oci.object_storage.ObjectStorageClient(c).get_namespace().data)"
```

### 9.3 MongoDB (opcional)

Si usas Mongo, instálalo en la misma VM y déjalo **solo en localhost**.

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

Si dejas Mongo **sin autenticación**, es válido solo con `bindIp: 127.0.0.1` (nunca abierto a la red) y `MONGO_URI=mongodb://127.0.0.1:27017/`; salta el resto de este apartado. Para activar autenticación, crea un usuario:

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
# .env
# MONGO_URI=mongodb://insightmind:<PASSWORD>@127.0.0.1:27017/insightmind
```

Luego, una sola vez, con la API arriba: `./deploy/sincronizar_mongo.sh` (equivale a `python -m backend.sync_mongo`: sincroniza directo, sin login, y muestra los periodos que verá el Panorama). Un `curl` a `/sincronizar` ya no sirve: la API exige sesión.

### 9.4 Servicio systemd

`/etc/systemd/system/insightmind.service`:

```ini
[Unit]
Description=InsightMind API (FastAPI)
After=network-online.target
Wants=network-online.target

[Service]
User=opc
WorkingDirectory=/opt/insightmind
ExecStart=/opt/insightmind/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now insightmind
sudo systemctl status insightmind
journalctl -u insightmind -f        # logs en vivo
```

La app lee el `.env` con `python-dotenv` desde el `WorkingDirectory`, por eso la unidad no necesita `EnvironmentFile`.

### 9.5 Red

Como todo queda en localhost, **no abras 80, 443, 8000 ni 27017** en `firewalld` ni en OCI. Deja solo **22** (SSH), idealmente restringido a tu IP, y entra con un túnel (sección 2.1).

---

## 10. Front y backend separados con nginx, y login

Todo en la misma máquina, en `http://localhost`, sin dominio ni HTTPS.

| Pieza | Quién la sirve | Dónde escucha |
|---|---|---|
| Front (`index.html`, `css/`, `js/`) | nginx, desde `/var/www/insightmind` | `127.0.0.1:80` |
| API FastAPI | uvicorn | `127.0.0.1:8000` (solo vía nginx en `/api/`) |
| MongoDB | `mongod` | `127.0.0.1:27017` |

### 10.1 Qué cambió en el código

- **`frontend/.../js/api.js`**: la base de la API es `origin + "/api"` (en `/ui`, sin prefijo). Ante un `401` pide login encima de la pantalla actual, sin perder el estado.
- **`frontend/.../js/auth.js`** (nuevo): puerta de acceso. Pregunta `GET /auth/me`; sin sesión muestra el login y, solo con sesión, carga `datos-ejemplo.js`, `datos-dashboard.js`, `dashboard.js` y `app.js`. Botón "Cerrar sesión" en el pie del menú.
- **`backend/auth.py`** (nuevo): usuarios en `data/usuarios.json` (hash PBKDF2-SHA256), sesión en cookie firmada con HMAC (`HttpOnly`, `SameSite=Strict`, 12 h), bloqueo de 60 s tras 5 intentos fallidos por IP+usuario, y un middleware que exige sesión en **toda** la API salvo `/auth/*`. Sin dependencias nuevas.
- **`main.py`**: registra el middleware y el router `/auth`; el CORS `*` desaparece (solo existe si defines `CORS_ORIGINS`); `/ui` solo se monta con `SERVIR_UI=1`; se corrigió `hoy` sin definir en `/procesar` (lanzaba `NameError`).
- **`deploy/`**: `nginx/insightmind.conf`, `systemd/insightmind.service` y `desplegar.sh`.

### 10.2 Instalación (Oracle Linux 9)

```bash
cd /opt/insightmind && source venv/bin/activate

# 1) Primer usuario (pide contraseña de 8+ caracteres y genera AUTH_SECRET en .env)
python -m backend.auth crear <usuario>

# 2) nginx + front + SELinux (+ unidad systemd del backend)
./deploy/desplegar.sh --systemd
```

Abre <http://localhost/>. Cada vez que cambies el front, vuelve a ejecutar `./deploy/desplegar.sh`.

Administrar usuarios: `python -m backend.auth listar | crear <u> | borrar <u>`. `crear` sobre un usuario existente cambia su contraseña. Borrar un usuario invalida su sesión de inmediato.

### 10.3 Qué hace nginx

- `/` sirve el front estático (solo contiene la pantalla de login y el JS; los datos viven detrás del login).
- `/api/` quita el prefijo y hace proxy a `127.0.0.1:8000`; admite `GET`, `POST` y `PUT` (sin `DELETE`).
- `/api/auth/login` tiene límite de peticiones (10/min por IP, ráfaga 5), además del bloqueo de la API.
- Responde `404` en `/api/docs`, `/api/redoc`, `/api/openapi.json`, `/api/sincronizar`, `/api/download*` y `/api/files*`: el front no los usa.

### 10.4 Comprobaciones

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/                       # 200: front
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/config/voz         # 401: sin sesión
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/docs               # 404: bloqueado
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
     -d '{"usuario":"<u>","password":"<p>"}' http://localhost/api/auth/login      # 200: login
sudo ss -tlnp | grep -E ':(80|8000|27017)\b'                                      # todo en 127.0.0.1
```

### 10.5 Límites a tener presentes

- **HTTP no cifra**: contraseña y cookie viajan en claro. Es aceptable en `localhost` o por túnel SSH; si abres nginx a una red (`listen 80;`), pon HTTPS (`AUTH_COOKIE_SECURE=true`).
- Hay un solo nivel de acceso: cualquier usuario con login puede usar todas las rutas permitidas, incluidas `/procesar` y `/generar` (consumen créditos de Cohere).
- Las sesiones son cookies sin estado en servidor: no hay "cerrar sesión en todos lados" salvo cambiar `AUTH_SECRET` o borrar al usuario.
- El límite de intentos de la API es en memoria: se reinicia al reiniciar el servicio.
- Rota cualquier clave que haya viajado por chat, correo o repositorio.

---

## 11. Estructura del repositorio

```text
.
├── main.py                      # FastAPI: archivos, /procesar, tickets, curaduría, /auth; /ui solo con SERVIR_UI=1
├── requirements.txt
├── .env.example
├── input_examples/              # mensajes JSON de ejemplo
├── deploy/
│   ├── desplegar.sh               # front + nginx + SELinux (+ systemd con --systemd)
│   ├── nginx/insightmind.conf     # localhost:80, front estático + proxy /api/
│   └── systemd/insightmind.service
├── backend/
│   ├── auth.py                    # login, sesión por cookie, middleware, CLI de usuarios
│   ├── analizador_sentimiento.py  # Cohere + calcular_ruta() + umbrales
│   ├── cache_analisis.py          # caché del análisis (etag + modelo)
│   ├── generador_contenido.py     # prompts por formato + reglas de estilo
│   ├── config_voz.py              # guía de voz: texto, chips y reglas
│   ├── contexto.py                # slug por mensaje y por lote
│   ├── curaduria.py               # lee/escribe activos/<slug>/curaduria.json
│   ├── db.py                      # MongoDB (opcional, tolerante a fallos)
│   ├── oci_storage.py             # cliente único de Object Storage y prefijos
│   ├── rutas_contenido.py         # /generar, /config/voz, /sincronizar
│   ├── privacidad.py              # enmascara correos y teléfonos antes de enviar texto a la IA
│   └── rutas_publico.py           # /publico/faqs y /publico/newsletter (landing, sin sesión)
├── docs/legal/                    # privacidad, acuerdo de tratamiento, proveedores y procedimientos
├── frontend/landingpage/          # landing pública: info, planes, FAQs y newsletter (ver su README)
└── frontend/insightmind-v2/
    ├── index.html
    ├── css/
    ├── js/
    │   ├── api.js                 # cliente HTTP (fetch, base /api)
    │   ├── auth.js                # pantalla de login y carga del panel
    │   ├── app.js                 # estado, flujo, huellas, reconciliación
    │   └── datos-ejemplo.js       # modo demo sin backend
    └── build.py                   # empaqueta el front en un solo HTML para compartir
```

---

## 12. Pendientes

- [x] Separar front y backend con nginx y cerrar el CORS (sección 10).
- [x] Autenticación de usuarios.
- [ ] Roles (hoy todo usuario con login puede usar todas las rutas permitidas).
- [ ] HTTPS si algún día se expone fuera de localhost.
- [ ] Usar *instance principals* de OCI en lugar de `~/.oci/config` en la VM.
- [ ] Usuario de sistema dedicado para el servicio (hoy `opc`).
- [ ] Publicación real en LinkedIn / X desde la aplicación.
- [ ] Umbrales editables desde la UI y persistidos en el backend (hoy fijos en código).
- [ ] Pruebas automatizadas del flujo `/procesar` → `/generar` con OCI y Cohere simulados.
- [ ] Segundo front que consulte MongoDB.
