/* Insight Mind · páginas legales: solo el tema (claro/oscuro), igual que en la portada. */
(() => {
  const raiz = document.documentElement;
  const CLAVE_TEMA = "im-sitio-tema";
  const oscuroSistema = matchMedia("(prefers-color-scheme: dark)");
  const boton = document.getElementById("boton_tema");
  const temaEfectivo = () => raiz.dataset.theme || (oscuroSistema.matches ? "dark" : "light");

  function pintar() {
    const t = temaEfectivo();
    raiz.dataset.temaEfectivo = t;
    boton.setAttribute("aria-label", t === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  }
  function conTransicion(cambio) {
    raiz.classList.add("cambiando-tema");
    void raiz.offsetWidth;
    cambio();
    setTimeout(() => raiz.classList.remove("cambiando-tema"), 780);
  }
  boton.addEventListener("click", () => conTransicion(() => {
    const nuevo = temaEfectivo() === "dark" ? "light" : "dark";
    raiz.dataset.theme = nuevo;
    try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch (e) {}
    pintar();
  }));
  oscuroSistema.addEventListener("change", () => conTransicion(pintar));
  pintar();
})();
