const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {build}=require('esbuild');
const crypto=require('node:crypto');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
(async()=>{
  const root=process.cwd(),port=4337;
  await build({stdin:{contents:"import {prepareGninaGrid,rasterizeGnina} from './src/lib/research/gnina-grid.ts'; import {openSession} from './src/lib/research/runtime.ts'; Object.assign(globalThis,{prepareGninaGrid,rasterizeGnina,openSession});",resolveDir:root},bundle:true,format:'esm',platform:'browser',external:['fs','crypto'],outfile:'.qa/gnina-input-bundle.js'});
  const fixtures=JSON.parse(fs.readFileSync('artifacts/gnina-input-references/fixtures.json','utf8'));
  const manifestPath=process.env.MANIFEST_PATH||'public/research/gnina-crossdock/manifest.json';
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const predictions=JSON.parse(fs.readFileSync('artifacts/gnina-crossdock-export.json','utf8'));
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>GNINA prepared input validation</title><script type="module" src="/__qa/gnina-input-bundle.js"></script>');}
    const file=path.resolve(url.pathname.startsWith('/__qa/')?path.join(root,'.qa',url.pathname.slice(6)):
      url.pathname.startsWith('/artifacts/')?path.join(root,url.pathname):path.join(root,'public',url.pathname.replace(/^\/public\//,'/')));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{const info=fs.statSync(file);res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'}[path.extname(file)]||'application/octet-stream','Content-Length':info.size});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();page.on('pageerror',e=>console.error(e));page.on('console',m=>{if(m.type()==='log')console.log(m.text());});
    await page.goto('http://127.0.0.1:'+port+'/');await page.waitForFunction(()=>typeof prepareGninaGrid==='function');
    const result=await page.evaluate(async({fixtures,manifest,predictions})=>{
      const text=async url=>(await fetch('/'+url)).text(),floats=async url=>new Float32Array(await(await fetch('/'+url)).arrayBuffer());
      const difference=(actual,expected)=>{if(actual.length!==expected.length)throw Error('length mismatch');let max=0,total=0,nonzero=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);max=Math.max(max,d);total+=d;if(d)nonzero++;}return {max,mean:total/actual.length,nonzero};};
      const results={synthetic:[],complexes:[]};
      for(const f of fixtures.synthetic){const grid=rasterizeGnina(f.atoms,f.center,false),expected=await floats(f.grid.path);results.synthetic.push({id:f.id,grid:difference(grid,expected)});}
      const model=await openSession(manifest,location.origin+'/',()=>{});
      try{
        for(const fixture of [...fixtures.complexes,...fixtures.typing]){
          try{
            const pdb=await text(fixture.receptor.path),sdf=await text(fixture.ligand.path),start=performance.now();
            const prepared=await prepareGninaGrid(pdb,sdf,location.origin+'/',()=>{}),prepareMs=performance.now()-start;
            const errors={};for(const name of ['receptorAtoms','ligandAtoms']){
              const actual=prepared[name],expected=fixture[name],mismatches=[];
              for(let i=0;i<Math.max(actual.length,expected.length);i++)if(!actual[i]||!expected[i]||actual[i].channel!==expected[i].channel||actual[i].radius!==expected[i].radius||actual[i].xyz.some((v,j)=>v!==expected[i].xyz[j]))mismatches.push({i,actual:actual[i],expected:expected[i]});
              errors[name]={actual:actual.length,expected:expected.length,mismatchCount:mismatches.length,densityContributingMismatches:mismatches.filter(m=>[m.actual,m.expected].some(a=>!a||a.xyz.every((v,d)=>Math.abs(v-prepared.center[d])<=11.75+a.radius*1.5))).length,first:mismatches.slice(0,30)};
            }
            const output=await model.run([{name:'grid',dtype:'float32',shape:[1,28,48,48,48],data:prepared.grid}]);
            const reference=fixture.referenceAffinity!==undefined?{affinity:fixture.referenceAffinity}:[...predictions.curatedReferences,...predictions.publishedGninaRegression].find(r=>r.id===fixture.id);
            const entry={id:fixture.id,prepareMs,atomParity:errors,center:prepared.center,referenceCenter:fixture.center,
              grid:difference(prepared.grid,await floats(fixture.grid.path)),affinity:output.affinity[0],referenceAffinity:reference.affinity,affinityError:Math.abs(output.affinity[0]-reference.affinity),openBabelVersion:prepared.openBabelVersion};
            results.complexes.push(entry);console.log(JSON.stringify(entry));
          }catch(e){results.complexes.push({id:fixture.id,error:e.message,expectedUnsupported:fixture.id==='1hvr'&&e.message.includes('tryptophan or histidine')});console.log(fixture.id+' '+e.message);}
        }
      }finally{await model.dispose();}
      return results;
    },{fixtures,manifest,predictions});
    const report={date:new Date().toISOString(),browser:await browser.version(),device:{os:os.platform()+' '+os.release(),cpu:os.cpus()[0].model,ramBytes:os.totalmem()},...result};
    report.passed=result.synthetic.every(c=>c.grid.max<=1e-5)&&result.complexes.every(c=>c.expectedUnsupported||(!c.error&&c.grid.max<=3e-5&&c.affinityError<=.01&&Object.values(c.atomParity).every(a=>a.densityContributingMismatches===0)));
    const raw=JSON.stringify(report,null,2);fs.writeFileSync(process.env.REPORT_PATH||'artifacts/browser-gnina-input-validation.json',raw);console.log(raw);if(report.passed){manifest.validation={status:'passed',referenceSha256:crypto.createHash('sha256').update(raw).digest('hex'),maxAbsError:Math.max(...report.complexes.filter(c=>!c.error).map(c=>c.affinityError))};fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));}
    if(!report.passed)process.exitCode=1;
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
