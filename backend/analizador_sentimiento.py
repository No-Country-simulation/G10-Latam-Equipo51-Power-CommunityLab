"""
Analiza sentimiento/tipo/score de una interacción usando la API de Cohere.

Reemplaza el workflow de n8n "ANALISIS_SENTIMIENTO_01_actualizado":
  Edit Fields (armar prompt) -> HTTP Request2 (Cohere) -> Interpretar respuesta IA
  -> Consolidar sentimiento

Requiere la variable de entorno COHERE_API_KEY.
"""

import os
import re
import json
import requests
from dotenv import load_dotenv


load_dotenv()

COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
COHERE_URL = "https://api.cohere.ai/v2/chat"
COHERE_MODEL = "command-r-08-2024"

# Mismos umbrales que "Ajustes -> Umbrales de decisión" en el frontend
UMBRAL_DESCARTE = 40
UMBRAL_EXITO = 70

TIPOS_VALIDOS = {"testimonio", "logro", "pregunta_tecnica", "queja",
                  "problema_acceso", "feedback", "conversacion"}

# Se usa cuando el JSON de la interacción YA trae "tipo" (tu caso: "testimonio").
# No le pedimos a Cohere que lo reclasifique, solo que evalúe sentimiento/score.
PROMPT_CON_TIPO = """Analiza el sentimiento del siguiente mensaje de una comunidad tecnológica.
El tipo de mensaje ya se conoce: "{tipo}". No lo reclasifiques.
Devuelve UNICAMENTE un JSON valido, sin texto adicional ni backticks, con esta forma exacta:

{{
  "sentimiento": "positivo|neutral|negativo",
  "score": <entero 0-100, que tan relevante o accionable es el mensaje>,
  "por_que": "una frase breve explicando la clasificacion"
}}

Mensaje de {autor}:
\"\"\"{texto}\"\"\"
"""

# Se usa cuando el JSON NO trae "tipo": le pedimos a Cohere que también lo infiera.
PROMPT_SIN_TIPO = """Analiza el siguiente mensaje de una comunidad tecnológica.
Devuelve UNICAMENTE un JSON valido, sin texto adicional ni backticks, con esta forma exacta:

{{
  "tipo": "testimonio|logro|pregunta_tecnica|queja|problema_acceso|feedback|conversacion",
  "sentimiento": "positivo|neutral|negativo",
  "score": <entero 0-100, que tan relevante o accionable es el mensaje>,
  "por_que": "una frase breve explicando la clasificacion"
}}

Mensaje de {autor}:
\"\"\"{texto}\"\"\"
"""


def _construir_prompt(autor: str, texto: str, tipo: str | None = None) -> str:
    if tipo:
        return PROMPT_CON_TIPO.format(autor=autor, texto=texto, tipo=tipo)
    return PROMPT_SIN_TIPO.format(autor=autor, texto=texto)


def _llamar_cohere(prompt: str, system: str | None = None, temperature: float | None = None) -> str:
    if not COHERE_API_KEY:
        raise RuntimeError("Falta la variable de entorno COHERE_API_KEY")

    resp = requests.post(
        COHERE_URL,
        headers={
            "Authorization": f"Bearer {COHERE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": COHERE_MODEL,
            "messages": (
                ([{"role": "system", "content": system}] if system else [])
                + [{"role": "user", "content": prompt}]
            ),
            **({"temperature": temperature} if temperature is not None else {}),
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        # misma extracción que hacía el nodo "Interpretar respuesta IA" en n8n
        return data["message"]["content"][0]["text"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(f"Respuesta inesperada de Cohere: {data}")


def _parsear_respuesta(raw: str, tipo_conocido: str | None = None) -> dict:
    limpio = re.sub(r"```json|```", "", raw).strip()
    try:
        ia = json.loads(limpio)
    except json.JSONDecodeError:
        # mismo fallback que usaba el Code node de n8n si el modelo no devuelve JSON válido
        return {
            "tipo": tipo_conocido or "conversacion",
            "sentimiento": "neutral",
            "score": 0,
            "por_que": limpio[:120],
        }
    return {
        "tipo": tipo_conocido or ia.get("tipo", "conversacion"),
        "sentimiento": ia.get("sentimiento", "neutral"),
        "score": int(ia.get("score", 0) or 0),
        "por_que": ia.get("por_que", ""),
    }


def _sent_num(sentimiento: str) -> float:
    """Traduce positivo/neutral/negativo a un número -1..1 para reusar la regla de ruta()."""
    return {"positivo": 0.8, "neutral": 0.0, "negativo": -0.6}.get(sentimiento, 0.0)


def calcular_ruta(tipo: str, sentimiento: str, score: int) -> str:
    """Port directo de la función ruta(m) de app.js."""
    sent = _sent_num(sentimiento)
    if score < UMBRAL_DESCARTE:
        return "descartado"
    if sent <= -0.4 or tipo in ("queja", "problema_acceso"):
        return "ticket"
    if tipo in ("testimonio", "logro") and sent >= 0.6 and score >= UMBRAL_EXITO:
        return "exito"
    if tipo == "pregunta_tecnica":
        return "faq"
    return "insight"


def analizar_interaccion(interaccion: dict) -> dict:
    """
    interaccion: dict con al menos {"autor": ..., "texto": ...}, y opcionalmente
    "tipo" ya clasificado (si viene, se respeta y Cohere solo evalúa sentimiento).

    Devuelve el registro que espera la grilla del frontend:
    autor, texto, tipo, sentimiento, score, por_que, ruta
    """
    autor = interaccion.get("autor", "Anónimo")
    texto = interaccion.get("texto", "")
    canal = interaccion.get("canal", "general")
    idioma = interaccion.get("idioma", "es")

    if not texto or not texto.strip():
        raise RuntimeError("La interacción no trae 'texto' (revisa el JSON del bucket)")

    tipo_dado = interaccion.get("tipo")
    if tipo_dado not in TIPOS_VALIDOS:
        tipo_dado = None  # tipo ausente o desconocido: que lo infiera Cohere

    prompt = _construir_prompt(autor, texto, tipo_dado)
    raw = _llamar_cohere(prompt)
    ia = _parsear_respuesta(raw, tipo_dado)
    ruta = calcular_ruta(ia["tipo"], ia["sentimiento"], ia["score"])

    return {
        "autor": autor,
        "texto": texto,
        "canal": canal,
        "idioma": idioma,
        "tipo": ia["tipo"],
        "sentimiento": ia["sentimiento"],
        "sent": _sent_num(ia["sentimiento"]),  # -1..1, listo para reusar en el frontend
        "score": ia["score"],
        "por_que": ia["por_que"],
        "ruta": ruta,
    }


def mensaje_con_error(interaccion: dict, error: Exception) -> dict:
    """Registro de relleno cuando un mensaje falla (no se cachea)."""
    return {
        "autor": interaccion.get("autor", "Anónimo"),
        "texto": interaccion.get("texto", ""),
        "canal": interaccion.get("canal", "general"),
        "idioma": interaccion.get("idioma", "es"),
        "tipo": "conversacion",
        "sentimiento": "neutral",
        "sent": 0.0,
        "score": 0,
        "por_que": f"Error al analizar: {error}",
        "ruta": "descartado",
    }


def consolidar(mensajes: list[dict]) -> dict:
    """Arma el paquete consolidado (equivalente al nodo 'Consolidar sentimiento' de n8n)."""
    contar = lambda s: sum(1 for m in mensajes if m["sentimiento"] == s)
    return {
        "total": len(mensajes),
        "positivo": contar("positivo"),
        "neutral": contar("neutral"),
        "negativo": contar("negativo"),
        "mensajes": mensajes,
    }


def analizar_lote(interacciones: list[dict]) -> dict:
    """Analiza una lista de interacciones (sin caché). /procesar ya no lo usa; se deja por compatibilidad."""
    mensajes = []
    for interaccion in interacciones:
        try:
            mensajes.append(analizar_interaccion(interaccion))
        except Exception as e:
            mensajes.append(mensaje_con_error(interaccion, e))
    return consolidar(mensajes)
