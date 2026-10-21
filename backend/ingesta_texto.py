"""Ingesta de mensajes pegados en crudo (POST /ingesta/texto).

Las comunidades reales no exportan JSON etiquetado: alguien copia una conversación de
Discord, un foro o un formulario y la pega. Este endpoint la convierte al formato de
entrada del brief (un archivo por interacción en el bucket, SIN "tipo") para que
/procesar la analice como cualquier otro lote y la IA clasifique cada mensaje desde cero.

Formatos que entiende, línea por línea:
  Ana: Conseguí mi primer empleo            -> autor "Ana"
  [10:32] Ana: Conseguí mi primer empleo    -> la hora se ignora
  Ana — hoy a las 10:32                     -> encabezado de Discord; el mensaje va en las líneas siguientes
  una línea sin autor                       -> continúa el mensaje anterior (o "Anónimo" si es la primera)
"""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.oci_storage import guardar_json

router = APIRouter(tags=["ingesta"])

MAX_MENSAJES = 50        # cada mensaje es una llamada a Cohere
MAX_CARACTERES = 2000    # por mensaje

_HORA = r"(?:\[[^\]]{1,20}\]\s*)?"
# Un autor: empieza con letra, hasta 4 palabras y 32 caracteres, sin ":".
_AUTOR = r"([^\W\d_][\w.\- ]{0,31}?)"
_LINEA_AUTOR = re.compile(rf"^{_HORA}{_AUTOR}\s*:\s+(.+)$")
_ENCABEZADO_DISCORD = re.compile(rf"^{_AUTOR}\s+[—–]\s+\S.*$")


def _es_autor(nombre: str) -> bool:
    """Hasta 4 palabras y ninguna solo de dígitos: "ana92" es un autor, "Error 403" no."""
    palabras = nombre.split()
    return len(palabras) <= 4 and not any(p.isdigit() for p in palabras)


def parsear(texto: str) -> list[dict]:
    """Convierte texto pegado en [{autor, texto}], en el orden en que aparecen."""
    mensajes: list[dict] = []
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea:
            continue
        m = _LINEA_AUTOR.match(linea)
        if m and _es_autor(m.group(1)):
            mensajes.append({"autor": m.group(1).strip(), "texto": m.group(2).strip()})
            continue
        m = _ENCABEZADO_DISCORD.match(linea)
        if m and _es_autor(m.group(1)):
            mensajes.append({"autor": m.group(1).strip(), "texto": ""})
            continue
        if mensajes:
            previo = mensajes[-1]
            previo["texto"] = f"{previo['texto']}\n{linea}".strip()
        else:
            mensajes.append({"autor": "Anónimo", "texto": linea})
    return [m for m in mensajes if m["texto"]]


class IngestaTexto(BaseModel):
    texto: str
    canal: str = "#general"
    origen_comunidad: str = "Pegado_en_panel"
    periodo_referencia: str | None = None     # si falta, la semana ISO actual ("Semana_43")


@router.post("/ingesta/texto")
def ingestar_texto(req: IngestaTexto):
    """Guarda cada mensaje pegado como un archivo de entrada en el bucket, sin "tipo"."""
    mensajes = parsear(req.texto)
    if not mensajes:
        raise HTTPException(400, "No se encontró ningún mensaje en el texto pegado")
    if len(mensajes) > MAX_MENSAJES:
        raise HTTPException(400, f"Máximo {MAX_MENSAJES} mensajes por envío; llegaron {len(mensajes)}")

    ahora = datetime.now(timezone.utc)
    periodo = req.periodo_referencia or f"Semana_{ahora.isocalendar().week:02d}"
    sello = ahora.strftime("%Y%m%d-%H%M%S")
    archivos = []
    for i, m in enumerate(mensajes, 1):
        nombre = f"pegado_{sello}_{i:02d}.json"
        guardar_json(nombre, {
            "origen_comunidad": req.origen_comunidad,
            "periodo_referencia": periodo,
            "interaccion": {"autor": m["autor"], "canal": req.canal, "texto": m["texto"][:MAX_CARACTERES]},
        })
        archivos.append(nombre)
    return {"status": "exito", "total": len(archivos), "periodo_referencia": periodo, "archivos": archivos}
