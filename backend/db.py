"""MongoDB como proyección consultable del bucket (para el segundo front).

El bucket de OCI sigue siendo la fuente de verdad. Aquí se replica:
  mensajes_entrada   -> el JSON de entrada tal cual baja del bucket (+ archivo, etag)
  analisis           -> resultado del análisis de sentimiento por mensaje
  contenido_generado -> LinkedIn / X / FAQ / newsletter (los "activos" de la curaduría)
  tickets            -> mensajes enrutados a ticket, con su estado
  lotes              -> resumen de cada procesamiento (slug, totales, caché)
  config             -> guía de voz ( _id = "voz" )

Si MONGO_URI no está definida, o Mongo falla, todo es no-op: el flujo del bucket
nunca se cae por culpa de la base de datos.
"""

import logging
import os
import time
from datetime import datetime, timezone
from functools import wraps

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("uvicorn.error")

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "insightmind")

_db = None
_avisado = False
_caido_hasta = 0.0        # tras un fallo, no se reintenta durante 60 s (evita esperar 3 s por cada upsert)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def habilitado() -> bool:
    return bool(MONGO_URI)


def get_db():
    """Conexión perezosa. Devuelve None si Mongo no está configurado."""
    global _db, _avisado
    if _db is not None:
        return _db
    if not MONGO_URI:
        if not _avisado:
            log.warning("MONGO_URI no definida: se omite la persistencia en MongoDB")
            _avisado = True
        return None
    from pymongo import MongoClient

    cliente = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    _db = cliente[MONGO_DB]
    _crear_indices(_db)
    return _db


def _crear_indices(db) -> None:
    db.mensajes_entrada.create_index([("periodo_referencia", 1), ("origen_comunidad", 1)])
    db.analisis.create_index([("slug", 1), ("ruta", 1)])
    db.contenido_generado.create_index([("slug", 1), ("formato", 1), ("estado", 1)])
    db.tickets.create_index([("slug", 1), ("estado", 1)])


def seguro(fn):
    """Si Mongo no está o falla, registra el aviso y sigue (devuelve None)."""

    @wraps(fn)
    def envoltura(*a, **kw):
        global _caido_hasta
        if time.time() < _caido_hasta:
            return None
        try:
            db = get_db()
            if db is None:
                return None
            return fn(db, *a, **kw)
        except Exception as e:
            _caido_hasta = time.time() + 60
            log.warning("MongoDB: %s falló (se pausa 60 s): %s", fn.__name__, e)
            return None

    return envoltura


# ------------------------------------------------------------------ escritura

@seguro
def guardar_entrada(db, archivo: str, etag: str, contenido: dict, contexto: dict) -> None:
    """Mantiene la forma original: origen_comunidad / periodo_referencia / interaccion."""
    db.mensajes_entrada.update_one(
        {"_id": archivo},
        {"$set": {
            "archivo": archivo,
            "etag": etag,
            "origen_comunidad": contexto.get("origen_comunidad"),
            "periodo_referencia": contexto.get("periodo_referencia"),
            "interaccion": contexto.get("interaccion"),
            "actualizado": _ahora(),
        }},
        upsert=True,
    )


@seguro
def guardar_analisis(db, archivo: str, etag: str, modelo: str, slug: str, mensaje: dict) -> None:
    db.analisis.update_one(
        {"_id": archivo},
        {"$set": {**mensaje, "archivo": archivo, "etag": etag, "modelo": modelo,
                  "slug": slug, "actualizado": _ahora()}},
        upsert=True,
    )


@seguro
def guardar_ticket(db, slug: str, mensaje: dict) -> None:
    """Crea el ticket como 'Abierto' solo la primera vez; no pisa estados ya gestionados."""
    sev = "Alta" if mensaje.get("sent", 0) <= -0.6 else "Media"
    db.tickets.update_one(
        {"_id": f"{slug}:{mensaje['archivo']}"},
        {"$set": {"slug": slug, "archivo": mensaje["archivo"], "severidad": sev,
                  "autor": mensaje.get("autor"), "canal": mensaje.get("canal"),
                  "texto": mensaje.get("texto"),
                  "origen_comunidad": mensaje.get("origen_comunidad"),
                  "periodo_referencia": mensaje.get("periodo_referencia")},
         "$setOnInsert": {"estado": "Abierto", "aviso": None, "creado": _ahora()}},
        upsert=True,
    )


@seguro
def guardar_lote(db, slug: str, resumen: dict) -> None:
    db.lotes.update_one({"_id": slug}, {"$set": {**resumen, "slug": slug, "actualizado": _ahora()}}, upsert=True)


@seguro
def guardar_curaduria(db, slug: str, doc: dict) -> None:
    """Contenido generado (cada activo = un documento) y estado de tickets."""
    for a in doc.get("activos", []):
        if not a.get("id"):
            continue
        db.contenido_generado.update_one(
            {"_id": f"{slug}:{a['id']}"},
            {"$set": {**a, "slug": slug,
                      "periodo_referencia": doc.get("periodo_referencia"),
                      "actualizado": _ahora()}},
            upsert=True,
        )
    for t in doc.get("tickets", []):
        if not t.get("archivo"):
            continue
        db.tickets.update_one(
            {"_id": f"{slug}:{t['archivo']}"},
            {"$set": {"estado": t.get("estado", "Abierto"), "aviso": t.get("aviso"),
                      "slug": slug, "archivo": t["archivo"], "actualizado": _ahora()}},
            upsert=True,
        )


@seguro
def guardar_voz(db, voz: dict) -> None:
    db.config.update_one({"_id": "voz"}, {"$set": {**voz, "actualizado": _ahora()}}, upsert=True)


@seguro
def guardar_generado(db, slug: str, activo: dict) -> None:
    """Texto recién generado: no pisa el estado si el activo ya fue guardado/publicado."""
    id_ = f"{slug}:{activo['id']}"
    db.contenido_generado.update_one(
        {"_id": id_},
        {"$set": {**{k: v for k, v in activo.items() if k != "estado"}, "slug": slug, "actualizado": _ahora()},
         "$setOnInsert": {"estado": "Pendiente"}},
        upsert=True,
    )
