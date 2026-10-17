// Reproducible scientific renders from the prepared coordinates, using the site's renderer.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),sharp=require('sharp');
const {chromium}=require('C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const editorial=process.argv.includes('--editorial');
const root=path.resolve(__dirname,'..'),out=path.join(root,editorial?'artifacts/editorial-renders':'public/illustrations/molecular-panels');
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
 const source=JSON.parse(fs.readFileSync(path.join(root,'artifacts/illustrated-chrome-fusion-outputs.json'))),fusion=source.find(r=>r.input.smiles==='CC(=O)Oc1ccccc1C(=O)O').result,aspirin=fusion.molblock;
 for(const kind of editorial?['aspirin','fusion-volume','pocket','pocket-detail']:['complex','pocket','aspirin']){
 const data=await page.evaluate(async({kind,protein,ligand,aspirin,fusion,editorial})=>{
  const host=document.getElementById('molecule');host.replaceChildren();
  const v=$3Dmol.createViewer(host,{backgroundColor:'white',backgroundAlpha:editorial?0:1,antialias:true});
  if(editorial&&kind==='fusion-volume'){
   const a=v.addModel(aspirin,'sdf');
   a.setStyle({not:{elem:'H'}},{stick:{radius:.13,colorscheme:'Jmol'},sphere:{scale:.22,colorscheme:'Jmol'}});
   v.setProjection('orthographic');v.zoomTo({not:{elem:'H'}});v.rotate(35,'x');v.rotate(-30,'y');v.rotate(-8,'z');v.zoom(.48);v.setSlab(-80,80);
  }else if(editorial&&kind!=='aspirin'){
   const p=v.addModel(protein,'pdb'),l=v.addModel(ligand,'sdf');
   p.setStyle({},{});
   l.setStyle({not:{elem:'H'}},{stick:{radius:.20,colorscheme:'Jmol'},sphere:{scale:.27,colorscheme:'Jmol'}});
   const atoms=l.selectedAtoms({not:{elem:'H'}}),pocket=p.selectedAtoms({not:{elem:'H'}}).filter(a=>atoms.some(b=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2<25));
   await v.addSurface($3Dmol.SurfaceType.VDW,{color:'#bfa5d0',opacity:.76},{model:0,index:pocket.map(a=>a.index)});
   v.zoomTo({model:1});v.zoom(kind==='pocket'?.64:.80);v.rotate(35,'z');v.rotate(kind==='pocket'?35:55,'y');v.rotate(kind==='pocket'?16:30,'x');
   v.setSlab(-80,80);
  }else if(kind!=='aspirin'){
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
  v.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const png=v.pngURI();
  if(editorial&&kind==='fusion-volume'){
   // Project the exact grid coordinates through the same camera as the conformer.
   // SVG faces avoid transparent-mesh sorting artefacts in the static WebGL capture.
   const project=p=>{const s=v.modelToScreen({x:p[0],y:p[1],z:p[2]});return [s.x*2,s.y*2];};
   const faces=(corner,size)=>{const result=[];for(let axis=0;axis<3;axis++)for(const side of [0,1]){
    const u=(axis+1)%3,w=(axis+2)%3,points=[];
    for(const [a,b] of [[0,0],[1,0],[1,1],[0,1]]){const p=corner.slice();p[axis]+=side*size;p[u]+=a*size;p[w]+=b*size;points.push(project(p));}
    if(!side)points.reverse();
    const area=points.reduce((a,p,i)=>a+p[0]*points[(i+1)%4][1]-p[1]*points[(i+1)%4][0],0);
    result.push({points,front:area<0,axis,side});
   }return result;};
   const lo=fusion.center.map(c=>c-6),hi=fusion.center.map(c=>c+6),outer=faces(lo,12),cells=[];
   for(let x=4;x<16;x++)for(let y=4;y<16;y++)for(let z=4;z<16;z++){
    if(Array.from({length:14},(_,i)=>fusion.grid.data[(((i+14)*24+x)*24+y)*24+z]).some(n=>n>0))cells.push(...faces([x,y,z].map((n,i)=>fusion.center[i]+n-10),1).filter(f=>f.front));
   }
   const poly=(f,color,opacity)=>'<polygon points="'+f.points.join(' ')+'" fill="'+color+'" opacity="'+opacity+'"/>';
   const back=outer.map(f=>poly(f,'#a9dcda',.10)).join('')+cells.map(f=>poly(f,'#68b3b5',.22)).join('');
   let front=outer.filter(f=>f.front).map(f=>poly(f,'#b8e0dd',.08)).join('');
   for(const f of outer.filter(f=>f.front)){
    const u=(f.axis+1)%3,w=(f.axis+2)%3;
    for(const [along,cross] of [[u,w],[w,u]])for(let i=0;i<=12;i+=2){const a=lo.slice(),b=lo.slice();a[f.axis]=b[f.axis]=f.side?hi[f.axis]:lo[f.axis];a[cross]=b[cross]=lo[cross]+i;b[along]=hi[along];front+='<path d="M'+project(a)+'L'+project(b)+'" fill="none" stroke="#94c5c7" stroke-width="1.5" opacity=".70"/>';}
   }
   v.clear();return {png,back,front};
  }
  v.clear();return {png};
 },{kind,protein,ligand,aspirin,fusion,editorial});
 const png=Buffer.from(data.png.split(',')[1],'base64');
 if(data.back){
  const svg=body=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1600">'+body+'</svg>');
  await sharp({create:{width:2000,height:1600,channels:4,background:'#ffffff00'}}).composite([{input:svg(data.back)},{input:png},{input:svg(data.front)}]).png().toFile(path.join(out,kind+'.png'));
 }else fs.writeFileSync(path.join(out,kind+'.png'),png);
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
