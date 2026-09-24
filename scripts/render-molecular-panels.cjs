// Reproducible scientific renders from the prepared coordinates, using the site's renderer.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public/illustrations/molecular-panels');
const allowed={'/3dmol.js':path.join(root,'node_modules/3dmol/build/3Dmol-min.js')};
const html='<!doctype html><html><body style="margin:0"><div id="molecule" style="width:1000px;height:800px;position:relative"></div><script src="/3dmol.js"></script></body></html>';
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else if(allowed[req.url]){res.setHeader('Content-Type','text/javascript');fs.createReadStream(allowed[req.url]).pipe(res);}else res.writeHead(404).end();});
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:2});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const protein=fs.readFileSync(path.join(root,'public/research/gnina-crossdock/1hsg-protein.pdb'),'utf8'),ligand=fs.readFileSync(path.join(root,'public/research/gnina-crossdock/1hsg.sdf'),'utf8');
 const source=JSON.parse(fs.readFileSync(path.join(root,'artifacts/illustrated-chrome-fusion-outputs.json'))),aspirin=source.find(r=>r.input.smiles==='CC(=O)Oc1ccccc1C(=O)O').result.molblock;
 for(const kind of ['complex','pocket','aspirin']){
 const data=await page.evaluate(async({kind,protein,ligand,aspirin})=>{
  const host=document.getElementById('molecule');host.replaceChildren();
  const v=$3Dmol.createViewer(host,{backgroundColor:'white',antialias:true});
  if(kind!=='aspirin'){
   const p=v.addModel(protein,'pdb');p.setStyle({chain:'A'},{cartoon:{color:'#718ec8',opacity:kind==='pocket'?.3:1}});p.setStyle({chain:'B'},{cartoon:{color:'#9d88bb',opacity:kind==='pocket'?.3:1}});
   const l=v.addModel(ligand,'sdf');l.setStyle({not:{elem:'H'}},{stick:{radius:.23,colorscheme:'Jmol'},sphere:{scale:.3,colorscheme:'Jmol'}});
   if(kind==='pocket'){
    const atoms=l.selectedAtoms({not:{elem:'H'}}),pocket=p.selectedAtoms({not:{elem:'H'}}).filter(a=>atoms.some(b=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2<25));
    p.setStyle({index:pocket.map(a=>a.index)},{stick:{radius:.09,colorscheme:{prop:'elem',map:{C:'#8495b1',N:'#3876c1',O:'#c45b50',S:'#c9a640'}}}},true);
    v.zoomTo({model:1});v.zoom(.65);
   }else{v.zoomTo();v.zoom(.9);}
   v.rotate(35,'z');v.rotate(25,'y');v.rotate(10,'x');v.setSlab(-60,60);
  }else{
   const a=v.addModel(aspirin,'sdf');a.setStyle({not:{elem:'H'}},{stick:{radius:.12,colorscheme:'Jmol'},sphere:{scale:.18,colorscheme:'Jmol'}});
   const atoms=a.selectedAtoms({}),r=atoms[4],s=atoms[5],t=atoms[6],u=[s.x-r.x,s.y-r.y,s.z-r.z],w=[t.x-r.x,t.y-r.y,t.z-r.z],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n);v.zoomTo({not:{elem:'H'}});v.rotate(Math.acos(n[2]/length)*180/Math.PI,{x:n[1]/Math.hypot(n[0],n[1]),y:-n[0]/Math.hypot(n[0],n[1]),z:0});v.rotate(18,'y');v.rotate(-15,'z');v.zoom(.85);
  }
  v.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const png=v.pngURI();v.clear();return png;
 },{kind,protein,ligand,aspirin});
 fs.writeFileSync(path.join(out,kind+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
