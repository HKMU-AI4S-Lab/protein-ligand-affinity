import http from 'node:http';
import {siteBase} from '../deployment.config.mjs';
// This proxy is used exclusively by loopback previews. No backend URL is shipped to visitors.
export function dockingProxy(req,res,next=()=>{}){
 const prefix=siteBase+'api/docking/';
 if(!req.url?.startsWith(prefix))return next();
 const host=req.headers.host;
 if(!/^127\.0\.0\.1:\d+$/.test(host||'')||req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site'){
  res.writeHead(403,{'Content-Type':'application/json'}).end(JSON.stringify({detail:'Use the local preview to access private docking.'}));return;
 }
 const path=req.url.slice(prefix.length);
 if(!/^(?:health|jobs(?:\/[0-9a-f-]{36}(?:\/(?:result|submission))?)?)$/.test(path)||!['GET','POST','DELETE'].includes(req.method)||req.method==='POST'&&(path!=='jobs'||!req.headers['content-type']?.startsWith('application/json'))){res.writeHead(400).end();return;}
 let size=0;const chunks=[];
 req.on('data',chunk=>{size+=chunk.length;if(size>6_000_000){res.writeHead(413,{'Content-Type':'application/json'}).end(JSON.stringify({detail:'Inputs exceed 6 MB. Reduce the PDB or SDF size.'}));req.destroy();}else chunks.push(chunk);});
 req.on('end',()=>{
  if(res.writableEnded)return;
  const payload=Buffer.concat(chunks),upstream=http.request({hostname:'127.0.0.1',port:8765,path:'/'+path,method:req.method,headers:{'Content-Type':'application/json','Content-Length':payload.length},timeout:60000},response=>{
   res.writeHead(response.statusCode,{'Content-Type':'application/json','Cache-Control':'no-store'});response.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({detail:'The private docking server could not be reached. Reconnect the private service and retry.'}));else res.destroy();});upstream.end(payload);
 });
}
