"""Caché del análisis de sentimiento en el bucket.

Cada archivo de entrada `X.json` se analiza una sola vez y el resultado queda en
`analisis/X.json` junto con el etag del archivo original y el modelo usado.
Si el archivo cambia (otro etag) o cambia el modelo, se vuelve a analizar.
"""

import logging

from backend.oci_storage import PREFIJO_ANALISIS, guardar_json, leer_json, listar_objetos

log = logging.getLogger("uvicorn.error")


def _clave(nombre: str) -> str:
    return f"{PREFIJO_ANALISIS}{nombre}.json"


def nombres_en_cache() -> set[str]:
    """Nombres de los archivos de entrada que ya tienen análisis (1 solo list_objects, sin GET 404 por archivo)."""
    ini, fin = len(PREFIJO_ANALISIS), len(".json")
    return {o.name[ini:-fin] for o in listar_objetos(PREFIJO_ANALISIS) if o.name.endswith(".json")}


def cargar(nombre: str, etag: str, modelo: str) -> dict | None:
    try:
        data = leer_json(_clave(nombre))
    except Exception as e:  # caché ilegible = se recalcula
        log.warning("Caché ilegible para %s: %s", nombre, e)
        return None
    if data.get("etag") == etag and data.get("modelo") == modelo:
        return data["mensaje"]
    return None


def guardar(nombre: str, etag: str, modelo: str, mensaje: dict) -> None:
    try:
        guardar_json(_clave(nombre), {"etag": etag, "modelo": modelo, "mensaje": mensaje})
    except Exception as e:  # no cachear no debe tumbar el lote
        log.warning("No se pudo guardar caché de %s: %s", nombre, e)
