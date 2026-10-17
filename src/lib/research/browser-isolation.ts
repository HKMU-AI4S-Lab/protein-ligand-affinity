export async function prepareBrowserIsolation(base:string){
 if(crossOriginIsolated)return;
 if(!('serviceWorker' in navigator)||!isSecureContext)throw Error('Browser docking requires a secure connection and service workers. Open the HTTPS website in a current browser.');
 const registration=await navigator.serviceWorker.register(base+'sw.js',{scope:base});
 await registration.update();
 const installing=registration.installing||registration.waiting;
 if(installing&&installing.state!=='activated')await new Promise<void>((resolve,reject)=>{
  const changed=()=>{if(installing.state==='activated'){clearTimeout(timer);installing.removeEventListener('statechange',changed);resolve();}else if(installing.state==='redundant'){clearTimeout(timer);reject(Error('Browser setup failed. Reload to retry docking.'));}};
  const timer=setTimeout(()=>{installing.removeEventListener('statechange',changed);reject(Error('Browser setup took too long. Reload to retry docking.'));},15000);
  installing.addEventListener('statechange',changed);changed();
 });
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{
  const changed=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();};
  const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(Error('The browser could not enable docking. Enable service workers and reload.'));},15000);
  navigator.serviceWorker.addEventListener('controllerchange',changed);
 });
 const key='webina-isolation-reload';
 // A guard prevents a reload loop in browsers that cannot isolate via a worker.
 if(sessionStorage.getItem(key)===location.href){sessionStorage.removeItem(key);throw Error('This browser could not enable SharedArrayBuffer. Use current Chrome, Edge or Firefox with service workers enabled.');}
 sessionStorage.setItem(key,location.href);location.reload();await new Promise(()=>{});
}
