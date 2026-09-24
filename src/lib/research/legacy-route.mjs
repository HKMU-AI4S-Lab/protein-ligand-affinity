// Closed destinations: preserve historical method links without open redirects.
export function legacyExplanationDestination(search='',hash='',base='/'){
 const params=new URLSearchParams(search),method=params.get('method');
 const gradcam=method==='grad-cam'||(method!=='occlusion'&&hash==='#grad-cam');
 const shared=['#concept','#research','#experiment','#references'];
 const section=params.get('from')==='prediction'?'experiment':shared.includes(hash)?hash.slice(1):gradcam?'grad-cam':'occlusion';
 return base+'topics/'+(gradcam?'screening-molecules':'binding-affinity')+'/'+(params.size?'?'+params.toString():'')+'#'+section;
}
