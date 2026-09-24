// 3Dmol 2.5.5 has clear(), but no viewer disposer. Its constructor registers
// global listeners and private observers. Capture only synchronous registrations
// made during construction, then restore EventTarget immediately.
export function scopedViewer(factory:()=>any){
 const original=EventTarget.prototype.addEventListener;
 const listeners:{target:EventTarget;type:string;listener:any;options:any}[]=[];
 EventTarget.prototype.addEventListener=function(type,listener,options){listeners.push({target:this,type,listener,options});return original.call(this,type,listener,options);};
 let viewer:any;
 try{viewer=factory();}catch(e){for(const l of listeners)l.target.removeEventListener(l.type,l.listener,l.options);throw e;}finally{EventTarget.prototype.addEventListener=original;}
 return {viewer,dispose(){for(const l of listeners)l.target.removeEventListener(l.type,l.listener,l.options);listeners.length=0;viewer.divwatcher?.disconnect();viewer.intwatcher?.disconnect();viewer.clear();const canvas=viewer.getCanvas?.()||viewer.glDOM;if(canvas){delete canvas._3dmol_viewer;const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl?.getExtension('WEBGL_lose_context')?.loseContext();}viewer=null;}};
}
