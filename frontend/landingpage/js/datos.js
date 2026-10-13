/* ============================================================
   Insight Mind · sitio público · capa de datos
   Toda la lectura de datos del sitio pasa por este archivo.

   FAQs y newsletter vienen de la plataforma (FastAPI, app/main.py):
     GET {ORIGEN}/publico/faqs        activos "Tip / FAQ" publicados en la curaduría
     GET {ORIGEN}/publico/newsletter  activos "Destaque de newsletter" publicados
   Ambos responden curadurías con la forma de activos/<slug>/curaduria.json.

   Si la plataforma no responde, el sitio usa los JSON de sitio/datos/ como respaldo,
   para que nunca quede vacío en una demo sin backend. Los planes viven solo aquí.
   ============================================================ */

/* Dónde está la API y dónde está el panel, según cómo se sirva la landing:
   - Detrás de nginx (deploy/desplegar.sh): landing en /landing/, API en /api/, panel en /.
   - Desarrollo con FastAPI (SERVIR_UI=1 uvicorn main:app): landing en :8000/landing/, API en el
     mismo origen sin prefijo, panel en /ui/.
   - Servida suelta (node servidor.js → :5600, o abierta desde otro host): API en localhost:8000
     (requiere CORS_ORIGINS=http://localhost:5600 en el .env del backend).
   Para forzar otra API: <meta name="im-api" content="https://…"> en index.html. */
const ENTORNO = (() => {
  const meta = document.querySelector('meta[name="im-api"]');
  const enLanding = location.pathname.startsWith("/landing");
  if (meta && meta.content) return { api: meta.content.replace(/\/$/, ""), app: "/" };
  if (enLanding && location.port === "8000") return { api: location.origin, app: "/ui/" };
  if (enLanding) return { api: location.origin + "/api", app: "/" };
  return { api: "http://localhost:8000", app: "http://localhost:8000/ui/" };
})();
const ORIGEN = ENTORNO.api;
const RUTAS = {
  faqs: { api: "/publico/faqs", local: "datos/faqs.json" },
  newsletter: { api: "/publico/newsletter", local: "datos/newsletter.json" },
  planes: { api: null, local: "datos/planes.json" }
};
const ESPERA_MS = 4000;   // sin respuesta en este tiempo, se usa el respaldo local

/* URL de la aplicación (botón "Entrar" y botones de plan) */
const URL_APP = new URL(ENTORNO.app, location.href).href;

const FORMATO = { faq: "Tip / FAQ", newsletter: "Destaque de newsletter" };

/* De dónde salió cada bloque: "plataforma", "respaldo local" o "local" (útil para depurar) */
const procedencia = {};

async function pedir(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ESPERA_MS);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function leer(nombre) {
  const ruta = RUTAS[nombre];
  if (ruta.api) {
    try {
      const datos = await pedir(ORIGEN + ruta.api);
      procedencia[nombre] = "plataforma";
      return datos;
    } catch (e) {
      console.info(`[Insight Mind] ${nombre}: la plataforma no respondió (${e.message}); uso el respaldo local.`);
    }
  }
  procedencia[nombre] = ruta.api ? "respaldo local" : "local";
  return pedir(ruta.local);
}

/* Acepta una curaduría suelta o una lista de curadurías */
function activosPublicados(curadurias, formato) {
  const lista = Array.isArray(curadurias) ? curadurias : [curadurias];
  return lista
    .flatMap(c => (c.activos || []).map(a => ({ ...a, slug: c.slug, periodo: c.periodo_referencia })))
    .filter(a => a.estado === "Publicado" && a.formato === formato && a.texto)
    .sort((a, b) => String(b.publicado || "").localeCompare(String(a.publicado || "")));
}

/* ---------- Markdown mínimo, a mano y con HTML escapado ---------- */

const escapar = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* El sitio no usa emojis decorativos: los quita del texto que llega de la app */
const sinEmoji = s => s.replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/^\s+/, "");

/* Líneas de uso interno de la curaduría (avisos para el equipo) */
const esNotaInterna = l => /^\s*⚠/.test(l);

function enLinea(texto) {
  return escapar(sinEmoji(texto))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/* Convierte bloques separados por línea en blanco: títulos (##), listas numeradas,
   viñetas, y párrafos. Un bloque que empieza con **negrita** sola en su línea
   se vuelve un subtítulo con su texto debajo. */
function markdown(texto) {
  const bloques = String(texto).split(/\n\s*\n/).map(b => b.split("\n").filter(l => !esNotaInterna(l)))
    .filter(b => b.length && b.some(l => l.trim()));
  return bloques.map(lineas => {
    const primera = lineas[0].trim();
    if (/^#{1,3}\s/.test(primera)) return `<h3>${enLinea(primera.replace(/^#+\s*/, ""))}</h3>`;
    if (lineas.every(l => /^\s*\d+[.)]\s/.test(l)))
      return `<ol>${lineas.map(l => `<li>${enLinea(l.replace(/^\s*\d+[.)]\s*/, ""))}</li>`).join("")}</ol>`;
    if (lineas.every(l => /^\s*[-*]\s/.test(l)))
      return `<ul>${lineas.map(l => `<li>${enLinea(l.replace(/^\s*[-*]\s*/, ""))}</li>`).join("")}</ul>`;
    const sub = primera.match(/^\*\*([^*]+)\*\*$/);
    if (sub && lineas.length > 1)
      return `<h4>${enLinea(sub[1])}</h4><p>${lineas.slice(1).map(enLinea).join("<br>")}</p>`;
    return `<p>${lineas.map(enLinea).join("<br>")}</p>`;
  }).join("");
}

/* ---------- Formas que consume el sitio ---------- */

/* FAQ: título en negrita en la primera línea, el resto es la respuesta */
function aFaq(a) {
  const [cabeza, ...resto] = a.texto.split("\n");
  const m = cabeza.trim().match(/^\*\*(.+)\*\*$/);
  const pregunta = m ? m[1] : cabeza.trim();
  return {
    id: a.id,
    publicado: a.publicado,
    pregunta: sinEmoji(pregunta),
    respuestaHtml: markdown(m ? resto.join("\n") : a.texto)
  };
}

/* La app titula en inglés ("Community Highlights · Semana 41"): el sitio habla español.
   El espacio duro evita que una línea empiece con el punto medio. */
const tituloEdicion = t => sinEmoji(t).replace(/^Community Highlights/i, "Lo mejor de la comunidad").replace(/\s+·\s+/g, "\u00A0· ");

/* Edición: título (## …), extracto (primer párrafo con contenido) y cuerpo */
function aEdicion(a) {
  const lineas = a.texto.split("\n");
  const iTitulo = lineas.findIndex(l => /^#{1,3}\s/.test(l.trim()));
  const titulo = iTitulo >= 0 ? lineas[iTitulo].replace(/^#+\s*/, "").trim() : (a.periodo || a.slug);
  const cuerpo = iTitulo >= 0 ? lineas.filter((_, i) => i !== iTitulo).join("\n") : a.texto;
  const extracto = cuerpo.split(/\n\s*\n/)
    .map(b => b.split("\n").filter(l => !/^\s*\*\*[^*]+\*\*\s*$/.test(l) && !esNotaInterna(l)).join(" ").trim())
    .find(Boolean) || "";
  return {
    id: a.id,
    slug: a.slug,
    publicado: a.publicado,
    titulo: tituloEdicion(titulo),
    extracto: sinEmoji(extracto.replace(/\*\*|`/g, "")),
    cuerpoHtml: markdown(cuerpo)
  };
}

const Datos = {
  URL_APP,
  async faqs() { return activosPublicados(await leer("faqs"), FORMATO.faq).map(aFaq); },
  async ediciones() { return activosPublicados(await leer("newsletter"), FORMATO.newsletter).map(aEdicion); },
  async planes() { return leer("planes"); },
  procedencia,
  ORIGEN,
  escapar
};

window.Datos = Datos;
