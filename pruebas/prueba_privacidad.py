"""Prueba de la minimización de datos hacia la IA (backend/privacidad.py).

No llama a Cohere: revisa lo que se le ENVIARÍA.

    python pruebas/prueba_privacidad.py

Qué comprueba:
  - Correos y teléfonos se enmascaran, sin tocar fechas, horas ni números cortos.
  - El prompt de análisis no incluye el nombre del autor.
  - El prompt de una FAQ no incluye el autor; el de un caso de éxito sí (su publicación
    exige el permiso de la persona en el panel).
"""
import os, sys, pathlib, types
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
os.environ.setdefault("COHERE_API_KEY", "prueba")
# Armar prompts no necesita OCI, MongoDB ni la red: se simulan esos módulos
def _falso(nombre, **attrs):
    m = types.ModuleType(nombre); m.__dict__.update(attrs); sys.modules.setdefault(nombre, m)
_falso("backend.cohere_uso"); _falso("backend.db")
_falso("backend.oci_storage", PREFIJO_CONFIG="config/", guardar_json=lambda *a: None, leer_json=lambda *a: {})
for externo, attrs in (("requests", {}), ("dotenv", {"load_dotenv": lambda *a, **k: None})):
    try: __import__(externo)
    except ImportError: _falso(externo, **attrs)

from backend.privacidad import enmascarar
from backend.analizador_sentimiento import _construir_prompt
from backend.generador_contenido import _datos

fallas = 0
def comprobar(nombre, cond):
    global fallas
    print(("ok    " if cond else "FALLA ") + " " + nombre)
    fallas += not cond

t = enmascarar("Escríbeme a ana.perez+cursos@gmail.com o al +52 55 1234 5678, (11) 98765-4321.")
comprobar("Correo enmascarado", "[correo]" in t and "gmail" not in t)
comprobar("Teléfonos enmascarados", t.count("[teléfono]") == 2 and "1234" not in t and "98765" not in t)
t = enmascarar("El 13/10/2026 a las 10:45 subí 3 ejercicios del módulo 2 de Python 3.12")
comprobar("Fechas, horas y números cortos intactos", "13/10/2026" in t and "10:45" in t and "3.12" in t)

p = _construir_prompt("Mariana Souza", "No me funciona pip, mi correo es mariana@ejemplo.com")
comprobar("Análisis sin nombre del autor", "Mariana" not in p and "Souza" not in p)
comprobar("Análisis con correo enmascarado", "mariana@ejemplo.com" not in p and "[correo]" in p)

m = {"autor": "Mariana Souza", "texto": "Conseguí empleo, llámenme al 5512345678", "tipo": "logro"}
comprobar("FAQ sin autor", "Mariana" not in _datos(m, con_autor=False))
comprobar("Caso de éxito con autor", "Mariana" in _datos(m))
comprobar("Teléfono enmascarado también al redactar", "5512345678" not in _datos(m))

print(f"\n{fallas} fallas." if fallas else "\nTodo bien.")
sys.exit(1 if fallas else 0)
