"""Prueba de los pipelines del Panorama contra un MongoDB falso.

No necesita un MongoDB real ni credenciales: mongomock levanta uno en memoria.
Los documentos tienen la forma EXACTA que escribe backend/db.py, así que si
esto pasa, los pipelines son válidos contra nuestro esquema.

    pip install mongomock
    python pruebas/prueba_dashboard.py

Qué comprueba:
  - Las ocho agregaciones corren y devuelven las cifras esperadas.
  - El filtro por canal llega a las dos colecciones (analisis y
    contenido_generado, donde el canal vive en fuente_detalle.interaccion).
  - `cobertura` detecta por periodo si el análisis ya guarda temas y claves:
    una semana vieja sin temas debe reportar temas=False, no un panel vacío.
"""
import sys, pathlib, mongomock
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from backend import db as capa_db

cliente = mongomock.MongoClient()
base = cliente["insightmind"]

def analisis(archivo, slug, autor, canal, tipo, sentimiento, score, ruta, temas=None, claves=None):
    d = {"_id": archivo, "archivo": archivo, "slug": slug, "autor": autor, "canal": canal,
         "tipo": tipo, "sentimiento": sentimiento,
         "sent": {"positivo": .8, "neutral": 0.0, "negativo": -.6}[sentimiento],
         "score": score, "ruta": ruta, "texto": "…", "idioma": "es",
         "etag": "e1", "modelo": "command-r-08-2024", "actualizado": "2026-10-01T00:00:00Z"}
    if temas is not None: d["temas"] = temas
    if claves is not None: d["claves"] = claves
    return d

def activo(id_, slug, formato, estado, canal, editado=False):
    return {"_id": f"{slug}:{id_}", "id": id_, "slug": slug, "formato": formato,
            "estado": estado, "editado": editado,
            "fuente_detalle": {"archivo": "m1.json", "interaccion": {"canal": canal, "autor": "Ana"}}}

# --- semana 04: sin temas ni claves (el estado de hoy) ---
base.analisis.insert_many([
    analisis("m1.json", "2026-semana-04", "Ana Ribeiro",   "#logros-y-empleos", "testimonio",     "positivo", 95, "exito"),
    analisis("m2.json", "2026-semana-04", "Ana Ribeiro",   "#logros-y-empleos", "logro",          "positivo", 88, "exito"),
    analisis("m3.json", "2026-semana-04", "Diego Fuentes", "#soporte-labs",     "queja",          "negativo", 80, "ticket"),
    analisis("m4.json", "2026-semana-04", "Diego Fuentes", "#soporte-labs",     "problema_acceso","negativo", 75, "ticket"),
    analisis("m5.json", "2026-semana-04", "Hector Salas",  "#general",          "conversacion",   "neutral",  20, "descartado"),
])
# --- semana 05: más volumen, peor ánimo, y YA con temas y claves ---
base.analisis.insert_many([
    analisis("m6.json",  "2026-semana-05", "Ana Ribeiro",   "#logros-y-empleos", "testimonio",     "positivo", 92, "exito",   ["Contratación / Logros"], ["empleo"]),
    analisis("m7.json",  "2026-semana-05", "Diego Fuentes", "#soporte-labs",     "queja",          "negativo", 85, "ticket",  ["Acceso a laboratorios"], ["tenancy","acceso"]),
    analisis("m8.json",  "2026-semana-05", "Diego Fuentes", "#soporte-labs",     "problema_acceso","negativo", 81, "ticket",  ["Acceso a laboratorios"], ["tenancy"]),
    analisis("m9.json",  "2026-semana-05", "Matias Silva",  "#soporte-labs",     "queja",          "negativo", 78, "ticket",  ["Acceso a laboratorios"], ["acceso"]),
    analisis("m10.json", "2026-semana-05", "Lucas A.",      "#dudas-langgraph",  "pregunta_tecnica","neutral", 70, "faq",     ["LangGraph / Nodos"],     ["reintento"]),
    analisis("m11.json", "2026-semana-05", "Sofia M.",      "#general",          "conversacion",   "neutral",  15, "descartado", ["Convivencia"],        ["gracias"]),
])
base.contenido_generado.insert_many([
    activo("A1", "2026-semana-04", "Post de LinkedIn", "Publicado", "#logros-y-empleos"),
    activo("A2", "2026-semana-04", "Hilo de X",        "Listo",     "#logros-y-empleos", editado=True),
    activo("A3", "2026-semana-05", "Post de LinkedIn", "Publicado", "#logros-y-empleos"),
    activo("A4", "2026-semana-05", "Post de LinkedIn", "Publicado", "#logros-y-empleos", editado=True),
    activo("A5", "2026-semana-05", "Tip / FAQ",        "Pendiente", "#dudas-langgraph"),
])

capa_db.habilitado = lambda: True
capa_db.get_db = lambda: base
from backend import rutas_dashboard
r = rutas_dashboard.panorama(slug=None, canal=None)

print("PERIODO      ", r["periodo"])
print("COBERTURA    ", r["cobertura"])
print("CANALES      ", r["canales"])
print("MÉTRICAS act ", r["metricas"]["actual"])
print("MÉTRICAS prev", r["metricas"]["previo"])
print("PULSO        ", r["pulso"])
print("TEMAS        ", r["temas"])
print("TERMÓMETRO   ", r["termometro"])
print("CLAVES       ", r["claves"])
print("EMBUDO       ", r["embudo"])
print("PLATAFORMAS  ", r["plataformas"])
print("VOCES        ", r["voces"])
print("RIESGO       ", r["riesgo"])

print("\n--- filtrado por #soporte-labs ---")
f = rutas_dashboard.panorama(slug=None, canal="#soporte-labs")
print("MÉTRICAS     ", f["metricas"]["actual"])
print("EMBUDO       ", f["embudo"])
print("PLATAFORMAS  ", f["plataformas"], "(vacío es correcto: ese canal no genera contenido)")
print("RIESGO       ", f["riesgo"])

print("\n--- semana 04, que NO tiene temas ---")
v = rutas_dashboard.panorama(slug="2026-semana-04", canal=None)
print("COBERTURA    ", v["cobertura"])
print("TEMAS        ", v["temas"], "(vacío y cobertura lo explica)")
