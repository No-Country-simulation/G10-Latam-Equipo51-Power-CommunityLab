#!/usr/bin/env bash
# Carga a MongoDB lo que ya está en el bucket y muestra qué verá el Panorama. No pide usuario ni contraseña.
# Uso (desde la raíz del repo):  ./deploy/sincronizar_mongo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PY=python3; [[ -x venv/bin/python ]] && PY=venv/bin/python
exec "$PY" -m backend.sync_mongo
