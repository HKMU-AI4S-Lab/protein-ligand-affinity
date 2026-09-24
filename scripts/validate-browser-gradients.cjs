/* Local-only real Chrome validation of the production explanation module. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {build}=require('esbuild');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');

(async()=>{
  const root=process.cwd(),port=4336;
  await build({stdin:{contents:"import {openGninaExplainer} from './src/lib/research/gnina-explain.ts'; globalThis.openGninaExplainer=openGninaExplainer;",resolveDir:root},bundle:true,format:'esm',platform:'browser',outfile:'.qa/gnina-gradient-bundle.js'});
  const native=JSON.parse(fs.readFileSync('artifacts/gnina-gradients-export.json','utf8'));
  const manifestPath='public/research/gnina-crossdock/gradients-manifest.json';
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>GNINA live gradient validation</title><script type="module" src="/__qa/gnina-gradient-bundle.js"></script>');}
    const requested=url.pathname.startsWith('/__qa/')?path.join(root,'.qa',url.pathname.slice(6)):
      url.pathname.startsWith('/artifacts/gnina-gradient-references/')?path.join(root,url.pathname):path.join(root,'public',url.pathname);
    const resolved=path.resolve(requested);
    if(!resolved.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{const info=fs.statSync(resolved);res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'}[path.extname(resolved)]||'application/octet-stream','Content-Length':info.size});fs.createReadStream(resolved).pipe(res);}
    catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();page.on('pageerror',e=>console.error(e));
    await page.goto('http://127.0.0.1:'+port+'/');await page.waitForFunction(()=>typeof openGninaExplainer==='function');
    const evidence=await page.evaluate(async({native,manifest})=>{
      const floats=async url=>new Float32Array(await(await fetch(url)).arrayBuffer());
      const maxError=(a,b)=>{if(a.length!==b.length)throw Error('Shape mismatch');let error=0;for(let k=0;k<a.length;k++)error=Math.max(error,Math.abs(a[k]-b[k]));return error;};
      const heap=()=>performance.memory?performance.memory.usedJSHeapSize:null;
      const begin=performance.now(),model=await openGninaExplainer(manifest,location.origin+'/');
      const result={coldLoadMs:performance.now()-begin,cases:[],heapBefore:heap()};
      try{
        for(const reference of native.cases.filter(c=>c.references)){
          const grid=await floats('/research/gnina-crossdock/'+reference.id+'-grid.bin');
          const errors={},times=[];
          for(let repeat=0;repeat<3;repeat++){
            const started=performance.now(),actual=await model.gradient(grid);times.push(performance.now()-started);
            for(const [name,artifact] of Object.entries(reference.references)){
              const expected=await floats('/'+artifact.path);errors[name]=Math.max(errors[name]||0,maxError(actual[name],expected));
            }
          }
          if(errors.affinity>.01||errors.input_gradient>1e-4||errors.grad_cam>1e-5||errors.spatial_activation>1e-4)throw Error('Derivative parity failed: '+JSON.stringify(errors));
          const integrations=[];
          for(const steps of reference.id==='1hsg'?[64,128]:[128]){
            const started=performance.now(),actual=await model.integratedGradients(grid,{steps});
            const expected=await floats('/'+reference.integratedGradients[String(steps)].path),error=maxError(actual.values,expected);
            if(error>1e-4)throw Error('Integrated Gradients parity failed '+error);
            const signed={negative:0,positive:0};for(const value of actual.values){if(value<0)signed.negative++;if(value>0)signed.positive++;}
            integrations.push({steps,elapsedMs:performance.now()-started,maxVoxelError:error,attributionSum:actual.attributionSum,
              completenessResidual:actual.completenessResidual,outputDifference:actual.outputDifference,coarse64:actual.coarse64,signed});
          }
          result.cases.push({id:reference.id,errors,gradientMs:times,integrations});
        }
        const grid=await floats('/research/gnina-crossdock/1hsg-grid.bin'),control=new AbortController();let progressCalls=0,aborted=false;
        try{await model.integratedGradients(grid,{steps:64,signal:control.signal,onProgress:()=>{if(++progressCalls===2)control.abort();}});}catch(e){aborted=e.name==='AbortError';}
        if(!aborted||progressCalls!==2)throw Error('Cancellation check failed');
        const recovery=await model.gradCam(grid);if(!recovery.values.some(v=>v>0))throw Error('Post-cancellation session invalid');
        result.cancellation={aborted,progressCalls,recovered:true};result.heapAfter=heap();
      }finally{await model.dispose();}
      let disposedRejected=false;try{await model.gradCam(new Float32Array(28*48**3));}catch{disposedRejected=true;}
      result.disposedRejected=disposedRejected;result.userAgent=navigator.userAgent;return result;
    },{native,manifest});
    const report={date:new Date().toISOString(),browser:await browser.version(),backend:'wasm',runtime:'onnxruntime-web 1.29.0',
      device:{os:os.platform()+' '+os.release(),cpu:os.cpus()[0].model,ramBytes:os.totalmem()},
      checkpointSha256:manifest.checkpointSha256,modelSha256:manifest.artifact.sha256,modelBytes:manifest.artifact.bytes,
      ...evidence,memoryNote:'Main page JS heap observations only, not total WASM residency. Model ran repeated derivatives and full IG, cancellation and recovery, then released.'};
    const raw=JSON.stringify(report,null,2);fs.writeFileSync('artifacts/browser-gnina-gradients-validation.json',raw);
    manifest.validation={status:'passed',referenceSha256:crypto.createHash('sha256').update(raw).digest('hex'),maxAbsError:Math.max(...evidence.cases.map(c=>c.errors.input_gradient))};
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
