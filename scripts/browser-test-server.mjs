import http from 'node:http';
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('dist'),cases=JSON.parse(await readFile('.qa/browser-cases.json','utf8'));
const worker='/_astro/'+(await readdir('dist/_astro')).find(p=>/^inference.worker-.*\.js$/.test(p));
const requests=[];let offline=false;const invalid=Buffer.from('invalid ONNX');
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1:4322');requests.push({method:req.method,path:url.pathname,offline});
  if(req.headers.host!=='127.0.0.1:4322'){res.writeHead(403);return res.end();}
  if(url.pathname==='/__qa/config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({cases,worker,unsupported:{path:'__qa/corrupt.onnx',sha256:createHash('sha256').update(invalid).digest('hex'),bytes:invalid.length}}));}
  if(url.pathname==='/__qa/offline'){offline=true;return res.end('offline');}if(url.pathname==='/__qa/online'){offline=false;return res.end('online');}
  if(url.pathname==='/__qa/report'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;await writeFile('.qa/browser-report.json',JSON.stringify({...JSON.parse(body),requests},null,2));return res.end('saved');}
  if(url.pathname==='/__qa/corrupt.onnx'){res.setHeader('Content-Type','application/octet-stream');return res.end(invalid);}
  if(url.pathname.startsWith('/__qa/missing')){res.writeHead(404);return res.end();}
  // Simulate offline artifact transport, with cache-verified resources already resident.
  if(offline&&(url.pathname.startsWith('/models/')||url.pathname.endsWith('.wasm'))){req.socket.destroy();return;}
  if(url.pathname==='/__qa/'){res.setHeader('Content-Type','text/html');return res.end(await readFile('tests/browser-harness.html'));}
  let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/')){res.writeHead(403);return res.end();}
  try{if((await stat(path)).isDirectory())path+='/index.html';const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'};res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}
});server.listen(4322,'127.0.0.1',()=>console.log('Browser verification harness: http://127.0.0.1:4322/__qa/'));
