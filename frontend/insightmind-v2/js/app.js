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

function toast(titulo, texto, ok, undo) {
  const t = el("div", "toast" + (ok ? " ok" : ""), `<div><b>${titulo}</b>${texto || ""}</div>`);
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

btn_file.onclick = () => file.click(); file.onchange = subirYValidar; btn_ejemplo.onclick = validar;
drop.addEventListener("dragover", e => { e.preventDefault(); drop.style.borderColor = "var(--primary)"; });
drop.addEventListener("dragleave", () => drop.style.borderColor = "");
drop.addEventListener("drop", e => {
  e.preventDefault(); drop.style.borderColor = "";
  if (e.dataTransfer.files[0]) { file.files = e.dataTransfer.files; subirYValidar(); }
});

function validar() { validacion.hidden = false; toast("Archivo cargado", "12 interacciones válidas · 1 duplicada eliminada"); }

async function subirYValidar() {
  const archivo = file.files[0]; if (!archivo) return;
  const r = await conError(API.subirArchivo(archivo), "No se pudo subir el archivo a OCI");
  if (!r) return;
  validacion.hidden = false;
  toast("Archivo subido a OCI", archivo.name, true);
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
  "guardar · OCI Object Storage"
];

/***
 *   "generar · LinkedIn, X, FAQ y newsletter",
 *   "newsletter_semanal · highlights",
 */

async function procesarLote(lote = {}) {
  return conError(API.procesarLote(lote),
    "No se pudo procesar el lote. Revisa que main.py esté corriendo y COHERE_API_KEY configurada.");
}

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
  const totalPasos = nodos.length;

  for (let i = 0; i < totalPasos; i++) {
    if (E.paso !== 2) return;
    nodos[i].className = "step run";
    await new Promise(r => setTimeout(r, 600));  // espera de 0.6s entre cada paso
    if (E.paso !== 2) return;
    nodos[i].className = "step done";
    const pct = totalPasos > 0 ? Math.round(((i + 1) / totalPasos) * 70) : 70;
    actualizarProgreso(pct);
  }

  if (totalPasos === 0) {
    actualizarProgreso(70);
  }

  // invoca /procesar en FastAPI: al recibir response sube 15% (a 85%)
  const resultado = await procesarLote();
  if (!resultado) { irPaso(1); return; }
  if (E.paso !== 2) return;
  actualizarProgreso(85);

  await fin(resultado);
};

async function fin(resultado) {
  if (!resultado) { irPaso(1); return; }   /* conError ya mostró el toast de error */
  E.slug = resultado.slug;
  oci_ruta.textContent = `activos/${E.slug}/paquete-distribucion.json`; oci_linea.hidden = false;

  /* Reemplaza el lote de ejemplo por los mensajes reales que analizó Cohere.
     DATOS es const: se muta el arreglo en vez de reasignarlo. */
  DATOS.length = 0;
  resultado.mensajes.forEach((m, i) => DATOS.push({
    id: "m" + (i + 1), autor: m.autor, canal: m.canal || "general", tipo: m.tipo,
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

  // invoca /generar en FastAPI: al recibir response sube 15% (a 100%)
  const conIA = await redactarConVoz(pendientes);   /* reemplaza las plantillas SOLO de los pendientes */
  if (E.paso !== 2) return;
  actualizarProgreso(100);

  E.activos = c.activos; E.tickets = c.tickets; E.procesado = true; save();
  visualizar(); 
  analisis_resultado.hidden = false;
  toast("Lote procesado", `${pendientes.length} activos generados · ${reutilizados} reutilizados · ${c.tickets.length} tickets` + (conIA ? " · con tu guía de voz" : ""), true);
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
    `<tr><td>${k} ${nuevos.includes(k) ? '<span class="pill p-pri">nuevo</span>' : ""}</td><td class="mono" style="width:60px">${c}</td></tr>`).join("");
  const nivel = pct(neg) >= 25 ? "err" : pct(neg) >= 15 ? "warn" : "info";
  banner_slot.innerHTML = `<div class="note ${nivel}">${ic("alerta")}<div><b>${nivel === "err" ? "Alerta de sentimiento." : "Resumen del lote."}</b> ${pct(neg)}% de los mensajes analizados fueron negativos, sobre ${DATOS.length} interacciones.</div></div>`;
 
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
      `<div class="mini" style="border-left:2px solid var(--alert);padding-left:9px"><b>${m.autor}</b> · ${m.canal}<br>${m.texto.slice(0, 72)}…</div>`).join("");
  
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
      clon.querySelector('[data-campo="tipo"]').textContent = m.tipo;

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

function visualizarCuraduria() {
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
    <div style="flex:1;min-width:160px"><b>${p.nom}</b><div class="mini">${conn ? p.cuenta + " · " + p.modo : "sin vincular"}</div></div>
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
        <details class="acc" style="margin-bottom:9px"><summary>Basado en: mensaje de ${m.autor}</summary>
          <div class="body"><div class="meta">${m.canal} · SCORE ${m.score} · SENT ${m.sent.toFixed(2)}</div>${m.texto}
          <div class="meta" style="margin-top:7px">POR QUÉ ESTE SCORE: ${m.por_que}</div></div></details>
        <textarea rows="${cfg.porPost ? 8 : 6}" id="ta_${a.id}" ${a.estado === "Publicado" ? "readonly" : ""}>${a.texto}</textarea>
        <div class="row" style="justify-content:space-between;margin-top:9px">
          <span class="mini mono" id="c_${a.id}"></span>
          <div class="acciones-activo">${a.estado === "Publicado"
          ? `<span class="mini">Publicado el ${a.publicado}</span>`
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
          const ps = ta.value.split("———"), mx = Math.max(...ps.map(x => x.trim().length));
          c.textContent = `${ps.length} posts · máx ${mx}/280`; c.style.color = mx > 280 ? "var(--alert)" : "";
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

/* modal de confirmación antes de publicar */
function confirmarPublicacion(id) {
  const a = E.activos.find(x => x.id === id), cfg = FORMATOS[a.formato], p = PLAT[cfg.plat], m = msg(a.fuente);
  const largo = cfg.porPost
    ? a.texto.split("———").length + " posts · máximo " + Math.max(...a.texto.split("———").map(x => x.trim().length)) + "/280 caracteres"
    : a.texto.length + "/" + cfg.limite + " caracteres";
  dlg_cont.innerHTML = `
    <div class="modal-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div style="flex:1"><b>Publicar en ${p.nom}</b><div class="mini">${p.cuenta} · ${p.modo}</div></div></div>
    <div class="modal-body">
      <div class="modal-meta"><span>Formato: <b>${a.formato}</b></span><span>Origen: <b>${m.autor}</b></span>
        <span>Longitud: <b>${largo}</b></span>${a.editado ? "<span>Estado: <b>editado a mano</b></span>" : ""}</div>
      <div><span class="label">Así se va a publicar</span><div class="modal-prev">${a.texto.replace(/</g, "&lt;")}</div></div>
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
}

function publicar(id) {
  const a = E.activos.find(x => x.id === id), p = PLAT[FORMATOS[a.formato].plat];
  const previo = a.estado;
  a.estado = "Publicado"; a.publicado = "23 sep, 10:4" + Math.floor(Math.random() * 9);
  const pub = { fecha: a.publicado, plat: FORMATOS[a.formato].plat, formato: a.formato, extracto: a.texto.slice(0, 64) + "…", fuente: a.fuente };
  E.pubs.unshift(pub); save(); visualizar();
  toast("Publicado en " + p.nom, p.cuenta, true, () => {
    a.estado = previo; delete a.publicado; E.pubs = E.pubs.filter(x => x !== pub); save(); visualizar();
    toast("Publicación revertida", "El contenido volvió a " + previo);
  });
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
      <div class="modal-prev">${lista.map(a => "• " + a.texto.split("\n")[0].slice(0, 70).replace(/</g, "&lt;") + "…").join("\n\n")}</div>
      <div class="mini">Se publican en orden y quedan registrados en Publicaciones. Tendrás 6 segundos para deshacer.</div></div>
    <div class="modal-foot"><button class="btn" id="dlg_no">Cancelar</button>
      <button class="btn primary" id="dlg_si">Publicar los ${lista.length}</button></div>`;
  dlg.showModal(); dlg_no.onclick = () => dlg.close();
  dlg_si.onclick = () => {
    dlg.close();
    const previos = lista.map(a => ({ a, estado: a.estado })), nuevas = [];
    lista.forEach(a => {
      a.estado = "Publicado"; a.publicado = "23 sep, 10:4" + Math.floor(Math.random() * 9);
      const pub = { fecha: a.publicado, plat, formato: a.formato, extracto: a.texto.slice(0, 64) + "…", fuente: a.fuente };
      nuevas.push(pub); E.pubs.unshift(pub);
    });

    save(); 
    visualizar();
    toast(lista.length + " publicados en " + p.nom, p.cuenta, true, () => {
      previos.forEach(x => { x.a.estado = x.estado; delete x.a.publicado; });
      E.pubs = E.pubs.filter(x => !nuevas.includes(x)); save(); visualizar(); toast("Publicaciones revertidas", "Todo volvió a la cola");
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
      <td style="width:160px"><b>${m.autor}</b></td><td style="width:130px" class="muted">${m.canal}</td>
      <td style="min-width:260px;max-width:360px;white-space:normal;word-break:break-word">${m.texto}</td>
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
    <td class="muted" style="max-width:300px">${p.extracto}</td><td class="muted">${m.autor}</td>
    <td><a href="#" onclick="return false" style="color:var(--link)">ver</a></td></tr>`;
  }).join("")
    : '<tr><td colspan="6" class="empty">Aún no publicas nada esta semana. Publica desde el paso 3 · Curaduría.</td></tr>';
}

/* ---------- HISTORIAL ---------- */
let semanaSel = "2026-semana-03";

function visualizarHistorial() {
  
  const semanas = ["2026-semana-04", "2026-semana-03", "2026-semana-02"];
  
  lista_semanas.innerHTML = semanas.map(s => {
    const d = s === "2026-semana-04" ? { 
      inter: E.procesado ? 12 : 0, publicados: E.pubs.length } : HIST[s];
    return `<button class="semana-btn" data-s="${s}" aria-current="${semanaSel === s}">
      <div style="flex:1"><b>${s.replace("2026-semana-", "Semana ")}</b>
        <div class="mini">${d.inter} interacciones · ${d.publicados} publicados</div></div>
      ${s === "2026-semana-04" ? '<span class="pill p-pri">actual</span>' : ""}</button>`;
  }).join("");
 
  lista_semanas.querySelectorAll(".semana-btn").forEach(b => b.onclick = () => { semanaSel = b.dataset.s; visualizarHistorial(); });
  const act = semanaSel === "2026-semana-04";
  const d = act ? {
    inter: E.procesado ? 12 : 0, pos: 58, neg: 25, activos: E.activos.length, publicados: E.pubs.length,
    tickets: E.tickets.length, temas: ["Acceso a laboratorios", "Contratación / Logros", "LangGraph"],
    contenidos: E.activos.map(a => [FORMATOS[a.formato].plat, a.formato, a.texto.slice(0, 52) + "…", a.estado]),
    tickets_list: E.tickets.map(t => [msg(t.fuente).texto.slice(0, 46) + "…", t.estado])
  } : HIST[semanaSel];
  detalle_semana.innerHTML = `
    <div class="stats stats-4">
      <div class="stat"><div class="k">Interacciones</div><div class="v">${d.inter}</div></div>
      <div class="stat"><div class="k">% positivo</div><div class="v">${d.pos}%</div></div>
      <div class="stat"><div class="k">Activos</div><div class="v">${d.activos}</div></div>
      <div class="stat"><div class="k">Publicados</div><div class="v">${d.publicados}</div></div>
    </div>
    <div class="block"><p class="blk-title">Temas de la semana</p>
      <div class="row" style="margin-top:8px">${d.temas.map(t => `<span class="pill p-mute">${t}</span>`).join("")}</div></div>
    <div class="block"><p class="blk-title">Contenidos</p>
      <p class="blk-info">Todo lo que se generó esa semana, con su estado final.</p>
      <div class="df"><table><thead><tr><th>Plataforma</th><th>Formato</th><th>Contenido</th><th>Estado</th></tr></thead><tbody>
      ${d.contenidos.length ? d.contenidos.map(c => `<tr><td><span class="pill p-mute">${PLAT[c[0]].nom}</span></td><td>${c[1]}</td>
        <td class="muted" style="max-width:280px">${c[2]}</td>
        <td><span class="pill ${c[3] === "Publicado" ? "p-ok" : c[3] === "Descartado" ? "p-mute" : "p-warn"}">${c[3]}</span></td></tr>`).join("")
      : '<tr><td colspan="4" class="empty">Sin contenidos todavía.</td></tr>'}
      </tbody></table></div></div>
    <div class="block"><p class="blk-title">Tickets</p>
      <div class="df"><table><thead><tr><th>Ticket</th><th>Estado</th></tr></thead><tbody>
      ${d.tickets_list.length ? d.tickets_list.map(t => `<tr><td>${t[0]}</td>
        <td><span class="pill ${t[1] === "Resuelto" ? "p-ok" : "p-warn"}">${t[1]}</span></td></tr>`).join("")
      : '<tr><td colspan="2" class="empty">Sin tickets.</td></tr>'}
      </tbody></table></div></div>
    <div class="mini">Ruta en OCI: <code>activos/${semanaSel}/</code></div>`;
}

/* ---------- CONEXIONES ---------- */
function visualizarConex() {
  b_con.textContent = Object.values(E.conex).filter(Boolean).length + "/" + Object.keys(PLAT).length;
  lista_conexiones.innerHTML = Object.entries(PLAT).map(([k, p]) => {
    const on = E.conex[k];
    return `<div class="conn"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div class="b"><b>${p.nom}</b><div class="dot ${on ? "on" : ""}"><i></i>${on ? "Conectado · " + p.cuenta : "Sin conectar"}</div>
        <div class="mini">${p.modo}</div></div>
      <button class="btn sm ${on ? "" : "primary"}" data-c="${k}">${on ? "Desvincular" : "Conectar"}</button></div>`;
  }).join("");
  lista_conexiones.querySelectorAll("[data-c]").forEach(b => b.onclick = () => alternar(b.dataset.c));
  lista_vinculadas.innerHTML = Object.entries(PLAT).filter(([k]) => E.conex[k]).map(([k, p]) =>
    `<div class="row" style="justify-content:space-between"><span class="dot on"><i></i>${p.nom} · ${p.cuenta}</span>
      <button class="btn sm" data-c="${k}">Desvincular</button></div>`).join("") || '<p class="mini">No hay cuentas vinculadas.</p>';
  lista_vinculadas.querySelectorAll("[data-c]").forEach(b => b.onclick = () => alternar(b.dataset.c));
}
function alternar(k) {
  const p = PLAT[k], on = E.conex[k]; E.conex[k] = !on; 
  save(); 
  visualizar();
  toast(on ? p.nom + " desvinculado" : p.nom + " conectado", on ? "Lo ya publicado no se borra." : p.cuenta, !on);
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

/* El Panorama se dibuja una sola vez: sus cifras son historia ya cerrada en
   MongoDB y no cambian porque en esta sesión se apruebe o se publique algo.
   Sus propios filtros lo vuelven a dibujar cuando hace falta. */
visualizarDashboard(); 

ir("flujo");
irPaso(1);
