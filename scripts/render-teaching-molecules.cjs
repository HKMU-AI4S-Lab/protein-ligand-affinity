// Reproducible scientific rendering with the installed 3Dmol renderer.
// Input coordinates, plane positions and region boundaries are never optimised.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const D=read('artifacts/research-illustration-data.json').aspirin,C=read('artifacts/gradcam-illustration-data.json'),E=read('public/research/gnina-crossdock/manifest.json').examples[0];
if(hash(C.source.path)!==C.source.sha256)throw Error('Captured source changed');
const r=read(C.source.path).find(r=>r.input.smiles==='CCO');
for(const k of ['grid','protein','structure'])if(hash('public/'+E[k].path)!==E[k].sha256)throw Error('Prepared complex changed');
const protein=fs.readFileSync(path.join(root,'public',E.protein.path),'utf8'),ligand=fs.readFileSync(path.join(root,'public',E.structure.path),'utf8');
const html='<!doctype html><html><body style="margin:0"><div id="molecule" style="width:800px;height:800px;position:relative"></div><script src="/3dmol.js"></script></body></html>';
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else if(req.url==='/3dmol.js'){res.setHeader('Content-Type','text/javascript');fs.createReadStream(path.join(root,'node_modules/3dmol/build/3Dmol-min.js')).pipe(res);}else res.writeHead(404).end();});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});const outputs=[];
try{const page=await browser.newPage({viewport:{width:800,height:800},deviceScaleFactor:2});await page.goto('http://127.0.0.1:'+server.address().port);
for(const kind of ['aspirin-space','ethanol-space','1hsg-region-a']){
const result=await page.evaluate(async({kind,D,C,E,ethanol,protein,ligand})=>{
 const host=document.getElementById('molecule');host.replaceChildren();const v=$3Dmol.createViewer(host,{backgroundColor:'white',antialias:true});let m,lo,hi,z;
 const coord=a=>({x:a[0],y:a[1],z:a[2]});
 if(kind==='aspirin-space'){
  m=v.addModel();m.addAtoms(D.atoms.map((a,i)=>({elem:a.symbol,x:a.xyz[0],y:a.xyz[1],z:a.xyz[2],serial:i,bonds:D.bonds.filter(b=>b.a===i||b.b===i).map(b=>b.a===i?b.b:b.a),bondOrder:D.bonds.filter(b=>b.a===i||b.b===i).map(b=>b.order)})));
  lo=D.gridSlices.origin.map(n=>n+8);hi=lo.map(n=>n+8);z=D.gridSlices.origin[2]+(D.gridSlices.z+.5)*D.gridSlices.spacing;
 }else if(kind==='ethanol-space'){
  m=v.addModel(ethanol,'sdf');const a=m.selectedAtoms({});lo=['x','y','z'].map(k=>Math.min(...a.map(a=>a[k]))-2);hi=['x','y','z'].map(k=>Math.max(...a.map(a=>a[k]))+2);z=C.spatialFrame.origin[2]+2*C.zIndex;
 }else{
  const p=v.addModel(protein,'pdb');p.setStyle({},{});m=v.addModel(ligand,'sdf');const ligAtoms=m.selectedAtoms({not:{elem:'H'}}),pocket=p.selectedAtoms({not:{elem:'H'}}).filter(a=>ligAtoms.some(b=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2<=25));p.setStyle({index:pocket.map(a=>a.index)},{stick:{radius:.04,color:'#b9c3cf'}});lo=E.center.map(n=>n-12);hi=E.center.map(n=>n+12);
 }
 m.setStyle({not:{elem:'H'}},{stick:{radius:kind==='1hsg-region-a'?.13:.105,colorscheme:'Jmol'},sphere:{scale:.21,colorscheme:'Jmol'}});
 function box(lo,hi,color,radius){const corners=[];for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]])corners.push([x,y,z]);for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(corners[i].filter((x,k)=>x!==corners[j][k]).length===1)v.addCylinder({start:coord(corners[i]),end:coord(corners[j]),color,radius,fromCap:1,toCap:1});}
 box(lo,hi,'#ccd3db',kind==='1hsg-region-a'?.025:.012);
 if(kind==='1hsg-region-a')box(lo,E.center,'#a76436',.055);
 else{
  const vertices=[[lo[0],lo[1],z],[hi[0],lo[1],z],[hi[0],hi[1],z],[lo[0],hi[1],z]].map(coord);
  v.addCustom({vertexArr:vertices,faceArr:[0,1,2,0,2,3,2,1,0,3,2,0],normalArr:vertices.map(()=>({x:0,y:0,z:1})),color:'#7196bd',opacity:.18});
  for(let i=0;i<4;i++)v.addCylinder({start:vertices[i],end:vertices[(i+1)%4],color:'#537ba7',radius:.015,fromCap:1,toCap:1});
 }
 v.zoomTo({model:m.getID()});v.rotate(30,'x');v.rotate(-35,'y');v.rotate(-12,'z');v.zoom(kind==='1hsg-region-a'?.43:kind==='ethanol-space'?.55:.66);v.setSlab(-80,80);v.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const png=v.pngURI();v.clear();return {png,plane:z,lo,hi};
},{kind,D,C,E,ethanol:r.result.molblock,protein,ligand});
const file='public/illustrations/panels/'+kind+'.png';fs.writeFileSync(path.join(root,file),Buffer.from(result.png.split(',')[1],'base64'));outputs.push({path:file,sha256:hash(file),plane:result.plane,bounds:[result.lo,result.hi]});
}
const inputs=['public/research/gnina-crossdock/manifest.json','artifacts/research-illustration-data.json','artifacts/gradcam-illustration-data.json',C.source.path,'public/'+E.protein.path,'public/'+E.structure.path];fs.writeFileSync(path.join(root,'artifacts/molecular-panel-provenance.json'),JSON.stringify({generator:'scripts/render-teaching-molecules.cjs',renderer:'3Dmol 2.5.5',inputs:inputs.map(path=>({path,sha256:hash(path)})),outputs,operations:'Fixed source coordinates, element colours, exact spatial plane or region bounds; rendering only, no conformer generation or model execution.'},null,2));console.log('Rendered 3 fixed-coordinate molecular panels');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
