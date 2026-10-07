/* ============================================================
   Panorama · agregaciones y render.
   Cada función de agregación de este archivo es el equivalente en
   JavaScript de un pipeline de MongoDB. El nombre del pipeline va
   anotado sobre cada una. Cuando el backend esté arriba, estas
   funciones se borran y el panel solo pinta lo que llega de
   GET /dashboard. Modelo y pipelines: docs/DASHBOARD.md
   ============================================================ */

let DASH={rango:30,canal:"todos",slug:null,claves:[...CLAVES_INICIALES]};

/* Respuesta de GET /dashboard, o null si no hay backend/MongoDB.
   Con PANO, las funciones de agregación de abajo no calculan nada: solo
   traducen lo que ya vino resuelto del servidor. Sin PANO, siguen trabajando
   sobre la serie simulada exactamente como antes. */
let PANO=null;
const MIN_POR_PIEZA=22;   /* minutos que cuesta escribir y revisar una pieza a mano */
const MESES=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fnum=n=>n.toLocaleString("es-MX");
const fdia=f=>f.getDate()+" "+MESES[f.getMonth()];

/* Variación contra el periodo anterior, ya formateada. */
function delta(a,b,sufijo){
  /* En puntos, un 0 previo es un dato legítimo (índice de sentimiento neutro),
     no "sin dato": solo el porcentaje necesita un divisor distinto de cero. */
  if(sufijo==="pts"){const d=Math.round(a-b);
    return{t:(d>=0?"+":"−")+Math.abs(d)+" pts",c:d>0?"up":d<0?"down":"",n:d};}
  if(!b)return{t:a?"nuevo":"—",c:a?"up":""};
  const p=sufijo==="pts"?Math.round(a-b):Math.round((a/b-1)*100);
  return{t:(p>=0?"+":"−")+Math.abs(p)+(sufijo==="pts"?" pts":"%"),c:p>0?"up":p<0?"down":"",n:p};
}
const chispa=(vals,color)=>{
  const w=66,h=20,mx=Math.max(...vals,1),paso=vals.length>1?w/(vals.length-1):w;
  const p=vals.map((v,i)=>`${(i*paso).toFixed(1)},${(h-2.5-v/mx*(h-5)).toFixed(1)}`).join(" ");
  return `<svg class="chispa" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${p}"
    fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
};

/* ---- La ventana de tiempo: actual, anterior y cómo se agrupa ---- */
function ventana(){
  if(PANO)return{api:true,cubos:PANO.pulso.length,R:PANO.pulso.length,gran:1,
    msg:[],msgPrev:[],act:[],actPrev:[],desde:null,hasta:null,corte:0};
  const R=DASH.rango, corte=DIAS_SERIE-R, corteP=DIAS_SERIE-2*R;
  const canal=DASH.canal, pasa=m=>canal==="todos"||m.canal===canal;
  return{
    R, gran:R>30?7:1, cubos:R>30?Math.ceil(R/7):R,
    msg:SERIE.inter.filter(m=>m.dia>corte&&pasa(m)),
    msgPrev:SERIE.inter.filter(m=>m.dia>corteP&&m.dia<=corte&&pasa(m)),
    act:SERIE.act.filter(a=>a.dia>corte&&pasa(a)),
    actPrev:SERIE.act.filter(a=>a.dia>corteP&&a.dia<=corte&&pasa(a)),
    desde:SERIE.inter.find(m=>m.dia>corte).fecha, hasta:SERIE.hoy, corte
  };
}
/* $match por rango y canal, $group por $dateTrunc y etiqueta de sentimiento.
   Pipeline: pulso_diario */
function pulso(v){
  if(PANO)return PANO.pulso.map(c=>({pos:c.positivas,neu:c.neutrales,neg:c.negativas,
    tot:c.total,etiqueta:(c.periodo||"").replace(/^\d{4}-semana-/,"Semana ")}));
  const cubos=Array.from({length:v.cubos},()=>({pos:0,neu:0,neg:0,tot:0,f0:null,f1:null}));
  v.msg.forEach(m=>{
    const off=DIAS_SERIE-m.dia, i=Math.min(v.cubos-1,v.cubos-1-Math.floor(off/v.gran));
    const c=cubos[i];c.tot++;c[m.sent>.2?"pos":m.sent<-.2?"neg":"neu"]++;
    if(!c.f0||m.fecha<c.f0)c.f0=m.fecha; if(!c.f1||m.fecha>c.f1)c.f1=m.fecha;
  });
  return cubos;
}
/* $unwind temas + $facet actual/previo + $group por tema. Pipeline: temas_en_ascenso */
function porTema(v){
  if(PANO)return PANO.temas.map(t=>({tema:t.tema,n:t.n,sent:t.sentimiento,serie:null,
    nuevo:t.nuevo,d:t.variacion==null?{t:"nuevo",c:"up",n:null}
      :{t:(t.variacion>=0?"+":"−")+Math.abs(t.variacion)+"%",c:t.variacion>0?"up":t.variacion<0?"down":"",n:t.variacion}}));
  const acc={},prev={},serie={};
  v.msg.forEach(m=>{
    const a=acc[m.tema]||(acc[m.tema]={n:0,s:0,neg:0});
    a.n++;a.s+=m.sent;if(m.sent<-.2)a.neg++;
    const off=DIAS_SERIE-m.dia, i=Math.min(v.cubos-1,v.cubos-1-Math.floor(off/v.gran));
    (serie[m.tema]||(serie[m.tema]=Array(v.cubos).fill(0)))[i]++;
  });
  v.msgPrev.forEach(m=>prev[m.tema]=(prev[m.tema]||0)+1);
  return Object.entries(acc).map(([t,a])=>({
    tema:t,n:a.n,sent:a.s/a.n,neg:a.neg,serie:serie[t],
    nuevo:!prev[t],d:delta(a.n,prev[t]||0)
  }));
}
/* $facet sobre interacciones y activos. Pipeline: embudo_de_produccion */
function embudo(v){
  if(PANO){const e=PANO.embudo;return{tot:e.analizadas,aprov:e.aprovechables,
    tickets:e.tickets,gen:e.generadas,apro:e.aprobadas,pub:e.publicadas,
    limpios:e.pct_sin_editar==null?null:Math.round(e.pct_sin_editar*e.aprobadas/100),
    pctLimpios:e.pct_sin_editar,mediana:null,ediciones:null};}
  const tot=v.msg.length, aprov=v.msg.filter(m=>m.ruta!=="descartado").length,
    tickets=v.msg.filter(m=>m.ruta==="ticket").length, gen=v.act.length,
    apro=v.act.filter(a=>a.estado==="Listo"||a.estado==="Publicado"),
    pub=v.act.filter(a=>a.estado==="Publicado"),
    limpios=apro.filter(a=>!a.editado).length,
    horas=pub.map(a=>a.horas).sort((x,y)=>x-y);
  return{tot,aprov,tickets,gen,apro:apro.length,pub:pub.length,limpios,
    mediana:horas.length?horas[Math.floor(horas.length/2)]:0,
    ediciones:apro.length?apro.reduce((s,a)=>s+a.ediciones,0)/apro.length:0};
}
/* $group por plataforma sobre activos. Pipeline: desempeno_por_plataforma */
function porPlataforma(v){
  if(PANO)return PANO.plataformas.map(f=>({plat:(FORMATOS[f.formato]||{}).plat||"web",
    gen:f.generadas,pub:f.publicadas,tasa:f.tasa,edit:f.pct_edit,mediana:null,
    formato:f.formato}));
  return Object.keys(FORMATO_DE).map(p=>{
    const g=v.act.filter(a=>a.plat===p), pub=g.filter(a=>a.estado==="Publicado"),
      ed=g.filter(a=>a.editado).length, h=pub.map(a=>a.horas).sort((x,y)=>x-y);
    return{plat:p,gen:g.length,pub:pub.length,
      tasa:g.length?Math.round(pub.length/g.length*100):0,
      edit:g.length?Math.round(ed/g.length*100):0,
      mediana:h.length?h[Math.floor(h.length/2)]:0};
  }).filter(x=>x.gen);
}
/* $match ruta:"exito" + $group por autor. Pipeline: voces_destacadas */
function voces(v){
  if(PANO)return PANO.voces.map(x=>({autor:x.autor,n:x.n,sent:1,tema:(x.canales||[])[0]||"—"}));
  const a={};
  v.msg.filter(m=>m.ruta==="exito").forEach(m=>{
    const x=a[m.autor]||(a[m.autor]={n:0,temas:{},sent:0});
    x.n++;x.sent+=m.sent;x.temas[m.tema]=(x.temas[m.tema]||0)+1;});
  return Object.entries(a).map(([autor,x])=>({autor,n:x.n,sent:x.sent/x.n,
    tema:Object.entries(x.temas).sort((p,q)=>q[1]-p[1])[0][0]}))
    .sort((p,q)=>q.n-p.n).slice(0,5);
}
/* $match sentimiento < -0.4 + $group por autor + $match count >= 4.
   Pipeline: miembros_en_riesgo */
function enRiesgo(v){
  if(PANO)return PANO.riesgo.map(x=>({autor:x.autor,n:x.n,
    canal:(x.canales||[]).join(", ")||"—",tema:null,ult:null}));
  const a={};
  v.msg.filter(m=>m.sent<-.4).forEach(m=>{
    const x=a[m.autor]||(a[m.autor]={n:0,canales:{},temas:{},ult:null});
    x.n++;x.canales[m.canal]=(x.canales[m.canal]||0)+1;x.temas[m.tema]=(x.temas[m.tema]||0)+1;
    if(!x.ult||m.fecha>x.ult)x.ult=m.fecha;});
  const top=(o)=>Object.entries(o).sort((p,q)=>q[1]-p[1])[0][0];
  return Object.entries(a).filter(([,x])=>x.n>=4)
    .map(([autor,x])=>({autor,n:x.n,canal:top(x.canales),tema:top(x.temas),ult:x.ult}))
    .sort((p,q)=>q.n-p.n).slice(0,5);
}
/* $match con índice de texto sobre el mensaje. Pipeline: seguimiento_de_claves */
function serieClave(v,termino){
  if(PANO){const k=PANO.claves.find(c=>c.termino===termino)||{menciones:0,previo:0,sentimiento:0};
    return{termino,n:k.menciones,sent:k.sentimiento,serie:null,d:delta(k.menciones,k.previo)};}
  const s=Array(v.cubos).fill(0);let n=0,sent=0,prev=0;
  v.msg.forEach(m=>{
    if(!m.claves.includes(termino))return;
    n++;sent+=m.sent;
    const off=DIAS_SERIE-m.dia;s[Math.min(v.cubos-1,v.cubos-1-Math.floor(off/v.gran))]++;});
  v.msgPrev.forEach(m=>{if(m.claves.includes(termino))prev++;});
  return{termino,n,sent:n?sent/n:0,serie:s,d:delta(n,prev)};
}

/* ============================ RENDER ============================ */
const RANGOS=[[7,"7 días"],[30,"30 días"],[90,"90 días"]];
const tonoSent=s=>s>.2?"var(--ok)":s<-.2?"var(--alert)":"var(--neutral)";
const clasePill=s=>s>.2?"p-ok":s<-.2?"p-alert":"p-mute";

async function visualizarDashboard(){
  /* Se intenta el backend en silencio. Si no hay MongoDB, o el endpoint aún no
     existe, se dibuja la serie simulada: el Panorama nunca se queda en blanco.
     No se usa conError() a propósito: en una instalación sin Mongo saltaría un
     toast de error en cada carga, y eso no es un fallo, es el estado esperado. */
  try{ PANO = await API.dashboard(DASH.slug, DASH.canal); }
  catch(e){ PANO = null; console.info("Panorama sin backend, se usa la serie de ejemplo:", e.message); }

  const aviso=document.getElementById("panorama_simulado");
  if(aviso)aviso.hidden=!!PANO;
  if(PANO&&PANO.periodo)DASH.slug=PANO.periodo.actual;

  const v=ventana();
  visualizarFiltros(v);visualizarKpis(v);visualizarPulso(v);visualizarTemas(v);
  visualizarClaves(v);visualizarEmbudo(v);visualizarVoces(v);
}

/* Qué bloques tienen datos. Sin backend, todos: la serie simulada es completa. */
const cubre=k=>!PANO||!PANO.cobertura||PANO.cobertura[k]!==false;
const faltaActivar=`<p class="mini">Este bloque necesita que el análisis guarde
  <code>temas</code> y <code>claves</code>. Ver <code>PANORAMA.md</code>.</p>`;

function visualizarFiltros(v){
  if(PANO){
    /* Con datos reales se elige periodo, no rango de días: los documentos no
       traen fecha por mensaje, solo el slug de la semana. */
    const disp=PANO.periodo.disponibles.slice(-4);
    rango_btns.innerHTML=disp.map(sl=>
      `<button aria-pressed="${DASH.slug===sl}" data-s="${sl}">${sl.replace(/^\d{4}-semana-/,"Semana ")}</button>`).join("");
    rango_btns.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{
      DASH.slug=b.dataset.s;visualizarDashboard();});
    rango_txt.textContent=PANO.periodo.previo
      ? `${DASH.slug.replace(/^\d{4}-semana-/,"Semana ")} · comparada con ${PANO.periodo.previo.replace(/^\d{4}-semana-/,"semana ")}`
      : `${DASH.slug.replace(/^\d{4}-semana-/,"Semana ")} · sin semana previa para comparar`;
  }else{
    rango_btns.innerHTML=RANGOS.map(([n,t])=>
      `<button aria-pressed="${DASH.rango===n}" data-r="${n}">${t}</button>`).join("");
    rango_btns.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
      DASH.rango=+b.dataset.r;visualizarDashboard();});
    rango_txt.textContent=`${fdia(v.desde)} – ${fdia(v.hasta)} · comparado con los ${v.R} días previos`;
  }
  const canales=PANO?PANO.canales:[...new Set(SERIE.inter.map(m=>m.canal))].sort();
  canal_sel.innerHTML=`<option value="todos">Todos los canales</option>`+
    canales.map(c=>`<option value="${c}">${c}</option>`).join("");
  canal_sel.value=DASH.canal;
  canal_sel.onchange=()=>{DASH.canal=canal_sel.value;visualizarDashboard();};
}

function visualizarKpis(v){
  if(PANO){const a=PANO.metricas.actual,p=PANO.metricas.previo||{};
    kpis.innerHTML=[
     ["Interacciones analizadas",fnum(a.interacciones),delta(a.interacciones,p.interacciones||0)],
     ["Índice de sentimiento",(a.indice_sentimiento>=0?"+":"−")+Math.abs(a.indice_sentimiento),
      delta(a.indice_sentimiento,p.indice_sentimiento||0,"pts")],
     ["Señales aprovechadas",a.pct_aprovechadas+"%",delta(a.pct_aprovechadas,p.pct_aprovechadas||0,"pts")],
     ["Piezas publicadas",fnum(a.publicadas),delta(a.publicadas,p.publicadas||0)],
     ["Horas de redacción ahorradas",a.horas_ahorradas+" h",delta(a.horas_ahorradas,p.horas_ahorradas||0)]
    ].map(([k,val,d])=>`<div class="stat"><div class="k">${k}</div><div class="v">${val}</div>
      <div class="d ${d.c}">${d.t}</div></div>`).join("");
    return;}
  const ind=s=>s.length?Math.round((s.filter(m=>m.sent>.2).length-s.filter(m=>m.sent<-.2).length)/s.length*100):0,
    aprov=s=>s.length?Math.round(s.filter(m=>m.ruta!=="descartado").length/s.length*100):0,
    pub=a=>a.filter(x=>x.estado==="Publicado").length;
  const p=pub(v.act), pp=pub(v.actPrev),
    hrs=Math.round(p*MIN_POR_PIEZA/60), hrsP=Math.round(pp*MIN_POR_PIEZA/60);
  kpis.innerHTML=[
   ["Interacciones analizadas",fnum(v.msg.length),delta(v.msg.length,v.msgPrev.length)],
   ["Índice de sentimiento",(ind(v.msg)>=0?"+":"−")+Math.abs(ind(v.msg)),delta(ind(v.msg),ind(v.msgPrev),"pts")],
   ["Señales aprovechadas",aprov(v.msg)+"%",delta(aprov(v.msg),aprov(v.msgPrev),"pts")],
   ["Piezas publicadas",fnum(p),delta(p,pp)],
   ["Horas de redacción ahorradas",hrs+" h",delta(hrs,hrsP)]
  ].map(([k,val,d])=>`<div class="stat"><div class="k">${k}</div><div class="v">${val}</div>
    <div class="d ${d.c}">${d.t}</div></div>`).join("");
}

function visualizarPulso(v){
  const c=pulso(v), mxUp=Math.max(...c.map(x=>x.pos+x.neu),1), mxDn=Math.max(...c.map(x=>x.neg),1);
  const etq=x=>x.etiqueta||(v.gran===1?fdia(x.f1||v.hasta):`${fdia(x.f0||v.desde)} – ${fdia(x.f1||v.hasta)}`);
  const leer=x=>`<b>${etq(x)}</b><span class="sep3"></span><b>${x.tot}</b> interacciones
    <em><i class="sw-pos"></i><b>${x.pos}</b> positivas</em>
    <em><i class="sw-neu"></i><b>${x.neu}</b> neutrales</em>
    <em><i class="sw-neg"></i><b>${x.neg}</b> negativas</em>`;
  const total=PANO
    ? c.reduce((a,x)=>({tot:a.tot+x.tot,pos:a.pos+x.pos,neu:a.neu+x.neu,neg:a.neg+x.neg}),
               {tot:0,pos:0,neu:0,neg:0})
    : {tot:v.msg.length,pos:v.msg.filter(m=>m.sent>.2).length,
       neg:v.msg.filter(m=>m.sent<-.2).length,neu:0};
  if(!PANO)total.neu=total.tot-total.pos-total.neg;
  const rotulo=PANO?`${c.length} semana${c.length===1?"":"s"}`:`${fdia(v.desde)} – ${fdia(v.hasta)}`;
  const base=`<b>${rotulo}</b><span class="sep3"></span><b>${fnum(total.tot)}</b> interacciones
    <em><i class="sw-pos"></i><b>${total.pos}</b> positivas</em>
    <em><i class="sw-neu"></i><b>${total.neu}</b> neutrales</em>
    <em><i class="sw-neg"></i><b>${total.neg}</b> negativas</em>`;
  lectura.innerHTML=base;
  pulso_graf.innerHTML=c.map(x=>`<div class="pcol" data-lee="${encodeURIComponent(leer(x))}">
      <div class="pup"><i class="s-pos" style="height:${x.pos/mxUp*100}%"></i><i class="s-neu" style="height:${x.neu/mxUp*100}%"></i></div>
      <div class="peje"></div>
      <div class="pdn"><i class="s-neg" style="height:${x.neg/mxDn*100}%"></i></div></div>`).join("")+
    (PANO?[]:HITOS.filter(h=>h.dia>v.corte)).map(h=>
      `<span class="hito" style="left:${(h.dia-v.corte)/v.R*100}%"><b></b></span>`).join("");
  pulso_graf.setAttribute("aria-label",`Pulso de la comunidad: ${total.tot} interacciones.`);
  const marcas=[...new Set([c[0],c[Math.floor(c.length/2)],c[c.length-1]].filter(Boolean).map(etq))];
  pulso_eje.innerHTML=marcas.map((t,i)=>
    `<span class="${marcas.length===3&&i===1?"centro":""}">${t}</span>`).join("");
  const dentro=PANO?[]:HITOS.filter(h=>h.dia>v.corte);
  pulso_hitos.innerHTML=dentro.length
    ? dentro.map(h=>`<span class="hito-txt"><i></i>${h.txt}</span>`).join("")
    : `<span class="mini">${PANO?"Una columna por semana. El detalle diario necesita una fecha por mensaje.":"Sin hitos registrados en el periodo."}</span>`;
  /* Una sola línea de lectura bajo la cabecera, en vez de un globo que tape
     la leyenda. Sin cálculo de posición y responde igual al dedo que al cursor. */
  pulso_graf.querySelectorAll(".pcol").forEach(col=>{
    const ver=()=>lectura.innerHTML=decodeURIComponent(col.dataset.lee);
    col.onmouseenter=ver;col.onpointerdown=ver;
    col.onmouseleave=()=>lectura.innerHTML=base;});
  pulso_graf.onmouseleave=()=>lectura.innerHTML=base;
}

function visualizarTemas(v){
  if(!cubre("temas")){tabla_temas.innerHTML=`<tr><td colspan="5">${faltaActivar}</td></tr>`;
    termo.innerHTML=faltaActivar;return;}
  const t=porTema(v);
  tabla_temas.innerHTML=t.slice().sort((a,b)=>(b.d.n??999)-(a.d.n??999)).slice(0,7).map(x=>`<tr>
    <td><b>${x.tema}</b>${x.nuevo?' <span class="pill p-pri">nuevo</span>':""}</td>
    <td class="mono">${x.n}</td>
    <td class="mono ${x.d.c}">${x.d.t}</td>
    <td>${x.serie?chispa(x.serie,x.sent<-.2?"var(--alert)":"var(--primary)"):'<span class="mini">—</span>'}</td>
    <td><span class="pill ${clasePill(x.sent)}">${x.sent>=0?"+":"−"}${Math.abs(x.sent).toFixed(2)}</span></td></tr>`).join("");
  const paraTermo=PANO?PANO.termometro.map(x=>({tema:x.tema,n:x.n,sent:x.sentimiento})):t;
  termo.innerHTML=paraTermo.slice().sort((a,b)=>a.sent-b.sent).map(x=>{
    const w=Math.min(50,Math.abs(x.sent)*50), neg=x.sent<0;
    return `<div class="termo-row"><span class="termo-nom">${x.tema}</span>
      <span class="termo-bar"><b></b><i class="${neg?"neg":"pos"}" style="${neg?"right:50%":"left:50%"};width:${w}%"></i></span>
      <span class="mono termo-val" style="color:${tonoSent(x.sent)}">${x.sent>=0?"+":"−"}${Math.abs(x.sent).toFixed(2)}</span>
      <span class="mono termo-n">${x.n}</span></div>`;}).join("");
}

function visualizarClaves(v){
  if(!cubre("claves")){claves_chips.innerHTML="";claves_sug.innerHTML="";
    claves_grid.innerHTML=faltaActivar;return;}
  /* Con datos reales, las palabras las decide el análisis, no el panel: no hay
     endpoint para vigilar o dejar de vigilar una, así que no se ofrecen chips. */
  if(PANO)DASH.claves=PANO.claves.map(c=>c.termino);
  claves_chips.innerHTML=DASH.claves.map(c=>
    `<span class="vchip">${c}<button data-q="${c}" aria-label="Dejar de vigilar ${c}">×</button></span>`).join("")
    ||`<span class="mini">No vigilas ninguna palabra todavía.</span>`;
  if(PANO)claves_chips.querySelectorAll("button").forEach(b=>b.remove());
  else claves_chips.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    DASH.claves=DASH.claves.filter(x=>x!==b.dataset.q);visualizarDashboard();});
  if(PANO){claves_sug.innerHTML='<span class="mini">Las extrae el análisis de cada mensaje.</span>';}
  else claves_sug.innerHTML=CLAVES_SUGERIDAS.filter(c=>!DASH.claves.includes(c)).slice(0,8)
    .map(c=>`<button data-a="${c}">${ic("mas")}${c}</button>`).join("");
  claves_sug.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{
    DASH.claves=[...DASH.claves,b.dataset.a];visualizarDashboard();
    toast("Palabra en seguimiento",b.dataset.a+" se agregó al panel",true);});
  claves_grid.innerHTML=DASH.claves.map(c=>{const k=serieClave(v,c);
    return `<div class="kw"><div class="kw-top"><b>${k.termino}</b>
        <span class="pill ${clasePill(k.sent)}">${k.sent>=0?"+":"−"}${Math.abs(k.sent).toFixed(2)}</span></div>
      <div class="kw-n"><span class="v mono">${k.n}</span><span class="mini">menciones</span>
        <span class="mono ${k.d.c} kw-d">${k.d.t}</span></div>
      ${k.serie?chispa(k.serie,k.sent<-.2?"var(--alert)":"var(--primary)"):""}</div>`;}).join("")
    ||`<p class="mini">Agrega una palabra de la lista de sugerencias para empezar a vigilarla.</p>`;
}

function visualizarEmbudo(v){
  const e=embudo(v), pc=n=>e.tot?Math.round(n/e.tot*100):0;
  const fases=[["Interacciones analizadas",e.tot,100],
    ["Con señal aprovechable",e.aprov,pc(e.aprov)],
    ["Piezas generadas por la IA",e.gen,pc(e.gen)],
    ["Aprobadas por una persona",e.apro,pc(e.apro)],
    ["Publicadas",e.pub,pc(e.pub)]];
  embudo_fases.innerHTML=fases.map(([n,val,p],i)=>`<div class="fase">
      <div class="fase-l"><span>${n}</span><b class="mono">${fnum(val)}</b></div>
      <div class="fase-bar"><i style="width:${Math.max(p,2)}%"></i></div>
      ${i?`<div class="fase-conv mono">${fases[i-1][1]?Math.round(val/fases[i-1][1]*100):0}% de la fase anterior</div>`:""}
    </div>`).join("");
  const pctLimpios=e.pctLimpios!=null?e.pctLimpios:(e.apro?Math.round(e.limpios/e.apro*100):null);
  embudo_extra.innerHTML=[
    ["Aprobadas sin tocar el texto",pctLimpios==null?"—":pctLimpios+"%","Mide qué tan buena es la redacción del modelo"],
    ["Ediciones por pieza aprobada",e.ediciones==null?"—":e.ediciones.toFixed(1),
     e.ediciones==null?"Falta guardar un contador de ediciones":"Cuántos retoques necesita en promedio"],
    ["Tiempo mediano de curaduría",e.mediana==null?"—":e.mediana.toFixed(1)+" h",
     e.mediana==null?"Falta guardar fecha_publicado en cada pieza":"De generada a publicada"],
    ["Tickets derivados al equipo",fnum(e.tickets),"Rama que nunca se publica"]
  ].map(([k,val,d])=>`<div class="kpi-min"><span class="k">${k}</span><b class="mono">${val}</b>
    <span class="mini">${d}</span></div>`).join("");
  tabla_plat.innerHTML=porPlataforma(v).map(x=>{const p=PLAT[x.plat];return `<tr>
    <td><span class="row plat-cell"><span class="mk mk-min" style="--pc:${p.color}">${p.ini}</span>${p.nom}</span></td>
    <td class="mono">${x.gen}</td><td class="mono"><b>${x.pub}</b></td>
    <td class="mono">${x.tasa}%</td><td class="mono">${x.edit}%</td>
    <td class="mono">${x.mediana==null?"—":x.mediana.toFixed(1)+" h"}</td></tr>`;}).join("");
}

function visualizarVoces(v){
  const vo=voces(v);
  lista_voces.innerHTML=vo.length?vo.map(x=>`<div class="voz">
    <span class="av">${x.autor.split(" ").map(s=>s[0]).slice(0,2).join("")}</span>
    <span class="voz-b"><b>${x.autor}</b><span class="mini">${x.tema}</span></span>
    <span class="mono voz-n">${x.n}</span></div>`).join("")
    :'<p class="mini">Sin casos de éxito en el periodo.</p>';
  const ri=enRiesgo(v);
  lista_riesgo.innerHTML=ri.length?ri.map(x=>`<div class="voz">
    <span class="av alerta">${x.autor.split(" ").map(s=>s[0]).slice(0,2).join("")}</span>
    <span class="voz-b"><b>${x.autor}</b><span class="mini">${[x.n+" mensajes negativos",x.tema,x.canal].filter(Boolean).join(" · ")}</span></span>
    <button class="btn sm" data-r="${x.autor}">Avisar</button></div>`).join("")
    :'<p class="mini">Nadie acumula señales de frustración en el periodo. Buena noticia.</p>';
  /* Avisa de verdad: marca los tickets pendientes de esa persona y delega en
     avisar("discord") de app.js, que es la función que ya existe y funciona.
     No se duplica la lógica de envío: si cambia allá, cambia aquí. */
  lista_riesgo.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{
    const autor=b.dataset.r;
    const suyos=E.tickets.filter(t=>{
      const m=msg(t.fuente);
      return m&&m.autor===autor&&t.estado!=="Enviado"&&t.estado!=="Resuelto";});
    if(!suyos.length){
      ir("tickets");
      return toast("Sin tickets pendientes",autor+" no tiene tickets abiertos en este lote.");}
    E.tickets.forEach(t=>t.seleccionado=false);
    suyos.forEach(t=>t.seleccionado=true);
    avisar("discord");});
}
