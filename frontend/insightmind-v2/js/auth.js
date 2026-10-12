/* Puerta de acceso del panel.
   1. Pregunta a la API (GET /auth/me) si ya hay sesión.
   2. Sin sesión, muestra el login; con sesión, carga el resto de los scripts.
   La API exige la cookie en todas las rutas: esta pantalla es solo la cara visible. */

const Auth = (() => {
  /* Mismo orden que tenían en index.html: dashboard.js usa datos-ejemplo.js y app.js usa dashboard.js. */
  const SCRIPTS = ["js/datos-ejemplo.js", "js/datos-dashboard.js", "js/dashboard.js", "js/app.js"];
  const $ = id => document.getElementById(id);
  let appCargada = false;

  function cargarScripts() {
    return SCRIPTS.reduce((previa, src) => previa.then(() => new Promise((ok, fallo) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => fallo(new Error("No se pudo cargar " + src));
      document.body.appendChild(s);
    })), Promise.resolve());
  }

  function mostrarLogin(mensaje) {
    $("login").hidden = false;
    $("login_pass").value = "";
    const err = $("login_err");
    err.hidden = !mensaje;
    err.textContent = mensaje || "";
    setTimeout(() => ($("login_user").value ? $("login_pass") : $("login_user")).focus(), 30);
  }

  async function entrar(usuario) {
    $("login").hidden = true;
    $("usr_txt").textContent = usuario;
    $("btn_salir").hidden = false;
    if (appCargada) return;           // reautenticación: el estado de la pantalla sigue intacto
    appCargada = true;
    try { await cargarScripts(); }
    catch (e) { appCargada = false; mostrarLogin(e.message); }
  }

  async function comprobarSesion() {
    try {
      const r = await fetch(API.base + "/auth/me");
      if (r.ok) return entrar((await r.json()).usuario);
      mostrarLogin();
    } catch (e) {
      mostrarLogin("No se pudo contactar con el servidor");
    }
  }

  async function enviarLogin(ev) {
    ev.preventDefault();
    const btn = $("login_btn");
    btn.disabled = true;
    try {
      const r = await fetch(API.base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: $("login_user").value, password: $("login_pass").value }),
      });
      if (r.ok) return entrar((await r.json()).usuario);
      mostrarLogin(r.status === 401 ? "Usuario o contraseña incorrectos"
        : r.status === 429 ? "Demasiados intentos. Espera un minuto."
        : `Error ${r.status} al iniciar sesión`);
    } catch (e) {
      mostrarLogin("No se pudo contactar con el servidor");
    } finally {
      btn.disabled = false;
    }
  }

  async function salir() {
    try { await fetch(API.base + "/auth/logout", { method: "POST" }); } catch (e) { }
    location.reload();
  }

  /* Lo llama api.js ante un 401: la sesión venció. Se pide login encima de la pantalla actual. */
  function sesionExpirada() {
    if ($("login").hidden) mostrarLogin("Tu sesión expiró. Vuelve a iniciar sesión.");
  }

  $("login_form").addEventListener("submit", enviarLogin);
  $("btn_salir").addEventListener("click", salir);

  if (API.modoDemo) { $("btn_salir").hidden = true; appCargada = true; cargarScripts(); }
  else comprobarSesion();

  return { sesionExpirada };
})();
