/* Lógica del panel: navegación, render y acciones.
   Las llamadas al backend viven en api.js */

const MODOS_TEMA=["sistema","claro","oscuro"];let tIdx=0;
try{tIdx=Math.max(0,MODOS_TEMA.indexOf(localStorage.getItem("clg-tema")||"sistema"));}catch(e){}
function aplicarTema(){const t=MODOS_TEMA[tIdx];
  if(t==="sistema")document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",t==="claro"?"light":"dark");
  tema_txt.textContent="Tema: "+t;
  tema_ico.innerHTML=`<use href="#i-${t==="claro"?"sol":t==="oscuro"?"luna":"sistema"}"/>`;
  try{localStorage.setItem("clg-tema",t);}catch(e){}}
tema.onclick=()=>{tIdx=(tIdx+1)%MODOS_TEMA.length;aplicarTema();};aplicarTema();

let E={activos:[],tickets:[],pubs:[],procesado:false,paso:1,conex:{},chips:[]};
Object.keys(PLAT).forEach(k=>E.conex[k]=PLAT[k].on);
/* El prototipo arranca siempre limpio: el usuario ejecuta el flujo desde "Usar lote de ejemplo".
   Solo el historial trae semanas anteriores con datos. */
const save=()=>{};   /* el estado vive en memoria durante la sesión; en producción lo persiste OCI */
const ic=n=>`<svg class="ico"><use href="#i-${n}"/></svg>`;
const $=s=>document.querySelector(s), el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!==undefined)e.innerHTML=h;return e;};
const msg=id=>DATOS.find(d=>d.id===id);
function toast(titulo,texto,ok,undo){
  const t=el("div","toast"+(ok?" ok":""),`<div><b>${titulo}</b>${texto||""}</div>`);
  if(undo){const u=el("button","btn sm undo","Deshacer");u.onclick=()=>{undo();t.remove();};t.appendChild(u);}
  toasts.appendChild(t);setTimeout(()=>t.remove(),undo?6500:3400);}

function construir(){
  const a=[];let n=1;const add=o=>a.push(Object.assign({id:"A"+(n++),estado:"Pendiente"},o));
  DATOS.filter(m=>ruta(m)==="exito").forEach(m=>{
    add({formato:"Post de LinkedIn",fuente:m.id,score:m.score,texto:linkedinTxt(m)});
    if(m.id==="m1")add({formato:"Hilo de X",fuente:m.id,score:m.score-4,texto:hiloTxt(m)});});
  add({formato:"Tip / FAQ",fuente:"m2",score:82,texto:faq1()});
  add({formato:"Tip / FAQ",fuente:"m10",score:69,texto:faq2()});
  add({formato:"Destaque de newsletter",fuente:"m1",score:90,texto:newsTxt()});
  const t=DATOS.filter(m=>ruta(m)==="ticket").map((m,i)=>({id:"T"+(i+1),fuente:m.id,sev:m.sent<=-.6?"Alta":"Media",aviso:null,estado:"Abierto"}));
  return {activos:a,tickets:t};}

const META={panorama:["Panorama de la comunidad","Qué dice la comunidad y qué produjo Insight Mind con eso."],
 flujo:["Procesar lote","Ingesta, análisis y curaduría en un solo flujo."],
 tickets:["Tickets","Lo que no se publica: se avisa al equipo."],
 publicaciones:["Publicaciones","Qué salió publicado, dónde y cuándo."],
 historial:["Historial","Entra a cualquier semana y revisa qué pasó."],
 conexiones:["Conexiones","Vincula los destinos donde se publica."],
 ajustes:["Ajustes","Voz de marca, umbrales y cuentas."]};
const PAGS=Object.keys(META);
function ir(p){
  document.querySelectorAll(".nav").forEach(b=>b.setAttribute("aria-current",b.dataset.p===p?"page":"false"));
  PAGS.forEach(x=>$("#p_"+x).hidden=(x!==p));
  titulo.textContent=META[p][0];subtitulo.textContent=META[p][1];
  mtop_pag.textContent=META[p][0];cerrarMenu();
  acciones.innerHTML="";
  if(p==="flujo"&&E.procesado)acciones.appendChild(el("span","mini",`Lote 2026-semana-04 · ${DATOS.length} mensajes · ${E.segundos||0} s`));
  window.scrollTo({top:0,behavior:"smooth"});}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>ir(b.dataset.p));

/* ---------- MENÚ MÓVIL ---------- */
function abrirMenu(){document.body.classList.add("menu-abierto");scrim.hidden=false;
  hamb.setAttribute("aria-expanded","true");hamb.setAttribute("aria-label","Cerrar menú");}
function cerrarMenu(){if(!document.body.classList.contains("menu-abierto"))return;
  document.body.classList.remove("menu-abierto");hamb.setAttribute("aria-expanded","false");
  hamb.setAttribute("aria-label","Abrir menú");setTimeout(()=>{scrim.hidden=true;},260);}
hamb.onclick=()=>document.body.classList.contains("menu-abierto")?cerrarMenu():abrirMenu();
scrim.onclick=cerrarMenu;
addEventListener("keydown",e=>{if(e.key==="Escape")cerrarMenu();});
document.querySelectorAll("#tabs_flujo .stp").forEach(b=>b.onclick=()=>{
  const n=+b.dataset.s;if(n>1&&!E.procesado)return toast("Falta procesar","Sube un lote y ejecuta el grafo.");irPaso(n);});
function irPaso(n){E.paso=n;save();
  document.querySelectorAll("#tabs_flujo .stp").forEach(b=>{
    const i=+b.dataset.s, hecho=E.procesado&&i<n;
    b.className="stp"+(hecho?" done":"");
    b.querySelector(".n").innerHTML=hecho?ic("check"):i;
    if(i===n)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");});
  [1,2,3].forEach(i=>$("#paso_"+i).hidden=(i!==n));}

btn_file.onclick=()=>file.click(); file.onchange=validar; btn_ejemplo.onclick=validar;
drop.addEventListener("dragover",e=>{e.preventDefault();drop.style.borderColor="var(--primary)";});
drop.addEventListener("dragleave",()=>drop.style.borderColor="");
drop.addEventListener("drop",e=>{e.preventDefault();drop.style.borderColor="";validar();});
/* Lo que se va a mandar en POST /procesar. En demo no hay archivo real, pero la
   variable existe para que el día que modoDemo pase a false no haya que tocar
   ejecutarGrafo(). */
let LOTE_ACTUAL=null;
function validar(e){
  LOTE_ACTUAL={semana:"2026-semana-04",archivo:(e&&e.target&&e.target.files&&e.target.files[0]||{}).name||"lote-ejemplo.json"};
  validacion.hidden=false;
  toast("Archivo cargado",`${DATOS.length} interacciones válidas · 1 duplicada eliminada`);}

const PASOS=["validar · esquema Pydantic","limpiar · enmascarar datos personales","analizar · sentimiento y temas","agrupar_preguntas · dudas similares","router · 4 reglas condicionales","generar · LinkedIn, X, FAQ y newsletter","newsletter_semanal · highlights","consolidar · paquete oficial","guardar · OCI Object Storage"];
/* El avance se detiene aquí mientras el servidor no conteste. La animación NUNCA
   llega sola al final: un loader que termina antes que el proceso deja la pantalla
   diciendo "listo" mientras está congelada, que es peor que no tener loader.
   Es exactamente lo que nos pasó en la prueba del equipo. */
const TOPE_SIN_RESPUESTA=.7;
const espera=ms=>new Promise(r=>setTimeout(r,ms));
let grafoCorriendo=false;

btn_procesar.onclick=()=>ejecutarGrafo();
btn_reintentar.onclick=()=>ejecutarGrafo();

async function ejecutarGrafo(){
  if(grafoCorriendo)return;
  grafoCorriendo=true;btn_procesar.disabled=true;
  irPaso(2);
  steps.innerHTML="";oci_linea.hidden=true;oci_ruta.textContent="";
  analisis_resultado.hidden=true;grafo_aviso.hidden=true;grafo_error.hidden=true;
  prog.classList.remove("esperando");barra.style.transform="scaleX(0)";
  PASOS.forEach(x=>steps.appendChild(el("div","step",
    '<span class="sdot"></span><span class="step-txt">'+x+'</span><span class="step-t mono"></span>')));
  const nodos=[...steps.children];
  const tope=Math.max(1,Math.floor(nodos.length*TOPE_SIN_RESPUESTA));

  /* El trabajo de verdad. En demo se simula una latencia variable justamente para
     que se vea el caso que nos rompió: el servidor tardando más que la animación. */
  const trabajo=API.modoDemo
    ? espera(2800+Math.random()*5600).then(()=>({demo:true}))
    : API.procesarLote(LOTE_ACTUAL);

  let respuesta=null,fallo=null,resuelto=false;
  trabajo.then(r=>respuesta=r,e=>fallo=e).finally(()=>resuelto=true);

  const t0=Date.now();let hecho=0;
  const pintarNodos=()=>{
    nodos.forEach((n,k)=>{n.className="step"+(k<hecho?" done":k===hecho?" run":"");
      if(k!==hecho)n.querySelector(".step-t").textContent="";});
    barra.style.transform=`scaleX(${hecho/nodos.length})`;};
  const reloj=setInterval(()=>{
    const n=nodos[Math.min(hecho,nodos.length-1)];
    if(n)n.querySelector(".step-t").textContent=Math.round((Date.now()-t0)/1000)+" s";},250);

  pintarNodos();
  /* Fase 1 · avanza desacelerando. Cada nodo tarda un poco más que el anterior,
     que es como se comporta un proceso real y como se siente creíble. */
  for(;hecho<tope&&!resuelto;hecho++){pintarNodos();await espera(340+hecho*90);}

  /* Fase 2 · si el servidor todavía no contestó, aquí se queda */
  if(!resuelto){
    pintarNodos();prog.classList.add("esperando");grafo_aviso.hidden=false;
    await trabajo.catch(()=>{});
    prog.classList.remove("esperando");grafo_aviso.hidden=true;}
  clearInterval(reloj);
  nodos.forEach(n=>n.querySelector(".step-t").textContent="");

  if(fallo){
    nodos[Math.min(hecho,nodos.length-1)].className="step fallo";
    grafo_error_txt.textContent=fallo.message||"El servidor no respondió.";
    grafo_error.hidden=false;grafoCorriendo=false;btn_procesar.disabled=false;
    return toast("No se pudo procesar","Revisa la conexión con la API");}

  /* Fase 3 · ya hay respuesta: cierra rápido lo que falte */
  for(;hecho<nodos.length;hecho++){pintarNodos();await espera(140);}
  pintarNodos();
  const segs=Math.round((Date.now()-t0)/1000);
  grafoCorriendo=false;btn_procesar.disabled=false;
  fin(respuesta,segs);}

function fin(respuesta,segs){
  oci_ruta.textContent="activos/2026-semana-04/paquete-distribucion.json";oci_linea.hidden=false;
  const c=construir();E.activos=c.activos;E.tickets=c.tickets;E.procesado=true;
  E.segundos=segs;selTic.clear();selCur={};save();
  pintar();analisis_resultado.hidden=false;
  toast("Lote procesado",`${c.activos.length} activos y ${c.tickets.length} tickets en ${segs} s`,true);}
btn_a_3.onclick=()=>irPaso(3);

/* ---------- ANÁLISIS ---------- */
function pintarAnalisis(){
  const pos=DATOS.filter(m=>m.sent>.2).length,neg=DATOS.filter(m=>m.sent<-.2).length,neu=DATOS.length-pos-neg;
  const pct=n=>Math.round(n/DATOS.length*100);
  stats.innerHTML=[["Interacciones",DATOS.length,"+3 vs sem 03","up"],["% positivas",pct(pos)+"%","−9 pts","down"],
   ["Activos generados",E.activos.length,"","up"],["Tickets abiertos",E.tickets.filter(t=>t.estado!=="Resuelto").length,"+2","down"],
   ["Publicados",E.pubs.length,"","up"]].map(k=>
   `<div class="stat"><div class="k">${k[0]}</div><div class="v">${k[1]}</div><div class="d ${k[3]}">${k[2]}</div></div>`).join("");
  bars.innerHTML=`<i style="background:var(--ok);width:${pct(pos)}%"></i><i style="background:var(--border-2);width:${pct(neu)}%"></i><i style="background:var(--alert);width:${pct(neg)}%"></i>`;
  l_pos.textContent=pct(pos)+"%";l_neu.textContent=pct(neu)+"%";l_neg.textContent=pct(neg)+"%";
  const t={};DATOS.forEach(m=>m.temas.forEach(x=>t[x]=(t[x]||0)+1));
  const nuevos=["Acceso a laboratorios","Plataforma / Video"];
  temas.innerHTML=Object.entries(t).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,c])=>
    `<tr><td>${k} ${nuevos.includes(k)?'<span class="pill p-pri">nuevo</span>':""}</td><td class="mono" style="width:60px">${c}</td></tr>`).join("");
  banner_slot.innerHTML=`<div class="note err">${ic("alerta")}<div><b>Alerta de sentimiento.</b> Los negativos pasaron de 8% a ${pct(neg)}% frente a la semana 03. Origen: acceso a laboratorios de OCI con 2 reportes y videos del módulo 3.</div></div>`;
  const cuenta={};E.activos.forEach(a=>cuenta[a.formato]=(cuenta[a.formato]||0)+1);
  resumen_produccion.innerHTML=Object.entries(cuenta).map(([f,c])=>{const p=PLAT[FORMATOS[f].plat];
    return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:7px">
      <span class="row" style="gap:8px"><span class="mk" style="--pc:${p.color};width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-size:.62rem;font-weight:700">${p.ini}</span>${f}</span>
      <b class="mono">${c}</b></div>`;}).join("")+
   `<div class="row" style="justify-content:space-between"><span class="row" style="gap:8px">
     <span class="mk" style="--pc:var(--alert);width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-size:.62rem;font-weight:700">!</span>Tickets internos</span>
     <b class="mono">${E.tickets.length}</b></div>`;
  apoyo.innerHTML=DATOS.filter(m=>m.apoyo).map(m=>
    `<div class="mini" style="border-left:2px solid var(--alert);padding-left:9px"><b>${m.autor}</b> · ${m.canal}<br>${m.texto.slice(0,72)}…</div>`).join("");
  tabla.innerHTML=DATOS.slice().sort((a,b)=>b.score-a.score).map(m=>{const r=ruta(m);return `<tr>
    <td><b>${m.autor}</b></td><td style="max-width:240px" class="muted">${m.texto.slice(0,70)}…</td>
    <td class="muted">${m.tipo}</td><td class="mono ${m.sent>.2?"up":m.sent<-.2?"down":""}">${m.sent.toFixed(2)}</td>
    <td class="mono"><b>${m.score}</b></td><td class="muted" style="max-width:170px">${m.por_que}</td>
    <td><span class="pill ${PILL[r]}">${NOM[r]}</span></td></tr>`;}).join("");}

/* ---------- CURADURÍA ---------- */
let tabFmt="linkedin",fEstado={};
/* Igual que en tickets: la selección vive fuera del render, por plataforma. */
let selCur={};
const selDe=k=>selCur[k]||(selCur[k]=new Set());
const curSeleccionable=a=>a.estado!=="Publicado"&&a.estado!=="Descartado";
const ESTADOS=["Todos","Pendiente","Listo","Publicado"];
const pendientesDe=k=>E.activos.filter(a=>FORMATOS[a.formato].plat===k&&a.estado==="Pendiente").length;
function pintarCuraduria(){
  if(!E.procesado){tabs_formato.innerHTML="";
    curaduria.innerHTML='<div class="block empty">Procesa un lote para ver el contenido generado.</div>';return;}
  tabs_formato.innerHTML=TABS.map(([k,n])=>{
    const total=k==="tickets"?E.tickets.length:E.activos.filter(a=>FORMATOS[a.formato].plat===k).length;
    const pend=k==="tickets"?E.tickets.filter(t=>!t.aviso).length:pendientesDe(k);
    const badge=pend?`<span class="c pend" title="${pend} sin revisar">${pend}</span>`:`<span class="c" title="${total} en total">${total}</span>`;
    return `<button class="tab" data-t="${k}" aria-selected="${tabFmt===k}">${n}${badge}</button>`;}).join("");
  tabs_formato.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{tabFmt=b.dataset.t;pintarCuraduria();});
  if(tabFmt==="tickets"){conexion_aviso.innerHTML="";return pintarTicketsEn(curaduria);}
  const p=PLAT[tabFmt],conn=E.conex[tabFmt],fE=fEstado[tabFmt]||"Todos";
  conexion_aviso.innerHTML=conn?"":`<div class="note">${ic("enchufe")}<div><b>${p.nom}</b> no está vinculado. Puedes aprobar, pero no publicar hasta conectarlo en Conexiones.</div></div>`;
  const todos=E.activos.filter(a=>FORMATOS[a.formato].plat===tabFmt);
  const lista=todos.filter(a=>fE==="Todos"||a.estado===fE);
  const pend=pendientesDe(tabFmt);
  const listos=todos.filter(a=>a.estado==="Listo").length;
  const card=el("div","plat");
  card.innerHTML=`<div class="plat-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
    <div style="flex:1;min-width:160px"><b>${p.nom}</b><div class="mini">${conn?p.cuenta+" · "+p.modo:"sin vincular"}</div></div>
    <div class="plat-filtros">
      ${ESTADOS.map(e=>{const n=e==="Todos"?todos.length:todos.filter(a=>a.estado===e).length;
        return `<button aria-pressed="${fE===e}" data-e="${e}">${e} <span class="mono mini">${n}</span></button>`;}).join("")}
    </div></div>`;
  const elegibles=lista.filter(curSeleccionable), sel=selDe(tabFmt);
  const n=[...sel].filter(id=>elegibles.some(a=>a.id===id)).length;
  card.insertAdjacentHTML("beforeend",`<div class="selbar">
      <label class="chk"><input type="checkbox" id="cur_all" ${elegibles.length&&n===elegibles.length?"checked":""}
        ${elegibles.length?"":"disabled"}><span>Seleccionar todo</span></label>
      <span class="mini">${n?`${n} de ${elegibles.length} seleccionado${n===1?"":"s"}`:
        elegibles.length?"Ninguno seleccionado":"Nada por publicar aquí"}</span>
      <div class="selbar-sp"></div>
      ${pend?'<button class="btn sm" id="btn_aprobar_todo">'+ic("check")+'Guardar los '+pend+' pendientes</button>':""}
      <button class="btn primary sm" id="btn_cur_sel" ${n&&conn?"":"disabled"}
        title="${conn?"":"Vincula "+p.nom+" en Conexiones para poder publicar"}">${ic("enviar")}Publicar seleccionados${n?` (${n})`:""}</button>
    </div>`);
  if(!lista.length)card.appendChild(el("div","empty",fE==="Todos"
    ?"Este lote no generó contenido para "+p.nom+"."
    :`Nada en estado “${fE}” en ${p.nom}.`));
  lista.forEach(a=>{
    const m=msg(a.fuente),cfg=FORMATOS[a.formato];
    const pillC=a.estado==="Publicado"?"p-pri":a.estado==="Listo"?"p-ok":a.estado==="Descartado"?"p-mute":"p-warn";
    const it=el("div","item "+a.estado.toLowerCase());
    it.innerHTML=`<div class="row item-head">
        <div class="row item-head-l">${curSeleccionable(a)
          ? `<label class="chk"><input type="checkbox" class="js-cu" data-cu="${a.id}"
              ${sel.has(a.id)?"checked":""} aria-label="Seleccionar ${a.formato}"></label>`
          : '<span class="chk-hueco"></span>'}<b>${a.formato}</b><span class="mono mini">score ${a.score}</span></div>
        <span class="pill ${pillC}">${a.estado}</span></div>
      <details class="acc" style="margin-bottom:9px"><summary>Basado en: mensaje de ${m.autor}</summary>
        <div class="body"><div class="meta">${m.canal} · SCORE ${m.score} · SENT ${m.sent.toFixed(2)}</div>${m.texto}
        <div class="meta" style="margin-top:7px">POR QUÉ ESTE SCORE: ${m.por_que}</div></div></details>
      <textarea rows="${cfg.porPost?8:6}" id="ta_${a.id}" ${a.estado==="Publicado"?"readonly":""}>${a.texto}</textarea>
      <div class="row" style="justify-content:space-between;margin-top:9px">
        <span class="mini mono" id="c_${a.id}"></span>
        <div class="acciones-activo">${a.estado==="Publicado"
          ? `<span class="mini">Publicado el ${a.publicado}</span>`
          : `<button class="btn primary sm" data-ac="publicar" data-id="${a.id}" ${conn?"":"disabled"}>Publicar en ${p.nom}</button>
             <button class="btn sm" data-ac="listo" data-id="${a.id}" ${a.estado==="Listo"?"disabled":""}>${a.estado==="Listo"?ic("check")+"En cola":"Guardar para después"}</button>
             <span class="sep2"></span>
             <button class="btn sm" data-ac="corto" data-id="${a.id}" title="Acorta el texto">${ic("corto")}Más corto</button>
             <button class="btn sm" data-ac="largo" data-id="${a.id}" title="Alarga el texto o revierte el recorte">${ic("largo")}Más largo</button>
             <button class="btn sm" data-ac="nuevo" data-id="${a.id}" title="Otra versión desde el mismo mensaje">${ic("regenerar")}Volver a generar</button>
             <button class="btn sm" data-ac="descartar" data-id="${a.id}">Descartar</button>`}</div></div>`;
    card.appendChild(it);
    const ta=it.querySelector("textarea"),c=it.querySelector("#c_"+a.id);
    const cuenta=()=>{if(cfg.porPost){const ps=ta.value.split("———"),mx=Math.max(...ps.map(x=>x.trim().length));
        c.textContent=`${ps.length} posts · máx ${mx}/280`;c.style.color=mx>280?"var(--alert)":"";}
      else{c.textContent=`${ta.value.length}/${cfg.limite} caracteres`;c.style.color=ta.value.length>cfg.limite?"var(--alert)":"";}};
    cuenta();ta.oninput=()=>{cuenta();if(ta.value!==a.texto){a.editado=true;a.texto=ta.value;save();}};
  });
  curaduria.innerHTML="";curaduria.appendChild(card);
  card.querySelectorAll(".plat-filtros [data-e]").forEach(b=>b.onclick=()=>{fEstado[tabFmt]=b.dataset.e;pintarCuraduria();});
  const ba=card.querySelector("#btn_aprobar_todo");
  if(ba)ba.onclick=()=>aprobarPendientes(tabFmt);
  const all=card.querySelector("#cur_all");
  if(all)all.onchange=()=>{all.checked?elegibles.forEach(a=>sel.add(a.id))
    :elegibles.forEach(a=>sel.delete(a.id));pintarCuraduria();};
  card.querySelectorAll(".js-cu").forEach(c=>c.onchange=()=>{
    c.checked?sel.add(c.dataset.cu):sel.delete(c.dataset.cu);pintarCuraduria();});
  const bs=card.querySelector("#btn_cur_sel");
  if(bs)bs.onclick=()=>publicarVarios(tabFmt,E.activos.filter(a=>sel.has(a.id)&&curSeleccionable(a)));
  curaduria.querySelectorAll('[data-ac]').forEach(b=>b.onclick=()=>accion(b.dataset.ac,b.dataset.id));}
function aprobarPendientes(plat){
  const n=E.activos.filter(a=>FORMATOS[a.formato].plat===plat&&a.estado==="Pendiente");
  n.forEach(a=>a.estado="Listo");save();pintar();
  toast(n.length+" en cola de "+PLAT[plat].nom,"Listos para publicar cuando quieras",true);}

/* modal de confirmación antes de publicar */
function confirmarPublicacion(id){
  const a=E.activos.find(x=>x.id===id),cfg=FORMATOS[a.formato],p=PLAT[cfg.plat],m=msg(a.fuente);
  const largo=cfg.porPost
    ? a.texto.split("———").length+" posts · máximo "+Math.max(...a.texto.split("———").map(x=>x.trim().length))+"/280 caracteres"
    : a.texto.length+"/"+cfg.limite+" caracteres";
  dlg_cont.innerHTML=`
    <div class="modal-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div style="flex:1"><b>Publicar en ${p.nom}</b><div class="mini">${p.cuenta} · ${p.modo}</div></div></div>
    <div class="modal-body">
      <div class="modal-meta"><span>Formato: <b>${a.formato}</b></span><span>Origen: <b>${m.autor}</b></span>
        <span>Longitud: <b>${largo}</b></span>${a.editado?"<span>Estado: <b>editado a mano</b></span>":""}</div>
      <div><span class="label">Así se va a publicar</span><div class="modal-prev">${a.texto.replace(/</g,"&lt;")}</div></div>
      <div class="mini">Se registrará en Publicaciones con su enlace y el mensaje que lo originó. Tendrás 6 segundos para deshacer.</div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="dlg_no">Cancelar</button>
      <button class="btn primary" id="dlg_si">Publicar ahora</button>
    </div>`;
  dlg.showModal();
  dlg_no.onclick=()=>dlg.close();
  dlg_si.onclick=()=>{dlg.close();publicar(id);};
  setTimeout(()=>dlg_si.focus(),50);}

function publicar(id){
  const a=E.activos.find(x=>x.id===id),p=PLAT[FORMATOS[a.formato].plat];
  const previo=a.estado;
  a.estado="Publicado";a.publicado="23 sep, 10:4"+Math.floor(Math.random()*9);
  const pub={fecha:a.publicado,plat:FORMATOS[a.formato].plat,formato:a.formato,extracto:a.texto.slice(0,64)+"…",fuente:a.fuente};
  E.pubs.unshift(pub);selDe(FORMATOS[a.formato].plat).delete(id);save();pintar();
  toast("Publicado en "+p.nom,p.cuenta,true,()=>{
    a.estado=previo;delete a.publicado;E.pubs=E.pubs.filter(x=>x!==pub);save();pintar();
    toast("Publicación revertida","El contenido volvió a "+previo);});}

const GANCHOS=[
 "Nada nos da más orgullo que ver a nuestros talentos conquistando el mercado tech 🚀",
 "Hay historias que explican mejor que cualquier folleto para qué sirve una comunidad 👇",
 "Esto no pasó por suerte: pasó por un proyecto terminado y publicado 💼",
 "De hacer ejercicios a firmar contrato. Así se ve el camino cuando se recorre acompañado 🌱"];
const CIERRE="\n\n¿Tú también estás construyendo tu portafolio? Cuéntanos en qué andas 👇\n\n#ComunidadONE #AprenderHaciendo";

function accion(ac,id){
  const a=E.activos.find(x=>x.id===id);
  if(ac==="publicar")return confirmarPublicacion(id);
  if(ac==="listo"){a.estado="Listo";save();pintar();
    toast("Guardado en la cola","Listo para publicar cuando quieras · curaduria.json",true);return;}
  if(ac==="descartar"){a.estado="Descartado";save();pintar();toast("Descartado","Se puede recuperar desde el filtro Todos");return;}
  /* variantes de texto: siempre parten del original generado */
  if(!a.base)a.base=a.texto;
  const partes=a.base.split("\n\n");
  if(ac==="corto"){
    a.texto=partes.slice(0,Math.max(2,Math.ceil(partes.length/2))).join("\n\n")+"\n\n#ComunidadONE";
    a.version="corta";toast("Versión más corta",a.texto.length+" caracteres · 1 llamada al LLM");}
  if(ac==="largo"){
    a.texto=(a.version==="corta"||a.version==="variante")?a.base:a.base+CIERRE;
    a.version=(a.version==="corta"||a.version==="variante")?"original":"larga";
    toast(a.version==="original"?"Texto original restaurado":"Versión más larga",a.texto.length+" caracteres");}
  if(ac==="nuevo"){
    a.variante=((a.variante||0)+1)%GANCHOS.length;
    const resto=a.base.split("\n\n").slice(1).join("\n\n");
    a.texto=GANCHOS[a.variante]+"\n\n"+resto;a.version="variante";
    toast("Nueva versión","Gancho "+(a.variante+1)+" de "+GANCHOS.length+" · 1 llamada al LLM");}
  const t=$("#ta_"+id);if(t){t.value=a.texto;t.dispatchEvent(new Event("input"));}
  save();pintarCuraduria();}

function publicarVarios(plat,lista){
  const p=PLAT[plat];
  if(!lista.length)return toast("Nada seleccionado","Marca al menos un contenido.");
  dlg_cont.innerHTML=`
    <div class="modal-head"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div style="flex:1"><b>Publicar ${lista.length} contenidos en ${p.nom}</b><div class="mini">${p.cuenta} · ${p.modo}</div></div></div>
    <div class="modal-body">
      <div class="modal-prev">${lista.map(a=>"• "+a.texto.split("\n")[0].slice(0,70).replace(/</g,"&lt;")+"…").join("\n\n")}</div>
      <div class="mini">Se publican en orden y quedan registrados en Publicaciones. Tendrás 6 segundos para deshacer.</div></div>
    <div class="modal-foot"><button class="btn" id="dlg_no">Cancelar</button>
      <button class="btn primary" id="dlg_si">Publicar los ${lista.length}</button></div>`;
  dlg.showModal();dlg_no.onclick=()=>dlg.close();
  dlg_si.onclick=()=>{dlg.close();
    const previos=lista.map(a=>({a,estado:a.estado})),nuevas=[];
    lista.forEach(a=>selDe(plat).delete(a.id));
    lista.forEach(a=>{a.estado="Publicado";a.publicado="23 sep, 10:4"+Math.floor(Math.random()*9);
      const pub={fecha:a.publicado,plat,formato:a.formato,extracto:a.texto.slice(0,64)+"…",fuente:a.fuente};
      nuevas.push(pub);E.pubs.unshift(pub);});
    save();pintar();
    toast(lista.length+" publicados en "+p.nom,p.cuenta,true,()=>{
      previos.forEach(x=>{x.a.estado=x.estado;delete x.a.publicado;});
      E.pubs=E.pubs.filter(x=>!nuevas.includes(x));save();pintar();toast("Publicaciones revertidas","Todo volvió a la cola");});};}

/* ---------- TICKETS ---------- */
/* La selección vive fuera del render: pintar() reconstruye el DOM y sin esto
   se perdería en cada repintado. Los ganchos van por clase, no por id, porque
   la misma tabla se dibuja en dos lugares (Tickets y la pestaña de Curaduría). */
let selTic=new Set();
const ticSeleccionables=()=>E.tickets.filter(t=>!t.aviso);

function filasTickets(){
  return E.tickets.map(t=>{const m=msg(t.fuente),av=!!t.aviso;return `<tr>
    <td class="col-chk"><label class="chk"><input type="checkbox" class="js-tk" data-tk="${t.id}"
      ${selTic.has(t.id)?"checked":""} ${av?"disabled":""}
      aria-label="Seleccionar el ticket de ${m.autor}"></label></td>
    <td><span class="pill ${t.sev==="Alta"?"p-alert":"p-warn"}">${t.sev}</span></td>
    <td><b>${m.autor}</b></td><td class="muted">${m.canal}</td><td><span class="celda-res">${m.texto}</span></td>
    <td>${av?`<span class="pill p-mute">${PLAT[t.aviso].nom}</span>`:'<span class="mini">sin avisar</span>'}</td>
    <td><span class="pill ${t.estado==="Resuelto"?"p-ok":"p-mute"}">${t.estado}</span></td>
    <td class="col-ac"><button class="btn sm js-av" data-av="${t.id}" ${av?"disabled":""}>
      ${av?ic("check")+"Avisado":ic("enviar")+"Avisar"}</button></td></tr>`;}).join("");}

function tablaTickets(){
  const sel=ticSeleccionables(),n=[...selTic].filter(id=>sel.some(t=>t.id===id)).length;
  const todos=sel.length>0&&n===sel.length;
  return `<div class="selbar">
      <label class="chk"><input type="checkbox" class="js-tk-all" ${todos?"checked":""}
        ${sel.length?"":"disabled"}><span>Seleccionar todos</span></label>
      <span class="mini">${n?`${n} de ${sel.length} seleccionado${n===1?"":"s"}`:
        sel.length?"Ninguno seleccionado":"Nada pendiente de avisar"}</span>
      <div class="selbar-sp"></div>
      <button class="btn primary sm js-tk-sel" ${n?"":"disabled"}>${ic("enviar")}Enviar seleccionados${n?` (${n})`:""}</button>
    </div>
    <div class="df"><table><thead><tr>
      <th class="col-chk"></th><th>Sev.</th><th>Reportado por</th><th>Canal</th>
      <th>Resumen</th><th>Aviso</th><th>Estado</th><th class="col-ac"></th></tr></thead>
      <tbody>${E.tickets.length?filasTickets()
        :'<tr><td colspan="8" class="empty">Procesa un lote para generar tickets.</td></tr>'}</tbody>
    </table></div>`;}

function conectarTickets(cont){
  const all=cont.querySelector(".js-tk-all");
  if(all)all.onchange=()=>{const sel=ticSeleccionables();
    if(all.checked)sel.forEach(t=>selTic.add(t.id));else sel.forEach(t=>selTic.delete(t.id));
    refrescarTickets();};
  cont.querySelectorAll(".js-tk").forEach(c=>c.onchange=()=>{
    c.checked?selTic.add(c.dataset.tk):selTic.delete(c.dataset.tk);refrescarTickets();});
  const b=cont.querySelector(".js-tk-sel");
  if(b)b.onclick=()=>avisarTickets([...selTic]);
  cont.querySelectorAll(".js-av").forEach(b=>b.onclick=()=>avisarTickets([b.dataset.av]));}

const refrescarTickets=()=>{pintarTickets();if(tabFmt==="tickets")pintarCuraduria();};

function pintarTickets(){
  b_tic.textContent=E.procesado?E.tickets.filter(t=>t.estado!=="Resuelto").length:"—";
  tickets_cont.innerHTML=tablaTickets();conectarTickets(tickets_cont);
  tabla_tickets_hist.innerHTML=[["2026-semana-03","Error 500 al subir el proyecto final","discord","15 sep","17 sep","Resuelto"],
   ["2026-semana-03","Video del módulo 2 sin audio","discord","16 sep","18 sep","Resuelto"],
   ["2026-semana-02","Certificado no se descarga","discord","09 sep","—","En curso"]].map(f=>
   `<tr><td><b>${f[0]}</b></td><td>${f[1]}</td><td><span class="pill p-mute">${PLAT[f[2]].nom}</span></td>
    <td class="muted">${f[3]}</td><td class="muted">${f[4]}</td><td><span class="pill ${f[5]==="Resuelto"?"p-ok":"p-warn"}">${f[5]}</span></td></tr>`).join("");}

function pintarTicketsEn(cont){
  const card=el("div","plat");
  card.innerHTML=`<div class="plat-head"><div class="mk" style="--pc:var(--alert)">!</div>
    <div class="plat-head-b"><b>Tickets internos</b><div class="mini">No se publican: se avisan en Discord, en el canal del equipo</div></div>
    <span class="mini mono">${E.tickets.length}</span></div>
    <div class="item">${tablaTickets()}</div>`;
  cont.innerHTML="";cont.appendChild(card);conectarTickets(card);}

function avisarTickets(ids){
  if(!E.conex.discord){ir("conexiones");return toast("Falta vincular","Discord no está conectado.");}
  const lista=E.tickets.filter(t=>ids.includes(t.id)&&!t.aviso);
  if(!lista.length)return toast("Nada que enviar","Esos tickets ya se avisaron.");
  const previos=lista.map(t=>({t,estado:t.estado}));
  lista.forEach(t=>{t.aviso="discord";t.estado="En curso";selTic.delete(t.id);});
  save();pintar();
  toast(lista.length===1?"Ticket enviado":lista.length+" tickets enviados",
    "Discord · "+PLAT.discord.cuenta,true,()=>{
      previos.forEach(x=>{x.t.aviso=null;x.t.estado=x.estado;});save();pintar();
      toast("Envío revertido","Los tickets volvieron a la cola");});}

/* ---------- PUBLICACIONES ---------- */
function pintarPubs(){
  b_pub.textContent=E.pubs.length;
  const n=k=>E.pubs.filter(p=>p.plat===k).length;
  stats_pub.innerHTML=[["LinkedIn",n("linkedin")],["X",n("x")],["FAQ web",n("web")],["Total semana",E.pubs.length]]
   .map(k=>`<div class="stat"><div class="k">${k[0]}</div><div class="v">${k[1]}</div></div>`).join("");
  tabla_pub.innerHTML=E.pubs.length?E.pubs.map(p=>{const m=msg(p.fuente);return `<tr>
    <td class="muted">${p.fecha}</td><td><span class="pill p-mute">${PLAT[p.plat].nom}</span></td><td>${p.formato}</td>
    <td class="muted" style="max-width:300px">${p.extracto}</td><td class="muted">${m.autor}</td>
    <td><a href="#" onclick="return false" style="color:var(--link)">ver</a></td></tr>`;}).join("")
    :'<tr><td colspan="6" class="empty">Aún no publicas nada esta semana. Publica desde el paso 3 · Curaduría.</td></tr>';}

/* ---------- HISTORIAL ---------- */
let semanaSel="2026-semana-03";
function pintarHistorial(){
  const semanas=["2026-semana-04","2026-semana-03","2026-semana-02"];
  lista_semanas.innerHTML=semanas.map(s=>{
    const d=s==="2026-semana-04"?{inter:E.procesado?12:0,publicados:E.pubs.length}:HIST[s];
    return `<button class="semana-btn" data-s="${s}" aria-current="${semanaSel===s}">
      <div style="flex:1"><b>${s.replace("2026-semana-","Semana ")}</b>
        <div class="mini">${d.inter} interacciones · ${d.publicados} publicados</div></div>
      ${s==="2026-semana-04"?'<span class="pill p-pri">actual</span>':""}</button>`;}).join("");
  lista_semanas.querySelectorAll(".semana-btn").forEach(b=>b.onclick=()=>{semanaSel=b.dataset.s;pintarHistorial();});
  const act=semanaSel==="2026-semana-04";
  const d=act?{inter:E.procesado?12:0,pos:58,neg:25,activos:E.activos.length,publicados:E.pubs.length,
    tickets:E.tickets.length,temas:["Acceso a laboratorios","Contratación / Logros","LangGraph"],
    contenidos:E.activos.map(a=>[FORMATOS[a.formato].plat,a.formato,a.texto.slice(0,52)+"…",a.estado]),
    tickets_list:E.tickets.map(t=>[msg(t.fuente).texto.slice(0,46)+"…",t.estado])}:HIST[semanaSel];
  detalle_semana.innerHTML=`
    <div class="stats stats-4">
      <div class="stat"><div class="k">Interacciones</div><div class="v">${d.inter}</div></div>
      <div class="stat"><div class="k">% positivo</div><div class="v">${d.pos}%</div></div>
      <div class="stat"><div class="k">Activos</div><div class="v">${d.activos}</div></div>
      <div class="stat"><div class="k">Publicados</div><div class="v">${d.publicados}</div></div>
    </div>
    <div class="block"><p class="blk-title">Temas de la semana</p>
      <div class="row" style="margin-top:8px">${d.temas.map(t=>`<span class="pill p-mute">${t}</span>`).join("")}</div></div>
    <div class="block"><p class="blk-title">Contenidos</p>
      <p class="blk-info">Todo lo que se generó esa semana, con su estado final.</p>
      <div class="df"><table><thead><tr><th>Plataforma</th><th>Formato</th><th>Contenido</th><th>Estado</th></tr></thead><tbody>
      ${d.contenidos.length?d.contenidos.map(c=>`<tr><td><span class="pill p-mute">${PLAT[c[0]].nom}</span></td><td>${c[1]}</td>
        <td class="muted" style="max-width:280px">${c[2]}</td>
        <td><span class="pill ${c[3]==="Publicado"?"p-ok":c[3]==="Descartado"?"p-mute":"p-warn"}">${c[3]}</span></td></tr>`).join("")
        :'<tr><td colspan="4" class="empty">Sin contenidos todavía.</td></tr>'}
      </tbody></table></div></div>
    <div class="block"><p class="blk-title">Tickets</p>
      <div class="df"><table><thead><tr><th>Ticket</th><th>Estado</th></tr></thead><tbody>
      ${d.tickets_list.length?d.tickets_list.map(t=>`<tr><td>${t[0]}</td>
        <td><span class="pill ${t[1]==="Resuelto"?"p-ok":"p-warn"}">${t[1]}</span></td></tr>`).join("")
        :'<tr><td colspan="2" class="empty">Sin tickets.</td></tr>'}
      </tbody></table></div></div>
    <div class="mini">Ruta en OCI: <code>activos/${semanaSel}/</code></div>`;}

/* ---------- CONEXIONES ---------- */
function pintarConex(){
  b_con.textContent=Object.values(E.conex).filter(Boolean).length+"/"+Object.keys(PLAT).length;
  lista_conexiones.innerHTML=Object.entries(PLAT).map(([k,p])=>{const on=E.conex[k];
    return `<div class="conn"><div class="mk" style="--pc:${p.color}">${p.ini}</div>
      <div class="b"><b>${p.nom}</b><div class="dot ${on?"on":""}"><i></i>${on?"Conectado · "+p.cuenta:"Sin conectar"}</div>
        <div class="mini">${p.modo}</div></div>
      <button class="btn sm ${on?"":"primary"}" data-c="${k}">${on?"Desvincular":"Conectar"}</button></div>`;}).join("");
  lista_conexiones.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>alternar(b.dataset.c));
}
function alternar(k){const p=PLAT[k],on=E.conex[k];E.conex[k]=!on;save();pintar();
  toast(on?p.nom+" desvinculado":p.nom+" conectado",on?"Lo ya publicado no se borra.":p.cuenta,!on);}

/* ---------- AJUSTES ---------- */
const ESTILOS=["Cercano","Inspirador","Celebratorio","Didáctico","Técnico","Breve","Sobrio","Con emojis","Sin hashtags","Primera persona plural"];
function pintarChips(){
  voz_chips.innerHTML=E.chips.map(c=>`<span class="vchip">${c}<button data-q="${c}" title="Quitar">×</button></span>`).join("");
  voz_chips.querySelectorAll("button").forEach(b=>b.onclick=()=>{E.chips=E.chips.filter(x=>x!==b.dataset.q);save();pintarChips();});
  chips_estilo.innerHTML=ESTILOS.map(e=>`<button aria-pressed="${E.chips.includes(e)}" data-e="${e}">${E.chips.includes(e)?ic("check"):""}${e}</button>`).join("");
  chips_estilo.querySelectorAll("button").forEach(b=>b.onclick=()=>{const e=b.dataset.e;
    E.chips=E.chips.includes(e)?E.chips.filter(x=>x!==e):[...E.chips,e];save();pintarChips();});}
btn_voz.onclick=()=>{voz_msg.textContent=E.chips.length?"Guardada con "+E.chips.length+" chips de estilo":"Guardada";
  toast("Guía de voz guardada","Se aplica al siguiente lote",true);};
function recalcular(){
  U.descartar=+u_desc.value;U.exito_score=+u_ex.value;
  if(E.procesado){
    const previos=E.activos, c=construir();
    /* Conserva el trabajo humano: si el activo sigue existiendo tras el recálculo,
       mantiene su texto editado y su estado. Solo nacen los que cambian de rama. */
    c.activos.forEach(n=>{
      const v=previos.find(x=>x.formato===n.formato&&x.fuente===n.fuente);
      if(v)Object.assign(n,{estado:v.estado,texto:v.texto,editado:v.editado,
        publicado:v.publicado,base:v.base,version:v.version,variante:v.variante});
    });
    const perdidos=previos.filter(v=>!c.activos.some(n=>n.formato===v.formato&&n.fuente===v.fuente)
      &&(v.estado!=="Pendiente"||v.editado)).length;
    E.activos=c.activos;E.tickets=c.tickets;save();
    if(perdidos)toast(`${perdidos} borrador${perdidos===1?"":"es"} ya no aplica${perdidos===1?"":"n"}`,
      "Cambiaron de rama con los nuevos umbrales");
  }
  pintar();toast("Umbrales aplicados",`descartar < ${U.descartar} · éxito ≥ ${U.exito_score}`,true);
  irPaso(2);ir("flujo");}

btn_umbrales.onclick=()=>{
  const enRiesgo=E.activos.filter(a=>a.estado!=="Pendiente"||a.editado);
  if(!enRiesgo.length)return recalcular();
  const editados=enRiesgo.filter(a=>a.editado).length,
        cola=E.activos.filter(a=>a.estado==="Listo").length,
        pub=E.activos.filter(a=>a.estado==="Publicado").length;
  dlg_cont.innerHTML=`
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
  dlg.showModal();dlg_no.onclick=()=>dlg.close();
  dlg_si.onclick=()=>{dlg.close();recalcular();};
  setTimeout(()=>dlg_no.focus(),50);};

function pintar(){pintarAnalisis();pintarCuraduria();pintarTickets();pintarPubs();pintarConex();pintarHistorial();}
pintarChips();pintar();
/* El panorama se pinta una sola vez: sus cifras son historia ya cerrada en
   MongoDB y no cambian porque en esta sesión se apruebe o se publique algo.
   Sus propios filtros lo vuelven a pintar cuando hace falta. */
pintarDashboard();
ir("panorama");irPaso(1);
