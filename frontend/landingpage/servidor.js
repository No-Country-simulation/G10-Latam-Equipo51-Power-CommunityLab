/* Servidor estático mínimo para ver el sitio público en local.
   Alternativa a `python3 -m http.server`, útil donde Python no está disponible.
   Uso:  node frontend/landingpage/servidor.js  [puerto]   →  http://localhost:5600 */
const http=require("http"),fs=require("fs"),path=require("path");
const raiz=__dirname, puerto=+(process.argv[2]||5600);
const TIPO={".html":"text/html;charset=utf-8",".css":"text/css;charset=utf-8",
  ".js":"text/javascript;charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
http.createServer((q,r)=>{
  let u=decodeURIComponent(q.url.split("?")[0]);   /* la query se quita antes de resolver */
  if(u==="/")u="/index.html";
  const f=path.join(raiz,u);
  if(!f.startsWith(raiz)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end("404");}
  r.writeHead(200,{"Content-Type":TIPO[path.extname(f)]||"application/octet-stream","Cache-Control":"no-store"});
  fs.createReadStream(f).pipe(r);
}).listen(puerto,()=>console.log("Sitio de Insight Mind en http://localhost:"+puerto));
