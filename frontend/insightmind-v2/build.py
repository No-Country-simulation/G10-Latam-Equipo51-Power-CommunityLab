#!/usr/bin/env python3
"""Junta index.html + css + js en un solo archivo, para compartir el prototipo por link.

El orden de los js importa y es el mismo que en index.html:
datos-dashboard.js usa ruta() de datos-ejemplo.js al construir su serie, y
app.js llama a visualizarDashboard() de dashboard.js al arrancar.

Escribe SIEMPRE sobre frontend/InsightMind2.0-html-css-js.html. No genera
archivos nuevos: ese es el único build y se sobreescribe.
"""
import re, pathlib
raiz = pathlib.Path(__file__).parent
html = (raiz/"index.html").read_text(encoding="utf-8")
css  = (raiz/"css/styles.css").read_text(encoding="utf-8")
js   = "\n".join((raiz/f"js/{f}").read_text(encoding="utf-8") for f in ["api.js","datos-ejemplo.js","datos-dashboard.js","dashboard.js","app.js"])

html = re.sub(r'<link rel="stylesheet" href="css/styles.css">', f"<style>\n{css}\n</style>", html)
html = re.sub(r'<script src="js/[^"]+"></script>\s*', "", html)
html = html.replace("</body>", f"<script>\n{js}\n</script>\n</body>")
salida = raiz.parent/"InsightMind2.0-html-css-js.html"
salida.write_text(html, encoding="utf-8")
print(f"{salida} · {len(html)//1024} KB")
