"""Autenticación local: sin dominio, sin HTTPS, sin dependencias nuevas.

Cómo funciona
-------------
- Los usuarios viven en un archivo JSON (`AUTH_USERS_FILE`, por defecto
  `data/usuarios.json`, fuera de git) con la contraseña como hash PBKDF2-SHA256.
- `POST /auth/login` valida usuario y contraseña y entrega una cookie de sesión
  firmada con HMAC (`AUTH_SECRET`). La cookie es HttpOnly y SameSite=Strict.
- Un middleware exige esa cookie en TODA la API salvo `/auth/*`.
- Intentos fallidos: 5 por IP+usuario y se bloquea 60 s (nginx añade su propio límite).

La cookie NO lleva el flag `Secure` por defecto, porque el acceso es por
http://localhost. Si algún día pones HTTPS: `AUTH_COOKIE_SECURE=true`.

Administrar usuarios (desde la raíz del repo, con el venv activo)
------------------------------------------------------------------
    python -m backend.auth crear <usuario>     # pide la contraseña; también cambia una existente
    python -m backend.auth listar
    python -m backend.auth borrar <usuario>

`crear` genera `AUTH_SECRET` en `.env` si todavía no existe.
Cambiar `AUTH_SECRET` invalida todas las sesiones abiertas.
"""

import argparse
import base64
import getpass
import hashlib
import hmac
import json
import logging
import os
import secrets
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

log = logging.getLogger("uvicorn.error")

USERS_FILE = Path(os.getenv("AUTH_USERS_FILE", "data/usuarios.json"))
SESSION_HORAS = int(os.getenv("AUTH_SESSION_HOURS", "12"))
COOKIE_NAME = "im_sesion"
COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "false").strip().lower() == "true"

PBKDF2_ITER = 240_000
MAX_FALLOS = 5
BLOQUEO_SEG = 60

# Prefijos que NO exigen sesión. main.py agrega "/ui" si se sirve el front desde FastAPI.
RUTAS_PUBLICAS = ["/auth"]

_SECRET = os.getenv("AUTH_SECRET")
if not _SECRET:
    _SECRET = secrets.token_hex(32)
    if __name__ != "__main__":   # en la CLI no tiene sentido avisar
        log.warning(
            "AUTH_SECRET no está definido: se usa una clave temporal y las sesiones "
            "se pierden al reiniciar. Ejecuta: python -m backend.auth crear <usuario>"
        )


# ---------------------------------------------------------------- contraseñas

def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_password(password: str, iteraciones: int = PBKDF2_ITER) -> str:
    sal = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), sal, iteraciones)
    return f"pbkdf2_sha256${iteraciones}${_b64e(sal)}${_b64e(h)}"


def verificar_password(password: str, almacenado: str) -> bool:
    try:
        algoritmo, it, sal, esperado = almacenado.split("$")
        if algoritmo != "pbkdf2_sha256":
            return False
        h = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(sal), int(it))
        return hmac.compare_digest(h, _b64d(esperado))
    except Exception:
        return False


# Hash de relleno: si el usuario no existe se calcula igual, para no delatarlo por tiempo.
_HASH_RELLENO = hash_password(secrets.token_hex(8))


# -------------------------------------------------------------------- usuarios

def _cargar_usuarios() -> dict[str, str]:
    try:
        datos = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        return {k.lower(): v for k, v in datos.get("usuarios", {}).items()}
    except FileNotFoundError:
        return {}
    except Exception as e:
        log.error("No se pudo leer %s: %s", USERS_FILE, e)
        return {}


def _guardar_usuarios(usuarios: dict[str, str]) -> None:
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = USERS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"usuarios": usuarios}, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(USERS_FILE)


# ---------------------------------------------------------------------- sesión

def _firmar(payload: str) -> str:
    return _b64e(hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).digest())


def crear_token(usuario: str) -> str:
    payload = _b64e(json.dumps({"u": usuario, "exp": int(time.time()) + SESSION_HORAS * 3600}).encode())
    return f"{payload}.{_firmar(payload)}"


def leer_token(token: str | None) -> str | None:
    """Devuelve el usuario si el token es válido y no venció; si no, None."""
    if not token or "." not in token:
        return None
    payload, firma = token.rsplit(".", 1)
    if not hmac.compare_digest(firma, _firmar(payload)):
        return None
    try:
        datos = json.loads(_b64d(payload))
        if datos["exp"] < time.time():
            return None
        usuario = datos["u"]
    except Exception:
        return None
    # Si borraste al usuario, su sesión muere aunque la cookie siga vigente.
    return usuario if usuario in _cargar_usuarios() else None


def usuario_actual(request: Request) -> str | None:
    return leer_token(request.cookies.get(COOKIE_NAME))


async def middleware_sesion(request: Request, call_next):
    """Exige sesión en toda la API, salvo las rutas públicas."""
    ruta = request.url.path
    if request.method == "OPTIONS" or any(ruta == p or ruta.startswith(p + "/") for p in RUTAS_PUBLICAS):
        return await call_next(request)
    usuario = usuario_actual(request)
    if not usuario:
        return JSONResponse({"detail": "No autenticado"}, status_code=401)
    request.state.usuario = usuario
    return await call_next(request)


# --------------------------------------------------------- límite de intentos

_FALLOS: dict[str, tuple[int, float]] = {}


def _ip(request: Request) -> str:
    ip = request.client.host if request.client else "?"
    if ip in ("127.0.0.1", "::1"):            # uvicorn solo escucha en loopback: lo que llega es nginx
        ip = request.headers.get("x-real-ip", ip)
    return ip


def _bloqueado(clave: str) -> bool:
    n, hasta = _FALLOS.get(clave, (0, 0.0))
    return n >= MAX_FALLOS and time.time() < hasta


def _registrar_fallo(clave: str) -> None:
    n, hasta = _FALLOS.get(clave, (0, 0.0))
    if time.time() >= hasta:
        n = 0
    _FALLOS[clave] = (n + 1, time.time() + BLOQUEO_SEG)


# ------------------------------------------------------------------------ rutas

router = APIRouter(prefix="/auth", tags=["auth"])


class Credenciales(BaseModel):
    usuario: str
    password: str


@router.post("/login")
def login(datos: Credenciales, request: Request, response: Response):
    usuario = datos.usuario.strip().lower()
    clave = f"{_ip(request)}|{usuario}"
    if _bloqueado(clave):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera un minuto.")

    almacenado = _cargar_usuarios().get(usuario)
    coincide = verificar_password(datos.password, almacenado or _HASH_RELLENO)
    if not (almacenado and coincide):
        _registrar_fallo(clave)
        log.warning("Login fallido: usuario=%r ip=%s", usuario, _ip(request))
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    _FALLOS.pop(clave, None)
    response.set_cookie(
        COOKIE_NAME, crear_token(usuario),
        max_age=SESSION_HORAS * 3600, httponly=True, samesite="strict",
        secure=COOKIE_SECURE, path="/",
    )
    return {"usuario": usuario}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "exito"}


@router.get("/me")
def me(request: Request):
    usuario = usuario_actual(request)
    if not usuario:
        raise HTTPException(status_code=401, detail="No autenticado")
    return {"usuario": usuario}


# -------------------------------------------------------------------------- CLI

def _asegurar_secret() -> None:
    env = Path(".env")
    texto = env.read_text(encoding="utf-8") if env.exists() else ""
    if any(l.strip().startswith("AUTH_SECRET=") and l.split("=", 1)[1].strip() for l in texto.splitlines()):
        return
    sep = "" if not texto or texto.endswith("\n") else "\n"
    with env.open("a", encoding="utf-8") as f:
        f.write(f"{sep}AUTH_SECRET={secrets.token_hex(32)}\n")
    os.chmod(env, 0o600)
    print("AUTH_SECRET generado en .env (reinicia el servicio para que lo use).")


def _cli() -> int:
    ap = argparse.ArgumentParser(prog="python -m backend.auth", description="Administra usuarios de InsightMind")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nombre in ("crear", "borrar"):
        sub.add_parser(nombre).add_argument("usuario")
    sub.add_parser("listar")
    args = ap.parse_args()

    usuarios = _cargar_usuarios()

    if args.cmd == "listar":
        print("\n".join(sorted(usuarios)) or "(sin usuarios)")
        return 0

    usuario = args.usuario.strip().lower()
    if args.cmd == "borrar":
        if usuarios.pop(usuario, None) is None:
            print(f"No existe el usuario {usuario!r}")
            return 1
        _guardar_usuarios(usuarios)
        print(f"Usuario {usuario!r} eliminado")
        return 0

    pw = getpass.getpass("Contraseña (mín. 8 caracteres): ")
    if len(pw) < 8:
        print("La contraseña debe tener al menos 8 caracteres")
        return 1
    if pw != getpass.getpass("Repite la contraseña: "):
        print("Las contraseñas no coinciden")
        return 1
    existia = usuario in usuarios
    usuarios[usuario] = hash_password(pw)
    _guardar_usuarios(usuarios)
    _asegurar_secret()
    print(f"Usuario {usuario!r} {'actualizado' if existia else 'creado'} en {USERS_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
