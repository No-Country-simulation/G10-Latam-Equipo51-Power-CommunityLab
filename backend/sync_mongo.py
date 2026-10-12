"""Carga a MongoDB lo que ya está en el bucket, sin pasar por la API (no pide login).

    python -m backend.sync_mongo

Hace lo mismo que POST /sincronizar y después muestra los periodos que verá el Panorama.
Es idempotente. Requiere MONGO_URI en .env y las credenciales de OCI (~/.oci/config).
"""
import sys

from fastapi import HTTPException

from backend import db
from backend.rutas_contenido import sincronizar


def main() -> int:
    try:
        print("sincronizar:", sincronizar())
    except HTTPException as e:
        print(f"Error {e.status_code}: {e.detail}")
        return 1
    base = db.get_db()
    periodos = sorted(s for s in base.analisis.distinct("slug") if s)
    print("periodos en Mongo:", periodos or "(ninguno: el bucket no tiene análisis todavía)")
    for col in ("analisis", "contenido_generado", "tickets"):
        print(f"  {col}: {base[col].count_documents({})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
