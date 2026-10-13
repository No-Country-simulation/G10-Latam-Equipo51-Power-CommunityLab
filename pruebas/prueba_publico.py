"""Prueba de los endpoints públicos (/publico/faqs y /publico/newsletter) contra un bucket falso.

No necesita OCI ni credenciales: se reemplaza backend.oci_storage por un bucket en memoria
con curadurías de la forma EXACTA que escribe backend/curaduria.py.

    python pruebas/prueba_publico.py

Qué comprueba:
  - Solo salen activos con estado "Publicado" y del formato pedido.
  - No salen tickets ni `fuente_detalle` (autor y texto del mensaje de la comunidad).
  - Una curaduría ilegible no tumba la respuesta.
  - Guardar una curaduría invalida la caché: lo recién publicado aparece al instante.
"""
import sys, pathlib, types
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

# --- bucket falso en lugar de OCI ---
BUCKET = {}
falso = types.ModuleType("backend.oci_storage")
falso.PREFIJO_CURADURIA = "activos/"
falso.listar_objetos = lambda prefijo=None: [types.SimpleNamespace(name=n) for n in BUCKET if n.startswith(prefijo or "")]
def _leer(nombre):
    v = BUCKET[nombre]
    if isinstance(v, Exception): raise v
    return v
falso.leer_json = _leer
sys.modules["backend.oci_storage"] = falso

from fastapi import Response
from backend import rutas_publico as pub

def activo(id_, formato, estado, texto="**¿Pregunta?**\n1. Paso", publicado=None):
    return {"id": id_, "formato": formato, "estado": estado, "texto": texto, "publicado": publicado,
            "huella": "h", "editado": False,
            "fuente_detalle": {"archivo": "m1.json", "interaccion": {"autor": "Ana", "texto": "privado"}}}

BUCKET["activos/2026-semana-40/curaduria.json"] = {
    "slug": "2026-semana-40", "periodo_referencia": "Semana_40",
    "activos": [
        activo("A1", "Tip / FAQ", "Publicado", publicado="2026-10-06T15:00:00Z"),
        activo("A2", "Tip / FAQ", "Listo"),
        activo("A3", "Post de LinkedIn", "Publicado"),
        activo("A4", "Destaque de newsletter", "Publicado", texto="## Semana 40\n\n**Logro**\nAlgo"),
    ],
    "tickets": [{"id": "T1", "estado": "Abierto"}],
}
BUCKET["activos/2026-semana-41/curaduria.json"] = {
    "slug": "2026-semana-41", "periodo_referencia": "Semana_41",
    "activos": [activo("A1", "Tip / FAQ", "Pendiente")],
}
BUCKET["activos/roto/curaduria.json"] = ValueError("JSON ilegible")
BUCKET["activos/2026-semana-40/otro.json"] = {"no": "es curaduría"}

errores = []
def comprobar(cond, msg):
    print(("ok   " if cond else "FALLA") + "  " + msg)
    if not cond: errores.append(msg)

faqs = pub.faqs_publicadas(Response())
comprobar(len(faqs) == 1 and faqs[0]["slug"] == "2026-semana-40", "FAQs: una curaduría con publicados")
comprobar([a["id"] for a in faqs[0]["activos"]] == ["A1"], "FAQs: solo el Tip / FAQ publicado")
comprobar("fuente_detalle" not in faqs[0]["activos"][0] and "huella" not in faqs[0]["activos"][0], "FAQs: sin datos internos del activo")
comprobar("tickets" not in faqs[0], "FAQs: sin tickets")
comprobar(faqs[0]["activos"][0]["publicado"] == "2026-10-06T15:00:00Z", "FAQs: conserva la fecha de publicación")

news = pub.newsletter_publicada(Response())
comprobar([a["id"] for a in news[0]["activos"]] == ["A4"], "Newsletter: solo el destaque publicado")

# Publicar algo nuevo: sin invalidar sigue la caché; al invalidar aparece
BUCKET["activos/2026-semana-41/curaduria.json"] = {   # un PUT reescribe el objeto completo
    "slug": "2026-semana-41", "periodo_referencia": "Semana_41",
    "activos": [activo("A1", "Tip / FAQ", "Publicado", publicado="2026-10-13T10:00:00Z")],
}
comprobar(len(pub.faqs_publicadas(Response())) == 1, "Caché: sin invalidar no relee el bucket")
pub.invalidar_cache()
comprobar(len(pub.faqs_publicadas(Response())) == 2, "Caché: invalidar muestra lo recién publicado")

print("\n" + ("Todo bien." if not errores else f"{len(errores)} fallas."))
sys.exit(1 if errores else 0)
