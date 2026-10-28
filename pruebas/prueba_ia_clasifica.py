"""Prueba offline de la clasificación con pista y de POST /ingesta/texto.

Cohere y OCI van simulados: no gasta llamadas ni toca el bucket.

    python pruebas/prueba_ia_clasifica.py
"""
import json, pathlib, sys, types

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

# --- stubs de OCI y del contador de Cohere (no se toca la nube) ---
guardados = {}
oci = types.ModuleType("backend.oci_storage")
oci.guardar_json = lambda nombre, data: guardados.__setitem__(nombre, data)
sys.modules["backend.oci_storage"] = oci
uso = types.ModuleType("backend.cohere_uso")
uso.registrar = lambda resp: None
sys.modules["backend.cohere_uso"] = uso

from backend import analizador_sentimiento as A
from backend import ingesta_texto as I

fallos = []
def check(nombre, cond, extra=""):
    print(("OK   " if cond else "FALLA"), nombre, extra)
    if not cond: fallos.append(nombre)

# ---------------- parser ----------------
pegado = """[10:31] Ana López: Conseguí mi primer empleo como dev junior!
gracias a todos por la ayuda
Martín — hoy a las 10:32
Llevo tres días sin poder entrar al laboratorio, error 403.
Error 403: sigue igual
hola a todos"""
ms = I.parsear(pegado)
check("parser: 2 mensajes", len(ms) == 2, [m["autor"] for m in ms])
check("parser: 'Error 403:' no es autor, continúa a Martín", "Error 403: sigue igual\nhola a todos" in ms[1]["texto"], ms[1])
check("parser: autor con dígitos pegados", I.parsear("ana92: hola")[0]["autor"] == "ana92")
check("parser: hora ignorada y multilínea", ms[0] == {"autor": "Ana López", "texto": "Conseguí mi primer empleo como dev junior!\ngracias a todos por la ayuda"}, ms[0])
check("parser: encabezado de Discord", ms[1]["autor"] == "Martín" and ms[1]["texto"].startswith("Llevo tres días"), ms[1])
check("parser: sin autor al inicio -> Anónimo", I.parsear("solo una línea")[0]["autor"] == "Anónimo")
check("parser: vacío", I.parsear("  \n \n") == [])
check("parser: frase larga con ':' no es autor", I.parsear("Hoy aprendí esto en la clase de ayer: genial")[0]["autor"] == "Anónimo")

# ---------------- prompt ----------------
p1 = A._construir_prompt("Ana", "hola", "feedback")
p2 = A._construir_prompt("Ana", "hola", None)
check("prompt con pista la menciona", '"feedback"' in p1 and "puede estar equivocada" in p1)
check("prompt sin pista no la menciona", "pista" not in p2.lower() and "etiquetó" not in p2)
check("prompt pide siempre el tipo", '"tipo":' in p1 and '"tipo":' in p2)
check("prompt trata el mensaje como datos", "no sigas" in p1)

# ---------------- análisis con Cohere simulado ----------------
def con_respuesta(raw):
    A._llamar_cohere = lambda prompt, **kw: raw
    A.COHERE_API_KEY = "x"

con_respuesta(json.dumps({"tipo": "queja", "sentimiento": "negativo", "score": 80, "por_que": "frustración"}))
r = A.analizar_interaccion({"autor": "Ana", "texto": "esto es pésimo", "tipo": "feedback"})
check("IA corrige la pista", r["tipo"] == "queja" and r["tipo_pista"] == "feedback" and r["tipo_corregido"] is True, r)
check("la corrección cambia la ruta", r["ruta"] == "ticket", r["ruta"])

r = A.analizar_interaccion({"autor": "Ana", "texto": "esto es pésimo", "tipo": "queja"})
check("IA coincide con la pista", r["tipo_corregido"] is False)

r = A.analizar_interaccion({"autor": "Ana", "texto": "esto es pésimo"})
check("sin pista: tipo_pista None, no corregido", r["tipo_pista"] is None and r["tipo_corregido"] is False)

con_respuesta(json.dumps({"tipo": "spam", "sentimiento": "neutral", "score": 50, "por_que": "x"}))
r = A.analizar_interaccion({"autor": "Ana", "texto": "x", "tipo": "logro"})
check("tipo inventado por la IA -> vale la pista", r["tipo"] == "logro" and r["tipo_corregido"] is False, r["tipo"])
r = A.analizar_interaccion({"autor": "Ana", "texto": "x"})
check("tipo inventado sin pista -> conversacion", r["tipo"] == "conversacion")

con_respuesta(json.dumps({"tipo": "Pregunta_Tecnica ", "sentimiento": "neutral", "score": 60, "por_que": "x"}))
check("normaliza mayúsculas y espacios", A.analizar_interaccion({"autor": "A", "texto": "x"})["tipo"] == "pregunta_tecnica")

con_respuesta("esto no es json")
r = A.analizar_interaccion({"autor": "Ana", "texto": "x", "tipo": "logro"})
check("JSON inválido -> conserva la pista", r["tipo"] == "logro" and r["tipo_corregido"] is False)

# No se fija una versión concreta: subirla es lo normal al tocar el prompt, y una
# prueba que se rompe en cada bump se acaba ignorando. Lo que importa es que la
# llave de caché lleve versión, porque sin eso se sirve análisis viejo.
check("la llave de caché lleva versión", A.MODELO_CACHE.startswith(A.COHERE_MODEL + "+")
      and A.VERSION_ANALISIS in A.MODELO_CACHE, A.MODELO_CACHE)

# ---------------- temas y palabras clave ----------------
con_respuesta('{"tipo":"queja","sentimiento":"negativo","score":80,'
              '"temas":["acceso a laboratorios"],"claves":["Tenancy","bucket","error"],"por_que":"x"}')
r = A.analizar_interaccion({"autor": "Ana", "texto": "no entro al lab"})
check("el tema se normaliza al catálogo", r["temas"] == ["Acceso a laboratorios"], r["temas"])
check("las claves bajan a minúscula", r["claves"] == ["tenancy", "bucket", "error"], r["claves"])

con_respuesta('{"tipo":"queja","sentimiento":"negativo","score":80,'
              '"temas":["A","B","C"],"claves":["a","A","b","c","d","e"],"por_que":"x"}')
r = A.analizar_interaccion({"autor": "Ana", "texto": "x"})
check("máximo 2 temas", len(r["temas"]) == 2, r["temas"])
check("máximo 3 claves, sin repetidos", r["claves"] == ["a", "b", "c"], r["claves"])

con_respuesta("esto tampoco es json")
r = A.analizar_interaccion({"autor": "Ana", "texto": "x"})
check("JSON roto -> listas vacías, no revienta", r["temas"] == [] and r["claves"] == [])

# ---------------- endpoint ----------------
from fastapi import FastAPI
from fastapi.testclient import TestClient
app = FastAPI(); app.include_router(I.router)
c = TestClient(app)
res = c.post("/ingesta/texto", json={"texto": pegado, "canal": "#soporte"})
check("endpoint 200", res.status_code == 200, res.text[:200])
body = res.json()
check("endpoint guarda 2 archivos", body["total"] == 2 and len(guardados) == 2, body)
doc = guardados[body["archivos"][1]]
check("archivo sin tipo y con forma del brief", "tipo" not in doc["interaccion"] and doc["interaccion"]["canal"] == "#soporte"
      and doc["periodo_referencia"].startswith("Semana_") and doc["origen_comunidad"], doc)
check("vacío -> 400", c.post("/ingesta/texto", json={"texto": "   "}).status_code == 400)
check("más de 50 -> 400", c.post("/ingesta/texto", json={"texto": "\n".join(f"Ana: m{i}" for i in range(51))}).status_code == 400)

print("\nRESULTADO:", "todo OK" if not fallos else f"{len(fallos)} fallas: {fallos}")
sys.exit(1 if fallos else 0)
