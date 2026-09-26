#!/usr/bin/env python3
"""Junta index.html + css + js en un solo archivo, para compartir el prototipo por link."""
import re, pathlib
raiz = pathlib.Path(__file__).parent
html = (raiz/"index.html").read_text()
css  = (raiz/"css/styles.css").read_text()
js   = "\n".join((raiz/f"js/{f}").read_text() for f in ["api.js","datos-ejemplo.js","app.js"])

html = re.sub(r'<link rel="stylesheet" href="css/styles.css">', f"<style>\n{css}\n</style>", html)
html = re.sub(r'<script src="js/[^"]+"></script>\s*', "", html)
html = html.replace("</body>", f"<script>\n{js}\n</script>\n</body>")
salida = raiz.parent/"InsightMind2.0-html-css-js.html"
salida.write_text(html)
print(f"{salida} · {len(html)//1024} KB")
