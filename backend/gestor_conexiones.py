import os
import json
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from requests_oauthlib import OAuth1

router = APIRouter()

ESTADOS_INICIALES = {
    "discord": {"nombre": "Discord (InsightMind G10)", "on": False, "tipo": "Chat / Ingestión", "cuenta": "Canal #general", "color": "#5865F2", "ini": "DI", "modo": "Desconectado"},
    "slack": {"nombre": "Slack Oficial", "on": False, "tipo": "Chat / Soporte", "cuenta": "InsightMind G10", "color": "#4A154B", "ini": "SL", "modo": "Desconectado"},
    "linkedin": {"nombre": "LinkedIn Page", "on": False, "tipo": "Publicación Automática", "cuenta": "InsightMind G10", "color": "#0A66C2", "ini": "LI", "modo": "Desconectado"},
    "x": {"nombre": "X (Twitter)", "on": False, "tipo": "Publicación Corta", "cuenta": "@insightmindg10", "color": "#000000", "ini": "X", "modo": "Desconectado"},
    "web": {"nombre": "Web de la comunidad", "on": True, "tipo": "Landing · sección FAQs", "cuenta": "Landing de Insight Mind", "color": "#20b2aa", "ini": "WEB", "modo": "Conectado a la landing"},
    "newsletter": {"nombre": "Newsletter", "on": True, "tipo": "Landing · sección Newsletter", "cuenta": "Landing de Insight Mind", "color": "#ff8c00", "ini": "NL", "modo": "Conectado a la landing"}
}

# Creamos el archivo conexiones_config.json si no existe, con los estados iniciales
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "conexiones_config.json")


def verificar_conexion_discord() -> bool:
    """Verificación real enviando un mensaje de prueba a un Webhook de Discord."""
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        print("[LOG DISCORD] No se encontró DISCORD_WEBHOOK_URL en las variables de entorno.")
        return False
        
    try:
        print("[LOG DISCORD] Enviando ping de prueba al Webhook de Discord...")
        payload = {
            "content": " **InsightMind G10**: Conexión de canal verificada con éxito."
        }
        response = requests.post(webhook_url, json=payload, timeout=5)
        
        print(f"[LOG DISCORD]  Código de respuesta HTTP: {response.status_code}")
        
        # Discord Webhooks devuelven 204 No Content cuando el mensaje se envía correctamente
        if response.status_code in [200, 204]:
            print("[LOG DISCORD] ¡Conexión real exitosa con Discord!")
            return True
        else:
            print(f"[LOG DISCORD] Falló la conexión. Respuesta: {response.text}")
            return False
            
    except Exception as e:
        print(f"[LOG DISCORD] Excepción de red al conectar con Discord: {e}")
        return False

def verificar_conexion_slack() -> bool:
    """Verificación real enviando un mensaje de prueba a un Webhook de Slack."""
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        print("[LOG SLACK] No se encontró SLACK_WEBHOOK_URL en las variables de entorno.")
        return False
        
    try:
        print("[LOG SLACK] Enviando ping de prueba al Webhook de Slack...")
        payload = {
            "text": " *InsightMind G10*: Conexión de Slack verificada con éxito."
        }
        response = requests.post(webhook_url, json=payload, timeout=5)
        
        print(f"[LOG SLACK]  Código de respuesta HTTP: {response.status_code}")
        
        if response.status_code == 200 and response.text.strip() == "ok":
            print("[LOG SLACK]  ¡Conexión real exitosa con Slack!")
            return True
        else:
            print(f"[LOG SLACK]  Falló la conexión. Respuesta: {response.text}")
            return False
            
    except Exception as e:
        print(f"[LOG SLACK] Excepción de red al conectar con Slack: {e}")
        return False



def verificar_conexion_x() -> bool:
    """Verificación real contra la API v2 de X (Twitter) usando credenciales OAuth 1.a."""
    api_key = os.getenv("TWITTER_API_KEY")
    api_secret = os.getenv("TWITTER_API_SECRET")
    access_token = os.getenv("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
    
    if not all([api_key, api_secret, access_token, access_token_secret]):
        print("[LOG X]  Faltan credenciales de X (Twitter) en las variables de entorno.")
        return False
        
    try:
        print("[LOG X] Verificando credenciales con la API de X (/2/users/me)...")
        
        auth = OAuth1(api_key, api_secret, access_token, access_token_secret)
        url = "https://api.twitter.com/2/users/me"
        response = requests.get(url, auth=auth, timeout=5)
        
        print(f"[LOG X] Código de respuesta HTTP: {response.status_code}")
        
        if response.status_code == 200:
            datos = response.json().get("data", {})
            username = datos.get("username", "Desconocido")
            print(f"[LOG X] ¡Conexión real exitosa con X! Usuario: @{username}")
            return True
        else:
            print(f"[LOG X] Falló la autenticación. Respuesta: {response.text}")
            return False
            
    except Exception as e:
        print(f"[LOG X] Excepción de red al conectar con X: {e}")
        return False

def verificar_conexion_linkedin() -> bool:
    """Verificación real contra la API de LinkedIn usando un Access Token."""
    token = os.getenv("LINKEDIN_ACCESS_TOKEN")
    
    if not token:
        print("[LOG LINKEDIN] No se encontró LINKEDIN_ACCESS_TOKEN en las variables de entorno.")
        print("[LOG LINKEDIN] Faltan credenciales de LinkedIn en las variables de entorno.")
        return False
        
    try:
        print("[LOG LINKEDIN] Verificando token con la API de LinkedIn...")
        headers = {"Authorization": f"Bearer {token}"}
        # Usamos el endpoint estándar de OpenID Connect / perfil de LinkedIn
        url = "https://api.linkedin.com/v2/userinfo"
        response = requests.get(url, headers=headers, timeout=5)
        
        print(f"[LOG LINKEDIN] Código de respuesta HTTP: {response.status_code}")
        
        if response.status_code == 200:
            datos = response.json()
            nombre = datos.get("name", "Usuario")
            print(f"[LOG LINKEDIN] ¡Conexión real exitosa con LinkedIn! Hola, {nombre}")
            return True
        else:
            print(f"[LOG LINKEDIN] Falló la autenticación en LinkedIn. Respuesta: {response.text}")
            return False
            
    except Exception as e:
        print(f"[LOG LINKEDIN] Excepción de red al conectar con LinkedIn: {e}")
        return False


def obtener_conexiones():
    conexiones = ESTADOS_INICIALES
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                conexiones = json.load(f)
        except Exception:
            pass
            
    return conexiones


def cambiar_estado_conexion(plataforma: str, conectar: bool):
    conexiones = obtener_conexiones()
    
    if plataforma not in conexiones:
        return {"status": "error", "mensaje": f"Plataforma '{plataforma}' no encontrada"}

    # Si se quiere conectar, ejecutamos la validación específica según la plataforma
    if conectar:
        validadores = {
            "discord": lambda: (
                None if os.getenv("DISCORD_WEBHOOK_URL") else "Falta configurar la variable de entorno DISCORD_WEBHOOK_URL.",
                None if verificar_conexion_discord() else "No se pudo verificar el Webhook de Discord. Comprueba la URL."
            ),
            "slack": lambda: (
                None if os.getenv("SLACK_WEBHOOK_URL") else "Falta configurar la variable de entorno SLACK_WEBHOOK_URL.",
                None if verificar_conexion_slack() else "No se pudo verificar el Webhook de Slack. Comprueba la URL."
            ),
            "x": lambda: (
                None if os.getenv("TWITTER_API_KEY") else "Faltan credenciales de la API de X.",
                None if verificar_conexion_x() else "No se pudo autenticar con X. Revisa tus llaves."
            ),
            "linkedin": lambda: (
                None if os.getenv("LINKEDIN_ACCESS_TOKEN") else "Faltan credenciales de LinkedIn en las variables de entorno.",
                None if verificar_conexion_linkedin() else "No se pudo autenticar con LinkedIn. Revisa tu token."
            )
        }

        # Si la plataforma tiene una regla de validación, la ejecutamos
        if plataforma in validadores:
            for error in validadores[plataforma]():
                if error:  # Si encuentra un mensaje de error, lo retorna inmediatamente
                    return {"status": "error", "mensaje": error}

    # Si pasa las validaciones (o si es una plataforma que solo se activa sin validación estricta)
    conexiones[plataforma]["on"] = conectar
    conexiones[plataforma]["modo"] = "Conectado vía API" if conectar else "Desconectado"
    
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(conexiones, f, indent=4, ensure_ascii=False)
        return {"status": "exito", "plataforma": plataforma, "on": conectar}
    except Exception as e:
        return {"status": "error", "mensaje": str(e)}