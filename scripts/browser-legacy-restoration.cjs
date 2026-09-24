/* Compatibility regression: use a real worker export, never a fabricated score. */
const {chromium}=require('C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=(process.env.TEST_BASE_URL||'http://127.0.0.1:4322'+require('../deployment.config.mjs').siteBase).replace(/\/$/,'');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']}),context=await browser.newContext(),page=await context.newPage(),checks=[];
 page.setDefaultTimeout(120000);
 await context.addInitScript(()=>{window.__messages=[];const Original=Worker;window.Worker=class extends Original{constructor(...args){super(...args);window.__scientificWorker=this;this.addEventListener('message',e=>window.__messages.push(e.data));}};});
 try{
  for(const [slug,model,method] of [['binding-affinity','gnina-crossdock','occlusion'],['screening-molecules','fusion-aofb','grad-cam']]){
   await page.goto(root+'/topics/'+slug+'/#experiment');
   await page.getByRole('button',{name:method==='grad-cam'?'Calculate screening score':'Calculate affinity'}).click();
   await page.locator('.result-title').waitFor();
   const before=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__messages.find(m=>m.type==='result').result,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v)));
   const manifest=JSON.parse(fs.readFileSync('public/research/'+model+'/manifest.json','utf8'));
   await page.evaluate(({manifest,before})=>window.__scientificWorker.postMessage({id:99999,type:'export-prediction',manifest,explanationFor:before}),{manifest,before});
   await page.waitForFunction(()=>window.__messages.some(m=>m.type==='snapshot'));
   await page.evaluate(async()=>{
    const snapshot=window.__messages.find(m=>m.type==='snapshot').snapshot,token=crypto.randomUUID();
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('research-prediction-handoff-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('predictions');req.onsuccess=()=>resolve(req.result);req.onerror=reject;});
    await new Promise((resolve,reject)=>{const tx=db.transaction('predictions','readwrite');tx.objectStore('predictions').put({token,snapshot},snapshot.modelId);tx.oncomplete=resolve;tx.onerror=reject;});db.close();sessionStorage.setItem('research-prediction-handoff',JSON.stringify({token,modelId:snapshot.modelId}));
   });
   await page.goto(root+'/topics/explainability/?method='+method+'&from=prediction#experiment');
   await page.waitForURL('**/topics/'+slug+'/?method='+method+'&from=prediction#experiment');await page.locator('.result-title').waitFor();
   const after=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__messages.find(m=>m.type==='result').result,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v)));
   assert.deepEqual(after,before);
   await page.getByRole('button',{name:method==='grad-cam'?'Calculate Grad-CAM':'Evaluate spatial occlusion',exact:true}).click();await page.locator('.explanation-view').waitFor();assert.equal(await page.getByRole('alert').count(),0);
   await page.evaluate(async model=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('research-prediction-handoff-v1',1);r.onsuccess=()=>resolve(r.result);});
    await new Promise(resolve=>{const tx=db.transaction('predictions','readwrite'),store=tx.objectStore('predictions'),r=store.get(model);r.onsuccess=()=>{r.result.snapshot.result.center[0]+=1;store.put(r.result,model);};tx.oncomplete=resolve;});db.close();
   },model);
   await page.reload();await page.getByText('Your earlier prediction could not be verified',{exact:false}).waitFor();assert.equal(await page.locator('.result-title,.explanation-view').count(),0);
   await page.getByRole('button',{name:method==='grad-cam'?'Calculate screening score':'Calculate affinity'}).click();await page.locator('.result-title').waitFor();assert.equal(await page.getByRole('alert').count(),0);
   checks.push(model+': exact legacy restoration, live interpretation, corrupt geometry rejected, fresh prediction works');console.log(checks.at(-1));
  }
  fs.writeFileSync((process.env.QA_OUTPUT_DIR||'artifacts')+'/rethink-legacy-restoration.json',JSON.stringify({passed:true,date:new Date().toISOString(),checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
