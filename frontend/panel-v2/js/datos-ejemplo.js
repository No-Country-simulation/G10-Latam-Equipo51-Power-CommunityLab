/* Datos simulados para el modo demo.
   Cuando el backend responda, estos se reemplazan por la respuesta de /procesar. */

const DATOS=[
 {id:"m1",autor:"Mariana Souza",canal:"#logros-y-empleos",tipo:"testimonio",sent:.94,score:96,idioma:"es",
  texto:"Comunidad, ¡quedé seleccionada para el puesto de Desarrolladora Junior de IA! El proyecto del curso de LangChain y OCI que construí en mi portfolio marcó toda la diferencia en la entrevista técnica.",
  por_que:"Contratación confirmada con el proyecto del curso como detonante",temas:["Contratación / Logros","Portafolio"],
  cita:"El proyecto del curso de LangChain y OCI marcó toda la diferencia en la entrevista técnica"},
 {id:"m2",autor:"Lucas Albuquerque",canal:"#dudas-langgraph",tipo:"pregunta_tecnica",sent:.05,score:82,idioma:"es",
  texto:"Tengo dudas sobre cómo estructurar los nodos condicionales en LangGraph cuando la respuesta del LLM necesita reintento.",
  por_que:"Duda repetida por 3 personas esta semana",temas:["LangGraph / Nodos condicionales"]},
 {id:"m3",autor:"Camila Rojas",canal:"#dudas-langgraph",tipo:"pregunta_tecnica",sent:-.1,score:74,idioma:"es",
  texto:"¿Cómo hago que un nodo vuelva a intentar si Gemini me devuelve un JSON roto? Me pasa 1 de cada 10 veces.",
  por_que:"Misma duda que Lucas: se agrupa en una sola FAQ",temas:["LangGraph / Reintentos"]},
 {id:"m4",autor:"Diego Fuentes",canal:"#soporte-labs",tipo:"queja",sent:-.72,score:88,idioma:"es",apoyo:true,
  texto:"Llevo tres días sin poder entrar al laboratorio de OCI, me sale error de tenancy y ya escribí dos veces sin respuesta.",
  por_que:"Bloqueo de acceso con riesgo de abandono",temas:["Acceso a laboratorios"]},
 {id:"m5",autor:"Ana Beatriz Lima",canal:"#logros-y-empleos",tipo:"logro",sent:.88,score:91,idioma:"pt",
  texto:"Pessoal, passei na certificação Oracle Cloud Infrastructure Foundations! Estudei 6 semanas com o grupo de estudos.",
  por_que:"Certificación lograda con apoyo del grupo de estudio",temas:["Certificaciones"],
  cita:"Passei na certificação OCI Foundations estudando com o grupo da comunidade"},
 {id:"m6",autor:"Rodrigo Pérez",canal:"#feedback-cursos",tipo:"feedback",sent:.42,score:63,idioma:"es",
  texto:"El módulo de agentes está buenísimo, pero los ejercicios del final saltan de nivel muy rápido.",
  por_que:"Feedback accionable sobre la curva del módulo",temas:["Diseño del curso"]},
 {id:"m7",autor:"Valeria Núñez",canal:"#soporte-labs",tipo:"problema_acceso",sent:-.55,score:71,idioma:"es",apoyo:true,
  texto:"Mi cuenta de estudiante no reconoce el bucket que creé ayer. Necesito entregar el viernes.",
  por_que:"Segundo reporte de acceso: posible falla generalizada",temas:["Acceso a laboratorios"]},
 {id:"m8",autor:"Héctor Salas",canal:"#general",tipo:"conversacion",sent:.3,score:18,idioma:"es",
  texto:"¡Buenos días a todos! ☕ feliz lunes",por_que:"Saludo sin contenido aprovechable",temas:["Convivencia"]},
 {id:"m9",autor:"Paula Iriarte",canal:"#logros-y-empleos",tipo:"testimonio",sent:.79,score:84,idioma:"es",
  texto:"Después de 4 meses, hoy firmé como Data Analyst Jr. Las mentorías de los martes me sirvieron muchísimo.",
  por_que:"Contratación atribuida a las mentorías del programa",temas:["Contratación / Logros","Mentorías"],
  cita:"Las mentorías de los martes me sirvieron muchísimo para preparar la entrevista"},
 {id:"m10",autor:"Joao Martins",canal:"#dudas-oci",tipo:"pregunta_tecnica",sent:.12,score:69,idioma:"pt",
  texto:"Alguém sabe como configurar o bucket Always Free sem gerar custo?",
  por_que:"Duda frecuente sobre costos de la capa gratuita",temas:["OCI Always Free"]},
 {id:"m11",autor:"Sofía Mendoza",canal:"#general",tipo:"conversacion",sent:.55,score:31,idioma:"es",
  texto:"gracias equipo, todo claro 🙌",por_que:"Agradecimiento breve, sin contenido",temas:["Convivencia"]},
 {id:"m12",autor:"Andrés Gutiérrez",canal:"#feedback-cursos",tipo:"queja",sent:-.48,score:66,idioma:"es",apoyo:true,
  texto:"Los videos del módulo 3 se cortan a la mitad y ya reporté el bug la semana pasada.",
  por_que:"Bug reincidente con frustración acumulada",temas:["Plataforma / Video"]}];

const PLAT={
 linkedin:{nom:"LinkedIn",cuenta:"Página ONE G10 LATAM",color:"#0A66C2",ini:"in",modo:"Publicación asistida",on:true},
 x:{nom:"X",cuenta:"@comunidadONE_g10",color:"#111827",ini:"X",modo:"Publicación asistida",on:true},
 web:{nom:"Web de la comunidad",cuenta:"ayuda.one-g10.dev/faq",color:"#7C3AED",ini:"FAQ",modo:"API · publica el tip",on:true},
 newsletter:{nom:"Newsletter",cuenta:"Mailchimp · lista general",color:"#059669",ini:"NL",modo:"Exporta el markdown",on:false},
 discord:{nom:"Discord",cuenta:"#soporte-interno",color:"#5865F2",ini:"DC",modo:"Webhook · avisa los tickets",on:true},
 slack:{nom:"Slack",cuenta:"Sin espacio de trabajo",color:"#611F69",ini:"SL",modo:"Webhook · avisa los tickets",on:false}};
const FORMATOS={"Post de LinkedIn":{plat:"linkedin",limite:3000},"Hilo de X":{plat:"x",limite:280,porPost:true},
 "Tip / FAQ":{plat:"web",limite:2500},"Destaque de newsletter":{plat:"newsletter",limite:4000}};
const TABS=[["linkedin","LinkedIn"],["x","X"],["web","Tip / FAQ"],["newsletter","Newsletter"],["tickets","Tickets"]];

let U={descartar:40,exito_score:70};
function ruta(m){if(m.score<U.descartar)return "descartado";
 if(m.sent<=-.4||m.tipo==="queja"||m.tipo==="problema_acceso"||m.apoyo)return "ticket";
 if((m.tipo==="testimonio"||m.tipo==="logro")&&m.sent>=.6&&m.score>=U.exito_score)return "exito";
 if(m.tipo==="pregunta_tecnica")return "faq";return "insight";}
const NOM={exito:"Caso de éxito",faq:"Tip / FAQ",ticket:"Ticket",descartado:"Descartado",insight:"Insight"};
const PILL={exito:"p-ok",faq:"p-warn",ticket:"p-alert",descartado:"p-mute",insight:"p-pri"};

const linkedinTxt=m=>m.idioma==="pt"
 ? `Nada nos deixa mais orgulhosos do que ver nossos talentos conquistando o mercado! 🚀\n\n${m.autor} conquistou a certificação Oracle Cloud Infrastructure Foundations depois de seis semanas com o grupo de estudos.\n\n"${m.cita}"\n\nParabéns, ${m.autor.split(" ")[0]}! 👏\n\n#OracleCloud #ComunidadeONE`
 : `Nada nos da más orgullo que ver a nuestros talentos conquistando el mercado tech 🚀\n\n${m.autor} acaba de ${m.tipo==="testimonio"?"ser contratada":"lograr un hito importante"} y nos contó qué hizo la diferencia:\n\n"${m.cita}"\n\nConstruir proyectos reales sigue siendo el camino más corto entre aprender y trabajar. ¡Felicidades, ${m.autor.split(" ")[0]}! 👏\n\n#TalentosTech #OracleCloud`;
const hiloTxt=m=>{const n=m.autor.split(" ")[0];return [
 `${n} entró a la comunidad hace unos meses sin experiencia en la nube.\n\nHoy tiene una historia que contar 🧵`,
 `"${m.cita}"\n\nNo fue un curso suelto: fue un proyecto real, publicado y defendido en entrevista.`,
 `La receta que repiten quienes lo logran:\n\n• un proyecto terminado > diez tutoriales\n• publicarlo aunque no sea perfecto\n• pedir revisión en comunidad`,
 `Si te falta el proyecto, este es tu recordatorio.\n\n¡Felicidades, ${n}! 👏`].join("\n\n———\n\n");};
const faq1=()=>`**Nodos condicionales con reintento en LangGraph**\n\nPreguntado por 3 personas esta semana.\n\nEl reintento vive en el nodo, no en el router.\n\n1. Valida la salida del LLM con un esquema Pydantic dentro del nodo.\n2. Si falla, lanza la excepción y deja que la política de reintentos la capture.\n3. Tras 2 intentos, marca el mensaje como "no analizado" y sigue con el lote.\n4. El router lee el estado ya validado y elige la rama.\n\n⚠️ Requiere validación de mentor antes de publicarse.`;
const faq2=()=>`**Cómo usar el bucket Always Free sin generar costo**\n\n1. Crea el bucket en tu región de inicio, tier Standard.\n2. No actives replicación ni versionado.\n3. Always Free incluye 20 GB: vigila el panel de uso.\n4. Borra los objetos de prueba al terminar cada práctica.`;
const newsTxt=()=>`## Community Highlights · Semana 04\n\n**🏆 Logro de la semana**\nMariana Souza consiguió empleo como Desarrolladora Junior de IA.\n\n**❓ Pregunta de la semana**\nNodos condicionales con reintento en LangGraph: 3 personas preguntaron lo mismo.\n\n**📈 Tema en tendencia**\nCertificaciones de Oracle Cloud: 2 aprobadas.\n\n**🔢 Cifra de la semana**\n12 interacciones · 58% positivas.`;

/* semanas anteriores simuladas */
const HIST={
 "2026-semana-03":{inter:9,pos:67,neg:8,activos:7,publicados:6,tickets:2,
  temas:["Certificaciones","Entrevistas técnicas","Java Spring"],
  contenidos:[["linkedin","Post de LinkedIn","Tres estudiantes aprobaron la certificación OCI…","Publicado"],
   ["x","Hilo de X","De cero a la nube en 8 semanas: el camino de…","Publicado"],
   ["web","Tip / FAQ","Cómo preparar el entorno de Java Spring en…","Publicado"],
   ["linkedin","Post de LinkedIn","Nuestra mentoría de los martes cumple un año…","Publicado"],
   ["newsletter","Destaque de newsletter","Community Highlights · Semana 03","Publicado"],
   ["web","Tip / FAQ","Errores comunes al configurar el tenancy","Publicado"],
   ["x","Hilo de X","5 recursos gratis para practicar SQL","Descartado"]],
  tickets_list:[["Error 500 al subir el proyecto final","Resuelto"],["Video del módulo 2 sin audio","Resuelto"]]},
 "2026-semana-02":{inter:11,pos:71,neg:5,activos:8,publicados:5,tickets:1,
  temas:["Onboarding","Git y GitHub","Empleabilidad"],
  contenidos:[["linkedin","Post de LinkedIn","La primera semana de la generación 2026 arrancó…","Publicado"],
   ["web","Tip / FAQ","Cómo resolver conflictos de merge sin miedo","Publicado"],
   ["x","Hilo de X","Cómo armar tu primer portafolio dev","Publicado"],
   ["newsletter","Destaque de newsletter","Community Highlights · Semana 02","Publicado"],
   ["linkedin","Post de LinkedIn","Dos egresados consiguieron empleo este mes","Publicado"],
   ["x","Hilo de X","Preguntas frecuentes de la semana","Listo"],
   ["web","Tip / FAQ","Comandos de Git que sí vas a usar","Listo"],
   ["linkedin","Post de LinkedIn","Testimonio de la mentoría de carrera","Descartado"]],
  tickets_list:[["Certificado no se descarga","En curso"]]}};
