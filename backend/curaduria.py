from backend.oci_storage import PREFIJO_CURADURIA, guardar_json


def guardar_curaduria(slug: str, activos: list):

    object_name = f"{PREFIJO_CURADURIA}{slug}/curaduria.json"

    guardar_json(object_name, {"slug": slug, "activos": activos})

    return {
        "status": "exito",
        "guardado_en": object_name,
        "total_activos": len(activos)
    }
