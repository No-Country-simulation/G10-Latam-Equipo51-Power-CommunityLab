"""Prueba de las conexiones "Web de la comunidad" (FAQs) y "Newsletter" hacia la landing.

No necesita OCI ni red: usa un conexiones_config.json temporal.

    python pruebas/prueba_conexiones.py

Qué comprueba:
  - Sin archivo, web y newsletter vienen conectadas y con enlace a la landing.
  - Un conexiones_config.json viejo (web/newsletter apagadas, "Mailchimp", etc.) NO las desconecta.
  - Desvincular a mano se respeta (manual) y volver a conectar también.
  - Las demás plataformas siguen leyéndose del archivo, y el diccionario base no se muta.
"""
import sys, json, pathlib, tempfile, os
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from backend import gestor_conexiones as g

tmp = tempfile.mkdtemp()
g.CONFIG_FILE = os.path.join(tmp, "conexiones_config.json")

errores = []
def comprobar(cond, msg):
    print(("ok   " if cond else "FALLA") + "  " + msg)
    if not cond: errores.append(msg)

# 1) sin archivo
c = g.obtener_conexiones()
comprobar(c["web"]["on"] and c["newsletter"]["on"], "Sin archivo: web y newsletter conectadas")
comprobar(c["web"]["url"] == "/landing/#faqs" and c["newsletter"]["url"] == "/landing/#newsletter", "Enlaces a la landing")

# 2) archivo viejo (el que está commiteado en el repo)
viejo = json.load(open(pathlib.Path(__file__).resolve().parent.parent / "backend" / "conexiones_config.json", encoding="utf-8"))
comprobar(viejo["web"]["on"] is False and viejo["newsletter"]["on"] is False, "(el archivo del repo las trae apagadas)")
json.dump(viejo, open(g.CONFIG_FILE, "w", encoding="utf-8"))
c = g.obtener_conexiones()
comprobar(c["web"]["on"] and c["newsletter"]["on"], "Archivo viejo: siguen conectadas")
comprobar(c["web"]["cuenta"] == "Landing de Insight Mind" and c["newsletter"]["cuenta"] == "Landing de Insight Mind",
          "Archivo viejo: datos de la landing, no 'Mailchimp' ni 'ayuda.one-g10.dev'")
comprobar(c["linkedin"]["on"] is True and c["slack"]["on"] is False, "Otras plataformas: se leen del archivo")

# 3) desvincular a mano y volver a conectar
r = g.cambiar_estado_conexion("web", False)
comprobar(r["status"] == "exito" and g.obtener_conexiones()["web"]["on"] is False, "Desvincular web se respeta")
comprobar(g.obtener_conexiones()["newsletter"]["on"] is True, "Newsletter no se afecta")
r = g.cambiar_estado_conexion("web", True)
c = g.obtener_conexiones()
comprobar(c["web"]["on"] and c["web"]["modo"] == "Conectado a la landing", "Reconectar web: vuelve a la landing")

# 4) el diccionario base no se muta
g.cambiar_estado_conexion("newsletter", False)
comprobar(g.ESTADOS_INICIALES["newsletter"]["on"] is True and "manual" not in g.ESTADOS_INICIALES["newsletter"],
          "ESTADOS_INICIALES intacto")

print()
if errores:
    print("Fallaron %d comprobaciones." % len(errores)); sys.exit(1)
print("Todo bien.")
