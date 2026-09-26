/* Capa de comunicación con el backend.
   Todo el panel habla con el servidor SOLO a través de este archivo.
   Así el front avanza con datos falsos mientras la API se construye.

   ESTADO: modo mockup. Ninguna llamada real está activa todavía.
   El código de conexión ya está escrito y comentado abajo; se enciende
   cambiando `modoDemo` a false cuando el backend esté listo. */

/* Se toma del origen donde cargó la página. Funciona tal cual si FastAPI
   sirve el panel (app.mount("/ui", ...)). Si lo sirves desde otro lado,
   escribe aquí la URL completa: "http://<ip-de-la-vm>:8000" */
const API_BASE = window.location.origin;

/* El webhook de n8n es otro servicio: hay que ponerlo a mano.
   Mientras esté vacío, procesar usa la simulación local. */
const N8N_WEBHOOK_URL = "";

const API = {
  base: API_BASE,

  /* Con true, el panel usa los datos de datos-ejemplo.js y no llama al servidor. */
  modoDemo: true,

  async _fetch(ruta, opciones = {}) {
    const r = await fetch(this.base + ruta, {
      headers: { "Content-Type": "application/json" },
      ...opciones,
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} en ${ruta}`);
    return r.json();
  },

  /* ---- Lo que YA existe en main.py y está probado ---- */

  /* POST /upload — sube el .json o .csv al bucket de OCI.
     Verificado contra la versión anterior del panel: funciona. */
  async subirLote(archivo) {
    if (this.modoDemo) return { file: archivo?.name || "semana_04.json", demo: true };
    const fd = new FormData();
    fd.append("file", archivo);
    const r = await fetch(`${this.base}/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`La API respondió ${r.status}`);
    return r.json();
  },

  /* GET /files — lista lo que hay en el bucket */
  async archivos() {
    if (this.modoDemo) return [];
    return this._fetch("/files");
  },

  /* GET /download/{nombre} — descarga un objeto del bucket */
  urlDescarga(nombre) {
    return `${this.base}/download/${encodeURIComponent(nombre)}`;
  },

  /* ---- Lo que FALTA construir en el backend ---- */

  /* Dispara el workflow de n8n con el archivo ya subido.
     Pendiente: la URL real del webhook. */
  async dispararWorkflow(nombreArchivo) {
    if (this.modoDemo || !N8N_WEBHOOK_URL) return null;
    const r = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: nombreArchivo, origen: "insight-mind-panel" }),
    });
    if (!r.ok) throw new Error(`n8n respondió ${r.status}`);
    return r.json();
  },

  /* POST /procesar — el endpoint del brief: manda el lote y devuelve el
     paquete completo. Contrato en docs/PROMPT_MAESTRO.md §4. NO EXISTE AÚN. */
  async procesarLote(lote) {
    if (this.modoDemo) return null;   // en demo, app.js arma el resultado con construir()
    return this._fetch("/procesar", { method: "POST", body: JSON.stringify(lote) });
  },

  /* GET /semanas y GET /semanas/{slug} — historial desde el bucket. NO EXISTEN AÚN. */
  async semanas() {
    if (this.modoDemo) return null;
    return this._fetch("/semanas");
  },
  async semana(slug) {
    if (this.modoDemo) return null;
    return this._fetch(`/semanas/${slug}`);
  },

  /* PUT /curaduria/{slug} — guarda el estado de los activos. NO EXISTE AÚN. */
  async guardarCuraduria(slug, activos) {
    if (this.modoDemo) return { status: "exito", guardado_en: `activos/${slug}/curaduria.json` };
    return this._fetch(`/curaduria/${slug}`, { method: "PUT", body: JSON.stringify({ activos }) });
  },

  /* POST /publicar — publica un activo en su plataforma. NO EXISTE AÚN. */
  async publicar(activoId, plataforma) {
    if (this.modoDemo) return { status: "exito", url: `https://${plataforma}.com/demo/${activoId}` };
    return this._fetch("/publicar", {
      method: "POST",
      body: JSON.stringify({ activo_id: activoId, plataforma }),
    });
  },

  /* POST /tickets/avisar — webhook de Discord o Slack. NO EXISTE AÚN. */
  async avisarTickets(ticketIds, destino) {
    if (this.modoDemo) return { status: "exito", enviados: ticketIds.length };
    return this._fetch("/tickets/avisar", {
      method: "POST",
      body: JSON.stringify({ tickets: ticketIds, destino }),
    });
  },

  /* PUT /config/voz — guarda la guía de voz y los chips. NO EXISTE AÚN. */
  async guardarVoz(texto, chips) {
    if (this.modoDemo) return { status: "exito" };
    return this._fetch("/config/voz", { method: "PUT", body: JSON.stringify({ texto, chips }) });
  },
};

/* Muestra el error al usuario en vez de dejar la pantalla congelada.
   Uso: await conError(API.subirLote(f), "No se pudo subir el archivo") */
async function conError(promesa, mensaje) {
  try {
    return await promesa;
  } catch (e) {
    console.error(e);
    if (typeof toast === "function") toast(mensaje, e.message);
    return null;
  }
}
