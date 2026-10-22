import os
import re
import httpx
import urllib.parse

async def publicar_en_redes(texto: str, plataforma: str):
    """Lógica de negocio pura para enviar contenido a LinkedIn o retornar el modo asistido para X."""
    print(f"--> [BACKEND] Intentando publicar en {plataforma}...")
    try:
        if plataforma == "linkedin":
            token = os.getenv("LINKEDIN_ACCESS_TOKEN")
            org_id = os.getenv("LINKEDIN_ORG_ID")
            
            if not token:
                return {"success": False, "error": "Falta LINKEDIN_ACCESS_TOKEN en el .env"}
            
            # Si configuraste el ID de organización, publicamos a nombre de la empresa
            if org_id:
                author_urn = f"urn:li:organization:{org_id.strip()}"
                print(f"--> [LINKEDIN] Publicando como Organización: {author_urn}")
            else:
                # Fallback al perfil personal si no hay org_id
                async with httpx.AsyncClient() as client:
                    perfil_res = await client.get("https://api.linkedin.com/v2/userinfo", headers={"Authorization": f"Bearer {token}"})
                    if perfil_res.status_code != 200:
                        return {"success": False, "error": f"Token de LinkedIn inválido o expirado ({perfil_res.status_code})"}
                    sub_id = perfil_res.json().get("sub")
                    author_urn = f"urn:li:person:{sub_id}"
                    print(f"--> [LINKEDIN] Publicando como Perfil Personal: {author_urn}")

            url = "https://api.linkedin.com/v2/ugcPosts"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0"
            }
            payload = {
                "author": author_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": texto},
                        "shareMediaCategory": "NONE"
                    }
                },
                "visibility": {
                    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code in [200, 201]:
                    mensaje_exito = "Publicado con éxito en la organización de LinkedIn" if org_id else "Publicado con éxito en tu perfil de LinkedIn"
                    return {"success": True, "mensaje": mensaje_exito}
                else:
                    return {"success": False, "error": f"Error LinkedIn ({response.status_code}): {response.text}"}

        elif plataforma == "x":
            texto_limpio = texto.strip()
            if len(texto_limpio) > 280:
                texto_limpio = texto_limpio[:277].rstrip() + "…"
            
            intent_url = f"https://twitter.com/intent/tweet?text={urllib.parse.quote(texto_limpio)}"
            
            return {
                "success": True,
                "modo_asistido": True,
                "url_destino": intent_url,
                "mensaje": "Abriendo compositor de X"
            }

        else:
            return {"success": False, "error": f"Plataforma '{plataforma}' no soportada"}

    except Exception as e:
        return {"success": False, "error": str(e)}