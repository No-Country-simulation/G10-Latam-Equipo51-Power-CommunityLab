"""Lectura de la estructura estándar de los archivos de entrada del bucket:

{
  "origen_comunidad": "Discord_Grupo_ONE_G10",
  "periodo_referencia": "Semana_01",
  "interaccion": {"autor":..., "canal":..., "tipo":..., "texto":...}
}

También acepta el formato de n8n ({"data": {...}}) y el archivo plano.
"""

import re
from collections import Counter
from datetime import datetime


def _raiz(contenido: dict) -> dict:
    data = contenido.get("data")
    return data if isinstance(data, dict) and isinstance(data.get("interaccion"), dict) else contenido


def extraer(contenido: dict) -> dict:
    """Devuelve {origen_comunidad, periodo_referencia, interaccion} (None si no vienen)."""
    raiz = _raiz(contenido)
    interaccion = raiz.get("interaccion") if isinstance(raiz.get("interaccion"), dict) else contenido
    return {
        "origen_comunidad": raiz.get("origen_comunidad") or contenido.get("origen_comunidad"),
        "periodo_referencia": raiz.get("periodo_referencia") or contenido.get("periodo_referencia"),
        "interaccion": interaccion,
    }


def slug_de_mensaje(m: dict, hoy: datetime | None = None) -> str | None:
    """Slug del PROPIO mensaje ('Semana_05' -> '2026-semana-05'); None si su periodo no es reconocible."""
    hit = re.search(r"semana\D*(\d{1,2})", str(m.get("periodo_referencia") or ""), re.I)
    return f"{(hoy or datetime.now()).year}-semana-{int(hit.group(1)):02d}" if hit else None


def slug_del_lote(mensajes: list[dict], hoy: datetime | None = None) -> str:
    """'Semana_01' -> '2026-semana-01'. Usa el periodo más frecuente del lote;
    si ninguno es reconocible, cae a la semana ISO actual (comportamiento anterior)."""
    hoy = hoy or datetime.now()
    semanas = []
    for m in mensajes:
        hit = re.search(r"semana\D*(\d{1,2})", str(m.get("periodo_referencia") or ""), re.I)
        if hit:
            semanas.append(int(hit.group(1)))
    semana = Counter(semanas).most_common(1)[0][0] if semanas else hoy.isocalendar().week
    return f"{hoy.year}-semana-{semana:02d}"


def resumen_contexto(mensajes: list[dict]) -> dict:
    """Periodos y orígenes presentes en el lote (útil para avisar de lotes mezclados)."""
    return {
        "periodos": sorted({m["periodo_referencia"] for m in mensajes if m.get("periodo_referencia")}),
        "origenes_comunidad": sorted({m["origen_comunidad"] for m in mensajes if m.get("origen_comunidad")}),
    }
