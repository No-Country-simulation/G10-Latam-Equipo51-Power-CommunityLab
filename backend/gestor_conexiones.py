import os
import json
import requests

ESTADOS_INICIALES = {
    "discord": {"nombre": "Discord (Comunidad G10)", "on": True, "tipo": "Chat / Ingestión", "cuenta": "Canal #general", "color": "#5865F2", "ini": "DI", "modo": "Webhook activo"},
    "slack": {"nombre": "Slack Oficial", "on": False, "tipo": "Chat / Soporte", "cuenta": "Workspace G10", "color": "#4A154B", "ini": "SL", "modo": "Desconectado"},
    "linkedin": {"nombre": "LinkedIn Page", "on": True, "tipo": "Publicación Automática", "cuenta": "CommunityLab Page", "color": "#0A66C2", "ini": "LI", "modo": "Modo asistido"},
    "twitter": {"nombre": "X (Twitter)", "on": False, "tipo": "Publicación Corta", "cuenta": "@CommunityLab", "color": "#000000", "ini": "X", "modo": "Desconectado"},
    "github": {"nombre": "GitHub Repositories", "on": True, "tipo": "Ingestión de Proyectos", "cuenta": "org/community-lab", "color": "#24292e", "ini": "GH", "modo": "API v3 Activa"}
}

CONFIG_FILE = "conexiones_config.json"

def verificar_conexion_github() -> bool:
    """Verificación real contra la API de GitHub si existe un token."""
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return False
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get("https://api.github.com/user", headers=headers, timeout=5)
        return response.status_code == 200
    except Exception:
        return False

def obtener_conexiones():
    conexiones = ESTADOS_INICIALES
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                conexiones = json.load(f)
        except Exception:
            pass
            
    # Validación con GitHub
    if "github" in conexiones and conexiones["github"]["on"]:
        token_valido = verificar_conexion_github()
        # Validación Token Github
        if os.getenv("GITHUB_TOKEN"):
            conexiones["github"]["on"] = token_valido

    return conexiones

def cambiar_estado_conexion(plataforma: str, conectar: bool):
    conexiones = obtener_conexiones()
    if plataforma in conexiones:
        # Validación de token de GitHub al conectar
        if plataforma == "github" and conectar:
            if not os.getenv("GITHUB_TOKEN"):
                return {"status": "error", "mensaje": "Falta configurar la variable de entorno GITHUB_TOKEN para conectar GitHub de forma real."}
            if not verificar_conexion_github():
                return {"status": "error", "mensaje": "El token de GitHub proporcionado no es válido o expiró."}

        conexiones[plataforma]["on"] = conectar
        conexiones[plataforma]["modo"] = "Conectado vía API" if conectar else "Desconectado"
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(conexiones, f, indent=4, ensure_ascii=False)
            return {"status": "exito", "plataforma": plataforma, "on": conectar}
        except Exception as e:
            return {"status": "error", "mensaje": str(e)}
            
    return {"status": "error", "mensaje": f"Plataforma '{plataforma}' no encontrada"}