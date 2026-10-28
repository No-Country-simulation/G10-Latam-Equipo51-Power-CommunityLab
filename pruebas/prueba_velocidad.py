"""Mide el efecto de paralelizar y deduplicar las llamadas a Cohere.

    python pruebas/prueba_velocidad.py

No llama a Cohere: sustituye la petición por una espera fija. El número que sale
es el tiempo que se pierde esperando a la red, que es el cuello de botella real.
Las lecturas del bucket no se miden a propósito: son rápidas comparadas con la IA.
"""
import hashlib
import pathlib
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

LATENCIA = 1.5      # lo que tarda de verdad una llamada a Cohere
LOTE = 30           # mensajes del lote
REPETIDOS = 10      # de esos, cuántos son copias exactas

fallos = 0


def check(que, ok, extra=""):
    global fallos
    print(f"  {'OK  ' if ok else 'FALLA'} {que} {extra}")
    if not ok:
        fallos += 1


def _firma(i):
    crudo = "\u0000".join(str(i.get(k) or "") for k in ("texto", "tipo", "canal"))
    return hashlib.sha256(crudo.encode()).hexdigest()


# ---------------------------------------------------------------- /procesar
llamadas = 0


def analizar(_):
    global llamadas
    llamadas += 1
    time.sleep(LATENCIA)
    return {"ok": True}


inter = [{"texto": f"mensaje {k % (LOTE - REPETIDOS)}", "tipo": "x", "canal": "y"}
         for k in range(LOTE)]

llamadas = 0
t0 = time.perf_counter()
for i in inter:
    analizar(i)
antes, antes_ll = time.perf_counter() - t0, llamadas

from main import HILOS_IA          # noqa: E402  (se importa aquí para no exigir .env al leer el módulo)

llamadas = 0
t0 = time.perf_counter()
unicos = {}
for i in inter:
    unicos.setdefault(_firma(i), i)
with ThreadPoolExecutor(max_workers=HILOS_IA) as pool:
    list(pool.map(analizar, unicos.values()))
ahora, ahora_ll = time.perf_counter() - t0, llamadas

print(f"\n/procesar · {LOTE} mensajes ({REPETIDOS} repetidos) · {LATENCIA}s por llamada\n")
print(f"  ANTES  secuencial, sin dedup : {antes:6.1f} s · {antes_ll} llamadas")
print(f"  AHORA  {HILOS_IA} hilos + dedup        : {ahora:6.1f} s · {ahora_ll} llamadas")
print(f"\n  Mejora: {antes / ahora:.1f}x\n")
check("se ahorran las llamadas repetidas", ahora_ll == LOTE - REPETIDOS, f"({ahora_ll} de {LOTE})")
check("el lote va al menos 3x más rápido", antes / ahora >= 3, f"({antes / ahora:.1f}x)")

# ----------------------------------------------------------------- /generar
from backend import generador_contenido as G      # noqa: E402

llamadas = 0


def falsa(formato, mensaje, voz, mensajes=None, texto_previo=None):
    global llamadas
    llamadas += 1
    time.sleep(LATENCIA)
    return f"texto de {mensaje.get('autor')}"


G.generar_texto = falsa
unicos_g = [{"id": f"A{i}", "formato": "Post de LinkedIn",
             "mensaje": {"autor": f"P{i}", "texto": f"m{i}"}} for i in range(LOTE - REPETIDOS)]
copias = [{"id": f"B{i}", "formato": "Post de LinkedIn",
           "mensaje": dict(unicos_g[i]["mensaje"])} for i in range(REPETIDOS)]

llamadas = 0
t0 = time.perf_counter()
res, err = G.generar_lote(unicos_g + copias, {"texto": "", "chips": []})
seg_g = time.perf_counter() - t0

print(f"\n/generar · {LOTE} activos ({REPETIDOS} copias exactas)\n")
print(f"  ANTES  4 hilos, sin dedup    : {LOTE * LATENCIA / 4:6.1f} s · {LOTE} llamadas")
print(f"  AHORA  {G.HILOS_GENERACION} hilos + dedup        : {seg_g:6.1f} s · {llamadas} llamadas")
print()
check("todos los activos reciben texto", len(res) == LOTE, f"({len(res)} de {LOTE})")
check("las copias reutilizan el original",
      all(res.get(f"B{i}") == res.get(f"A{i}") for i in range(REPETIDOS)))
check("no se pide dos veces lo mismo", llamadas == LOTE - REPETIDOS, f"({llamadas})")
check("ningún activo quedó con error", not err, str(err)[:60])

print(f"\n{'TODO BIEN' if not fallos else str(fallos) + ' FALLAS'}\n")
sys.exit(1 if fallos else 0)
