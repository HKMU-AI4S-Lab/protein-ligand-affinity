import {ResearchArtifact} from './contracts.mjs';
export const CACHE_NAME='molecular-grid-verified-v3';
const CACHE_CHUNK_BYTES=32*1024*1024;
export function artifactURL(value,base){const a=ResearchArtifact.parse(value);return a.url||new URL(a.path,base).href;}
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');}
/** @param {unknown} value @param {{base:string,signal?:AbortSignal,onProgress?:(value:number)=>void}} options */
export async function verifiedArtifact(value,{base,signal,onProgress=()=>{}}){
 const a=ResearchArtifact.parse(value),url=artifactURL(a,base),chunked=a.bytes>CACHE_CHUNK_BYTES;
 const keys=chunked?Array.from({length:Math.ceil(a.bytes/CACHE_CHUNK_BYTES)},(_,i)=>{const u=new URL(url);u.searchParams.set('__mrdd_sha256',a.sha256);u.searchParams.set('__mrdd_part',String(i));return u.href;}):[url];
 let cache;try{cache=await caches.open(CACHE_NAME);}catch{/* Storage denial does not disable online computation. */}
 let lastPercent=-1;
 const readInto=async(response,bytes,start,size)=>{
  if(!response.ok)throw Error('Artifact download failed: '+response.status);
  const declared=response.headers.get('content-length');if(declared&&Number(declared)!==size&&!response.headers.get('content-encoding'))throw Error('Artifact byte count mismatch');
  const reader=response.body?.getReader();if(!reader)throw Error('Streaming downloads are unavailable');let offset=0;
  try{while(true){signal?.throwIfAborted();const {value,done}=await reader.read();if(done)break;if(offset+value.length>size)throw Error('Artifact exceeds declared size');bytes.set(value,start+offset);offset+=value.length;const percent=Math.floor((start+offset)/a.bytes*100);if(percent!==lastPercent){lastPercent=percent;onProgress((start+offset)/a.bytes);}}if(offset!==size)throw Error('Incomplete artifact download');}
  finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
 };
 const verify=async bytes=>{signal?.throwIfAborted();if(await sha256(bytes)!==a.sha256)throw Error('Artifact SHA-256 mismatch');return bytes;};
 const evict=async()=>{try{for(const key of keys)await cache?.delete(key);}catch{cache=undefined;}};
 if(cache){try{const first=await cache.match(keys[0]);if(first){const bytes=new Uint8Array(a.bytes);for(let i=0;i<keys.length;i++){const response=i===0?first:await cache.match(keys[i]);if(!response)throw Error('Incomplete cached artifact');const start=chunked?i*CACHE_CHUNK_BYTES:0;await readInto(response,bytes,start,Math.min(chunked?CACHE_CHUNK_BYTES:a.bytes,a.bytes-start));}return await verify(bytes);}}catch{signal?.throwIfAborted();await evict();}}
 let response;try{response=await fetch(url,{signal,credentials:'omit',redirect:'follow'});}catch(error){signal?.throwIfAborted();throw Error('This artifact is not available offline. Reconnect to download and cache it.',{cause:error});}
 const bytes=new Uint8Array(a.bytes);lastPercent=-1;await readInto(response,bytes,0,a.bytes);await verify(bytes);
 if(cache){try{
  // Large Response bodies can exceed Cache Storage's per-operation limit even
  // with ample quota. Cache bounded pieces; verify the original whole-file hash
  // after reconstruction. These synthetic keys are never network requests.
  for(let i=0;i<keys.length;i++){signal?.throwIfAborted();const start=chunked?i*CACHE_CHUNK_BYTES:0,end=Math.min(start+(chunked?CACHE_CHUNK_BYTES:a.bytes),a.bytes);await cache.put(keys[i],new Response(bytes.subarray(start,end),{headers:{'content-type':'application/octet-stream','content-length':String(end-start)}}));}
 }catch{await evict();signal?.throwIfAborted();}}
 return bytes;
}
export async function clearResearchCache(){if(typeof caches!=='undefined')await caches.delete(CACHE_NAME);}
