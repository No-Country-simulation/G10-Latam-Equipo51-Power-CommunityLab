# Cumplimiento legal de Insight Mind

> **Esto no es asesoría legal.** Son plantillas y medidas técnicas para cubrir lo básico mientras Insight Mind es un proyecto académico. Antes de operar con datos reales de una comunidad, o de cobrar, un abogado debe revisarlas.

Marco usado como base: **RGPD** (el más exigente) con apartados para **México** (LFPDPPP 2025), **Brasil** (LGPD), **Colombia** (Ley 1581), **Argentina** (Ley 25.326) y **Chile** (Ley 21.719).

---

## 1. Quién es quién

Insight Mind trata dos tipos de datos, con roles distintos:

| Datos | Quién decide (responsable) | Quién procesa (encargado) | Documento |
|---|---|---|---|
| Correo del boletín y visitas a la landing | Equipo de Insight Mind | Oracle Cloud y el proveedor de correo | [Aviso de privacidad](../../frontend/landingpage/legal/privacidad.html) |
| Mensajes de una comunidad que usa el panel | La organización que administra la comunidad | **Insight Mind**, y por debajo Cohere, OCI y MongoDB | [Aviso para comunidades](../../frontend/landingpage/legal/comunidad.html) y [Acuerdo de tratamiento de datos](ACUERDO-TRATAMIENTO-DATOS.md) |

Lo segundo es lo delicado: las personas de la comunidad no eligieron usar Insight Mind. Por eso la organización tiene que avisarles (con el aviso para comunidades o uno equivalente) y firmar con nosotros el acuerdo de tratamiento.

---

## 2. Documentos

**Públicos** (en la landing, `frontend/landingpage/legal/`):

- `privacidad.html`: aviso de privacidad del sitio y del boletín.
- `comunidad.html`: aviso para miembros de comunidades. Explica qué se hace con sus mensajes. La organización puede enlazarlo o copiarlo.
- `terminos.html`: términos de uso del sitio y del panel.
- `cookies.html`: el sitio no usa cookies; el panel usa solo `im_sesion` (técnica).

**Internos** (en esta carpeta):

- [ACUERDO-TRATAMIENTO-DATOS.md](ACUERDO-TRATAMIENTO-DATOS.md): plantilla de acuerdo con cada organización (DPA).
- [PROVEEDORES.md](PROVEEDORES.md): quién recibe datos, dónde y con qué garantías.
- [PROCEDIMIENTOS.md](PROCEDIMIENTOS.md): plazos de conservación, solicitudes de derechos (con los pasos técnicos para borrar a una persona) e incidentes.

---

## 3. Medidas que ya están en el producto

| Medida | Dónde |
|---|---|
| A Cohere no le llegan correos ni teléfonos: se enmascaran antes de enviar | `backend/privacidad.py` (prueba: `pruebas/prueba_privacidad.py`) |
| El análisis no envía el nombre de la persona a Cohere | `backend/analizador_sentimiento.py` |
| Las FAQs se redactan sin el nombre del autor | `backend/generador_contenido.py` |
| Para publicar contenido que nombra a alguien (LinkedIn, X, newsletter) hay que confirmar que dio su permiso; en FAQs, que no hay datos personales | `frontend/insightmind-v2/js/app.js` (`casillaLegal`) |
| La API pública de la landing no expone autores, tickets ni el texto original | `backend/rutas_publico.py` |
| Nada se publica sin aprobación humana | Flujo de curaduría |
| Acceso al panel con usuario, contraseña y cookie de sesión `HttpOnly` + `SameSite=Strict` | `backend/auth.py` |
| Todo el tráfico por HTTPS (Let's Encrypt); `http://` redirige | `deploy/nginx/insightmind.conf` |
| Enlaces a términos y privacidad en el acceso al panel | `frontend/insightmind-v2/index.html` |
| La landing no usa cookies ni recursos de terceros; las fuentes se sirven desde el propio servidor | `frontend/landingpage/` |
| Aviso de consentimiento en el formulario del boletín | `frontend/landingpage/index.html` |
| Se avisa que FAQs y newsletter se redactan con IA y los revisa una persona | landing |

---

## 4. Pendientes antes de operar con datos reales

### Bloqueantes

- [x] **HTTPS.** Activo en `https://insightmind.duckdns.org` con Let's Encrypt; `http://` redirige.
- [ ] **Cookie segura.** Con HTTPS ya activo, poner `AUTH_COOKIE_SECURE=true` en el `.env` del servidor y reiniciar el backend, para que la cookie de sesión solo viaje cifrada.
- [ ] **Correo de contacto real.** Reemplazar `privacidad@[dominio]` en las cuatro páginas de `frontend/landingpage/legal/` y revisar que alguien lo atienda.
- [ ] **Completar los marcadores.** Los textos entre corchetes y subrayados en amarillo en las páginas legales: región de OCI y de MongoDB, plazos de conservación, proveedor de correo, licencia del repositorio y país de la ley aplicable.
- [ ] **Contrato con Cohere.** Confirmar en sus términos de API si usan los datos para entrenar, y desactivarlo si es posible. Ver [PROVEEDORES.md](PROVEEDORES.md).
- [ ] **Acuerdo firmado** con cada organización cuya comunidad se conecte.
- [ ] **Aviso a la comunidad** publicado por la organización antes del primer análisis.

### Importantes

- [ ] **Borrado automático** según los plazos de [PROCEDIMIENTOS.md](PROCEDIMIENTOS.md). Hoy se borra a mano.
- [ ] **Registrar quién confirmó el permiso** al publicar: hoy la casilla se exige pero no se guarda. Añadir `confirmado_por` y `confirmado_en` al activo en `curaduria.json`.
- [ ] **Redactar casos de éxito con un marcador** (`{nombre}`) y sustituir el nombre solo en el panel, para que tampoco viaje a Cohere.
- [ ] **Boletín real:** guardar la prueba del consentimiento, confirmar la suscripción por correo (doble opt-in) y poner un enlace de baja en cada envío. Ver el `TODO` en `frontend/landingpage/js/sitio.js`.
- [ ] **Roles en el panel:** hoy todo usuario con sesión puede usarlo todo.
- [ ] **Evaluación de impacto (DPIA)** si se procesan comunidades grandes o con menores.

### Cuando exista empresa

- [ ] Razón social, domicilio y responsable de protección de datos en los documentos.
- [ ] Ley aplicable y jurisdicción en los términos.
- [ ] Condiciones comerciales propias si los planes pasan a ser de pago.
- [ ] Revisión del paquete completo por un abogado de cada país donde se opere.
