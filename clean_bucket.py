import requests
from dotenv import load_dotenv
import os

load_dotenv()

API_BUCKET  = os.getenv("FAST_API_BUCKET")

API_URL = f"http://{API_BUCKET}:8000"

print(API_BUCKET)

try:
    # Obtener todos los archivos del bucket
    response = requests.get(f"{API_URL}/files")
    response.raise_for_status()

    archivos = response.json()

    print(f"Encontrados {len(archivos)} archivos")

    eliminados = 0
    errores = 0

    for archivo in archivos:

        nombre = archivo["name"]

        try:
            r = requests.delete(
                f"{API_URL}/files/{nombre}",
                timeout=30
            )

            if r.status_code == 200:
                eliminados += 1
                print(f"[OK] {nombre}")
            else:
                errores += 1
                print(
                    f"[ERROR] {nombre} "
                    f"({r.status_code})"
                )

        except Exception as e:
            errores += 1
            print(f"[ERROR] {nombre}: {e}")

    print("\n===== RESUMEN =====")
    print(f"Eliminados: {eliminados}")
    print(f"Errores: {errores}")

except Exception as e:
    print(f"Error obteniendo listado: {e}")