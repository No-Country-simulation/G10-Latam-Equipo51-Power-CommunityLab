"""Endpoint del Panorama: agregaciones de MongoDB para el dashboard del front.

Va en un router aparte para no tocar los endpoints de nadie (main.py solo lo incluye).

Principio: **el panel no consulta MongoDB, pide agregaciones ya resueltas.**
Mandar miles de documentos al navegador para sumarlos allí no escala y rompe el
trato que tiene el front, donde toda la comunicación vive en js/api.js.

Fuente de los datos
-------------------
  analisis            un documento por mensaje analizado
  contenido_generado  un documento por pieza generada

El bucket de OCI sigue siendo la fuente de verdad. Esto solo lee la proyección
que `db.py` ya replica. Si MongoDB está apagado, el endpoint responde 503 y el
front se queda con su serie de ejemplo: nada del flujo principal se cae.

Periodo, no rango de fechas
---------------------------
Los documentos no tienen una fecha por mensaje: solo `slug` (`2026-semana-05`),
derivado de `periodo_referencia`. Por eso todo se compara **semana contra
semana** y el pulso dibuja una columna por semana. El día que la entrada traiga
`interaccion.fecha`, cambiar a rango de días es sustituir el `$match` por uno
sobre esa fecha y agrupar con `$dateTrunc`.

Qué se puede y qué no, hoy
--------------------------
`cobertura` en la respuesta dice qué bloques tienen datos. Los tres que faltan
dependen de que el análisis extraiga `temas` y `claves`; ver PANORAMA.md.
"""

from fastapi import APIRouter, HTTPException, Query

from backend import db

router = APIRouter()

# Un activo cuenta como aprobado desde que sale de "Pendiente" y no fue descartado.
ESTADOS_APROBADOS = ["Listo", "Publicado"]
# Minutos que cuesta escribir y revisar una pieza a mano. Es una estimación
# declarada, no una medición: se expone para que el front pueda decirlo.
MIN_POR_PIEZA = 22

# El canal vive en sitios distintos según la colección.
CANAL_ANALISIS = "canal"
CANAL_ACTIVO = "fuente_detalle.interaccion.canal"


def _base() -> "object":
    """Conexión a MongoDB o 503. Nunca propaga un error de driver al front."""
    if not db.habilitado():
        raise HTTPException(503, "MONGO_URI no está configurada: el Panorama no tiene de dónde leer")
    base = db.get_db()
    if base is None:
        raise HTTPException(503, "No se pudo conectar a MongoDB")
    return base


def _filtro(slugs: list[str], canal: str | None, campo_canal: str) -> dict:
    f: dict = {"slug": {"$in": slugs}} if slugs else {}
    if canal and canal != "todos":
        f[campo_canal] = canal
    return f


def _periodos(base) -> list[str]:
    """Semanas presentes en `analisis`, de la más vieja a la más nueva."""
    return sorted(s for s in base.analisis.distinct("slug") if s)


def _tiene_campo(base, campo: str, slug: str, canal: str | None) -> bool:
    """¿El análisis guarda este campo EN EL PERIODO que se está mirando?

    Se consulta por periodo y no en toda la colección a propósito: cuando se
    active la extracción de temas, las semanas viejas seguirán sin tenerlos.
    Si se mirara la colección entera, el front creería que hay datos y dejaría
    un panel vacío sin explicar por qué.
    """
    filtro = {**_filtro([slug], canal, CANAL_ANALISIS), campo: {"$exists": True, "$ne": []}}
    return base.analisis.count_documents(filtro, limit=1) > 0


# ------------------------------------------------------------------ bloques

def _metricas(base, slug: str, previo: str | None, canal: str | None) -> dict:
    """Las cinco tarjetas de arriba, con su comparación contra la semana anterior."""
    slugs = [s for s in (slug, previo) if s]
    filas = list(base.analisis.aggregate([
        {"$match": _filtro(slugs, canal, CANAL_ANALISIS)},
        {"$group": {
            "_id": "$slug",
            "total": {"$sum": 1},
            "positivas": {"$sum": {"$cond": [{"$eq": ["$sentimiento", "positivo"]}, 1, 0]}},
            "negativas": {"$sum": {"$cond": [{"$eq": ["$sentimiento", "negativo"]}, 1, 0]}},
            "aprovechables": {"$sum": {"$cond": [{"$ne": ["$ruta", "descartado"]}, 1, 0]}},
        }},
    ]))
    por_slug = {f["_id"]: f for f in filas}

    publicadas = {}
    for f in base.contenido_generado.aggregate([
        {"$match": _filtro(slugs, canal, CANAL_ACTIVO)},
        {"$group": {"_id": "$slug",
                    "publicadas": {"$sum": {"$cond": [{"$eq": ["$estado", "Publicado"]}, 1, 0]}}}},
    ]):
        publicadas[f["_id"]] = f["publicadas"]

    def arma(s: str | None) -> dict:
        d = por_slug.get(s) or {}
        total = d.get("total", 0)
        pub = publicadas.get(s, 0)
        return {
            "interacciones": total,
            # Índice de sentimiento: positivas menos negativas, sobre el total.
            # Un solo número con signo, más legible que dos porcentajes sueltos.
            "indice_sentimiento": round((d.get("positivas", 0) - d.get("negativas", 0)) / total * 100) if total else 0,
            "pct_aprovechadas": round(d.get("aprovechables", 0) / total * 100) if total else 0,
            "publicadas": pub,
            "horas_ahorradas": round(pub * MIN_POR_PIEZA / 60),
        }

    return {"actual": arma(slug), "previo": arma(previo) if previo else None,
            "supuesto_min_por_pieza": MIN_POR_PIEZA}


def _pulso(base, canal: str | None) -> list[dict]:
    """Una columna por semana: positivas arriba del eje, negativas abajo."""
    filas = list(base.analisis.aggregate([
        {"$match": _filtro([], canal, CANAL_ANALISIS)},
        {"$group": {
            "_id": "$slug",
            "total": {"$sum": 1},
            "positivas": {"$sum": {"$cond": [{"$eq": ["$sentimiento", "positivo"]}, 1, 0]}},
            "negativas": {"$sum": {"$cond": [{"$eq": ["$sentimiento", "negativo"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]))
    return [{"periodo": f["_id"], "total": f["total"], "positivas": f["positivas"],
             "negativas": f["negativas"],
             "neutrales": f["total"] - f["positivas"] - f["negativas"]} for f in filas]


def _temas(base, slug: str, previo: str | None, canal: str | None) -> list[dict]:
    """Temas de la semana con su variación contra la anterior.

    `variacion: None` significa tema nuevo. El front lo marca con una etiqueta
    en vez de imprimir un porcentaje: dividir entre cero daba cifras absurdas.
    """
    slugs = [s for s in (slug, previo) if s]
    filas = list(base.analisis.aggregate([
        {"$match": _filtro(slugs, canal, CANAL_ANALISIS)},
        {"$unwind": "$temas"},
        {"$group": {"_id": {"tema": "$temas", "periodo": "$slug"},
                    "n": {"$sum": 1}, "sentimiento": {"$avg": "$sent"}}},
        {"$group": {
            "_id": "$_id.tema",
            "actual": {"$sum": {"$cond": [{"$eq": ["$_id.periodo", slug]}, "$n", 0]}},
            "previo": {"$sum": {"$cond": [{"$eq": ["$_id.periodo", previo]}, "$n", 0]}},
            "sentimiento": {"$max": {"$cond": [{"$eq": ["$_id.periodo", slug]}, "$sentimiento", None]}},
        }},
        {"$match": {"actual": {"$gt": 0}}},
        {"$sort": {"actual": -1}},
    ]))
    salida = []
    for f in filas:
        prev = f.get("previo") or 0
        salida.append({
            "tema": f["_id"], "n": f["actual"],
            "variacion": round((f["actual"] / prev - 1) * 100) if prev else None,
            "nuevo": prev == 0,
            "sentimiento": round(f.get("sentimiento") or 0, 2),
        })
    salida.sort(key=lambda x: (x["variacion"] is None, -(x["variacion"] or 0)))
    return salida[:7]


def _termometro(base, slug: str, canal: str | None) -> list[dict]:
    """Temas ordenados del más frío al más cálido: lo que duele va arriba."""
    return [{"tema": f["_id"], "n": f["n"], "sentimiento": round(f["sentimiento"] or 0, 2)}
            for f in base.analisis.aggregate([
                {"$match": _filtro([slug], canal, CANAL_ANALISIS)},
                {"$unwind": "$temas"},
                {"$group": {"_id": "$temas", "n": {"$sum": 1}, "sentimiento": {"$avg": "$sent"}}},
                {"$sort": {"sentimiento": 1}},
            ])]


def _claves(base, slug: str, previo: str | None, canal: str | None) -> list[dict]:
    """Palabras vigiladas: menciones de esta semana y de la anterior."""
    slugs = [s for s in (slug, previo) if s]
    filas = list(base.analisis.aggregate([
        {"$match": _filtro(slugs, canal, CANAL_ANALISIS)},
        {"$unwind": "$claves"},
        {"$group": {
            "_id": "$claves",
            "actual": {"$sum": {"$cond": [{"$eq": ["$slug", slug]}, 1, 0]}},
            "previo": {"$sum": {"$cond": [{"$eq": ["$slug", previo]}, 1, 0]}},
            "sentimiento": {"$avg": "$sent"},
        }},
        {"$match": {"actual": {"$gt": 0}}},
        {"$sort": {"actual": -1}},
        {"$limit": 12},
    ]))
    return [{"termino": f["_id"], "menciones": f["actual"], "previo": f["previo"],
             "sentimiento": round(f.get("sentimiento") or 0, 2)} for f in filas]


def _embudo(base, slug: str, canal: str | None) -> dict:
    """De lo que llegó a lo que salió publicado, con el filtro humano en medio.

    `pct_sin_editar` es la métrica que mide al modelo: si sube, los prompts
    mejoraron; si baja, la voz de marca se desalineó.
    """
    a = next(iter(base.analisis.aggregate([
        {"$match": _filtro([slug], canal, CANAL_ANALISIS)},
        {"$group": {"_id": None,
                    "analizadas": {"$sum": 1},
                    "aprovechables": {"$sum": {"$cond": [{"$ne": ["$ruta", "descartado"]}, 1, 0]}},
                    "tickets": {"$sum": {"$cond": [{"$eq": ["$ruta", "ticket"]}, 1, 0]}}}},
    ])), {})
    c = next(iter(base.contenido_generado.aggregate([
        {"$match": _filtro([slug], canal, CANAL_ACTIVO)},
        {"$group": {"_id": None,
                    "generadas": {"$sum": 1},
                    "aprobadas": {"$sum": {"$cond": [{"$in": ["$estado", ESTADOS_APROBADOS]}, 1, 0]}},
                    "publicadas": {"$sum": {"$cond": [{"$eq": ["$estado", "Publicado"]}, 1, 0]}},
                    "sin_editar": {"$sum": {"$cond": [
                        {"$and": [{"$in": ["$estado", ESTADOS_APROBADOS]},
                                  {"$ne": ["$editado", True]}]}, 1, 0]}}}},
    ])), {})
    aprobadas = c.get("aprobadas", 0)
    return {
        "analizadas": a.get("analizadas", 0),
        "aprovechables": a.get("aprovechables", 0),
        "tickets": a.get("tickets", 0),
        "generadas": c.get("generadas", 0),
        "aprobadas": aprobadas,
        "publicadas": c.get("publicadas", 0),
        "pct_sin_editar": round(c.get("sin_editar", 0) / aprobadas * 100) if aprobadas else None,
    }


def _plataformas(base, slug: str, canal: str | None) -> list[dict]:
    """Dónde aprueba más el equipo y dónde hay que retocar más el texto."""
    filas = list(base.contenido_generado.aggregate([
        {"$match": _filtro([slug], canal, CANAL_ACTIVO)},
        {"$group": {"_id": "$formato",
                    "generadas": {"$sum": 1},
                    "publicadas": {"$sum": {"$cond": [{"$eq": ["$estado", "Publicado"]}, 1, 0]}},
                    "editadas": {"$sum": {"$cond": [{"$eq": ["$editado", True]}, 1, 0]}}}},
        {"$sort": {"publicadas": -1}},
    ]))
    return [{"formato": f["_id"], "generadas": f["generadas"], "publicadas": f["publicadas"],
             "tasa": round(f["publicadas"] / f["generadas"] * 100) if f["generadas"] else 0,
             "pct_edit": round(f["editadas"] / f["generadas"] * 100) if f["generadas"] else 0}
            for f in filas]


def _voces(base, slug: str, canal: str | None) -> list[dict]:
    """Quién originó más casos de éxito."""
    return [{"autor": f["_id"], "n": f["n"], "canales": f["canales"]}
            for f in base.analisis.aggregate([
                {"$match": {**_filtro([slug], canal, CANAL_ANALISIS), "ruta": "exito"}},
                {"$group": {"_id": "$autor", "n": {"$sum": 1}, "canales": {"$addToSet": "$canal"}}},
                {"$sort": {"n": -1}}, {"$limit": 5},
            ]) if f["_id"]]


def _riesgo(base, slug: str, canal: str | None, minimo: int = 2) -> list[dict]:
    """Quién acumula mensajes negativos. Es la lista que ninguna herramienta
    del mercado ofrece: no mide marca, mide personas a punto de abandonar.

    El mínimo es 2 y no 4 porque una semana tiene muchos menos mensajes que
    una ventana de 30 días.
    """
    return [{"autor": f["_id"], "n": f["n"], "canales": f["canales"]}
            for f in base.analisis.aggregate([
                {"$match": {**_filtro([slug], canal, CANAL_ANALISIS), "sentimiento": "negativo"}},
                {"$group": {"_id": "$autor", "n": {"$sum": 1}, "canales": {"$addToSet": "$canal"}}},
                {"$match": {"n": {"$gte": minimo}}},
                {"$sort": {"n": -1}}, {"$limit": 5},
            ]) if f["_id"]]


# ------------------------------------------------------------------ endpoint

@router.get("/dashboard")
def panorama(
    slug: str | None = Query(None, description="Periodo a mirar, p. ej. 2026-semana-05. Por defecto, el más reciente."),
    canal: str | None = Query(None, description="Canal exacto (#soporte-labs) o 'todos'."),
):
    """Todas las cifras del Panorama en una sola llamada.

    Son ocho agregaciones; se resuelven juntas para no hacer ocho viajes.

    `cobertura` dice qué bloques tienen datos hoy. Los que vengan en `false`
    no son un error: es que el análisis todavía no guarda el campo que
    necesitan (ver PANORAMA.md). El front los muestra como "falta activar"
    en vez de dejar un panel vacío sin explicación.
    """
    base = _base()

    periodos = _periodos(base)
    if not periodos:
        raise HTTPException(404, "MongoDB no tiene análisis todavía: corre POST /sincronizar o procesa un lote")

    actual = slug or periodos[-1]
    if actual not in periodos:
        raise HTTPException(404, f"No hay datos del periodo {actual}. Disponibles: {', '.join(periodos)}")
    i = periodos.index(actual)
    previo = periodos[i - 1] if i > 0 else None

    hay_temas = _tiene_campo(base, "temas", actual, canal)
    hay_claves = _tiene_campo(base, "claves", actual, canal)

    return {
        "periodo": {"actual": actual, "previo": previo, "disponibles": periodos},
        "canal": canal or "todos",
        "canales": sorted(c for c in base.analisis.distinct(CANAL_ANALISIS) if c),
        "cobertura": {
            "metricas": True, "pulso": True, "embudo": True,
            "plataformas": True, "voces": True, "riesgo": True,
            "temas": hay_temas, "termometro": hay_temas, "claves": hay_claves,
            # El pulso es semanal mientras no haya una fecha por mensaje.
            "granularidad": "semana",
        },
        "metricas": _metricas(base, actual, previo, canal),
        "pulso": _pulso(base, canal),
        "temas": _temas(base, actual, previo, canal) if hay_temas else [],
        "termometro": _termometro(base, actual, canal) if hay_temas else [],
        "claves": _claves(base, actual, previo, canal) if hay_claves else [],
        "embudo": _embudo(base, actual, canal),
        "plataformas": _plataformas(base, actual, canal),
        "voces": _voces(base, actual, canal),
        "riesgo": _riesgo(base, actual, canal),
    }
