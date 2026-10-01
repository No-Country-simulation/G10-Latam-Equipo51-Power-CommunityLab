from datetime import datetime, timezone

from backend import db
from backend.oci_storage import PREFIJO_CURADURIA, guardar_json


def guardar_curaduria(slug: str, activos: list, periodo_referencia: str | None = None,
                      origen_comunidad: str | None = None, tickets: list | None = None):
    """activos/<slug>/curaduria.json — conserva la forma de la entrada:
    cada activo trae `fuente_detalle` {archivo, origen_comunidad, periodo_referencia, interaccion{...}}."""

    object_name = f"{PREFIJO_CURADURIA}{slug}/curaduria.json"

    detalles = [a.get("fuente_detalle") or {} for a in activos]
    origenes = sorted({d["origen_comunidad"] for d in detalles if d.get("origen_comunidad")}
                      | ({origen_comunidad} if origen_comunidad else set()))
    periodo = periodo_referencia or next((d["periodo_referencia"] for d in detalles if d.get("periodo_referencia")), None)

    doc = {
        "slug": slug,
        "periodo_referencia": periodo,
        "origenes_comunidad": origenes,
        "actualizado": datetime.now(timezone.utc).isoformat(),
        "activos": activos,
        "tickets": tickets or [],
    }
    guardar_json(object_name, doc)
    db.guardar_curaduria(slug, doc)

    return {
        "status": "exito",
        "guardado_en": object_name,
        "total_activos": len(activos)
    }
