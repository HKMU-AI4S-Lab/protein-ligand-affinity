const CACHE = 'ai4s-verified-v1';
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** @param {any} artifact @param {{base?:string,progress?:(message:string,fraction:number)=>void,signal?:AbortSignal}} options */
export async function loadArtifact(artifact, {base=import.meta.env.BASE_URL, progress=()=>{}, signal}={}) {
  if (!artifact || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !/^[\w./-]+$/.test(artifact.path) || artifact.path.startsWith('/') || artifact.path.split('/').includes('..')) throw new Error('Invalid artifact reference.');
  const url=new URL(base+artifact.path, self.location.origin);
  if(url.origin!==self.location.origin) throw new Error('Artifacts must be served by this site.');
  let cache;
  try { cache=await caches.open(CACHE); } catch { /* Storage can be unavailable in private browsing. */ }
  const cached=await cache?.match(url.href);
  if(cached) {
    const bytes=await cached.arrayBuffer();
    if(await sha256(bytes)===artifact.sha256) { progress('Loaded verified cached artifact',1); return bytes; }
    await cache.delete(url.href);
  }
  const response=await fetch(url,{signal,cache:'no-store',credentials:'same-origin'});
  if(!response.ok) throw new Error(`Artifact download failed (${response.status}). Reconnect and try again.`);
  const reader=response.body.getReader(), chunks=[]; let received=0;
  const total=Number(response.headers.get('content-length'))||artifact.bytes||0;
  // Bound allocations before trusting the downloaded file.
  const limit=artifact.bytes||100*1024*1024;
  while(true) {
    const {done,value}=await reader.read(); if(done) break;
    received+=value.length;
    if(received>limit) { await reader.cancel(); throw new Error('Artifact exceeds its declared size limit.'); }
    chunks.push(value); progress('Downloading model resources',total?received/total:0);
  }
  const bytes=new Uint8Array(received); let offset=0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  if(artifact.bytes&&received!==artifact.bytes || await sha256(bytes)!==artifact.sha256) throw new Error('Artifact checksum failed. The file was rejected. Restore the verified artifact and retry.');
  try { await cache?.put(url.href,new Response(bytes)); } catch { /* Inference also works without persistent cache. */ }
  return bytes.buffer;
}
export async function clearArtifactCache() { await caches.delete(CACHE); }
