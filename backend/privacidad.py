"""Minimización de datos antes de enviar texto a un proveedor de IA (Cohere).

Principio: a Cohere solo le llega lo necesario para la tarea.
  - Correos y teléfonos se sustituyen por marcadores ([correo], [teléfono]) en todo texto
    que sale hacia la IA. El texto original no se modifica en el bucket.
  - El nombre del autor no se envía para analizar (no cambia el sentimiento ni la relevancia)
    ni para redactar FAQs (que se publican sin nombres). Solo viaja en casos de éxito y en el
    newsletter, cuya publicación exige confirmar el permiso de la persona en el panel.

Ver docs/legal/README.md.
"""

import re

# usuario@dominio.tld
_CORREO = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Secuencias de 8 o más dígitos, con espacios, puntos, guiones o paréntesis opcionales
# y prefijo internacional opcional: +52 55 1234 5678, (11) 98765-4321, 5512345678
_TELEFONO = re.compile(r"(?<![\w/])(?:\+?\d[\s().-]*){8,}(?![\w/])")


def enmascarar(texto: str | None) -> str:
    """Sustituye correos y teléfonos por marcadores. Devuelve '' si no hay texto."""
    if not texto:
        return ""
    texto = _CORREO.sub("[correo]", str(texto))
    return _TELEFONO.sub(lambda m: "[teléfono]" + (" " if m.group(0).endswith(" ") else ""), texto)
