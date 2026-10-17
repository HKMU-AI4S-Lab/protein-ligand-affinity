// A job-shaped local adapter lets both engines share inputs, cancellation and exports.
const jobs=new Map<string,any>();
const database=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('molecular-affinity-browser-docking',1);r.onupgradeneeded=()=>r.result.createObjectStore('runs',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Enable browser storage to save and restore docking results.'));});
async function storage(id:string,value?:any){const db=await database();try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction('runs',value?'readwrite':'readonly'),s=tx.objectStore('runs'),r=value?s.put(value):s.get(id);tx.oncomplete=()=>resolve(value||r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function remember(job:any){await storage(job.id,{id:job.id,input:job.input,status:job.status,message:job.message,run:job.run});}
export async function browserDockingApi(path:string,options:RequestInit={}){
 options.signal?.throwIfAborted();
 if(path==='jobs'&&options.method==='POST'){
  if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('Browser isolation is unavailable. Enable service workers and use a current Chrome, Edge or Firefox browser, then reload this page.');
  const input=JSON.parse(String(options.body));if(jobs.has(input.id))return {id:input.id};
  const job:any={id:input.id,input,status:'running',message:'Preparing your protein and ligand in this browser…'};
  await remember(job);jobs.set(job.id,job);
  const worker=new Worker(new URL('./webina.worker.ts',import.meta.url),{type:'module'});job.worker=worker;
  const stop=()=>{worker.terminate();delete job.worker;clearTimeout(job.timeout);};
  worker.onmessage=async({data})=>{if(job.status!=='running')return;Object.assign(job,data);if(data.status==='completed'||data.status==='failed'){stop();try{await remember(job);}catch{job.message+=' Download the results now: browser storage is full.';}}};
  worker.onerror=()=>{if(job.status!=='running')return;Object.assign(job,{status:'failed',message:'The browser stopped the docking worker. Try a smaller ligand or lower exhaustiveness.'});stop();void remember(job).catch(()=>{});};
  job.timeout=setTimeout(()=>{if(job.status==='running'){job.status='failed';job.message='Docking exceeded 10 minutes. Try a smaller search box or lower exhaustiveness.';stop();void remember(job).catch(()=>{});}},600000);
  worker.postMessage({input,base:new URL(import.meta.env.BASE_URL,location.origin).href});return {id:job.id};
 }
 const [,id,part]=path.split('/');let job=jobs.get(id);
 if(!job){job=await storage(id);if(!job)throw Error('This browser has no saved result for that run. Dock again.');if(job.status==='running'){job.status='failed';job.message='This browser calculation was interrupted by a reload. Your inputs are restored; dock again to restart.';await remember(job);}jobs.set(id,job);}
 options.signal?.throwIfAborted();
 if(options.method==='DELETE'){job.worker?.terminate();clearTimeout(job.timeout);delete job.worker;job.status='cancelled';job.message='Docking cancelled.';await remember(job);return {id,status:job.status};}
 if(part==='submission')return job.input;
 if(part==='result'){if(job.status!=='completed')throw Error('The docking result is not complete.');return job.run;}
 return {id,status:job.status,message:job.message};
}
