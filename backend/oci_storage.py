"""Cliente único de OCI Object Storage para el paquete backend.

Centraliza el cliente, el bucket y los prefijos reservados para que
curaduria.py y cache_analisis.py no creen cada uno su propia conexión.
"""

import json
import os

import oci
from dotenv import load_dotenv

load_dotenv()

BUCKET_NAME = os.getenv("BUCKET_NAME")

client = oci.object_storage.ObjectStorageClient(oci.config.from_file())
namespace = client.get_namespace().data

# Prefijos donde ESTA app escribe. /procesar no debe tratarlos como mensajes de entrada.
PREFIJO_CURADURIA = "activos/"   # activos/<slug>/curaduria.json
PREFIJO_ANALISIS = "analisis/"   # analisis/<archivo>.json  (caché de Cohere)
PREFIJOS_RESERVADOS = (PREFIJO_CURADURIA, PREFIJO_ANALISIS)


def listar_objetos(prefijo: str | None = None) -> list:
    """Lista TODOS los objetos (pagina) con etag. Sin `fields`, OCI solo devuelve `name`."""
    kwargs = {"fields": "name,etag,size,timeModified"}
    if prefijo:
        kwargs["prefix"] = prefijo
    return oci.pagination.list_call_get_all_results(
        client.list_objects, namespace, BUCKET_NAME, **kwargs
    ).data.objects


def leer_json(nombre: str):
    obj = client.get_object(namespace_name=namespace, bucket_name=BUCKET_NAME, object_name=nombre)
    return json.loads(obj.data.content)


def guardar_json(nombre: str, data) -> None:
    client.put_object(
        namespace_name=namespace,
        bucket_name=BUCKET_NAME,
        object_name=nombre,
        put_object_body=json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
    )
