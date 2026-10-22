/* Lógica del panel: navegación, render y acciones.
   Las llamadas al backend viven en api.js */

const MODOS_TEMA = ["sistema", "claro", "oscuro"]; let tIdx = 0;

try { 
  tIdx = Math.max(0, MODOS_TEMA.indexOf(localStorage.getItem("clg-tema") || "sistema")); 
} catch (e) { }

function aplicarTema() {
  const t = MODOS_TEMA[tIdx];
  if (t === "sistema") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t === "claro" ? "light" : "dark");
  tema_txt.textContent = "Tema: " + t;
  tema_ico.innerHTML = `<use href="#i-${t === "claro" ? "sol" : t === "oscuro" ? "luna" : "sistema"}"/>`;
  try { localStorage.setItem("clg-tema", t); } catch (e) { }
}

tema.onclick = () => { tIdx = (tIdx + 1) % MODOS_TEMA.length; aplicarTema(); }; aplicarTema();

let E = { 
  activos: [], tickets: [], pubs: [], procesado: false, paso: 1, conex: {}, chips: [], slug: null 
};

Object.keys(PLAT).forEach(k => E.conex[k] = PLAT[k].on);
/* El prototipo arranca siempre limpio: el usuario ejecuta el flujo desde "Usar lote de ejemplo".
   Solo el historial trae semanas anteriores con datos. */
const save = () => { };   /* el estado vive en memoria durante la sesión; en producción lo persiste OCI */
/* Guarda el estado de la curaduría en OCI: activos/<slug>/curaduria.json (PUT /curaduria/{slug}).
   Devuelve true si se guardó, false si falló (conError ya muestra el toast) y
   "local" si no hay lote real (slug) —p. ej. el lote de ejemplo—, donde no hay nada que subir. */
async function guardarCuraduriaEnOCI() {
  if (!E.slug) return "local";
  /* Un lote puede mezclar periodos (Semana_01, Semana_05...): cada activo/ticket se guarda en
     activos/<slug>/curaduria.json del slug de SU mensaje de origen, no todo bajo un único slug. */
  const porSlug = new Map();
  const grupo = s => { if (!porSlug.has(s)) porSlug.set(s, { activos: [], tickets: [] }); return porSlug.get(s); };
  E.activos.forEach(a => grupo(slugDe(a.fuente)).activos.push({ ...a, fuente_detalle: fuenteDetalle(msg(a.fuente)) }));
  E.tickets.forEach(t => grupo(slugDe(t.fuente)).tickets.push({ ...t, archivo: (msg(t.fuente) || {}).archivo }));
  let ok = true;
  for (const [slug, g] of porSlug) {
    const m0 = DATOS.find(d => slugDe(d.id) === slug) || {};
    const r = await conError(
      API.guardarCuraduria(slug, g.activos, { periodo_referencia: m0.periodo_referencia || E.periodo, origen_comunidad: m0.origen_comunidad || E.origen, tickets: g.tickets }),
      "No se pudo guardar la curaduría en OCI");
    ok = ok && !!r;
  }
  return ok;
}

/* Slug (periodo) del mensaje de origen; si no lo trae, el del lote */
const slugDe = id => (msg(id) || {}).slug || E.slug;

function fuenteDetalle(m) {
  if (!m) return null;
  return {
    archivo: m.archivo, etag: m.etag, origen_comunidad: m.origen_comunidad, periodo_referencia: m.periodo_referencia,
    interaccion: { autor: m.autor, canal: m.canal, tipo: m.tipo, texto: m.texto }
  };
}

/* ---- Huella y reconciliación: lo ya generado NO se vuelve a generar ----
   huella = formato + archivo de origen + etag del archivo (la newsletter, todo el lote).
   Si la huella coincide con la guardada en activos/<slug>/curaduria.json, se reutiliza el texto. */
const NEWSLETTER = "Destaque de newsletter";
function hash53(s) {   /* cyrb53: hash corto y estable, suficiente para comparar */
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function huellaDe(a) {
  const m = msg(a.fuente) || {};
  const origen = a.formato === NEWSLETTER
    ? DATOS.map(d => `${d.archivo}@${d.etag}`).sort().join("|")
    : `${m.archivo}@${m.etag}`;
  return hash53(`${a.formato}|${origen}`);
}
const claveActivo = (formato, archivo, slug) => formato === NEWSLETTER ? `${NEWSLETTER}|${slug}` : `${formato}|${archivo}`;

/* Cruza los activos recién construidos con los guardados. Devuelve los que SÍ hay que generar.
   Se conserva id, texto, estado y ediciones de lo ya existente (un texto editado o ya en cola
   /publicado nunca se pisa). Los nuevos reciben ids que no chocan con ninguno guardado. */
/* Fusiona las curadurías de varios slugs en un solo objeto, marcando el slug de origen y
   resolviendo ids repetidos entre slugs (cada archivo guardado tenía su propia numeración A1, A2…). */
function fusionarGuardados(docs) {
  const vistos = new Set(), activos = [], tickets = [];
  let k = 1000;
  docs.filter(Boolean).forEach(d => {
    (d.activos || []).forEach(a => {
      const id = vistos.has(a.id) ? "A" + (k++) : a.id;
      vistos.add(id); activos.push({ ...a, id, _slug: d.slug });
    });
    tickets.push(...(d.tickets || []));
  });
  return { activos, tickets };
}

function reconciliar(c, guardado) {
  const gAct = (guardado && guardado.activos) || [], gTic = (guardado && guardado.tickets) || [];
  const porClave = new Map(gAct.map(g => [claveActivo(g.formato, (g.fuente_detalle || {}).archivo, g._slug), g]));
  const ocupados = new Set(gAct.map(g => g.id));
  const pendientes = []; let reutilizados = 0;

  c.activos.forEach(n => {
    n.huella = huellaDe(n);
    const g = porClave.get(claveActivo(n.formato, (msg(n.fuente) || {}).archivo, slugDe(n.fuente)));
    const protegido = g && (g.editado || (g.estado && g.estado !== "Pendiente"));
    const igual = g && (g.huella ? g.huella === n.huella : n.formato !== NEWSLETTER);   /* sin huella = guardado antiguo */
    if (g && g.texto && (igual || protegido)) {
      Object.assign(n, { id: g.id, texto: g.texto, estado: g.estado || "Pendiente", editado: g.editado,
        publicado: g.publicado, base: g.base, version: g.version, variante: g.variante,
        huella: igual ? n.huella : g.huella });
      reutilizados++;
    } else pendientes.push(n);
  });
  /* ids propios de los pendientes: ninguno puede repetir uno guardado o ya reutilizado */
  const usados = new Set([...ocupados, ...c.activos.filter(n => !pendientes.includes(n)).map(n => n.id)]);
  let k = 1;
  pendientes.forEach(n => { do { n.id = "A" + (k++); } while (usados.has(n.id)); usados.add(n.id); });

  /* los tickets conservan estado/aviso (antes se reiniciaban a "Abierto" en cada procesamiento) */
  c.tickets.forEach(t => {
    const g = gTic.find(x => x.archivo && x.archivo === (msg(t.fuente) || {}).archivo);
    if (g) Object.assign(t, { estado: g.estado, aviso: g.aviso, seleccionado: g.seleccionado ?? t.seleccionado });
  });
  return { pendientes, reutilizados };
}

/* Mensaje que se manda a /generar (sin campos de UI) */
const paraGenerar = m => ({
  autor: m.autor, canal: m.canal, tipo: m.tipo, texto: m.texto, idioma: m.idioma, por_que: m.por_que,
  sent: m.sent, score: m.score, archivo: m.archivo,
  origen_comunidad: m.origen_comunidad, periodo_referencia: m.periodo_referencia
});

/* Pide al backend el texto de cada activo (Cohere + guía de voz guardada).
   Si falla, los activos conservan la plantilla local. Devuelve true si se generó algo. */
async function redactarConVoz(activos = [], textoPrevio = {}) {
  
  if (!E.slug || !activos.length) return false;   /* lote de ejemplo (sin backend) o nada pendiente */
 
  const items = activos.map(a => ({
    id: a.id, formato: a.formato, slug: slugDe(a.fuente), huella: huellaDe(a), mensaje: paraGenerar(msg(a.fuente) || {}),
    mensajes: a.formato === "Destaque de newsletter" ? DATOS.map(paraGenerar) : null,
    texto_previo: textoPrevio[a.id] || null
  }));

  const r = await conError(API.generar(E.slug, items), "No se pudo generar con IA · se usan plantillas");
  
  if (!r) return false;
  activos.forEach(a => { if (r.resultados[a.id]) { a.texto = r.resultados[a.id]; a.base = a.texto; delete a.version; a.huella = huellaDe(a); } });
  
  const fallos = Object.keys(r.errores || {}).length;
  if (fallos) toast(`${fallos} activo${fallos === 1 ? "" : "s"} sin generar`, "Se dejó la plantilla local", false);
  return Object.keys(r.resultados).length > 0;
}

const ic = n => `<svg class="ico"><use href="#i-${n}"/></svg>`;
const $ = s => document.querySelector(s), el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const msg = id => DATOS.find(d => d.id === id);

/* Escapa todo lo que viene de la comunidad, del LLM o del servidor antes de meterlo en innerHTML. */
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(titulo, texto, ok, undo) {
  const t = el("div", "toast" + (ok ? " ok" : ""), `<div><b>${escHtml(titulo)}</b>${escHtml(texto || "")}</div>`);
  if (undo) { const u = el("button", "btn sm undo", "Deshacer"); u.onclick = () => { undo(); t.remove(); }; t.appendChild(u); }
  toasts.appendChild(t); setTimeout(() => t.remove(), undo ? 6500 : 3400);
}

function construir() {
  
  const a = []; let n = 1; const add = o => a.push(Object.assign({ id: "A" + (n++), estado: "Pendiente" }, o));
  const exitos = DATOS.filter(m => ruta(m) === "exito").sort((x, y) => y.score - x.score);
  
  exitos.forEach((m, i) => {
    add({ formato: "Post de LinkedIn", fuente: m.id, score: m.score, texto: linkedinTxt(m) });
    if (i === 0) add({ formato: "Hilo de X", fuente: m.id, score: m.score - 4, texto: hiloTxt(m) });
  });

  DATOS.filter(m => ruta(m) === "faq").sort((x, y) => y.score - x.score).slice(0, 2)
    .forEach(m => add({ formato: "Tip / FAQ", fuente: m.id, score: m.score, texto: faqGenerico(m) }));
  
    if (DATOS.length) {
    const pos = DATOS.filter(m => m.sent > .2).length;
    add({
      formato: "Destaque de newsletter", fuente: (exitos[0] || DATOS[0]).id, score: 90,
      texto: newsletterGenerico(DATOS, Math.round(pos / DATOS.length * 100))
    });
  }
  const t = DATOS.filter(m => ruta(m) === "ticket").map((m, i) => ({ id: "T" + (i + 1), fuente: m.id, sev: m.sent <= -.6 ? "Alta" : "Media", aviso: null, estado: "Abierto", seleccionado: true }));
  return { activos: a, tickets: t };
}

const META = {
  panorama: ["Panorama de la comunidad", "Qué dice la comunidad y qué produjo Insight Mind con eso."],
  flujo: ["Procesar lote", "Ingesta, análisis y curaduría en un solo flujo."],
  tickets: ["Tickets", "Lo que no se publica: se avisa al equipo."],
  publicaciones: ["Publicaciones", "Qué salió publicado, dónde y cuándo."],
  historial: ["Historial", "Entra a cualquier semana y revisa qué pasó."],
  conexiones: ["Conexiones", "Vincula los destinos donde se publica."],
  ajustes: ["Ajustes", "Voz de marca, umbrales y cuentas."]
};

const PAGS = Object.keys(META);

function ir(p) {
  document.querySelectorAll(".nav").forEach(b => b.setAttribute("aria-current", b.dataset.p === p ? "page" : "false"));
  PAGS.forEach(x => $("#p_" + x).hidden = (x !== p));
  titulo.textContent = META[p][0]; subtitulo.textContent = META[p][1];
  mtop_pag.textContent = META[p][0]; cerrarMenu();
  acciones.innerHTML = "";
  if (p === "flujo" && E.procesado) acciones.appendChild(el("span", "mini", `Lote ${E.slug} · ${DATOS.length} mensajes`));
  window.scrollTo({ top: 0, behavior: "smooth" });
  /* Cada vez que se abre el Panorama se vuelve a consultar GET /dashboard (MongoDB):
     así refleja lo procesado o sincronizado desde la última vez, sin recargar la página. */
  if (p === "panorama" && typeof visualizarDashboard === "function") visualizarDashboard();
}

document.querySelectorAll(".nav").forEach(b => b.onclick = () => ir(b.dataset.p));

/* ---------- MENÚ MÓVIL ---------- */
function abrirMenu() {
  document.body.classList.add("menu-abierto"); scrim.hidden = false;
  hamb.setAttribute("aria-expanded", "true"); hamb.setAttribute("aria-label", "Cerrar menú");
}

function cerrarMenu() {
  if (!document.body.classList.contains("menu-abierto")) return;
  document.body.classList.remove("menu-abierto"); hamb.setAttribute("aria-expanded", "false");
  hamb.setAttribute("aria-label", "Abrir menú"); setTimeout(() => { scrim.hidden = true; }, 260);
}
hamb.onclick = () => document.body.classList.contains("menu-abierto") ? cerrarMenu() : abrirMenu();
scrim.onclick = cerrarMenu;
addEventListener("keydown", e => { if (e.key === "Escape") cerrarMenu(); });
document.querySelectorAll("#tabs_flujo .stp").forEach(b => b.onclick = () => {
  const n = +b.dataset.s; if (n > 1 && !E.procesado) return toast("Falta procesar", "Sube un lote y ejecuta el grafo."); irPaso(n);
});

function irPaso(n) {
  E.paso = n; save();
  document.querySelectorAll("#tabs_flujo .stp").forEach(b => {
    const i = +b.dataset.s, hecho = E.procesado && i < n;
    b.className = "stp" + (hecho ? " done" : "");
    b.querySelector(".n").innerHTML = hecho ? ic("check") : i;
    if (i === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
  });
  [1, 2, 3].forEach(i => $("#paso_" + i).hidden = (i !== n));
}

btn_file.onclick = () => file.click(); 
file.onchange = subirYValidar; 
btn_ejemplo.onclick = validar;
btn_pegar.onclick = pegarMensajes;

drop.addEventListener("dragover", e => { e.preventDefault(); drop.style.borderColor = "var(--primary)"; });
drop.addEventListener("dragleave", () => drop.style.borderColor = "");
drop.addEventListener("drop", e => {
  e.preventDefault(); drop.style.borderColor = "";
  if (e.dataTransfer.files[0]) { 
    file.files = e.dataTransfer.files; 
    subirYValidar(); }
});

function validar() { validacion.hidden = false; toast("Archivo cargado", "12 interacciones válidas · 1 duplicada eliminada"); }

/* ---------- LISTA DE ARCHIVOS SUBIDOS (referencia) ---------- */
E.archivos = [];   /* { nombre, tamano, hora, estado: "subiendo" | "subido" | "error" } */

const fmtTamano = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const ESTADO_ARCHIVO = { subiendo: ["Subiendo…", "warn"], subido: ["Subido a OCI", "ok"], error: ["Error", "alert"] };
const MAX_ARCHIVOS = 20;   /* tope de archivos por sesión; los que fallan no cuentan */
const archivosOcupados = () => E.archivos.filter(a => a.estado !== "error").length;

function renderArchivos() {
  const lista = E.archivos;
  archivos_subidos.hidden = !lista.length;
  const ok = lista.filter(a => a.estado === "subido").length;
  archivos_total.textContent = `${archivosOcupados()}/${MAX_ARCHIVOS} archivos · ${ok} subido${ok === 1 ? "" : "s"}`;
  archivos_lista.innerHTML = "";
  /* el más reciente primero */
  [...lista].reverse().forEach(a => {
    const [txt, cls] = ESTADO_ARCHIVO[a.estado];
    const ext = (a.nombre.split(".").pop() || "").toUpperCase();
    archivos_lista.appendChild(el("li", "archivo " + a.estado,
      `<span class="archivo-ext">${escHtml(ext)}</span>
       <span class="archivo-info"><b title="${escHtml(a.nombre)}">${escHtml(a.nombre)}</b>
         <span class="mini mono">${fmtTamano(a.tamano)} · ${a.hora}</span></span>
       <span class="archivo-estado ${cls}">${txt}</span>`));
  });
}

async function subirYValidar() {
  const seleccion = [...(file.files || [])]; if (!seleccion.length) return;
  file.value = "";   /* permite volver a seleccionar el mismo archivo */
  const libres = Math.max(0, MAX_ARCHIVOS - archivosOcupados());
  if (!libres) return toast("Límite alcanzado", `Solo se permiten ${MAX_ARCHIVOS} archivos por lote.`, false);
  const archivos = seleccion.slice(0, libres);
  if (seleccion.length > libres)
    toast("Límite de archivos superado",
      `Máximo ${MAX_ARCHIVOS} archivos. Se subirán ${libres} y se omitirán ${seleccion.length - libres}.`, false);
  /* se registran todos antes de subir: reserva los cupos aunque se elija otro lote mientras tanto */
  const hora = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const regs = archivos.map(a => ({ archivo: a, nombre: a.name, tamano: a.size, estado: "subiendo", hora }));
  E.archivos.push(...regs); renderArchivos();
  for (const reg of regs) {
    const archivo = reg.archivo; delete reg.archivo;
    const r = await conError(API.subirArchivo(archivo), "No se pudo subir el archivo a OCI");
    reg.estado = r ? "subido" : "error"; renderArchivos();
    if (!r) continue;
    validacion.hidden = false;
    toast("Archivo subido a OCI", archivo.name, true);
  }
}

/* Mensajes pegados en crudo: entran al lote como un archivo más, sin etiqueta de tipo. */
async function pegarMensajes() {
  const texto = pegar_texto.value.trim();
  if (!texto) return toast("Nada que agregar", "Pega al menos un mensaje.", false);
  if (!Math.max(0, MAX_ARCHIVOS - archivosOcupados()))
    return toast("Límite alcanzado", `Solo se permiten ${MAX_ARCHIVOS} archivos por lote.`, false);
  const hora = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const reg = { nombre: "mensajes-pegados.txt", tamano: new Blob([texto]).size, estado: "subiendo", hora };
  E.archivos.push(reg); renderArchivos();
  btn_pegar.disabled = true;
  const r = await conError(API.ingestarTexto(texto, pegar_canal.value.trim() || "#general"),
    "No se pudieron agregar los mensajes");
  btn_pegar.disabled = false;
  reg.estado = r ? "subido" : "error";
  if (r) reg.nombre = `${r.total} mensaje${r.total === 1 ? "" : "s"} pegado${r.total === 1 ? "" : "s"}.txt`;
  renderArchivos();
  if (!r) return;
  pegar_texto.value = ""; validacion.hidden = false;
  toast("Mensajes agregados al lote", `${r.total} sin etiqueta: la IA clasificará cada uno.`, true);
}

/* ---------- PROCESAMIENTO DE MENSAJES ---------- */

function actualizarProgreso(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const elBarra = document.getElementById("barra");
  
  if (elBarra) {
    elBarra.style.width = `${p}%`;
    elBarra.style.transform = "none";
  }

  const elProg = elBarra ? elBarra.closest(".prog") : document.querySelector('.prog[role="progressbar"]');
  if (elProg) {
    elProg.setAttribute("aria-valuenow", p);
  }

  const elPorcentaje = document.getElementById("porcentaje");
  if (elPorcentaje) {
    elPorcentaje.textContent = `${p}%`;
  }
}

const PASOS = [
  "validar · esquema Pydantic", 
  "limpiar · enmascarar datos personales", 
  "analizar · sentimiento y temas", 
  "agrupar_preguntas · dudas similares", 
  "router · 4 reglas condicionales", 
  "consolidar · paquete oficial", 
  "guardar · OCI Object Storage",
  "procesar · procesando registros con IA", 
  "generar · generando contenido con IA"
];

/***
 *   "generar · LinkedIn, X, FAQ y newsletter",
 *   "newsletter_semanal · highlights",
 */

async function procesarLote(lote = {}) {
  try {
    return await conError(API.procesarLote(lote),
      "No se pudo procesar el lote. Revisa que main.py esté corriendo y COHERE_API_KEY configurada.");
  } finally {
    cargarUsoCohere();
  }
}

/* Barra de uso estimado de Cohere. Se oculta si el backend no está disponible. */
async function cargarUsoCohere() {
  const panel = document.getElementById("cohere_uso");
  if (!panel) return;
  try {
    const u = await API.usoCohere();
    if (!u) { panel.hidden = true; return; }

    const barra = document.getElementById("cohere_barra");
    const texto = document.getElementById("cohere_txt");
    const progreso = document.getElementById("cohere_prog");
    const nota = document.getElementById("cohere_nota");
    barra.style.width = `${u.porcentaje}%`;
    barra.className = u.porcentaje >= 90 ? "critico" : u.porcentaje >= 70 ? "alto" : "";
    progreso.setAttribute("aria-valuenow", String(u.porcentaje));
    texto.textContent = `${u.usadas.toLocaleString("es-CL")} / ${u.limite.toLocaleString("es-CL")}`;
    const reinicia = new Date(`${u.reinicia}T00:00:00Z`).toLocaleDateString("es-CL", {
      day: "numeric", month: "long", timeZone: "UTC"
    });
    nota.textContent = (u.restantes === 0
      ? `Sin llamadas disponibles según este contador; reinicia el ${reinicia}. `
      : `Quedan ${u.restantes.toLocaleString("es-CL")} llamadas estimadas · reinicia el ${reinicia}. `)
      + "Solo cuenta esta aplicación; verifica el total oficial en Cohere.";
    panel.hidden = false;
  } catch (_) {
    panel.hidden = true;
  }
}

cargarUsoCohere();

// Botón para ejecutar el procesamiento 
btn_procesar.onclick = async () => {

  // Cambia a la vista de progreso
  irPaso(2); 
  
  steps.innerHTML = "";
  oci_linea.hidden = true;
  oci_ruta.textContent = "";
  analisis_resultado.hidden = true;
  actualizarProgreso(0);

  PASOS.forEach(p => steps.appendChild(el("div", "step", '<span class="sdot"></span><span>' + p + '</span>')));
  const nodos = [...steps.children]; 
  
  /* Los 2 últimos nodos (procesar, generar) dependen de FastAPI: no se animan en el bucle inicial */
  const pasosIniciales = Math.max(0, nodos.length - 2);

  for (let i = 0; i < pasosIniciales; i++) {
    
    if (E.paso !== 2) return;
    nodos[i].className = "step run";
    
    await new Promise(r => setTimeout(r, 600)); 
    
    if (E.paso !== 2) return;
    nodos[i].className = "step done";
    actualizarProgreso(Math.round(((i + 1) / pasosIniciales) * 70));
  }

  actualizarProgreso(70);

  // Paso "procesar": done solo cuando responde /procesar (sube a 85%)
  const nodoProcesar = nodos[pasosIniciales];
  if (nodoProcesar) nodoProcesar.className = "step run";
  
  const resultado = await procesarLote();
  if (!resultado) { 
    if (nodoProcesar) nodoProcesar.className = "step"; 
    irPaso(1); 
    return; 
  }
  
  if (E.paso !== 2) return;
 
  if (nodoProcesar) nodoProcesar.className = "step done";
  actualizarProgreso(85);

  await fin(resultado, nodos[pasosIniciales + 1]);

};

async function fin(resultado, nodoGenerar = null) {
  
  if (!resultado) { irPaso(1); 
    return; 
  }   /* conError ya mostró el toast de error */

  E.slug = resultado.slug;
  oci_ruta.textContent = `activos/${E.slug}/paquete-distribucion.json`; oci_linea.hidden = false;

  /* Reemplaza el lote de ejemplo por los mensajes reales que analizó Cohere.
     DATOS es const: se muta el arreglo en vez de reasignarlo. */
  DATOS.length = 0;
  resultado.mensajes.forEach((m, i) => DATOS.push({
    id: "m" + (i + 1), autor: m.autor, canal: m.canal || "general", tipo: m.tipo,
    tipo_pista: m.tipo_pista || null, tipo_corregido: !!m.tipo_corregido,
    sent: m.sent, score: m.score, idioma: m.idioma || "es", texto: m.texto,
    por_que: m.por_que, temas: [m.tipo],
    apoyo: m.tipo === "queja" || m.tipo === "problema_acceso",
    archivo: m.archivo, etag: m.etag, slug: m.slug, origen_comunidad: m.origen_comunidad, periodo_referencia: m.periodo_referencia
  }));

  E.periodo = (resultado.periodos || [])[0] || null;
  E.origen = (resultado.origenes_comunidad || [])[0] || null;

  const c = construir();

  /* Lo ya generado vive en activos/<slug>/curaduria.json: solo se redacta lo nuevo o lo que cambió. */
  let guardado = null;
  if (E.slug) {
    try {
      const slugs = [...new Set(DATOS.map(d => d.slug || E.slug))];
      guardado = fusionarGuardados(await Promise.all(slugs.map(s => API.curaduria(s))));
    }
    catch (e) {   /* sin poder leerlo, NO se regenera: se pisaría lo ya generado */
      console.error(e); toast("No se pudo leer la curaduría guardada", e.message); irPaso(1); return;
    }
  }
  
  const { pendientes, reutilizados } = reconciliar(c, guardado);

  // Paso "generar": done sólo cuando responde /generar (sube a 100% el progreso)
  if (nodoGenerar) nodoGenerar.className = "step run";
  const response = await redactarConVoz(pendientes);
  
  if (E.paso !== 2) return;
  
  if (nodoGenerar) nodoGenerar.className = "step done";
  actualizarProgreso(100);

  E.activos = c.activos; E.tickets = c.tickets; E.procesado = true; save();
  visualizar(); 

  analisis_resultado.hidden = false;
  toast("Lote procesado", `${pendientes.length} activos generados · ${reutilizados} reutilizados · ${c.tickets.length} tickets` + (response ? " · con tu guía de voz" : ""), true);
}

btn_a_3.onclick = () => irPaso(3);

/* ---------- ANÁLISIS ---------- */
function visualizarAnalisis() {
  const pos = DATOS.filter(m => m.sent > .2).length, neg = DATOS.filter(m => m.sent < -.2).length, neu = DATOS.length - pos - neg;
  const pct = n => Math.round(n / DATOS.length * 100);
  
  // Resumen de datos procesados
  stats.innerHTML = [
    ["Interacciones", DATOS.length, "+3 vs sem 03", "up"], // #ToDo hay datos en duro
    ["% positivas", pct(pos) + "%", "−9 pts", "down"], // #ToDo hay datos en duro
    ["Activos generados", E.activos.length, "", "up"],  // #ToDo hay datos en duro
    ["Tickets abiertos", E.tickets.filter(t => t.estado !== "Resuelto").length, "+2", "down"], // #ToDo hay datos en duro
    ["Publicados", E.pubs.length, "", "up"]].map(k =>
    `<div class="stat"><div class="k">${k[0]}</div><div class="v">${k[1]}</div><div class="d ${k[3]}">${k[2]}</div></div>`).join("");
 
  bars.innerHTML = `<i style="background:var(--ok);width:${pct(pos)}%"></i><i style="background:var(--border-2);width:${pct(neu)}%"></i><i style="background:var(--alert);width:${pct(neg)}%"></i>`;
  l_pos.textContent = pct(pos) + "%"; l_neu.textContent = pct(neu) + "%"; l_neg.textContent = pct(neg) + "%";
  
  const t = {}; DATOS.forEach(m => m.temas.forEach(x => t[x] = (t[x] || 0) + 1));
  const nuevos = ["Acceso a laboratorios", "Plataforma / Video"];
  temas.innerHTML = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) =>
    `<tr><td>${escHtml(k)} ${nuevos.includes(k) ? '<span class="pill p-pri">nuevo</span>' : ""}</td><td class="mono" style="width:60px">${c}</td></tr>`).join("");
  const nivel = pct(neg) >= 25 ? "err" : pct(neg) >= 15 ? "warn" : "info";
  banner_slot.innerHTML = `<div class="note ${nivel}">${ic("alerta")}<div><b>${nivel === "err" ? "Alerta de sentimiento." : "Resumen del lote."}</b> ${pct(neg)}% de los mensajes analizados fueron negativos, sobre ${DATOS.length} interacciones.</div></div>`;
  /* La IA clasifica siempre: el tipo que trae cada mensaje es solo una pista que puede corregir. */
  const conPista = DATOS.filter(m => m.tipo_pista).length, corregidos = DATOS.filter(m => m.tipo_corregido).length;
  banner_slot.innerHTML += `<div class="note info" style="margin-top:8px">${ic("check")}<div><b>Clasificación de la IA.</b> ${
    conPista ? `Corrigió ${corregidos} de ${conPista} etiquetas de origen` : "Ningún mensaje traía etiqueta"}${
    DATOS.length - conPista ? ` · ${DATOS.length - conPista} llegaron sin etiqueta y los clasificó desde cero` : ""}.</div></div>`;
 
  const cuenta = {};
  E.activos.forEach(a => cuenta[a.formato] = (cuenta[a.formato] || 0) + 1);
  resumen_produccion.innerHTML = Object.entries(cuenta).map(([f, c]) => {
  const p = PLAT[FORMATOS[f].plat];
  return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:7px">
      <span class="row" style="gap:8px"><span class="mk" style="--pc:${p.color};width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-size:.62rem;font-weight:700">${p.ini}</span>${f}</span>
      <b class="mono">${c}</b></div>`;
  }).join("") +
    `<div class="row" style="justify-content:space-between"><span class="row" style="gap:8px">
     <span class="mk" style="--pc:var(--alert);width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-size:.62rem;font-weight:700">!</span>Tickets internos</span>
     <b class="mono">${E.tickets.length}</b></div>`;
  
    apoyo.innerHTML = DATOS.filter(m => m.apoyo).map(m =>
      `<div class="mini" style="border-left:2px solid var(--alert);padding-left:9px"><b>${escHtml(m.autor)}</b> · ${escHtml(m.canal)}<br>${escHtml(m.texto.slice(0, 72))}…</div>`).join("");
  
    cargarTablaMensajes();
}

// carga la tabla con el detalle de los mensajes procesados
function cargarTablaMensajes(mensajes = DATOS) {
  
  const tpl = document.getElementById("tpl_fila_mensaje");
  const targetTabla = document.getElementById("tabla");
  
  if (!tpl || !targetTabla) return;

  const fragment = document.createDocumentFragment();
  const procesados = mensajes.slice().sort((a, b) => b.score - a.score);

  if (procesados.length === 0) {
   
    const trVacio = document.createElement("tr");
    const tdVacio = document.createElement("td");

    tdVacio.colSpan = 7;
    tdVacio.className = "muted";
    tdVacio.style.textAlign = "center";
    tdVacio.style.padding = "16px";
    tdVacio.textContent = "No hay mensajes analizados en este lote.";

    trVacio.appendChild(tdVacio);
    fragment.appendChild(trVacio);
  
  } else {
    
    for (const m of procesados) {
     
      const r = ruta(m);
      const clon = tpl.content.cloneNode(true);

      clon.querySelector('[data-campo="autor"]').textContent = m.autor;
      clon.querySelector('[data-campo="texto"]').textContent =
        m.texto.length > 70 ? `${m.texto.slice(0, 70)}…` : m.texto;
      const tdTipo = clon.querySelector('[data-campo="tipo"]');
      tdTipo.textContent = m.tipo;
      if (m.tipo_corregido) {
        /* la IA no estuvo de acuerdo con la etiqueta que traía el mensaje */
        const pista = document.createElement("span");
        pista.className = "mini tipo-pista";
        pista.textContent = `corregido · venía como ${m.tipo_pista}`;
        tdTipo.append(document.createElement("br"), pista);
        tdTipo.title = "La IA corrigió la etiqueta de origen";
      }

      const tdSent = clon.querySelector('[data-campo="sent"]');
      tdSent.textContent = m.sent.toFixed(2);
     
      if (m.sent > 0.2) tdSent.classList.add("up");
      else if (m.sent < -0.2) tdSent.classList.add("down");

      clon.querySelector('[data-campo="score"]').textContent = m.score;
      clon.querySelector('[data-campo="porque"]').textContent = m.por_que;

      const pill = clon.querySelector('[data-campo="ruta"]');

      pill.className = `pill ${PILL[r]}`;
      pill.textContent = NOM[r];

      fragment.appendChild(clon);
      
    }
  }

  targetTabla.replaceChildren(fragment);
}

/* ---------- CURADURÍA ---------- */
let tabFmt = "linkedin", fEstado = {};
const ESTADOS = ["Todos", "Pendiente", "Listo", "Publicado"];
const pendientesDe = k => E.activos.filter(a => FORMATOS[a.formato].plat === k && a.estado === "Pendiente").length;

async function visualizarCuraduria() {
  
    // Pequeño bloque para reactivar curaduría si se abre un lote antiguo que ya estaba publicado: pasa a Pendiente y se borra la fecha de publicación.
  // if (E.activos) {
  //   E.activos.forEach(a => {
  //     if (a.estado === "Publicado") a.estado = "Pendiente";
  //     delete a.publicado;
  //   });
  //   save();
  // }

  try {
    const res = await fetch(API.base + '/conexiones');
    if (res.ok) {
      const data = await res.json();
      Object.keys(data).forEach(k => {
        if (!PLAT[k]) PLAT[k] = {};
        E.conex[k] = data[k].on;
      });
    }
  } catch (err) {
    console.error("Error al sincronizar conexiones en curaduría:", err);
  }

  if (!E.procesado) {
    tabs_formato.innerHTML = "";
    curaduria.innerHTML = '<div class="block empty">Procesa un lote para ver el contenido generado.</div>'; return;
  }
  
  tabs_formato.innerHTML = TABS.map(([k, n]) => {
    const total = k === "tickets" ? E.tickets.length : E.activos.filter(a => FORMATOS[a.formato].plat === k).length;
    const pend = k === "tickets" ? E.tickets.filter(t => t.estado !== "Enviado" && t.estado !== "Resuelto").length : pendientesDe(k);
    const badge = pend ? `<span class="c pend" title="${pend} sin revisar">${pend}</span>` : `<span class="c" title="${total} en total">${total}</span>`;
    return `<button class="tab" data-t="${k}" aria-selected="${tabFmt === k}">${n}${badge}</button>`;
  }).join("");
  
  tabs_formato.querySelectorAll(".tab").forEach(b => b.onclick = () => { tabFmt = b.dataset.t; visualizarCuraduria(); });
  if (tabFmt === "tickets") { 
    conexion_aviso.innerHTML = ""; 
    return visualizarTicketsEn(curaduria); 
  }
  
  const p = PLAT[tabFmt], conn = E.conex[tabFmt], fE = fEstado[tabFmt] || "Todos";
  
  conexion_aviso.innerHTML = conn ? "" : `<div class="note">${ic("enchufe")}<div><b>${p.nom}</b> no está vinculado. Puedes aprobar, pero no publicar hasta conectarlo en Conexiones.</div></div>`;
  
  const todos = E.activos.filter(a => FORMATOS[a.formato].plat === tabFmt);
  const lista = todos.filter(a => fE === "Todos" || a.estado === fE);
  const pend = pendientesDe(tabFmt);
  const listos = todos.filter(a => a.estado === "Listo").length;
  const card = el("div", "plat");
  
  card.innerHTML = `<div class="plat-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
    <div style="flex:1;min-width:160px"><b>${p.nom}</b><div class="mini">${conn ? p.cuenta + " · " + p.modo : "sin vincular"}${conn && p.url ? ` · <a href="${p.url}" target="_blank" rel="noopener">Ver en la landing</a>` : ""}</div></div>
    <div class="plat-filtros">
      ${ESTADOS.map(e => {
    const n = e === "Todos" ? todos.length : todos.filter(a => a.estado === e).length;
    return `<button aria-pressed="${fE === e}" data-e="${e}">${e} <span class="mono mini">${n}</span></button>`;
  }).join("")}
      ${pend ? '<span class="sep2"></span><button class="btn sm" id="btn_aprobar_todo">' + ic("check") + 'Guardar los ' + pend + ' pendientes</button>' : ""}
      ${listos && conn ? '<button class="btn primary sm" id="btn_publicar_listos">Publicar los ' + listos + ' listos</button>' : ""}
    </div></div>`;
  if (!lista.length) card.appendChild(el("div", "empty", fE === "Todos"
    ? "Este lote no generó contenido para " + p.nom + "."
    : `Nada en estado “${fE}” en ${p.nom}.`));
  
    lista.forEach(a => {
      const m = msg(a.fuente), cfg = FORMATOS[a.formato];
      const pillC = a.estado === "Publicado" ? "p-pri" : a.estado === "Listo" ? "p-ok" : a.estado === "Descartado" ? "p-mute" : "p-warn";
      const it = el("div", "item " + a.estado.toLowerCase());
      it.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:9px">
          <div class="row" style="gap:8px"><b>${a.formato}</b><span class="mono mini">score ${a.score}</span></div>
          <span class="pill ${pillC}">${a.estado}</span></div>
        <details class="acc" style="margin-bottom:9px"><summary>Basado en: mensaje de ${escHtml(m.autor)}</summary>
          <div class="body"><div class="meta">${escHtml(m.canal)} · SCORE ${m.score} · SENT ${m.sent.toFixed(2)}</div>${escHtml(m.texto)}
          <div class="meta" style="margin-top:7px">POR QUÉ ESTE SCORE: ${escHtml(m.por_que)}</div></div></details>
        <textarea rows="${cfg.porPost ? 8 : 6}" id="ta_${a.id}" ${a.estado === "Publicado" ? "readonly" : ""}>${escHtml(a.texto)}</textarea>
        <div class="row" style="justify-content:space-between;margin-top:9px">
          <span class="mini mono" id="c_${a.id}"></span>
          <div class="acciones-activo">${a.estado === "Publicado"
          ? `<span class="mini">Publicado el ${fechaLegible(a.publicado)}</span>`
          : `<button class="btn primary sm" data-ac="publicar" data-id="${a.id}" ${conn ? "" : "disabled"}>Publicar en ${p.nom}</button>
              <button class="btn sm" data-ac="listo" data-id="${a.id}" ${a.estado === "Listo" ? "disabled" : ""}>${a.estado === "Listo" ? ic("check") + "En cola" : "Guardar para después"}</button>
              <span class="sep2"></span>
              <button class="btn sm" data-ac="corto" data-id="${a.id}" title="Acorta el texto">${ic("corto")}Más corto</button>
              <button class="btn sm" data-ac="largo" data-id="${a.id}" title="Alarga el texto o revierte el recorte">${ic("largo")}Más largo</button>
              <button class="btn sm" data-ac="nuevo" data-id="${a.id}" title="Otra versión desde el mismo mensaje">${ic("regenerar")}Volver a generar</button>
              <button class="btn sm" data-ac="descartar" data-id="${a.id}">Descartar</button>`}</div></div>`;
      
      card.appendChild(it);
      const ta = it.querySelector("textarea"), c = it.querySelector("#c_" + a.id);
      const cuenta = () => {
        if (cfg.porPost) {
          const ps = ta.value.split("———").map(x => x.trim()).filter(Boolean), mx = Math.max(0, ...ps.map(x => x.length));
          c.textContent = `${ps.length} posts · máx ${mx}/255`; c.style.color = mx > 280 ? "var(--alert)" : mx > 255 ? "var(--warn)" : "";
        }
        else { c.textContent = `${ta.value.length}/${cfg.limite} caracteres`; c.style.color = ta.value.length > cfg.limite ? "var(--alert)" : ""; }
      };

      cuenta(); ta.oninput = () => { 
        cuenta(); 
        if (ta.value !== a.texto) { 
          a.editado = true; a.texto = ta.value; save(); 
        } 
      };
  });

  curaduria.innerHTML = ""; curaduria.appendChild(card);
  card.querySelectorAll(".plat-filtros [data-e]").forEach(b => b.onclick = () => { fEstado[tabFmt] = b.dataset.e; visualizarCuraduria(); });
  const ba = card.querySelector("#btn_aprobar_todo");
  if (ba) ba.onclick = () => aprobarPendientes(tabFmt);
  const bp = card.querySelector("#btn_publicar_listos");
  if (bp) bp.onclick = () => publicarLote(tabFmt);
  curaduria.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => accion(b.dataset.ac, b.dataset.id));
}

function aprobarPendientes(plat) {
  const n = E.activos.filter(a => FORMATOS[a.formato].plat === plat && a.estado === "Pendiente");
  n.forEach(a => a.estado = "Listo"); 
  save(); 
  visualizar();
  guardarCuraduriaEnOCI().then(ok => {
    if (!ok) { n.forEach(a => a.estado = "Pendiente"); visualizar(); return; }
    toast(n.length + " en cola de " + PLAT[plat].nom, ok === "local" ? "Listos para publicar cuando quieras" : `Guardados en OCI · activos/${E.slug}/curaduria.json`, true);
  });
}

// modal de confirmación antes de publicar  
function confirmarPublicacion(id) {
  const a = E.activos.find(x => x.id === id), cfg = FORMATOS[a.formato], p = PLAT[cfg.plat], m = msg(a.fuente);
  
  // Si NO es X, mantenemos el modal original 
  if (cfg.plat !== "x") {
    dlg.style.maxWidth = "";
    dlg.style.width = "";
    dlg.style.maxHeight = "";
    dlg.style.margin = "";
    dlg_cont.removeAttribute("style");
    const largo = cfg.porPost
      ? a.texto.split("———").length + " posts · máximo " + Math.max(...a.texto.split("———").map(x => x.trim().length)) + "/255 caracteres"
      : a.texto.length + "/" + cfg.limite + " caracteres";
    dlg_cont.innerHTML = `
      <div class="modal-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
        <div style="flex:1"><b>Publicar en ${p.nom}</b><div class="mini">${p.cuenta} · ${p.modo}</div></div></div>
      <div class="modal-body">
        <div class="modal-meta"><span>Formato: <b>${a.formato}</b></span><span>Origen: <b>${escHtml(m.autor)}</b></span>
          <span>Longitud: <b>${largo}</b></span>${a.editado ? "<span>Estado: <b>editado a mano</b></span>" : ""}</div>
        <div><span class="label">Así se va a publicar</span><div class="modal-prev">${escHtml(a.texto)}</div></div>
        <div class="mini">Se registrará en Publicaciones con su enlace y el mensaje que lo originó. Tendrás 6 segundos para deshacer.</div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="dlg_no">Cancelar</button>
        <button class="btn primary" id="dlg_si">Publicar ahora</button>
      </div>`;
    dlg.showModal();
    dlg_no.onclick = () => dlg.close();
    dlg_si.onclick = () => { dlg.close(); publicar(id); };
    setTimeout(() => dlg_si.focus(), 50);
    return;
  }

  // --- LÓGICA EXCLUSIVA PARA X (Hilos / Tuits segmentados) ---
  const partesHilo = cfg.porPost ? a.texto.split("———").map(x => x.trim()).filter(Boolean) : [a.texto];
  const excedeLimite = partesHilo.some(parte => parte.length > 280);
  const largo = partesHilo.length + " posts · máximo " + Math.max(0, ...partesHilo.map(parte => parte.length)) + "/255 caracteres";

  // Cada modal-prev ajustado para que el contenido se visualice completo sin scroll ni recortes
  const vistaPrevia = partesHilo.map((parte, indice) => `
    <div class="modal-prev" style="margin-bottom: 12px; max-height: none; overflow: visible; height: auto; padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
      <div class="row" style="justify-content:space-between; align-items:center; margin-bottom: 6px;">
        <b>Post ${indice + 1}/${partesHilo.length}</b>
        <span class="mini mono">${parte.length}/255 caracteres</span>
      </div>
      <div style="margin: 8px 0; white-space: pre-wrap; word-break: break-word; line-height: 1.55;">${escHtml(parte)}</div>
      <div class="row" style="gap: 8px; flex-wrap: wrap;">
        <button type="button" class="btn sm" data-copy-idx="${indice}">Copiar post ${indice + 1}</button>
        ${parte.length <= 280 ? `<a class="btn sm primary" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(parte)}" target="_blank" rel="noopener">Publicar Post ${indice + 1} en X ↗</a>` : '<span class="mini" style="color:var(--alert)">Supera los 280 caracteres.</span>'}
      </div>
    </div>`).join("");

  // Adaptar el modal a las dimensiones de la pantalla
  dlg.style.maxWidth = "min(800px, 94vw)";
  dlg.style.width = "94vw";
  dlg.style.maxHeight = "90vh";
  dlg.style.margin = "auto";

  dlg_cont.style.maxHeight = "90vh";
  dlg_cont.style.display = "flex";
  dlg_cont.style.flexDirection = "column";
  dlg_cont.style.width = "100%";
  dlg_cont.style.overflow = "hidden";

  dlg_cont.innerHTML = `
    <div class="modal-head" style="flex-shrink: 0;"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div style="flex:1"><b>Gestionar Hilo en ${p.nom}</b><div class="mini">${p.cuenta} · ${p.modo}</div></div></div>
    <div class="modal-body" style="overflow-y: auto; flex: 1; min-height: 0; max-height: calc(90vh - 130px); padding: 16px 18px;">
      <div class="modal-meta"><span>Formato: <b>${a.formato}</b></span><span>Origen: <b>${escHtml(m.autor)}</b></span>
        <span>Longitud: <b>${largo}</b></span>${a.editado ? "<span>Estado: <b>editado a mano</b></span>" : ""}</div>
      <div><span class="label">Secuencia de tuits listos para difusión</span>${vistaPrevia}</div>
      <div class="mini" style="margin-top: 8px;">Puedes abrir cada tuit individualmente en X. Una vez que termines de difundir todo el hilo, puedes marcar el bloque completo como publicado abajo.</div>
      ${excedeLimite ? '<div class="mini" style="color:var(--alert)">Acorta los posts que superan 280 caracteres antes de publicar.</div>' : ""}
    </div>
    <div class="modal-foot" style="flex-shrink: 0;">
      <button class="btn" id="dlg_no">Cancelar</button>
      <button class="btn primary" id="dlg_si" ${excedeLimite ? "disabled" : ""}>Marcar todo el hilo como Publicado</button>
    </div>`;

  dlg_cont.querySelectorAll("[data-copy-idx]").forEach(boton => {
    boton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(partesHilo[Number(boton.dataset.copyIdx)]);
        const originalText = boton.textContent;
        boton.textContent = "¡Copiado!";
        setTimeout(() => { boton.textContent = originalText; }, 1500);
      } catch (error) {
        toast("No se pudo copiar el post", "Selecciona el texto y cópialo manualmente", false);
      }
    };
  });

  const limpiarEstilosDlg = () => {
    dlg.style.maxWidth = "";
    dlg.style.width = "";
    dlg.style.maxHeight = "";
    dlg.style.margin = "";
    dlg_cont.removeAttribute("style");
  };

  dlg.showModal();
  dlg_no.onclick = () => { limpiarEstilosDlg(); dlg.close(); };
  dlg_si.onclick = () => { limpiarEstilosDlg(); dlg.close(); publicar(id); };
  dlg.onclose = () => { limpiarEstilosDlg(); };
  setTimeout(() => dlg_si.focus(), 50);
}

/* Fecha de publicación: se guarda en ISO (la lee la landing) y se muestra legible.
   Los registros antiguos con texto libre ("23 sep, 10:42") se muestran tal cual. */
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaLegible(v) {
  const d = /^\d{4}-\d{2}-\d{2}/.test(v || "") ? new Date(v) : null;
  if (!d || isNaN(d)) return v || "";
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function publicar(id) {
  const a = E.activos.find(x => x.id === id);
  const cfg = FORMATOS[a.formato];
  const plataformaClave = cfg.plat; // Asegura que sea "linkedin" o "x"
  const p = PLAT[plataformaClave];

  /* Web (FAQs) y Newsletter son destinos de la LANDING: no hay API externa a la que llamar.
     Publicar = marcar el activo como Publicado (fecha ISO) y guardar la curaduría en OCI;
     la landing lo lee de /publico/faqs y /publico/newsletter. */
  if (plataformaClave === "web" || plataformaClave === "newsletter") {
    const previo = a.estado;
    a.estado = "Publicado"; a.publicado = new Date().toISOString();
    const pub = { fecha: fechaLegible(a.publicado), plat: plataformaClave, formato: a.formato, extracto: a.texto.slice(0, 64) + "…", fuente: a.fuente };
    E.pubs.unshift(pub); save(); visualizar();
    const revertir = () => { a.estado = previo; delete a.publicado; E.pubs = E.pubs.filter(x => x !== pub); save(); visualizar(); };
    const ok = await guardarCuraduriaEnOCI();
    if (!ok) { revertir(); return; }   /* no quedó en el bucket: no se da por publicado (conError ya mostró el aviso) */
    toast("Publicado en " + p.nom, p.cuenta, true, () => {
      revertir();
      guardarCuraduriaEnOCI().then(ok2 => ok2 && toast("Publicación revertida", "El contenido volvió a " + previo));
    });
    return;
  }

  toast("Enviando a " + p.nom + "...", "Conectando con la API oficial");

  try {
    const respuesta = await fetch(API.base + '/publicar-redes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: a.texto,
        plataforma: plataformaClave,
        formato: a.formato
      })
    });

    const resultado = await respuesta.json();

    console.log("--> [FRONTEND] Respuesta recibida del servidor:", resultado);

    if (resultado.success) {

      // Si la plataforma requiere apertura de ventana asistida (como X por restricción de API)
      if (resultado.modo_asistido && resultado.url_destino) {
        window.open(resultado.url_destino, '_blank');
      }
      
      const previo = a.estado;
      a.estado = "Publicado";
      a.publicado = new Date().toISOString();
      const pub = {
        fecha: fechaLegible(a.publicado),
        plat: plataformaClave,
        formato: a.formato,
        extracto: a.texto.slice(0, 64) + "…",
        fuente: a.fuente
      };
      E.pubs.unshift(pub);
      save();
      visualizar();
      const revertir = () => {
        a.estado = previo;
        delete a.publicado;
        E.pubs = E.pubs.filter(x => x !== pub);
        save();
        visualizar();
      };
      await guardarCuraduriaEnOCI().then(ok => {
        if (!ok) return revertir();
        const detalleToast = (resultado.es_hilo && resultado.posts && resultado.posts.length > 1)
          ? p.cuenta + " · Post 1/" + resultado.posts.length + " abierto en X"
          : p.cuenta;
        toast("¡Publicado con éxito en " + p.nom + "!", detalleToast, true, () => {
          revertir();
          guardarCuraduriaEnOCI().then(ok2 => ok2 && toast("Publicación revertida", "El contenido volvió a " + previo));
        });
      });
    } else {
      toast("Error al publicar", resultado.error || "Verifica tus credenciales en Conexiones", false);
    }
  } catch (err) {
    console.error("Error de red al publicar en redes:", err);
    toast("Error de conexión", "No se pudo comunicar con el backend", false);
  }
}


const GANCHOS = [
  "Nada nos da más orgullo que ver a nuestros talentos conquistando el mercado tech 🚀",
  "Hay historias que explican mejor que cualquier folleto para qué sirve una comunidad 👇",
  "Esto no pasó por suerte: pasó por un proyecto terminado y publicado 💼",
  "De hacer ejercicios a firmar contrato. Así se ve el camino cuando se recorre acompañado 🌱"];
const CIERRE = "\n\n¿Tú también estás construyendo tu portafolio? Cuéntanos en qué andas 👇\n\n#ComunidadONE #AprenderHaciendo";

function accion(ac, id) {
  const a = E.activos.find(x => x.id === id);
  if (ac === "publicar") return confirmarPublicacion(id);
  if (ac === "listo") {
    const previo = a.estado;
    a.estado = "Listo";
    guardarCuraduriaEnOCI().then(ok => {
      if (!ok) { a.estado = previo; visualizar(); return; }   /* no quedó en el bucket: se revierte */
      toast("Guardado en la cola", ok === "local" ? "Listo para publicar cuando quieras" : `Guardado en OCI · activos/${E.slug}/curaduria.json`, true);
    });
    save(); visualizar(); return;
  }
  if (ac === "descartar") { a.estado = "Descartado"; save(); visualizar(); toast("Descartado", "Se puede recuperar desde el filtro Todos"); return; }
  /* variantes de texto: siempre parten del original generado */
  if (!a.base) a.base = a.texto;
  const partes = a.base.split("\n\n");
  if (ac === "corto") {
    a.texto = partes.slice(0, Math.max(2, Math.ceil(partes.length / 2))).join("\n\n") + "\n\n#ComunidadONE";
    a.version = "corta"; toast("Versión más corta", a.texto.length + " caracteres · 1 llamada al LLM");
  }
  if (ac === "largo") {
    a.texto = (a.version === "corta" || a.version === "variante") ? a.base : a.base + CIERRE;
    a.version = (a.version === "corta" || a.version === "variante") ? "original" : "larga";
    toast(a.version === "original" ? "Texto original restaurado" : "Versión más larga", a.texto.length + " caracteres");
  }
  if (ac === "nuevo" && E.slug) {
    toast("Generando otra versión…", "Usa tu guía de voz");
    redactarConVoz([a], { [a.id]: a.texto }).then(ok => {
      if (ok) { a.editado = false; a.version = "original"; toast("Nueva versión", "Generada con tu guía de voz", true); }
      const t = $("#ta_" + id); if (t) { t.value = a.texto; t.dispatchEvent(new Event("input")); }
      save(); visualizarCuraduria();
    });
    return;
  }
  if (ac === "nuevo") {
    a.variante = ((a.variante || 0) + 1) % GANCHOS.length;
    const resto = a.base.split("\n\n").slice(1).join("\n\n");
    a.texto = GANCHOS[a.variante] + "\n\n" + resto; a.version = "variante";
    toast("Nueva versión", "Gancho " + (a.variante + 1) + " de " + GANCHOS.length + " · 1 llamada al LLM");
  }
  const t = $("#ta_" + id); if (t) { t.value = a.texto; t.dispatchEvent(new Event("input")); }
  save(); 
  visualizarCuraduria();
}

function publicarLote(plat) {
  const lista = E.activos.filter(a => FORMATOS[a.formato].plat === plat && a.estado === "Listo"), p = PLAT[plat];
  dlg_cont.innerHTML = `
    <div class="modal-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div style="flex:1"><b>Publicar ${lista.length} contenidos en ${p.nom}</b><div class="mini">${p.cuenta} · ${p.modo}</div></div></div>
    <div class="modal-body">
      <div class="modal-prev">${lista.map(a => "• " + escHtml(a.texto.split("\n")[0].slice(0, 70)) + "…").join("\n\n")}</div>
      <div class="mini">Se publican en orden y quedan registrados en Publicaciones. Tendrás 6 segundos para deshacer.</div></div>
    <div class="modal-foot"><button class="btn" id="dlg_no">Cancelar</button>
      <button class="btn primary" id="dlg_si">Publicar los ${lista.length}</button></div>`;
  dlg.showModal(); dlg_no.onclick = () => dlg.close();
  dlg_si.onclick = () => {
    dlg.close();
    const previos = lista.map(a => ({ a, estado: a.estado })), nuevas = [];
    lista.forEach(a => {
      a.estado = "Publicado"; a.publicado = new Date().toISOString();
      const pub = { fecha: fechaLegible(a.publicado), plat, formato: a.formato, extracto: a.texto.slice(0, 64) + "…", fuente: a.fuente };
      nuevas.push(pub); E.pubs.unshift(pub);
    });

    save(); 
    visualizar();
    const revertir = () => {
      previos.forEach(x => { x.a.estado = x.estado; delete x.a.publicado; });
      E.pubs = E.pubs.filter(x => !nuevas.includes(x)); save(); visualizar();
    };
    /* Queda en activos/<slug>/curaduria.json: de ahí lo lee la landing (FAQs y newsletter) */
    guardarCuraduriaEnOCI().then(ok => {
      if (!ok) return revertir();
      toast(lista.length + " publicados en " + p.nom, p.cuenta, true, () => {
        revertir();
        guardarCuraduriaEnOCI().then(ok2 => ok2 && toast("Publicaciones revertidas", "Todo volvió a la cola"));
      });
    });
  };
}

/* ---------- TICKETS ---------- */

// procesa la lista de tickets pendientes
function filasTickets() {

  return E.tickets.map(t => {
    const m = msg(t.fuente); 
    const esEnviado = t.estado === "Enviado" || t.estado === "Resuelto";
    const pillEstado = esEnviado
      ? "p-ok"
      : t.estado === "Error"
        ? "p-warn"
        : "p-mute";

    // Si ya está enviado o resuelto, no se puede seleccionar ni individual ni globalmente
    const chk = (!esEnviado && t.seleccionado) ? "checked" : "";
    const disabled = esEnviado ? "disabled title='Este ticket ya fue enviado'" : "";

    return `<tr>
      <td style="width:40px;text-align:center"><input type="checkbox" class="chk-ticket" data-id="${t.id}" ${chk} ${disabled} aria-label="Seleccionar ticket ${t.id}"></td>
      <td style="width:75px"><span class="pill ${t.sev === "Alta" ? "p-alert" : "p-warn"}">${t.sev}</span></td>
      <td style="width:160px"><b>${escHtml(m.autor)}</b></td><td style="width:130px" class="muted">${escHtml(m.canal)}</td>
      <td style="min-width:260px;max-width:360px;white-space:normal;word-break:break-word">${escHtml(m.texto)}</td>
      <td style="width:110px">${t.aviso ? `<span class="pill p-mute">${PLAT[t.aviso].nom}</span>` : '<span class="mini">sin avisar</span>'}</td>
      <td style="width:110px"><span class="pill ${pillEstado}">${t.estado}</span></td></tr>`;
  }).join("");

}

function actualizarEstadoBotonesAviso() {
 
  if (avisandoTickets) return;
  
  const elegiblesSeleccionados = E.tickets.filter(t => t.seleccionado && t.estado !== "Enviado" && t.estado !== "Resuelto");
  const haySeleccion = elegiblesSeleccionados.length > 0;

  const btnDiscord = document.getElementById("btn_discord");
  if (btnDiscord) {
    btnDiscord.disabled = !haySeleccion;
    btnDiscord.title = haySeleccion ? "Avisar tickets seleccionados en Discord" : "Selecciona al menos un ticket para avisar";
  }

  const btnAvisar = document.getElementById("btn_avisar");
  if (btnAvisar) {
    btnAvisar.disabled = !haySeleccion;
    btnAvisar.title = haySeleccion ? "Avisar tickets seleccionados en Discord" : "Selecciona al menos un ticket para avisar";
  }
}

function sincronizarChecksTickets() {
  
  const master = document.getElementById("chk_todos_tickets");
  const masterCur = document.getElementById("chk_todos_tickets_curaduria");
  const checks = document.querySelectorAll(".chk-ticket");

  function actualizarMasters() {
    
    // tickets que pueden ser seleccionados segun estado
    const elegibles = E.tickets.filter(t => t.estado !== "Enviado" && t.estado !== "Resuelto");
   
    const totalElegibles = elegibles.length;

    if (!totalElegibles) {

      if (master) { 
        master.checked = false; 
        master.indeterminate = false; 
        master.disabled = true; 
        master.title = "Todos los tickets ya fueron enviados"; 
      }
      
      if (masterCur) { 
        masterCur.checked = false; 
        masterCur.indeterminate = false; 
        masterCur.disabled = true; 
        masterCur.title = "Todos los tickets ya fueron enviados"; 
      }
      
      actualizarEstadoBotonesAviso();

      return;
    }

    if (master) { master.disabled = false; master.title = "Seleccionar todos los tickets pendientes"; }
    if (masterCur) { masterCur.disabled = false; masterCur.title = "Seleccionar todos los tickets pendientes"; }

    const marcados = elegibles.filter(t => t.seleccionado).length;
    const todos = marcados === totalElegibles;
    const alguno = marcados > 0 && marcados < totalElegibles;

    if (master) {
      master.checked = todos;
      master.indeterminate = alguno;
    }

    if (masterCur) {
      masterCur.checked = todos;
      masterCur.indeterminate = alguno;
    }

    actualizarEstadoBotonesAviso();

  }

  checks.forEach(chk => {
    chk.onchange = () => {
      const id = chk.dataset.id;
      const t = E.tickets.find(x => x.id === id);
      // Solo permitir cambio si no es un ticket enviado
      if (t && t.estado !== "Enviado" && t.estado !== "Resuelto") {
        t.seleccionado = chk.checked;
      }
      document.querySelectorAll(`.chk-ticket[data-id="${id}"]`).forEach(c => {
        if (!c.disabled) c.checked = chk.checked;
      });
      actualizarMasters();
    };
  });

  const onMasterChange = (e) => {
    const val = e.target.checked;
    // Solo seleccionar tickets pendientes o con error, nunca los enviados
    E.tickets.forEach(t => {
      if (t.estado !== "Enviado" && t.estado !== "Resuelto") {
        t.seleccionado = val;
      } else {
        t.seleccionado = false;
      }
    });

    document.querySelectorAll(".chk-ticket:not(:disabled)").forEach(chk => { chk.checked = val; });
    document.querySelectorAll(".chk-ticket:disabled").forEach(chk => { chk.checked = false; });

    actualizarMasters();
    
  };

  if (master) master.onchange = onMasterChange;
  if (masterCur) masterCur.onchange = onMasterChange;

  actualizarMasters();
}

// despliega los tickets en el formulario
function visualizarTickets() {
  
  b_tic.textContent = E.procesado ? E.tickets.filter(t => t.estado !== "Resuelto" && t.estado !== "Enviado").length : "—";
  
  tabla_tickets.innerHTML = E.procesado ? filasTickets() : 
    '<tr><td colspan="7" class="empty">Procesa un lote para generar tickets.</td></tr>';
  
  // ToDo actualización de históricos
  tabla_tickets_hist.innerHTML = [["2026-semana-03", "Error 500 al subir el proyecto final", "discord", "15 sep", "17 sep", "Resuelto"],
    ["2026-semana-03", "Video del módulo 2 sin audio", "discord", "16 sep", "18 sep", "Resuelto"],
    ["2026-semana-02", "Certificado no se descarga", "discord", "09 sep", "—", "En curso"]].map(f =>
    `<tr><td><b>${f[0]}</b></td><td>${f[1]}</td><td><span class="pill p-mute">${PLAT[f[2]].nom}</span></td>
    <td class="muted">${f[3]}</td><td class="muted">${f[4]}</td><td><span class="pill ${f[5] === "Resuelto" ? "p-ok" : "p-warn"}">${f[5]}</span></td></tr>`).join("");
  
  sincronizarChecksTickets();

  if (tabFmt === "tickets" && E.procesado) {
    visualizarTicketsEn(curaduria);
  }
}

function visualizarTicketsEn(cont) {
  const card = el("div", "plat");
  card.innerHTML = `<div class="plat-head"><div class="mk" style="--pc:var(--alert)">!</div>
    <div style="flex:1"><b>Tickets internos</b><div class="mini">No se publican: se avisan en el canal del equipo</div></div>
    <span class="mini mono">${E.tickets.length}</span></div>
    <div class="item"><div class="df"><table><thead><tr>
      <th style="width:40px;text-align:center"><input type="checkbox" id="chk_todos_tickets_curaduria" aria-label="Seleccionar todos los tickets" title="Seleccionar todos"></th>
      <th style="width:75px">Severidad</th>
      <th style="width:160px">Reportado por</th>
      <th style="width:130px">Canal</th>
      <th style="min-width:260px">Resumen</th>
      <th style="width:110px">Aviso</th>
      <th style="width:110px">Estado</th>
    </tr></thead>
      <tbody>${filasTickets()}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn primary sm" id="btn_avisar">Avisar en Discord · #soporte-interno</button></div></div>`;
  cont.innerHTML = ""; cont.appendChild(card);
  $("#btn_avisar").onclick = () => avisar("discord");
  sincronizarChecksTickets();
}

let avisandoTickets = false;

function setBloqueoBotonesAviso(bloquear) {
  avisandoTickets = bloquear;
  if (bloquear) {
    const botones = [
      document.getElementById("btn_discord"),
      document.getElementById("btn_avisar")
    ].filter(Boolean);

    botones.forEach(btn => {
      btn.disabled = true;
    });
  } else {
    actualizarEstadoBotonesAviso();
  }
}

// función para enviar mensajes de los tickets pendientes mediante discord
async function avisar(dest) {
  if (avisandoTickets) return;

  if (!E.conex[dest]) { 
    ir("conexiones"); 
    return toast("Falta vincular", PLAT[dest].nom + " no está conectado."); 
  }
  
  const seleccionados = E.tickets.filter(t => t.seleccionado && t.estado !== "Enviado" && t.estado !== "Resuelto");
  if (!seleccionados.length) {
    return toast("Sin selección", "No hay tickets pendientes seleccionados para avisar.");
  }

  try {
    setBloqueoBotonesAviso(true);

    // Pasamos a "En curso" mientras se envía la petición
    seleccionados.forEach(t => { 
      t.estado = "En curso"; 
    }); 
    visualizarTickets();

    const mensaje = "**Tickets para atención**\n\n" + 
       seleccionados.map(t => {
         const m = msg(t.fuente);
         const detalle = m ? 
          `[**${t.sev}**] ${m.autor} (*${m.canal}*): ${m.texto}` : 
          `[**${t.sev}**] Ticket ${t.id}`;
         return `- \`${t.id}\` - ${detalle}`;
       }).join("\n");

    const r = await conError(API.avisarTickets(mensaje, dest),
       "No se pudo enviar mensaje de tickets pendientes.");
   
    if (!r) {
      // Si hubo error, cambiar estado a "Error" con pill p-warn y permitir reintento
      seleccionados.forEach(t => { 
        t.estado = "Error"; 
        t.aviso = null; 
      }); 
      visualizarTickets();
      return;
    }

    // Éxito: cambiar de "En curso" a "Enviado" con pill p-ok y desmarcar check
    seleccionados.forEach(t => { 
      t.aviso = dest; 
      t.estado = "Enviado"; 
      t.seleccionado = false;
    }); 

    save();
    visualizarTickets(); 
    toast(seleccionados.length + " tickets avisados", "Mensaje enviado a " + PLAT[dest].cuenta, true);

  } finally {
    setBloqueoBotonesAviso(false);
  }
}

// botones de aviso rápido en la sección de Tickets
const btn_discord = document.getElementById("btn_discord");
if (btn_discord) btn_discord.onclick = () => avisar("discord"); 

/* ---------- PUBLICACIONES ---------- */
function visualizarPubs() {
  b_pub.textContent = E.pubs.length;
  const n = k => E.pubs.filter(p => p.plat === k).length;
  stats_pub.innerHTML = [["LinkedIn", n("linkedin")], ["X", n("x")], ["FAQ web", n("web")], ["Total semana", E.pubs.length]]
    .map(k => `<div class="stat"><div class="k">${k[0]}</div><div class="v">${k[1]}</div></div>`).join("");
  tabla_pub.innerHTML = E.pubs.length ? E.pubs.map(p => {
    const m = msg(p.fuente); return `<tr>
    <td class="muted">${p.fecha}</td><td><span class="pill p-mute">${PLAT[p.plat].nom}</span></td><td>${p.formato}</td>
    <td class="muted" style="max-width:300px">${escHtml(p.extracto)}</td><td class="muted">${escHtml(m.autor)}</td>
    <td><a href="#" onclick="return false" style="color:var(--link)">ver</a></td></tr>`;
  }).join("")
    : '<tr><td colspan="6" class="empty">Aún no publicas nada esta semana. Publica desde el paso 3 · Curaduría.</td></tr>';
}

/* ---------- HISTORIAL ---------- */
let semanaSel = null;
let listaSemanasCache = [];
let detalleSemanaCache = {};

function obtenerSemanaActual() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const semana1 = new Date(d.getFullYear(), 0, 4);
  const semanaNum = Math.round(((((d - semana1) / 86400000) - 1 + (semana1.getDay() + 6) % 7) / 7) + 1);
  return `${d.getFullYear()}-semana-${String(semanaNum).padStart(2, '0')}`;
}

async function visualizarHistorial() {
  listaSemanasCache = [];

  try {
    const res = await fetch(API.base + '/semanas',{
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : (data.semanas || []);
      
      // Guardamos la lista de objetos
      listaSemanasCache = rawList;
    }
  } catch (err) {
    console.error("Error al conectar con el servidor:", err);
  }

  // Si no hay datos, armamos una estructura base de respaldo
  if (listaSemanasCache.length === 0) {
    listaSemanasCache = [
      { slug: obtenerSemanaActual(), actual: true },
      { slug: "2026-semana-03", actual: false }
    ];
  }

  // Normalizamos para extraer siempre el slug actual seleccionado
  const slugsDisponibles = listaSemanasCache.map(item => typeof item === 'object' ? item.slug : item);

  if (!semanaSel || !slugsDisponibles.includes(semanaSel)) {
    semanaSel = slugsDisponibles[0];
  }

  renderizarMenuSemanas();
  await cargarYRenderizarDetalle(semanaSel);
}

function renderizarMenuSemanas() {
  if (typeof lista_semanas === 'undefined' || !lista_semanas) return;

  lista_semanas.innerHTML = listaSemanasCache.map(item => {
    const slug = typeof item === 'object' ? item.slug : item;
    const isCurrent = typeof item === 'object' ? item.actual : (slug === obtenerSemanaActual());
    
    return `<button class="semana-btn" data-s="${slug}" aria-current="${semanaSel === slug}">
      <div style="flex:1"><b>${slug.replace(/20\d\d-semana-/, "Semana ")}</b>
        <div class="mini">${isCurrent ? 'Semana en curso' : 'Histórico OCI'}</div></div>
      ${isCurrent ? '<span class="pill p-pri">actual</span>' : ""}</button>`;
  }).join("");

  lista_semanas.querySelectorAll(".semana-btn").forEach(b => {
    b.onclick = async () => {
      semanaSel = b.dataset.s;
      renderizarMenuSemanas(); 
      await cargarYRenderizarDetalle(semanaSel);
    };
  });
}

async function cargarYRenderizarDetalle(slug) {
  let d = detalleSemanaCache[slug];

  // Mostramos un mensaje de carga si no está en caché
  if (!d && typeof detalle_semana !== 'undefined' && detalle_semana) {
    detalle_semana.innerHTML = `<div class="mini" style="padding:24px; text-align:center;">Cargando características de ${slug}...</div>`;
  }
  // DESPUÉS
  let motivo = "";
  if (!d) {
    try {
      const res = await fetch(`${API.base}/semanas/${encodeURIComponent(slug)}`);
      if (res.ok) {
        d = await res.json();
        detalleSemanaCache[slug] = d;
      } else {
        let det = "";
        try { det = (await res.json()).detail || ""; } catch (e) { }
        motivo = `${res.status} ${res.statusText}` + (det ? ` · ${det}` : "");
      }
    } catch (err) {
      motivo = err.message;
      console.warn(`No se pudo obtener el detalle remoto para ${slug}`, err);
    }
  }

  // Sin detalle: se dice por qué, en vez de dibujar una semana vacía que parece real
  if (!d) {
    if (typeof detalle_semana !== 'undefined' && detalle_semana) {
      detalle_semana.innerHTML = `<div class="note"><b>No hay detalle guardado para ${slug}.</b>
        ${motivo ? `<div class="mini" style="margin-top:4px">${motivo}</div>` : ""}
        <div class="mini" style="margin-top:4px">El detalle sale de <code>activos/${slug}/resumen.json</code>, que se crea al pulsar
        «Procesar» con mensajes de ese periodo.</div></div>`;
    }
    return;
  }

  const total = d.total || (d.mensajes ? d.mensajes.length : 0);
  const positivo = d.positivo || (d.mensajes ? d.mensajes.filter(m => m.sentimiento === "positivo").length : 0);
  const porcentajePos = total > 0 ? Math.round((positivo / total) * 100) : 0;
  const publicadosCount = d.mensajes ? d.mensajes.filter(m => m.ruta === "exito" || m.ruta === "publicado").length : 0;

  // Extraemos temas únicos a partir de los canales de los mensajes
  const canalesSet = new Set();
  if (d.mensajes) {
    d.mensajes.forEach(m => { if (m.canal) canalesSet.add(m.canal); });
  }
  const temasList = canalesSet.size > 0 ? Array.from(canalesSet) : ["general", "comunidad"];

  if (typeof detalle_semana !== 'undefined' && detalle_semana) {
    detalle_semana.innerHTML = `
      <div class="stats stats-4">
        <div class="stat"><div class="k">Interacciones</div><div class="v">${total}</div></div>
        <div class="stat"><div class="k">% Positivo</div><div class="v">${porcentajePos}%</div></div>
        <div class="stat"><div class="k">Neutrales / Neg.</div><div class="v">${(d.neutral || 0)} / ${(d.negativo || 0)}</div></div>
        <div class="stat"><div class="k">Éxitos / Publicados</div><div class="v">${publicadosCount}</div></div>
      </div>

      <div class="block"><p class="blk-title">Canales / Temas de la semana</p>
        <div class="row" style="margin-top:8px">
          ${temasList.map(t => `<span class="pill p-mute">${t}</span>`).join("")}
        </div>
      </div>

      <div class="block"><p class="blk-title">Mensajes e Interacciones</p>
        <p class="blk-info">Registro detallado de los mensajes procesados en esta semana.</p>
        <div class="df"><table>
          <thead>
            <tr>
              <th>Autor / Canal</th>
              <th>Tipo</th>
              <th>Contenido</th>
              <th>Sentimiento / Estado</th>
            </tr>
          </thead>
          <tbody>
          ${(d.mensajes && d.mensajes.length) ? d.mensajes.map(m => `
            <tr>
              <td>
                <b>${escHtml(m.autor || "Anónimo")}</b><br>
                <span class="mini muted">${escHtml(m.canal || "general")}</span>
              </td>
              <td><span class="pill p-mute">${escHtml(m.tipo || "conversacion")}</span></td>
              <td class="muted" style="max-width:320px">
                ${escHtml(m.texto || "")}
              </td>
              <td>
                <span class="pill ${m.sentimiento === "positivo" ? "p-ok" : m.sentimiento === "negativo" ? "p-warn" : "p-mute"}">
                  ${m.sentimiento || "neutral"}
                </span>
                <div class="mini" style="margin-top:4px">Ruta: ${m.ruta || "revisión"}</div>
              </td>
            </tr>`).join("")
          : '<tr><td colspan="4" class="empty">Sin mensajes registrados todavía.</td></tr>'}
          </tbody>
        </table></div>
      </div>

      <div class="mini">Ruta en OCI: <code>activos/${slug}/</code></div>`;
  }
}

/* ---------- CONEXIONES ---------- */
async function visualizarConex() {
  try {
    const res = await fetch(API.base + '/conexiones');
    if (res.ok) {
      const data = await res.json();

      Object.keys(data).forEach(k => {
        if (!PLAT[k]) PLAT[k] = {};
        PLAT[k].nom = data[k].nombre;
        PLAT[k].cuenta = data[k].cuenta;
        PLAT[k].color = data[k].color;
        PLAT[k].ini = data[k].ini;
        PLAT[k].modo = data[k].tipo || data[k].modo;
        PLAT[k].url = data[k].url;   /* destinos de la landing: enlace al sitio publicado */
        E.conex[k] = data[k].on;
      });
      visualizarCuraduria();   /* el estado real del servidor decide si se puede publicar y muestra el enlace a la landing */
    }
  } catch (err) {
    console.error("Error al obtener conexiones del servidor:", err);
  }

  b_con.textContent = Object.values(E.conex).filter(Boolean).length + "/" + Object.keys(PLAT).length;
  
  lista_conexiones.innerHTML = Object.entries(PLAT).map(([k, p]) => {
    const on = E.conex[k];
    return `<div class="conn"><div class="mk" style="--pc:${p.color || '#666'}">${p.ini || k.substring(0,2).toUpperCase()}</div>
      <div class="b"><b>${p.nom}</b><div class="dot ${on ? "on" : ""}"><i></i>${on ? "Conectado · " + (p.cuenta || '') : "Sin conectar"}</div>
        <div class="mini">${p.modo || ''}</div></div>
      <button class="btn sm ${on ? "" : "primary"}" data-c="${k}">${on ? "Desvincular" : "Conectar"}</button></div>`;
  }).join("");
  
  lista_conexiones.querySelectorAll("[data-c]").forEach(b => b.onclick = () => alternar(b.dataset.c));
  
  lista_vinculadas.innerHTML = Object.entries(PLAT).filter(([k]) => E.conex[k]).map(([k, p]) =>
    `<div class="row" style="justify-content:space-between"><span class="dot on"><i></i>${p.nom} · ${p.cuenta || ''}</span>
      <button class="btn sm" data-c="${k}">Desvincular</button></div>`).join("") || '<p class="mini">No hay cuentas vinculadas.</p>';
  
  lista_vinculadas.querySelectorAll("[data-c]").forEach(b => b.onclick = () => alternar(b.dataset.c));
}

async function alternar(k) {
  const p = PLAT[k], on = E.conex[k];
  const nuevoEstado = !on;

  // Todas las conexiones (reales y simuladas) se van por el endpoint PUT del backend.
  // El backend maneja el éxito inmediato para las simuladas (web, newsletter) y valida tokens para las reales.
  try {
    const res = await fetch(`${API.base}/conexiones/${k}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conectar: nuevoEstado })
    });

    const resultado = await res.json();

    if (res.ok && resultado.status === "exito") {
      E.conex[k] = nuevoEstado;
      save(); 
      visualizarConex(); 
      toast(on ? p.nom + " desvinculado" : p.nom + " conectado", on ? "Lo ya publicado no se borra." : (p.cuenta || 'Vinculado con éxito'), !on);
    } else {
      alert(resultado.mensaje || "No se pudo completar la conexión.");
    }
  } catch (err) {
    console.error("Error al conectar con el servidor:", err);
    alert("Error de red al intentar actualizar la conexión." + err.message);
  }
}

/* ---------- AJUSTES ---------- */
const ESTILOS = ["Cercano", "Amistoso", "Profesional", "Formal", "Inspirador", "Celebratorio", "Didáctico", "Técnico", "Breve", "Sobrio", "Con emojis", "Sin emojis", "Sin hashtags", "Primera persona plural"];
const EXCLUYENTES = { "Con emojis": "Sin emojis", "Sin emojis": "Con emojis" };
function visualizarChips() {
  voz_chips.innerHTML = E.chips.map(c => `<span class="vchip">${c}<button data-q="${c}" title="Quitar">×</button></span>`).join("");
  voz_chips.querySelectorAll("button").forEach(b => b.onclick = () => { E.chips = E.chips.filter(x => x !== b.dataset.q); save(); visualizarChips(); });
  chips_estilo.innerHTML = ESTILOS.map(e => `<button aria-pressed="${E.chips.includes(e)}" data-e="${e}">${E.chips.includes(e) ? ic("check") : ""}${e}</button>`).join("");
  chips_estilo.querySelectorAll("button").forEach(b => b.onclick = () => {
    const e = b.dataset.e;
    E.chips = E.chips.includes(e) ? E.chips.filter(x => x !== e) : [...E.chips.filter(x => x !== EXCLUYENTES[e]), e]; 
    save(); 
    visualizarChips();
  });
}

btn_voz.onclick = async () => {
  const r = await conError(API.guardarVoz(voz.value, E.chips), "No se pudo guardar la guía de voz");
  if (!r) return;
  if (r.voz) { voz.value = r.voz.texto; E.chips = r.voz.chips; visualizarChips(); }   /* estado = lo realmente persistido */
  voz_msg.textContent = E.chips.length ? "Guardada con " + E.chips.length + " chips de estilo" : "Guardada";
  toast("Guía de voz guardada", "Se aplica a todo lo que se genere desde ahora", true);
};

/* Al abrir el panel, carga la guía vigente del servidor (si no hay backend se queda la del HTML) */
(async () => {
  const v = await API.voz().catch(() => null);
  if (!v) return;
  voz.value = v.texto; E.chips = v.chips || []; visualizarChips();
})();

function recalcular() {
  U.descartar = +u_desc.value; U.exito_score = +u_ex.value;
  if (E.procesado) {
    const previos = E.activos, c = construir();
    /* Conserva el trabajo humano: si el activo sigue existiendo tras el recálculo,
       mantiene su texto editado y su estado. Solo nacen los que cambian de rama. */
    c.activos.forEach(n => {
      const v = previos.find(x => x.formato === n.formato && x.fuente === n.fuente);
      if (v) Object.assign(n, {
        estado: v.estado, texto: v.texto, editado: v.editado,
        publicado: v.publicado, base: v.base, version: v.version, variante: v.variante, huella: v.huella
      });
    });
    const perdidos = previos.filter(v => !c.activos.some(n => n.formato === v.formato && n.fuente === v.fuente)
      && (v.estado !== "Pendiente" || v.editado)).length;
    E.activos = c.activos; E.tickets = c.tickets; save();
    if (perdidos) toast(`${perdidos} borrador${perdidos === 1 ? "" : "es"} ya no aplica${perdidos === 1 ? "" : "n"}`,
      "Cambiaron de rama con los nuevos umbrales");
  }
  visualizar(); 
  toast("Umbrales aplicados", `descartar < ${U.descartar} · éxito ≥ ${U.exito_score}`, true);
  irPaso(2);
  ir("flujo");
}

btn_umbrales.onclick = () => {
  const enRiesgo = E.activos.filter(a => a.estado !== "Pendiente" || a.editado);
  if (!enRiesgo.length) return recalcular();
  const editados = enRiesgo.filter(a => a.editado).length,
    cola = E.activos.filter(a => a.estado === "Listo").length,
    pub = E.activos.filter(a => a.estado === "Publicado").length;
  dlg_cont.innerHTML = `
    <div class="modal-head"><div class="mk" style="--pc:var(--warn)">!</div>
      <div style="flex:1"><b>Recalcular el lote con los nuevos umbrales</b>
        <div class="mini">descartar &lt; ${u_desc.value} · caso de éxito ≥ ${u_ex.value}</div></div></div>
    <div class="modal-body">
      <div class="modal-meta">
        <span>Borradores editados a mano: <b>${editados}</b></span>
        <span>En cola: <b>${cola}</b></span>
        <span>Ya publicados: <b>${pub}</b></span></div>
      <div class="mini">Los contenidos que sigan existiendo conservan su texto y su estado.
        Los que cambien de rama con los nuevos umbrales desaparecen. Lo ya publicado no se borra
        del registro de Publicaciones.</div></div>
    <div class="modal-foot"><button class="btn" id="dlg_no">Cancelar</button>
      <button class="btn primary" id="dlg_si">Recalcular</button></div>`;
  dlg.showModal(); dlg_no.onclick = () => dlg.close();
  dlg_si.onclick = () => { dlg.close(); recalcular(); };
  setTimeout(() => dlg_no.focus(), 50);
};

// visualizar datos del flujo de trabajo
function visualizar() { 
  visualizarAnalisis(); 
  visualizarCuraduria(); 
  visualizarTickets(); 
  visualizarPubs(); 
  visualizarConex(); 
  visualizarHistorial(); 
}

visualizarChips(); 
visualizar(); 

/* Primera carga del Panorama al arrancar; después se vuelve a consultar cada vez que se abre
   la pestaña (ver ir()) y cuando cambian sus filtros. */
visualizarDashboard(); 

ir("flujo");
irPaso(1);
