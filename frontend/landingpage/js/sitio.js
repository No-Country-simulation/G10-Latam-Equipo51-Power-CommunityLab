/* ============================================================
   Insight Mind · sitio público · comportamiento
   Los datos llegan por window.Datos (js/datos.js).
   ============================================================ */
(() => {
  const $ = s => document.querySelector(s);
  const { escapar } = Datos;
  const raiz = document.documentElement;

  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fecha = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}` : "";
  };
  const ico = (id, extra = "") => `<svg class="ico ${extra}" aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ---------- Tema ---------- */
  const CLAVE_TEMA = "im-sitio-tema";
  const oscuroSistema = matchMedia("(prefers-color-scheme: dark)");
  const botonTema = $("#boton_tema");

  function temaEfectivo() {
    return raiz.dataset.theme || (oscuroSistema.matches ? "dark" : "light");
  }
  function pintarTema() {
    const t = temaEfectivo();
    raiz.dataset.temaEfectivo = t;
    botonTema.setAttribute("aria-label", t === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
    document.querySelectorAll('meta[name="theme-color"]').forEach(m =>
      m.setAttribute("content", t === "dark" ? "#121317" : "#F1F2F4"));
  }
  botonTema.addEventListener("click", () => {
    const nuevo = temaEfectivo() === "dark" ? "light" : "dark";
    raiz.dataset.theme = nuevo;
    try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch (e) {}
    pintarTema();
  });
  oscuroSistema.addEventListener("change", pintarTema);
  pintarTema();

  /* ---------- Enlace a la aplicación ---------- */
  $("#boton_entrar").href = Datos.URL_APP;

  /* ---------- Cabecera: línea al hacer scroll y ancla activa ---------- */
  const cabecera = $("#cabecera");
  const marcarScroll = () => { cabecera.dataset.scroll = scrollY > 8 ? "si" : "no"; };
  addEventListener("scroll", marcarScroll, { passive: true });
  marcarScroll();

  const anclas = [...document.querySelectorAll(".anclas a")];
  const observador = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      anclas.forEach(a => {
        if (a.getAttribute("href") === `#${e.target.id}`) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["producto", "planes", "faqs", "newsletter"].forEach(id => observador.observe(document.getElementById(id)));

  /* ---------- Revelado al hacer scroll ---------- */
  const revelador = raiz.classList.contains("anim")
    ? new IntersectionObserver(entradas => entradas.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add("visible");
        revelador.unobserve(e.target);
      }), { rootMargin: "0px 0px -8% 0px", threshold: .12 })
    : null;
  /* Marca y observa: `grupos` escalonan a sus hijos (--i) */
  function revelar(selector, { grupo = false } = {}) {
    document.querySelectorAll(selector).forEach(el => {
      const objetivos = grupo ? [...el.children] : [el];
      objetivos.forEach((o, i) => {
        if (o.hasAttribute("data-revelar")) return;
        o.setAttribute("data-revelar", "");
        if (grupo) o.style.setProperty("--i", Math.min(i, 6));
        if (revelador) revelador.observe(o); else o.classList.add("visible");
      });
    });
  }
  revelar(".producto_intro, .seccion_cabeza, .subtitulo, .decide, .faqs_cabeza, .boletin, .aviso_provisional");
  revelar(".pasos", { grupo: true });

  /* ---------- Estados de carga / error ---------- */
  const esqueleto = n => `<div class="cargando" aria-hidden="true">${"<span></span>".repeat(n)}</div>`;
  function fallo(contenedor, que, reintentar) {
    contenedor.innerHTML = `<div class="vacio" role="status"><b>No pudimos cargar ${que}.</b><br>Revisa tu conexión e inténtalo de nuevo.<br>
      <button class="boton boton_secundario boton_chico" type="button">Reintentar</button></div>`;
    contenedor.querySelector("button").addEventListener("click", reintentar);
  }
  async function cargar(contenedor, n, que, pintar) {
    contenedor.setAttribute("aria-busy", "true");
    contenedor.innerHTML = contenedor.tagName === "OL" ? `<li>${esqueleto(n)}</li>` : esqueleto(n);
    try {
      await pintar();
      revelar(`#${contenedor.id}`, { grupo: true });
    } catch (e) {
      console.warn(e);
      fallo(contenedor, que, () => cargar(contenedor, n, que, pintar));
    } finally {
      contenedor.setAttribute("aria-busy", "false");
    }
  }

  /* ---------- Planes ---------- */
  const listaPlanes = $("#lista_planes");
  cargar(listaPlanes, 3, "los planes", async () => {
    const datos = await Datos.planes();
    $("#aviso_planes").hidden = !datos.provisional;
    listaPlanes.innerHTML = datos.planes.map(p => {
      const gratis = p.precio === "0" || p.precio === 0;
      const precio = p.precio == null
        ? `<span class="cifra cifra_texto">A medida</span>`
        : gratis
          ? `<span class="cifra cifra_texto">Gratis</span><span class="periodo">${escapar(p.periodo || "")}</span>`
          : `<span class="moneda">${escapar(datos.moneda || "")}</span><span class="cifra">${escapar(p.precio)}</span><span class="periodo">${escapar(p.periodo || "")}</span>`;
      const url = new URL(Datos.URL_APP);
      url.searchParams.set("plan", p.id);
      return `<article class="plan" data-destacado="${!!p.destacado}" aria-labelledby="plan_${escapar(p.id)}">
        <div class="plan_cabeza">
          <h3 class="plan_nombre" id="plan_${escapar(p.id)}">${escapar(p.nombre)}</h3>
          ${p.destacado ? `<span class="plan_sello">Recomendado</span>` : ""}
        </div>
        <p class="plan_precio">${precio}</p>
        <p class="plan_para">${escapar(p.para_quien)}</p>
        <ul class="plan_incluye">${(p.incluye || []).map(i => `<li>${ico("i_check")}<span>${escapar(i)}</span></li>`).join("")}</ul>
        <a class="boton ${p.destacado ? "boton_primario" : "boton_secundario"}" href="${escapar(url.href)}">${escapar(p.boton || "Elegir")}</a>
      </article>`;
    }).join("");
  });

  /* ---------- FAQs ---------- */
  const listaFaqs = $("#lista_faqs");
  cargar(listaFaqs, 5, "las preguntas", async () => {
    const faqs = await Datos.faqs();
    if (!faqs.length) {
      listaFaqs.innerHTML = `<p class="vacio">Todavía no hay preguntas publicadas. Vuelve pronto.</p>`;
      return;
    }
    listaFaqs.innerHTML = faqs.map(f => `<details class="faq" id="faq_${escapar(f.id)}">
        <summary><span>${escapar(f.pregunta)}</span>${ico("i_mas")}</summary>
        <div class="faq_respuesta prosa">${f.respuestaHtml}
          ${f.publicado ? `<time class="faq_fecha" datetime="${escapar(f.publicado)}">Publicado el ${fecha(f.publicado)}</time>` : ""}
        </div>
      </details>`).join("");
  });

  /* ---------- Newsletter: ediciones ---------- */
  const listaEdiciones = $("#lista_ediciones");
  const dialogo = $("#dialogo_edicion");
  let ediciones = [];
  let disparador = null;

  cargar(listaEdiciones, 3, "las ediciones", async () => {
    ediciones = await Datos.ediciones();
    if (!ediciones.length) {
      listaEdiciones.innerHTML = `<li class="vacio">Todavía no hay ediciones publicadas. La primera llega este viernes.</li>`;
      return;
    }
    listaEdiciones.innerHTML = ediciones.slice(0, 3).map((e, i) => `<li>
        <button class="edicion_fila" type="button" data-i="${i}" aria-haspopup="dialog">
          <time datetime="${escapar(e.publicado || "")}">${fecha(e.publicado)}</time>
          <span><b>${escapar(e.titulo)}</b><span class="extracto">${escapar(e.extracto)}</span></span>
          <span class="leer">Leer${ico("i_flecha")}</span>
        </button>
      </li>`).join("");
  });

  listaEdiciones.addEventListener("click", ev => {
    const b = ev.target.closest(".edicion_fila");
    if (!b) return;
    const e = ediciones[+b.dataset.i];
    if (!e) return;
    disparador = b;
    $("#edicion_titulo").textContent = e.titulo;
    const t = $("#edicion_fecha");
    t.textContent = fecha(e.publicado);
    t.setAttribute("datetime", e.publicado || "");
    $("#edicion_contenido").innerHTML = e.cuerpoHtml;
    dialogo.showModal();
    dialogo.scrollTop = 0;
  });
  $("#boton_cerrar_edicion").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("click", ev => { if (ev.target === dialogo) dialogo.close(); });
  dialogo.addEventListener("close", () => { if (disparador) disparador.focus({ preventScroll: true }); });

  /* ---------- Newsletter: suscripción ---------- */
  const form = $("#form_suscripcion");
  const campo = $("#campo_correo");
  const mensaje = $("#suscripcion_mensaje");
  const MENSAJE_BASE = mensaje.textContent;
  const correoValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function estadoForm(estado, html) {
    form.dataset.estado = estado;
    mensaje.innerHTML = html;
    campo.setAttribute("aria-invalid", estado === "error" ? "true" : "false");
  }

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const correo = campo.value.trim();
    if (!correo) {
      estadoForm("error", `${ico("i_cerrar")}<span>Escribe tu correo para suscribirte.</span>`);
      campo.focus();
      return;
    }
    if (!correoValido(correo)) {
      estadoForm("error", `${ico("i_cerrar")}<span>Ese correo no parece completo. Revisa que tenga @ y un dominio, como nombre@correo.com.</span>`);
      campo.focus();
      return;
    }
    // TODO: enviar la suscripción al servicio real (p. ej. POST {ORIGEN}/suscripciones con { correo }).
    // En la v1 no se envía nada: solo se confirma en pantalla.
    estadoForm("exito", `${ico("i_check")}<span>Listo. Te escribiremos el viernes a <strong>${escapar(correo)}</strong>.</span>`);
    form.reset();
  });
  campo.addEventListener("input", () => {
    if (form.dataset.estado === "error") estadoForm("", escapar(MENSAJE_BASE));
  });
})();
