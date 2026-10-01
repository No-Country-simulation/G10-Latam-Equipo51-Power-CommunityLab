"""Genera el contenido (LinkedIn, hilo de X, FAQ, newsletter) con Cohere,
inyectando la guía de voz guardada en PUT /config/voz."""

import re
from concurrent.futures import ThreadPoolExecutor

from backend.analizador_sentimiento import _llamar_cohere
from backend.config_voz import voz_como_prompt

LIMITES = {"Post de LinkedIn": 3000, "Hilo de X": 280, "Tip / FAQ": 2500, "Destaque de newsletter": 4000}
SEPARADOR_HILO = "\n\n———\n\n"

INSTRUCCIONES = {
    "Post de LinkedIn": (
        "Escribe UN post de LinkedIn (máx. 1300 caracteres) que celebre a la persona del mensaje. "
        "Estructura: gancho en la primera línea, contexto breve, la cita textual del mensaje entre comillas, "
        "cierre con felicitación y 2-3 hashtags. Usa emojis con moderación."
    ),
    "Hilo de X": (
        f"Escribe un hilo de X de 4 posts. CADA post debe tener máximo 280 caracteres. "
        f"Separa los posts con una línea que contenga exactamente: {SEPARADOR_HILO.strip()}"
    ),
    "Tip / FAQ": (
        "Convierte la pregunta en un tip/FAQ para la comunidad: título en negrita (**así**), respuesta breve "
        "en pasos numerados, y al final la nota «⚠️ Requiere validación de mentor antes de publicarse.»"
    ),
    "Destaque de newsletter": (
        "Escribe un destaque para el newsletter semanal: titular, 2-3 párrafos cortos con lo más relevante "
        "del lote (porcentaje de mensajes positivos incluido) y una cita destacada."
    ),
}


def _datos(m: dict) -> str:
    return (
        f"Autor: {m.get('autor')}\nCanal: {m.get('canal', 'general')}\n"
        f"Tipo: {m.get('tipo')}\nComunidad: {m.get('origen_comunidad') or 'n/d'}\n"
        f"Periodo: {m.get('periodo_referencia') or 'n/d'}\nMensaje: \"{m.get('texto')}\""
    )


def _contexto_newsletter(mensajes: list[dict]) -> str:
    pos = sum(1 for m in mensajes if m.get("sent", 0) > 0.2)
    pct = round(pos / len(mensajes) * 100) if mensajes else 0
    lineas = [f"- {m.get('autor')} ({m.get('tipo')}): {str(m.get('texto'))[:140]}" for m in mensajes[:12]]
    return f"Mensajes del lote ({len(mensajes)}, {pct}% positivos):\n" + "\n".join(lineas)


def _ajustar(formato: str, texto: str) -> str:
    texto = re.sub(r"```\w*", "", texto).strip()
    if formato == "Hilo de X":
        posts = [p.strip() for p in re.split(r"\n\s*[—–-]{3,}\s*\n", texto) if p.strip()]
        posts = [p if len(p) <= 280 else p[:277].rstrip() + "…" for p in posts]
        return SEPARADOR_HILO.join(posts)
    limite = LIMITES.get(formato, 3000)
    return texto if len(texto) <= limite else texto[: limite - 1].rstrip() + "…"


def generar_texto(formato: str, mensaje: dict, voz: dict, mensajes: list[dict] | None = None,
                  texto_previo: str | None = None) -> str:
    if formato not in INSTRUCCIONES:
        raise ValueError(f"Formato no soportado: {formato}")

    sistema = (
        "Eres el redactor de la comunidad. Escribes contenido listo para publicar, sin explicaciones ni "
        "comentarios sobre lo que haces. Responde en el idioma del mensaje original "
        f"({'portugués' if mensaje.get('idioma') == 'pt' else 'español'}).\n\n" + voz_como_prompt(voz)
    )
    base = _contexto_newsletter(mensajes) if formato == "Destaque de newsletter" and mensajes else _datos(mensaje)
    prompt = f"{INSTRUCCIONES[formato]}\n\n{base}"
    if texto_previo:
        prompt += (
            "\n\nYa existe esta versión; escribe una DISTINTA (otro gancho y otro ángulo, mismos hechos):\n"
            f"{texto_previo}"
        )
    return _ajustar(formato, _llamar_cohere(prompt, system=sistema, temperature=0.9 if texto_previo else 0.6))


def generar_lote(items: list[dict], voz: dict) -> tuple[dict, dict]:
    """items: [{id, formato, mensaje, mensajes?, texto_previo?}] -> ({id: texto}, {id: error})"""
    resultados, errores = {}, {}

    def uno(it):
        try:
            resultados[it["id"]] = generar_texto(
                it["formato"], it.get("mensaje") or {}, voz, it.get("mensajes"), it.get("texto_previo"))
        except Exception as e:  # un activo que falla no tumba al resto
            errores[it["id"]] = str(e)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(uno, items))
    return resultados, errores
