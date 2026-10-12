#!/usr/bin/env bash
# Publica el front en nginx y deja nginx -> uvicorn listo en localhost (Oracle Linux 9 / RHEL 9).
# Idempotente: vuelve a ejecutarlo cada vez que cambies el front o la config de nginx.
# Uso (desde la raíz del repo):  ./deploy/desplegar.sh [--systemd]
#   --systemd  instala/actualiza también la unidad insightmind.service (usa el usuario y la ruta actuales)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WEB=/var/www/insightmind

command -v nginx >/dev/null || sudo dnf install -y nginx

# Front: solo lo que necesita el navegador (sin mockups, README ni build.py)
sudo mkdir -p "$WEB"
sudo rm -rf "$WEB"/index.html "$WEB"/css "$WEB"/js
sudo cp -r "$REPO"/frontend/insightmind-v2/{index.html,css,js} "$WEB/"
sudo restorecon -R "$WEB" 2>/dev/null || true

# SELinux: permite que nginx haga proxy a uvicorn
if command -v setsebool >/dev/null; then sudo setsebool -P httpd_can_network_connect 1; fi

sudo cp "$REPO/deploy/nginx/insightmind.conf" /etc/nginx/conf.d/insightmind.conf
# Nota: no se abre el puerto 80 en firewalld; el sitio solo responde en localhost.

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

if [[ "${1:-}" == "--systemd" ]]; then
  sed -e "s|^User=.*|User=$(id -un)|" -e "s|/opt/insightmind|$REPO|g" \
    "$REPO/deploy/systemd/insightmind.service" | sudo tee /etc/systemd/system/insightmind.service >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable --now insightmind
  sudo systemctl restart insightmind
fi

echo
echo "Listo: http://localhost/   (API interna: 127.0.0.1:8000, solo vía nginx en /api/)"
echo "Primer usuario:  cd $REPO && source venv/bin/activate && python -m backend.auth crear <usuario>"
