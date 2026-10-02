/* Capa de comunicación con el backend.
   Todo el panel habla con el servidor SOLO a través de este archivo.
   Así el front avanza con datos falsos mientras la API se construye. */

const API = {
  /* FastAPI sirve el frontend en /ui y la API en el mismo puerto, así que
     tomamos el origen real de la página en vez de fijar "localhost". */
  base: window.location.origin,

  /* Con true, el panel usa los datos de datos-ejemplo.js y no llama al servidor.
     En false, /procesar llama de verdad a FastAPI (main.py), que a su vez
     invoca analizador_sentimiento.py (Cohere) por cada archivo del bucket. */
  modoDemo: false,

  async _fetch(ruta, opciones = {}) {
    const r = await fetch(this.base + ruta, {
      headers: { "Content-Type": "application/json" },
      ...opciones,
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} en ${ruta}`);
    return r.json();
  },

  /* POST /procesar — manda el lote y recibe el paquete completo.
     Contrato: docs/contratos/ejemplo_respuesta.json */
  async procesarLote(lote) {
    if (this.modoDemo) return null;   // en demo, app.js arma el resultado con construir()
    return this._fetch("/procesar", { method: "POST", body: JSON.stringify(lote) });
  },

  /* POST /upload — sube un archivo real al bucket de OCI.
     No usa _fetch porque FormData necesita fijar su propio boundary
     en Content-Type; si lo forzamos a application/json, el backend no
     puede leer el archivo. */
  async subirArchivo(archivo) {
    if (this.modoDemo) return { message: "Archivo subido (demo)", file: archivo.name };
    const fd = new FormData();
    fd.append("file", archivo);
    const r = await fetch(this.base + "/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} en /upload`);
    return r.json();
  },

  /* GET /semanas — lista de semanas disponibles en el bucket de OCI */
  async semanas() {
    if (this.modoDemo) return null;   // en demo se usa el objeto HIST de datos-ejemplo.js
    return this._fetch("/semanas");
  },

  /* GET /semanas/{slug} — paquete completo de una semana anterior */
  async semana(slug) {
    if (this.modoDemo) return null;   // en demo se usa el objeto HIST de datos-ejemplo.js
    return this._fetch(`/semanas/${slug}`);
  },

  /* PUT /curaduria/{slug} — guarda el estado de todos los activos.
     meta = { periodo_referencia, origen_comunidad, tickets } (opcional) */
  async guardarCuraduria(slug, activos, meta = {}) {
    if (this.modoDemo) return { status: "exito", guardado_en: `activos/${slug}/curaduria.json` };
    return this._fetch(`/curaduria/${slug}`, { method: "PUT", body: JSON.stringify({ activos, ...meta }) });
  },

  /* POST /generar — redacta con Cohere usando la guía de voz guardada.
     items = [{ id, formato, mensaje, mensajes?, texto_previo? }] -> { resultados: {id: texto}, errores: {id: msg} } */
  async generar(slug, items) {
    if (this.modoDemo) return { resultados: {}, errores: {} };   // en demo se quedan las plantillas
    mostrarIndicadorProcesando(true);
    try {
      return await this._fetch("/generar", { method: "POST", body: JSON.stringify({ slug, items }) });
    } finally {
      mostrarIndicadorProcesando(false);
    }
  },

  /* GET /config/voz — guía de voz vigente */
  async voz() {
    if (this.modoDemo) return null;
    return this._fetch("/config/voz");
  },

  /* POST /publicar — publica un activo en su plataforma */
  async publicar(activoId, plataforma) {
    if (this.modoDemo) return { status: "exito", url: `https://${plataforma}.com/demo/${activoId}` };
    return this._fetch("/publicar", {
      method: "POST",
      body: JSON.stringify({ activo_id: activoId, plataforma }),
    });
  },

  /* POST /tickets/avisar — manda los tickets al webhook de Discord o Slack */
  async avisarTickets(mensaje, destino) {
    
    if (this.modoDemo) return { status: "exito" };

    let msg = mensaje;
    let dest = destino;

    if (typeof mensaje === "object" && mensaje !== null) {
      msg = mensaje.mensaje;
      dest = mensaje.destino || destino;
    }

    return this._fetch("/tickets/avisar", {
      method: "POST",
      body: JSON.stringify({ mensaje: msg, destino: dest }),
    });
    
  },

  /* PUT /config/voz — guarda la guía de voz y los chips de estilo */
  async guardarVoz(texto, chips) {
    if (this.modoDemo) return { status: "exito" };
    return this._fetch("/config/voz", { method: "PUT", body: JSON.stringify({ texto, chips }) });
  },

  /* GET /conexiones y PUT /conexiones/{plataforma} */
  async conexiones() {
    if (this.modoDemo) return null;
    return this._fetch("/conexiones");
  },
  async cambiarConexion(plataforma, conectar) {
    if (this.modoDemo) return { status: "exito" };
    return this._fetch(`/conexiones/${plataforma}`, {
      method: "PUT",
      body: JSON.stringify({ conectado: conectar }),
    });
  },
};

/* Muestra el error al usuario en vez de dejar la pantalla congelada.
   Envuelve cualquier llamada: await conError(API.procesarLote(lote), "No se pudo procesar el lote") */
async function conError(promesa, mensaje) {
  try {
    return await promesa;
  } catch (e) {
    console.error(e);
    if (typeof toast === "function") toast(mensaje, e.message);
    return null;
  }
}

/* Indicador de procesamiento para operaciones asíncronas con IA */
let peticionesGenerarEnCurso = 0;
function mostrarIndicadorProcesando(mostrar, titulo = "Procesando con IA...", sub = "Generando contenido") {
  const el = document.getElementById("indicador_procesando");
  if (mostrar) {
    peticionesGenerarEnCurso++;
    if (el) {
      const titEl = el.querySelector(".indicador-titulo");
      const subEl = el.querySelector(".indicador-sub");
      if (titEl && titulo) titEl.textContent = titulo;
      if (subEl && sub) subEl.textContent = sub;
      el.hidden = false;
    }
  } else {
    peticionesGenerarEnCurso = Math.max(0, peticionesGenerarEnCurso - 1);
    if (el && peticionesGenerarEnCurso === 0) {
      el.hidden = true;
    }
  }
}
if (typeof window !== "undefined") {
  window.mostrarIndicadorProcesando = mostrarIndicadorProcesando;
}