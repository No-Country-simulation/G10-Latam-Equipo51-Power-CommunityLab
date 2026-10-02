"""Guía de voz: reglas de redacción + chips de estilo que se inyectan en la generación.

Se guarda en el bucket (config/voz.json, fuente de verdad) y se replica en MongoDB.
"""

from backend import db
from backend.oci_storage import PREFIJO_CONFIG, guardar_json, leer_json

CLAVE = f"{PREFIJO_CONFIG}voz.json"

VOZ_POR_DEFECTO = {
    "texto": (
        "Tono cercano, inspirador y concreto. Celebramos a la persona, no a la marca.\n"
        "Español neutro, sin regionalismos. Frases cortas.\n"
        'Palabras prohibidas: "revolucionario", "disruptivo", "sinergia".'
    ),
    "chips": [],
}


def cargar_voz() -> dict:
    try:
        v = leer_json(CLAVE)
        return {"texto": v.get("texto", ""), "chips": list(v.get("chips", []))}
    except Exception:  # aún no existe config/voz.json
        return dict(VOZ_POR_DEFECTO)


def guardar_voz(texto: str, chips: list[str]) -> dict:
    voz = {"texto": texto.strip(), "chips": [c.strip() for c in chips if c.strip()]}
    guardar_json(CLAVE, voz)
    db.guardar_voz(voz)
    return voz


def voz_como_prompt(voz: dict) -> str:
    partes = [f"GUÍA DE VOZ (obligatoria, tiene prioridad sobre cualquier otro estilo):\n{voz['texto']}"]
    if voz.get("chips"):
        partes.append("Estilo adicional: " + ", ".join(voz["chips"]) + ".")
    return "\n\n".join(partes)
