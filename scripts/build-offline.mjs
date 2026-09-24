import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {siteBase} from '../deployment.config.mjs';
async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())result.push(...await files(p));else result.push(p);}return result;}
const all=await files('dist'),base=siteBase;
// Model, grid and WASM bytes are only admitted by the integrity cache after opt-in.
const shell=all.filter(p=>!p.includes('/research/')&&!p.includes('/runtime/')&&!p.includes('/notices/')&&!p.endsWith('.wasm')&&!p.endsWith('/sw.js'));
const version=createHash('sha256');for(const p of shell)version.update(await readFile(p));
const cache='bap-project-shell-'+version.digest('hex').slice(0,12);
const initial=shell.filter(p=>!p.endsWith('.js')||/\/(ResearchWorkbench|ExplainabilityWorkbench|client|react)[.-]/.test(p));
await writeFile('dist/sw.js',`const CACHE=${JSON.stringify(cache)},SHELL=${JSON.stringify(initial.map(p=>base+p.slice(5)))},APP=${JSON.stringify(shell.map(p=>base+p.slice(5)))};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('bap-project-shell-')||k.startsWith('mrdd-shell-')||k.startsWith('ai4s-')||k.startsWith('molecular-grid-shell-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.includes('/research/')||u.pathname.includes('/runtime/'))return;e.respondWith(fetch(e.request).then(async r=>{if(r.ok&&APP.includes(u.pathname)){try{const c=await caches.open(CACHE);await c.put(e.request,r.clone());}catch{}}return r;}).catch(async()=>{const c=await caches.open(CACHE);return await c.match(e.request)||await c.match(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname)||Response.error();}));});`);
console.log('Research shell generated; legacy caches removed on activation, artifacts stay lazy.');
