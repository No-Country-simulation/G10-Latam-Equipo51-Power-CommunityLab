"""Endpoints públicos de solo lectura para el sitio de Insight Mind (sitio/).

El sitio muestra lo que el equipo ya publicó desde la curaduría:
  GET /publico/faqs        activos "Tip / FAQ" con estado "Publicado"
  GET /publico/newsletter  activos "Destaque de newsletter" con estado "Publicado"

Responden una lista de curadurías con la MISMA forma que activos/<slug>/curaduria.json
({slug, periodo_referencia, activos:[{id, formato, estado, publicado, texto}]}), para que el
sitio las lea sin transformar nada. Lo que no es público se queda fuera:
  - los tickets,
  - `fuente_detalle` (autor, canal y texto original del mensaje de la comunidad),
  - cualquier activo que no esté publicado o que sea de otro formato.

Va en un router aparte para no tocar los endpoints de nadie (main.py solo lo incluye).
La fuente de verdad es el bucket de OCI; la respuesta se cachea unos segundos para que
un pico de visitas al sitio no se convierta en un pico de lecturas al bucket.
"""

import time

from fastapi import APIRouter, HTTPException, Response

from backend.oci_storage import PREFIJO_CURADURIA, leer_json, listar_objetos

router = APIRouter(prefix="/publico", tags=["publico"])

FORMATO_FAQ = "Tip / FAQ"
FORMATO_NEWSLETTER = "Destaque de newsletter"
CAMPOS_PUBLICOS = ("id", "formato", "estado", "publicado", "texto")
TTL_SEGUNDOS = 60

_cache: dict = {"t": 0.0, "docs": None}


def invalidar_cache() -> None:
    """Llamar después de guardar una curaduría: lo recién publicado aparece al instante."""
    _cache.update(t=0.0, docs=None)


def _curadurias() -> list[dict]:
    """Todas las curadurías del bucket, con caché corta en memoria."""
    if _cache["docs"] is not None and time.monotonic() - _cache["t"] < TTL_SEGUNDOS:
        return _cache["docs"]
    docs = []
    for o in listar_objetos(PREFIJO_CURADURIA):
        if not o.name.endswith("/curaduria.json"):
            continue
        try:
            docs.append(leer_json(o.name))
        except Exception:  # una curaduría ilegible no tumba el sitio
            continue
    _cache.update(t=time.monotonic(), docs=docs)
    return docs


def _publicados(formato: str) -> list[dict]:
    salida = []
    for doc in _curadurias():
        activos = [
            {k: a.get(k) for k in CAMPOS_PUBLICOS}
            for a in doc.get("activos", [])
            if a.get("estado") == "Publicado" and a.get("formato") == formato and a.get("texto")
        ]
        if activos:
            salida.append({
                "slug": doc.get("slug"),
                "periodo_referencia": doc.get("periodo_referencia"),
                "activos": activos,
            })
    return salida


def _responder(formato: str, response: Response) -> list[dict]:
    try:
        datos = _publicados(formato)
    except Exception as e:
        raise HTTPException(503, f"No se pudo leer la curaduría: {e}")
    # El servidor ya cachea el bucket; el navegador revalida siempre para ver lo recién publicado
    response.headers["Cache-Control"] = "no-cache"
    return datos


@router.get("/faqs")
def faqs_publicadas(response: Response):
    return _responder(FORMATO_FAQ, response)


@router.get("/newsletter")
def newsletter_publicada(response: Response):
    return _responder(FORMATO_NEWSLETTER, response)
