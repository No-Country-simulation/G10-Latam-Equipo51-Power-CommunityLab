/* ============================================================
   Serie histórica simulada · 90 días de comunidad ya analizada.
   Es el espejo exacto de lo que devolverá la colección `interacciones`
   de MongoDB. Cada objeto de aquí es un documento de allá.
   Contrato y pipelines de agregación: docs/DASHBOARD.md
   ============================================================ */

/* Generador con semilla: los mismos números en cada carga, en cada máquina.
   Sin esto la demo cambiaría de cifras delante del jurado. */
function semilla(n){return function(){n|=0;n=n+0x6D2B79F5|0;let t=Math.imul(n^n>>>15,1|n);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/* Campana centrada en m con desviación s, recortada a [-1,1]. */
function gauss(r,m,s){const u=1-r(),v=r();
  return Math.max(-1,Math.min(1,m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)));}

/* 180 días: el doble del rango máximo que ofrece el panel. Sin esto, comparar
   los últimos 90 días contra los 90 previos no tendría contra qué comparar y
   las variaciones saldrían infladas. */
const DIAS_SERIE=180;
const RANGO_MAX=90;

/* Cada tema tiene volumen propio, tendencia y temperatura.
   `evento` simula un incidente que arranca el día indicado. */
const TEMAS_SERIE=[
 {t:"Acceso a laboratorios",base:1.1,tend:.6,sent:[-.62,.22],tipo:"queja",canal:"#soporte-labs",
  evento:{hace:16,mult:5.2},claves:["tenancy","laboratorio","acceso"]},
 {t:"Plataforma / Video",base:.9,tend:.5,sent:[-.52,.22],tipo:"queja",canal:"#soporte-labs",
  evento:{hace:10,mult:3.4},claves:["video","módulo 3","reproductor"]},
 {t:"Contratación / Logros",base:2.6,tend:.5,sent:[.82,.13],tipo:"testimonio",canal:"#logros-y-empleos",
  claves:["empleo","entrevista","portafolio"]},
 {t:"Certificaciones",base:2.1,tend:.6,sent:[.76,.15],tipo:"logro",canal:"#logros-y-empleos",
  claves:["certificación","examen"]},
 {t:"LangGraph / Nodos",base:2.4,tend:1.1,sent:[.05,.21],tipo:"pregunta_tecnica",canal:"#dudas-langgraph",
  claves:["LangGraph","reintento","Gemini"]},
 {t:"OCI Always Free",base:1.9,tend:.3,sent:[.12,.22],tipo:"pregunta_tecnica",canal:"#dudas-oci",
  claves:["bucket","Always Free","costo"]},
 {t:"Mentorías",base:1.7,tend:-.15,sent:[.66,.18],tipo:"feedback",canal:"#feedback-cursos",
  claves:["mentoría","mentor"]},
 {t:"Diseño del curso",base:2.0,tend:-.35,sent:[.26,.31],tipo:"feedback",canal:"#feedback-cursos",
  claves:["ejercicios","módulo"]},
 {t:"Portafolio",base:1.8,tend:.55,sent:[.48,.23],tipo:"conversacion",canal:"#general",
  claves:["portafolio","GitHub","proyecto"]},
 {t:"Empleabilidad",base:1.9,tend:.25,sent:[.44,.28],tipo:"conversacion",canal:"#logros-y-empleos",
  claves:["CV","LinkedIn","empleo"]},
 {t:"Git y GitHub",base:1.3,tend:-.2,sent:[.18,.24],tipo:"pregunta_tecnica",canal:"#dudas-oci",
  claves:["merge","GitHub","rama"]},
 {t:"Convivencia",base:3.4,tend:0,sent:[.40,.25],tipo:"conversacion",canal:"#general",
  claves:["gracias","comunidad"]}];

const VOCES=["Mariana Souza","Lucas Albuquerque","Camila Rojas","Ana Beatriz Lima","Rodrigo Pérez",
 "Paula Iriarte","Joao Martins","Sofía Mendoza","Andrés Gutiérrez","Valeria Núñez","Diego Fuentes",
 "Héctor Salas","Renata Coelho","Iván Delgado","Bruna Teixeira","Nicolás Vera","Tatiana Ospina",
 "Felipe Cárdenas","Gabriela Moreno","Matías Silva","Carla Benítez","Thiago Ramos","Elena Duarte",
 "Pablo Arenas","Juliana Prado","Emilio Ferrer","Natalia Quiroz","Samuel Ortega","Luciana Farias",
 "Kevin Mora","Zaida Contreras","Greco Villalba","Jesús Paredes","Carolina Ríos"];
/* En una caída se queja mucha gente distinta, pero unos pocos vuelven semana
   tras semana. Ese puñado es el que el panel tiene que señalar: es quien está
   a punto de abandonar. Un tercio de lo negativo sale de aquí. */
const VOCES_FRICCION=["Diego Fuentes","Valeria Núñez","Andrés Gutiérrez","Renata Coelho",
 "Matías Silva","Tatiana Ospina"];

const SCORE_BASE={testimonio:84,logro:79,pregunta_tecnica:69,queja:71,feedback:59,conversacion:26,problema_acceso:75};
const FORMATO_DE={linkedin:"Post de LinkedIn",x:"Hilo de X",web:"Tip / FAQ",newsletter:"Destaque de newsletter"};

/* ---- Construcción de la serie ---- */
const SERIE=(function(){
  const hoy=new Date();hoy.setHours(12,0,0,0);
  const inter=[],act=[];let nAct=0;

  for(let d=0;d<=DIAS_SERIE;d++){
    const fecha=new Date(hoy);fecha.setDate(hoy.getDate()-(DIAS_SERIE-d));
    const dow=fecha.getDay();
    const finde=dow===0||dow===6?.45:dow===1?1.18:1;

    TEMAS_SERIE.forEach((tm,ti)=>{
      const r=semilla(d*97+ti*1013+7);
      let v=tm.base*finde*(1+tm.tend*(d/DIAS_SERIE));   /* crece parejo a lo largo de la serie */
      const arranca=DIAS_SERIE-tm.evento?.hace;
      if(tm.evento&&d>=arranca){
        const rampa=Math.min(1,(d-arranca)/6);
        v*=1+(tm.evento.mult-1)*rampa;
      }
      const n=Math.round(v*(.7+r()*.6));

      for(let k=0;k<n;k++){
        const sent=gauss(r,tm.sent[0],tm.sent[1]);
        const duro=sent<-.4;
        const pool=duro&&r()<.34?VOCES_FRICCION:VOCES;
        const autor=pool[Math.floor(r()*pool.length)];
        const tipo=duro&&tm.tipo==="queja"&&r()<.35?"problema_acceso":tm.tipo;
        const score=Math.max(5,Math.min(99,
          Math.round(SCORE_BASE[tipo]+Math.abs(sent)*13+(r()-.5)*26)));
        const m={fecha,dia:d,autor,canal:tm.canal,tema:tm.t,tipo,sent:+sent.toFixed(2),score,
          apoyo:duro,claves:tm.claves.filter(()=>r()<.62)};
        m.ruta=ruta(m);
        inter.push(m);

        /* Un mensaje aprovechable produce activos. El estado imita la realidad:
           no todo lo generado se aprueba y no todo lo aprobado se publica. */
        const destinos=m.ruta==="exito"?(r()<.55?["linkedin","x"]:["linkedin"])
          :m.ruta==="faq"?["web"]
          :m.ruta==="insight"&&r()<.18?["newsletter"]:[];
        destinos.forEach(p=>{
          const g=r(),edit=r()<.39;
          const estado=g<.055?"Descartado":g<.22?"Pendiente":g<.31?"Listo":"Publicado";
          /* El canal viaja con la pieza: sin él, filtrar el panorama por canal
             dejaría las métricas de producción en cero. */
          act.push({id:"H"+(++nAct),fecha,dia:d,plat:p,formato:FORMATO_DE[p],autor,tema:tm.t,canal:tm.canal,
            fuente_sent:m.sent,editado:edit,ediciones:edit?1+Math.floor(r()*3):0,estado,
            horas:+(.6+r()*7.4).toFixed(1)});
        });
      }
    });
  }
  return {inter,act,hoy};
})();

/* Hitos que explican los picos del gráfico. Vienen de la colección `hitos`. */
const HITOS=[{hace:62,txt:"Arranca el módulo de agentes"},
 {hace:30,txt:"Semana de certificaciones"},
 {hace:14,txt:"Caída de los laboratorios de OCI"}]
 .map(h=>({...h,dia:DIAS_SERIE-h.hace}));

/* Palabras clave vigiladas. En MongoDB viven en `seguimiento_claves`. */
const CLAVES_INICIALES=["tenancy","LangGraph","certificación","bucket"];
const CLAVES_SUGERIDAS=["entrevista","video","reintento","portafolio","mentoría","empleo",
 "Gemini","GitHub","módulo 3","Always Free","acceso","proyecto"];
