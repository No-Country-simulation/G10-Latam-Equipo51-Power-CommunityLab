import json

from fastapi import FastAPI, UploadFile, HTTPException, APIRouter
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
import requests
from requests_oauthlib import OAuth1
import oci
import io
import logging
import httpx

from backend.curaduria import cargar_curaduria, guardar_curaduria
from backend.analizador_sentimiento import (
    COHERE_MODEL, analizar_interaccion, consolidar, mensaje_con_error,
)
from backend import auth, cache_analisis, contexto, db
from backend.rutas_contenido import router as router_contenido
from backend.rutas_dashboard import router as router_dashboard
from backend.rutas_publico import invalidar_cache as invalidar_cache_publico, router as router_publico
from backend.oci_storage import PREFIJOS_RESERVADOS, leer_json, listar_objetos
from backend.gestor_semanas import obtener_lista_semanas_oci, obtener_detalle_semana_oci
from backend.gestor_conexiones import obtener_conexiones, cambiar_estado_conexion
from backend.gestor_publicaciones import publicar_en_redes
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

BUCKET_NAME  = os.getenv("BUCKET_NAME")

app = FastAPI(
    title="OCI Object Storage API"
)

# Front y API comparten origen (nginx en http://localhost, la API bajo /api/),
# así que CORS no hace falta. Solo se activa si defines CORS_ORIGINS
# (lista separada por comas, p. ej. otro puerto en desarrollo). Con cookies de
# sesión no puede ser "*".
_cors_origenes = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origenes:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origenes,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Toda la API exige sesión salvo /auth/* (login, logout, me). Ver backend/auth.py.
# Se registra después de CORS para que sea la capa más externa.
app.middleware("http")(auth.middleware_sesion)

config = oci.config.from_file()

client = oci.object_storage.ObjectStorageClient(config)

namespace = client.get_namespace().data

router = APIRouter()

class PublicacionRedesRequest(BaseModel):
    texto: str
    plataforma: str  # "linkedin" o "x"
    formato: str


@app.get("/files")
def list_files():

    response = client.list_objects(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME
    )

    files = []

    for obj in response.data.objects:
        files.append({
            "name": obj.name,
            "size": obj.size,
            "etag": obj.etag,
            "modified": str(obj.time_modified)
        })

    return files


@app.post("/upload")
async def upload_file(file: UploadFile):

    content = await file.read()

    client.put_object(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME,
        object_name=file.filename,
        put_object_body=content
    )

    return {
        "message": "Archivo subido",
        "file": file.filename
    }


@app.get("/download/{filename}")
def download_file(filename: str):

    try:

        obj = client.get_object(
            namespace_name=namespace,
            bucket_name=BUCKET_NAME,
            object_name=filename
        )

        return StreamingResponse(
            io.BytesIO(obj.data.content),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition":
                f"attachment; filename={filename}"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )


@app.delete("/files/{filename}")
def delete_file(filename: str):

    client.delete_object(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME,
        object_name=filename
    )

    return {
        "message": "Archivo eliminado",
        "file": filename
    }


def _extraer_interaccion(contenido: dict) -> dict:
    """
    Soporta las 3 formas que puede traer un archivo del bucket:
    - {"interaccion": {"autor":..., "texto":...}, "origen_comunidad":..., ...}  <- tu formato real
    - {"data": {"interaccion": {...}}}                                          <- formato original de n8n
    - {"autor":..., "texto":...}                                                <- archivo plano
    """
    data = contenido.get("data")
    if isinstance(data, dict) and isinstance(data.get("interaccion"), dict):
        return data["interaccion"]
    if isinstance(contenido.get("interaccion"), dict):
        return contenido["interaccion"]
    return contenido





from datetime import datetime

def _contexto_mensaje(archivo: str, contenido: dict) -> dict:
    ctx = contexto.extraer(contenido)
    return {"archivo": archivo, "origen_comunidad": ctx["origen_comunidad"],
            "periodo_referencia": ctx["periodo_referencia"]}


@app.post("/procesar")
def procesar_lote(forzar: bool = False):
    """
    Reemplaza el workflow de n8n "ANALISIS_SENTIMIENTO_01_actualizado":
      1. Lista los archivos de entrada del bucket (ignora activos/, analisis/ y config/)
      2. Si ya fue analizado (mismo etag y modelo) reutiliza analisis/<archivo>.json
      3. Si no, lo descarga, extrae la interacción y la analiza con Cohere
      4. Guarda el resultado en analisis/ (y lo replica en MongoDB) y devuelve el paquete consolidado

    Cada mensaje conserva origen_comunidad y periodo_referencia del archivo de entrada;
    el slug del lote sale del periodo_referencia (Semana_01 -> 2026-semana-01).
    ?forzar=true ignora la caché y vuelve a analizar todo.

    Cada mensaje de la respuesta trae `etag` (versión del archivo de entrada) y `nuevo`
    (True solo si se analizó en esta llamada). El front usa el etag para decidir qué contenido
    generado ya existe y no hay que regenerar.
    """
    log = logging.getLogger("uvicorn.error")

    entradas = [
        o for o in listar_objetos()
        if not o.name.startswith(PREFIJOS_RESERVADOS)
    ]
    en_cache = set() if forzar else cache_analisis.nombres_en_cache()

    # Mongo recién configurado y vacío: se rellena también con lo que ya estaba en la caché del bucket
    # (sin esto, solo se replicaría lo analizado en esta llamada y el Panorama daría 404).
    mongo_vacio = db.analisis_vacio() is True

    mensajes, procesados = [], []     # procesados: (objeto, mensaje) NUEVOS, para replicar en MongoDB
    reutilizados = nuevos = omitidos = 0

    for obj in entradas:
        # 1) ¿ya analizado?
        if obj.name in en_cache:
            cacheado = cache_analisis.cargar(obj.name, obj.etag, COHERE_MODEL)
            if cacheado:
                if "archivo" not in cacheado:
                    # caché anterior a origen/periodo: se completa leyendo el archivo, sin llamar a Cohere
                    try:
                        contenido = leer_json(obj.name)
                        cacheado.update(_contexto_mensaje(obj.name, contenido))
                        cache_analisis.guardar(obj.name, obj.etag, COHERE_MODEL, cacheado)
                        db.guardar_entrada(obj.name, obj.etag, contenido, contexto.extraer(contenido))
                    except ValueError:
                        cacheado["archivo"] = obj.name
                    procesados.append((obj, dict(cacheado)))   # solo los completados se re-sincronizan
                elif mongo_vacio:
                    procesados.append((obj, dict(cacheado)))
                # nuevo=False / etag viajan solo en la respuesta (no se escriben en analisis/)
                mensajes.append({**cacheado, "etag": obj.etag, "nuevo": False})
                reutilizados += 1
                continue

        # 2) analizar con Cohere
        try:
            contenido = leer_json(obj.name)
        except ValueError:  # no es JSON
            log.warning("Se omite %s: no es un JSON válido", obj.name)
            omitidos += 1
            continue

        ctx = contexto.extraer(contenido)
        interaccion = ctx["interaccion"]
        extra = _contexto_mensaje(obj.name, contenido)
        db.guardar_entrada(obj.name, obj.etag, contenido, ctx)

        try:
            mensaje = {**analizar_interaccion(interaccion), **extra}
        except Exception as e:
            # un mensaje que falla no tumba el lote y NO se cachea (se reintenta la próxima vez)
            mensajes.append({**mensaje_con_error(interaccion, e), **extra, "etag": obj.etag, "nuevo": True})
            continue

        cache_analisis.guardar(obj.name, obj.etag, COHERE_MODEL, mensaje)
        mensajes.append({**mensaje, "etag": obj.etag, "nuevo": True})
        procesados.append((obj, mensaje))
        nuevos += 1

    hoy = datetime.now()

    resultado = consolidar(mensajes)
    resultado["slug"] = contexto.slug_del_lote(mensajes)
    for m in mensajes:   # slug propio (el del lote solo como respaldo si el periodo no se reconoce)
        m["slug"] = contexto.slug_de_mensaje(m) or resultado["slug"]
    resultado.update(contexto.resumen_contexto(mensajes))
    resultado["cache"] = {"reutilizados": reutilizados, "analizados": nuevos, "omitidos": omitidos}

    # 3) replica en MongoDB (si está configurado; nunca rompe el flujo)
    for obj, m in procesados:
        # El slug es el del PROPIO mensaje: un lote con Semana_01..Semana_05 debe quedar en
        # cinco periodos y no en uno solo (el Panorama compara semana contra semana).
        slug_m = contexto.slug_de_mensaje(m) or resultado["slug"]
        db.guardar_analisis(obj.name, obj.etag, COHERE_MODEL, slug_m, m)
        if m.get("ruta") == "ticket":
            db.guardar_ticket(slug_m, m)
    db.guardar_lote(resultado["slug"], {
        "total": resultado["total"], "positivo": resultado["positivo"],
        "neutral": resultado["neutral"], "negativo": resultado["negativo"],
        "periodos": resultado["periodos"], "origenes_comunidad": resultado["origenes_comunidad"],
        "cache": resultado["cache"],
    })
    
    # Historial (/semanas/{slug}): un resumen.json POR PERIODO en activos/{slug}/
    try:
        from backend.oci_storage import guardar_json, PREFIJO_CURADURIA
        por_periodo: dict[str, list] = {}
        for m in mensajes:
            por_periodo.setdefault(m["slug"], []).append(m)
        for slug_p, msgs in por_periodo.items():
            parcial = consolidar(msgs)
            parcial["slug"] = slug_p
            parcial.update(contexto.resumen_contexto(msgs))
            guardar_json(f"{PREFIJO_CURADURIA}{slug_p}/resumen.json", parcial)
    except Exception as e:
        log.warning(
            "No se pudo guardar resumen por periodo: %s",
            str(e)
        )



    return resultado



class TicketAvisoRequest(BaseModel):
    mensaje: str
    destino: str

@app.post("/tickets/avisar")
def avisar_mensaje(aviso: TicketAvisoRequest):

    """
    Envia un mensaje a un destino (discord) 
    usando los webhooks configurados.
    """
 
    destino = aviso.destino.lower().strip()

    if destino == "discord":
        _enviar_discord(aviso.mensaje)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Destino no soportado: {destino}"
        )

    return {"status": "exito", "mensaje": "Aviso enviado correctamente", "destino": destino}

# Función para enviar mensajes a Slack usando webhooks
def _enviar_slack(mensaje: str):

    webhook_url = os.getenv("SLACK_WEBHOOK_URL")

    if not webhook_url:
        raise HTTPException(
            status_code=500,
            detail="No está configurado SLACK_WEBHOOK_URL"
        )

    payload = {
        "text": mensaje
    }

    try:
        response = requests.post(
            webhook_url,
            json=payload,
            timeout=10
        )
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error enviando a Slack: {e}")

# Función para enviar mensajes a Discord usando webhooks
def _enviar_discord(mensaje: str):

    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")

    if not webhook_url:
        raise HTTPException(
            status_code=500,
            detail="No está configurado DISCORD_WEBHOOK_URL"
        )

    payload = {
        "content": mensaje
    }

    try:
        response = requests.post(
            webhook_url,
            json=payload,
            timeout=10
        )
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error enviando a Discord: {e}")


class CuraduriaRequest(BaseModel):
    activos: list
    periodo_referencia: str | None = None
    origen_comunidad: str | None = None
    tickets: list = []

@app.get("/curaduria/{slug}")
def obtener_curaduria(slug: str):
    """Devuelve activos/<slug>/curaduria.json (lo ya generado/curado) o 404 si aún no existe."""
    doc = cargar_curaduria(slug)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"No hay curaduría para {slug}")
    return doc


@app.put("/curaduria/{slug}")
def actualizar_curaduria(
    slug: str,
    request: CuraduriaRequest
):

    resultado = guardar_curaduria(
        slug,
        request.activos,
        periodo_referencia=request.periodo_referencia,
        origen_comunidad=request.origen_comunidad,
        tickets=request.tickets,
    )
    invalidar_cache_publico()   # la landing ve lo recién publicado sin esperar la caché
    return resultado


@app.get("/semanas")
async def listar_semanas():
    """Endpoint para listar el historial de semanas disponibles."""
    try:
        semanas = obtener_lista_semanas_oci()
        return {"semanas": semanas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/semanas/{slug}")
async def obtener_detalle_semana(slug: str):
    """Endpoint para obtener el detalle y métricas de una semana específica."""
    detalle = obtener_detalle_semana_oci(slug)
    if not detalle:
        raise HTTPException(status_code=404, detail="Semana no encontrada en OCI")
    return detalle


@app.get("/conexiones")
def api_obtener_conexiones():
    """Retorna el estado de todas las plataformas configuradas."""
    return obtener_conexiones()

@app.put("/conexiones/{plataforma}")
def api_cambiar_conexion(plataforma: str, payload: dict):
    """Endpoint PUT para conectar o desconectar una plataforma."""
    conectar = payload.get("conectar", payload.get("on", False))
    resultado = cambiar_estado_conexion(plataforma, conectar)
    return resultado

@app.post("/publicar-redes")
async def api_publicar_redes(req: PublicacionRedesRequest):
    """Endpoint POST para enviar contenido directamente a LinkedIn o en modo asistido a X."""
    return await publicar_en_redes(req.texto, req.plataforma)

app.include_router(router_contenido)   # /config/voz, /generar, /sincronizar
app.include_router(router_dashboard)    # /dashboard (Panorama, lee de MongoDB)
app.include_router(auth.router)         # /auth/login, /auth/logout, /auth/me
app.include_router(router_publico)      # /publico/faqs, /publico/newsletter (landing, solo lectura)

# La landing (frontend/landingpage) es pública: lee lo publicado sin sesión.
# Solo GET, y solo devuelve activos "Publicado" sin datos de autores (ver backend/rutas_publico.py).
auth.RUTAS_PUBLICAS.append("/publico")


# En producción el front lo sirve nginx (ver deploy/nginx/insightmind.conf).
# Para desarrollo sin nginx: SERVIR_UI=1 uvicorn main:app  ->  http://127.0.0.1:8000/ui/
# Va al final para no pisar las rutas definidas arriba. /ui es público (solo estáticos);
# lo que protege la sesión es la API.
if os.getenv("SERVIR_UI", "").strip().lower() in ("1", "true", "yes"):
    auth.RUTAS_PUBLICAS.append("/ui")
    app.mount("/ui", StaticFiles(directory="frontend/insightmind-v2", html=True), name="ui")
    auth.RUTAS_PUBLICAS.append("/landing")
    app.mount("/landing", StaticFiles(directory="frontend/landingpage", html=True), name="landing")
