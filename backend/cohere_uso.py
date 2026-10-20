"""Contador aproximado de llamadas a Cohere realizadas por esta aplicación.

Guarda el estado en OCI Object Storage para sobrevivir a reinicios. No es un contador
oficial de Cohere: no incluye Playground, otras aplicaciones ni llamadas con la misma
API key fuera de este backend. Contrasta el dato con el dashboard de Cohere.
"""
import os
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
CLAVE = "config/cohere_uso.json"
USADAS_INICIALES = 2
_lock = threading.RLock()
_estado: dict | None = None


def _mes() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _limite_defecto() -> int:
    try:
        return max(1, int(os.getenv("COHERE_LIMITE_MENSUAL", "1000")))
    except (TypeError, ValueError):
        return 1000


def _cargar() -> dict:
    """Lee el estado del bucket; inicializa el contador solo si el objeto no existe."""
    global _estado
    mes = _mes()
    if _estado is None:
        from backend.oci_storage import leer_json
        try:
            guardado = leer_json(CLAVE)
            _estado = dict(guardado) if isinstance(guardado, dict) else {}
        except Exception as ex:
            if getattr(ex, "status", None) != 404:
                raise
            _estado = {"mes": mes, "usadas": USADAS_INICIALES}
    if _estado.get("mes") != mes:
        _estado = {"mes": mes, "usadas": 0}
    _estado.setdefault("usadas", 0)
    return _estado


def _guardar() -> None:
    from backend.oci_storage import guardar_json
    guardar_json(CLAVE, _estado)


def registrar(resp) -> None:
    """Registra únicamente respuestas HTTP exitosas; el contador nunca bloquea el análisis."""
    try:
        if not 200 <= resp.status_code < 300:
            return
        with _lock:
            e = _cargar()
            e["usadas"] = int(e.get("usadas", 0)) + 1
            cab = {k.lower(): v for k, v in resp.headers.items()}
            limite = cab.get("x-endpoint-monthly-call-limit", "")
            if limite.isdigit() and int(limite) > 0:
                e["limite"] = int(limite)
            relevantes = {
                k: v for k, v in cab.items()
                if k.startswith(("x-trial-", "x-endpoint-"))
            }
            if relevantes:
                e["cabeceras_cohere"] = relevantes
            _guardar()
    except Exception:
        # La métrica es auxiliar: nunca debe impedir que el análisis continúe.
        pass


def obtener() -> dict:
    with _lock:
        e = _cargar()
        limite = int(e.get("limite") or _limite_defecto())
        usadas = int(e.get("usadas", 0))
        ahora = datetime.now(timezone.utc)
        siguiente_mes = datetime(
            ahora.year + (1 if ahora.month == 12 else 0),
            1 if ahora.month == 12 else ahora.month + 1,
            1,
            tzinfo=timezone.utc,
        )
        return {
            "mes": e["mes"],
            "usadas": usadas,
            "limite": limite,
            "restantes": max(0, limite - usadas),
            "porcentaje": min(100, round(usadas * 100 / limite)) if limite else 0,
            "reinicia": siguiente_mes.date().isoformat(),
            "fuente": "conteo de esta app",
            "cabeceras_cohere": e.get("cabeceras_cohere", {}),
        }


class AjusteUso(BaseModel):
    usadas: int


@router.get("/cohere/uso")
def uso_cohere():
    return obtener()


@router.put("/cohere/uso")
def calibrar_uso(req: AjusteUso):
    """Sincroniza el contador con el número total que muestra Cohere este mes."""
    if req.usadas < 0:
        raise HTTPException(422, "usadas no puede ser negativo")
    try:
        with _lock:
            e = _cargar()
            e["usadas"] = req.usadas
            _guardar()
            return obtener()
    except Exception as ex:
        raise HTTPException(503, f"No se pudo guardar el contador: {type(ex).__name__}")
