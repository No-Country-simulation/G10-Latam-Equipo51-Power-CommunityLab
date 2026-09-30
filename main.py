import json

from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
import requests
import oci
import io
from pydantic import BaseModel
import logging

from backend.curaduria import guardar_curaduria
from backend.analizador_sentimiento import (
    COHERE_MODEL, analizar_interaccion, consolidar, mensaje_con_error,
)
from backend import cache_analisis
from backend.oci_storage import PREFIJOS_RESERVADOS, leer_json, listar_objetos
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

BUCKET_NAME  = os.getenv("BUCKET_NAME")

app = FastAPI(
    title="OCI Object Storage API"
)

# Necesario para que el frontend (InsightMind-gradioV1.html) pueda hacer
# fetch() a esta API desde otro origen. En producción, cambia allow_origins
# por la URL exacta donde sirvas el frontend en vez de "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

config = oci.config.from_file()

client = oci.object_storage.ObjectStorageClient(config)

namespace = client.get_namespace().data


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

@app.post("/procesar")
def procesar_lote(forzar: bool = False):
    """
    Reemplaza el workflow de n8n "ANALISIS_SENTIMIENTO_01_actualizado":
      1. Lista los archivos de entrada del bucket (ignora activos/ y analisis/)
      2. Si ya fue analizado (mismo etag y modelo) reutiliza analisis/<archivo>.json
      3. Si no, lo descarga, extrae la interacción y la analiza con Cohere
      4. Guarda el resultado en analisis/ y devuelve el paquete consolidado

    ?forzar=true ignora la caché y vuelve a analizar todo.
    """
    log = logging.getLogger("uvicorn.error")

    entradas = [
        o for o in listar_objetos()
        if not o.name.startswith(PREFIJOS_RESERVADOS)
    ]
    en_cache = set() if forzar else cache_analisis.nombres_en_cache()

    mensajes = []
    reutilizados = nuevos = omitidos = 0

    for obj in entradas:
        # 1) ¿ya analizado?
        if obj.name in en_cache:
            cacheado = cache_analisis.cargar(obj.name, obj.etag, COHERE_MODEL)
            if cacheado:
                mensajes.append(cacheado)
                reutilizados += 1
                continue

        # 2) analizar con Cohere
        try:
            interaccion = _extraer_interaccion(leer_json(obj.name))
        except ValueError:  # no es JSON
            log.warning("Se omite %s: no es un JSON válido", obj.name)
            omitidos += 1
            continue

        try:
            mensaje = analizar_interaccion(interaccion)
        except Exception as e:
            # un mensaje que falla no tumba el lote y NO se cachea (se reintenta la próxima vez)
            mensajes.append(mensaje_con_error(interaccion, e))
            continue

        cache_analisis.guardar(obj.name, obj.etag, COHERE_MODEL, mensaje)
        mensajes.append(mensaje)
        nuevos += 1

    resultado = consolidar(mensajes)

    hoy = datetime.now()
    resultado["slug"] = f"{hoy.year}-semana-{hoy.isocalendar().week:02d}"
    resultado["cache"] = {"reutilizados": reutilizados, "analizados": nuevos, "omitidos": omitidos}

    return resultado



@app.post("/tickets/avisar")
def avisar_mensaje(mensaje: str, destino: str):

    """
    Envia un mensaje a un destino (slack o discord) 
    usando los webhooks configurados en el frontend.":
    """
 
    destino = destino.lower().strip()

    if destino == "slack":
        _enviar_slack(mensaje)
    elif destino == "discord":
        _enviar_discord(mensaje)
    else:
        raise ValueError(
            f"Destino no soportado: {destino}"
        )

def _enviar_slack(mensaje: str):

    webhook_url = os.getenv("SLACK_WEBHOOK_URL")

    if not webhook_url:
        raise RuntimeError(
            "No está configurado SLACK_WEBHOOK_URL"
        )

    payload = {
        "text": mensaje
    }

    response = requests.post(
        webhook_url,
        json=payload,
        timeout=10
    )

    response.raise_for_status()


def _enviar_discord(mensaje: str):

    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")

    if not webhook_url:
        raise RuntimeError(
            "No está configurado DISCORD_WEBHOOK_URL"
        )

    payload = {
        "content": mensaje
    }

    response = requests.post(
        webhook_url,
        json=payload,
        timeout=10
    )

    response.raise_for_status()


class CuraduriaRequest(BaseModel):
    activos: list

@app.put("/curaduria/{slug}")
def actualizar_curaduria(
    slug: str,
    request: CuraduriaRequest
):
    print(f"[CURADURIA] slug={slug}")
    print(f"[CURADURIA] activos={len(request.activos)}")

    resultado = guardar_curaduria(
        slug,
        request.activos
    )

    print(f"[CURADURIA] resultado={resultado}")

    return resultado


# Sirve el frontend (InsightMind-gradioV1.html renombrado a index.html) desde
# la misma instancia, en el mismo puerto que la API: http://<tu-ip>:8000/ui/
# Va al final para no pisar las rutas /files, /upload, /download definidas arriba.
app.mount("/ui", StaticFiles(directory="frontend/insightmind-v2", html=True), name="ui")
