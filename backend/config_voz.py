"""Guía de voz: reglas de redacción + chips de estilo que se inyectan en la generación.

Se guarda en el bucket (config/voz.json, fuente de verdad) y se replica en MongoDB.
"""

import re

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
    except Exception as e:
        # Solo "no existe todavía" cae al valor por defecto. Cualquier otro error (credenciales,
        # red...) se propaga: antes se tragaba y los chips guardados "desaparecían" en silencio.
        if getattr(e, "status", None) == 404:
            return {"texto": VOZ_POR_DEFECTO["texto"], "chips": []}
        raise


def guardar_voz(texto: str, chips: list[str]) -> dict:
    voz = {"texto": texto.strip(), "chips": [c.strip() for c in chips if c.strip()]}
    guardar_json(CLAVE, voz)
    db.guardar_voz(voz)
    return voz


# Cada chip del front se traduce a una regla imperativa. Antes solo viajaba su nombre
# ("Estilo adicional: Sin hashtags") y el prompt del formato, más específico, lo contradecía.
REGLAS_CHIPS = {
    "Sin hashtags": "NO incluyas ningún hashtag (#) en el texto.",
    "Sin emojis": "NO uses emojis ni emoticonos.",
    "Con emojis": "Usa algunos emojis de forma natural.",
    "Cercano": "Tono cercano y cálido, de tú a tú.",
    "Amistoso": "Tono amistoso y acogedor.",
    "Profesional": "Tono profesional y claro, sin jerga coloquial.",
    "Formal": "Registro formal, sin coloquialismos ni muletillas.",
    "Inspirador": "Tono inspirador y motivador.",
    "Celebratorio": "Tono celebratorio: reconoce el logro de la persona.",
    "Didáctico": "Tono didáctico: explica con claridad y ejemplos.",
    "Técnico": "Tono técnico y preciso.",
    "Breve": "Sé breve: ve al grano, sin relleno.",
    "Sobrio": "Tono sobrio: sin exclamaciones ni adornos.",
    "Primera persona plural": "Escribe en primera persona del plural (nosotros).",
}


def _chips_efectivos(chips: list[str]) -> list[str]:
    chips = list(dict.fromkeys(chips or []))                 # sin duplicados, conserva el orden
    if "Sin emojis" in chips and "Con emojis" in chips:      # contradicción: gana la restricción
        chips.remove("Con emojis")
    return chips


def reglas_de_estilo(voz: dict) -> list[str]:
    return [REGLAS_CHIPS.get(c, f"Estilo: {c}.") for c in _chips_efectivos(voz.get("chips"))]


def voz_como_prompt(voz: dict) -> str:
    partes = [f"GUÍA DE VOZ (obligatoria, tiene prioridad sobre cualquier otro estilo):\n{voz['texto']}"]
    reglas = reglas_de_estilo(voz)
    if reglas:
        partes.append("REGLAS DE ESTILO OBLIGATORIAS (prevalecen sobre la estructura sugerida del formato):\n"
                      + "\n".join(f"- {r}" for r in reglas))
    return "\n\n".join(partes)


_RE_HASHTAG = re.compile(r"(?<![\w/&])#(?!\d+\b)[^\W\d_]\w*")
_RE_EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2B55\uFE0F\u200D]")


def aplicar_chips(texto: str, voz: dict) -> str:
    """Red de seguridad determinista: el LLM puede ignorar una regla, esto no."""
    chips = _chips_efectivos(voz.get("chips"))
    if "Sin hashtags" in chips:
        texto = _RE_HASHTAG.sub("", texto)
    if "Sin emojis" in chips:
        texto = _RE_EMOJI.sub("", texto).replace("« ", "«")
    if "Sin hashtags" in chips or "Sin emojis" in chips:
        texto = re.sub(r"[ \t]+\n", "\n", texto)
        texto = re.sub(r"[ \t]{2,}", " ", texto)
        texto = re.sub(r"\n{3,}", "\n\n", texto).strip()
    return texto
