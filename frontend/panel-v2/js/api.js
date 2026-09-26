/* Capa de comunicación con el backend.
   Todo el panel habla con el servidor SOLO a través de este archivo.
   Así el front avanza con datos falsos mientras la API se construye. */

const API = {
  base: "http://localhost:8000",

  /* Con true, el panel usa los datos de datos-ejemplo.js y no llama al servidor.
     Cámbialo a false cuando la API de Jorge esté arriba. */
  modoDemo: true,

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

  /* PUT /curaduria/{slug} — guarda el estado de todos los activos */
  async guardarCuraduria(slug, activos) {
    if (this.modoDemo) return { status: "exito", guardado_en: `activos/${slug}/curaduria.json` };
    return this._fetch(`/curaduria/${slug}`, { method: "PUT", body: JSON.stringify({ activos }) });
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
  async avisarTickets(ticketIds, destino) {
    if (this.modoDemo) return { status: "exito", enviados: ticketIds.length };
    return this._fetch("/tickets/avisar", {
      method: "POST",
      body: JSON.stringify({ tickets: ticketIds, destino }),
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
