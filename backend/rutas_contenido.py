"""Endpoints nuevos: guía de voz, generación de contenido y sincronización a MongoDB.

Van en un router aparte para no tocar los endpoints de los demás (main.py solo lo incluye).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend import config_voz, contexto, db, generador_contenido
from backend.oci_storage import (
    PREFIJO_ANALISIS, PREFIJO_CONFIG, PREFIJO_CURADURIA, leer_json, listar_objetos,
)

router = APIRouter()


# ---------------------------------------------------------------- guía de voz
class VozRequest(BaseModel):
    texto: str
    chips: list[str] = Field(default_factory=list)


@router.get("/config/voz")
def obtener_voz():
    return config_voz.cargar_voz()


@router.put("/config/voz")
def actualizar_voz(req: VozRequest):
    """Guarda la guía de voz. Se aplica a toda generación posterior (POST /generar)."""
    if not req.texto.strip() and not req.chips:
        raise HTTPException(400, "La guía de voz no puede estar vacía")
    voz = config_voz.guardar_voz(req.texto, req.chips)
    return {"status": "exito", "guardado_en": config_voz.CLAVE, "chips": len(voz["chips"])}


# ----------------------------------------------------------------- generación
class ItemGenerar(BaseModel):
    id: str
    formato: str
    mensaje: dict = Field(default_factory=dict)
    mensajes: list[dict] | None = None        # solo "Destaque de newsletter"
    texto_previo: str | None = None           # "Volver a generar": pide otra versión


class GenerarRequest(BaseModel):
    slug: str | None = None                   # si viene, el texto se replica en MongoDB
    items: list[ItemGenerar]


@router.post("/generar")
def generar(req: GenerarRequest):
    """Genera con Cohere (usando la guía de voz vigente) el texto de cada activo."""
    voz = config_voz.cargar_voz()
    items = [i.model_dump() for i in req.items]
    resultados, errores = generador_contenido.generar_lote(items, voz)

    if req.slug:
        for it in items:
            if it["id"] in resultados:
                m = it["mensaje"]
                db.guardar_generado(req.slug, {
                    "id": it["id"], "formato": it["formato"], "texto": resultados[it["id"]],
                    "fuente_detalle": _fuente_detalle(m),
                })
    return {"resultados": resultados, "errores": errores}


def _fuente_detalle(m: dict) -> dict:
    """Misma forma que el archivo de entrada, para rastrear de dónde salió cada activo."""
    return {
        "archivo": m.get("archivo"),
        "origen_comunidad": m.get("origen_comunidad"),
        "periodo_referencia": m.get("periodo_referencia"),
        "interaccion": {k: m.get(k) for k in ("autor", "canal", "tipo", "texto")},
    }


# -------------------------------------------------------------- sincronización
@router.post("/sincronizar")
def sincronizar():
    """Carga a MongoDB lo que ya está en el bucket (entradas, análisis, curadurías y voz).
    Idempotente: se puede ejecutar las veces que haga falta."""
    if not db.habilitado():
        raise HTTPException(503, "MongoDB no está configurado (falta MONGO_URI)")
    try:
        db.get_db().command("ping")
    except Exception as e:
        raise HTTPException(503, f"No hay conexión con MongoDB: {e}")

    cuenta = {"entradas": 0, "analisis": 0, "curadurias": 0, "voz": 0, "omitidos": 0}

    for o in listar_objetos():
        n = o.name
        try:
            if n.startswith(PREFIJO_ANALISIS):
                reg = leer_json(n)
                msg = reg.get("mensaje", {})
                archivo = n[len(PREFIJO_ANALISIS):].removesuffix(".json")
                db.guardar_analisis(archivo, reg.get("etag"), reg.get("modelo"),
                                    contexto.slug_del_lote([msg]), {**msg, "archivo": archivo})
                cuenta["analisis"] += 1
            elif n.startswith(PREFIJO_CURADURIA):
                if n.endswith("/curaduria.json"):
                    doc = leer_json(n)
                    db.guardar_curaduria(doc.get("slug") or n.split("/")[1], doc)
                    cuenta["curadurias"] += 1
            elif n.startswith(PREFIJO_CONFIG):
                if n == config_voz.CLAVE:
                    db.guardar_voz(leer_json(n))
                    cuenta["voz"] += 1
            else:
                ctx = contexto.extraer(leer_json(n))
                db.guardar_entrada(n, o.etag, {}, ctx)
                cuenta["entradas"] += 1
        except Exception:  # archivo no JSON u objeto ilegible
            cuenta["omitidos"] += 1
    return {"status": "exito", **cuenta}
