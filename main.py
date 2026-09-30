import json

from fastapi import FastAPI, UploadFile, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
import requests
import oci
import io

from analizador_sentimiento import analizar_lote

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


@app.post("/procesar")
def procesar_lote():
    """
    Reemplaza el workflow de n8n "ANALISIS_SENTIMIENTO_01_actualizado":
      1. Lista los archivos del bucket (igual que GET /files)
      2. Descarga cada uno (igual que GET /download/{name})
      3. Extrae la interacción (autor/texto)
      4. Analiza cada mensaje con Cohere (analizador_sentimiento.py)
      5. Devuelve el paquete consolidado que espera la grilla del frontend
    """
    archivos = client.list_objects(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME
    ).data.objects

    interacciones = []
    for obj in archivos:
        raw_obj = client.get_object(
            namespace_name=namespace,
            bucket_name=BUCKET_NAME,
            object_name=obj.name
        )
        contenido = json.loads(raw_obj.data.content)
        interacciones.append(_extraer_interaccion(contenido))

    return analizar_lote(interacciones)

class TicketAvisoRequest(BaseModel):
    mensaje: str
    destino: str

@app.post("/tickets/avisar")
def avisar_mensaje(aviso: TicketAvisoRequest):

    """
    Envia un mensaje a un destino (slack o discord) 
    usando los webhooks configurados.
    """
 
    destino = aviso.destino.lower().strip()

    if destino == "slack":
        _enviar_slack(aviso.mensaje)
    elif destino == "discord":
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


# Sirve el frontend (InsightMind-gradioV1.html renombrado a index.html) desde
# la misma instancia, en el mismo puerto que la API: http://<tu-ip>:8000/ui/
# Va al final para no pisar las rutas /files, /upload, /download definidas arriba.
app.mount("/ui", StaticFiles(directory="frontend/insightmind-v2", html=True), name="ui")