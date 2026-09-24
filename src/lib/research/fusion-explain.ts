import {PredictorManifest} from './contracts.mjs';
import {openSession} from './runtime';
const CHECKPOINT='73029954ba6581365d5786c78768cf54f1d399c7f891f0e2b7bd5d8c371d12f1',SPATIAL=24**3;
type Options={signal?:AbortSignal;onProgress?:(fraction:number,message:string)=>void};
function spatial(values:Float32Array,n:number){const projection=new Float32Array(n*n);for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++)projection[x*n+y]+=values[(x*n+y)*n+z];return {shape:[n,n,n],values,projectionShape:[n,n],projection};}
export async function openFusionExplainer(value:unknown,base:string,progress:(s:string)=>void=()=>{}){
 const manifest=PredictorManifest.parse(value);if(manifest.id!=='fusion-aofb'||manifest.checkpointSha256!==CHECKPOINT||!manifest.outputs.some(o=>o.name==='input_gradient'))throw Error('Unverified Fusion derivative manifest.');
 const session=await openSession(manifest,base,progress);let disposed=false,busy=false;
 const guarded=async<T>(work:()=>Promise<T>)=>{if(disposed||busy)throw Error('Explanation session is disposed or busy.');busy=true;try{return await work();}finally{busy=false;}};
 const evaluate=async(grid:Float32Array,tokens:BigInt64Array,options:Options)=>{options.signal?.throwIfAborted();const out=await session.run([{name:'grid',dtype:'float32',shape:[1,28,24,24,24],data:grid},{name:'tokens',dtype:'int64',shape:[1,100],data:tokens}]);options.signal?.throwIfAborted();return out;};
 const cam=(out:Record<string,Float32Array>)=>({...spatial(out.grad_cam,12),execution:'live-browser',method:'grad-cam',target:'MAO-B screening score',targetValue:out.screening_scores[1],checkpointSha256:CHECKPOINT,layer:'Final fire-block spatial activations before average pooling and projection',positiveOnly:true});
 return {
  gradient:(grid:Float32Array,tokens:BigInt64Array,options:Options={})=>guarded(()=>evaluate(grid,tokens,options)),
  gradCam:(grid:Float32Array,tokens:BigInt64Array,options:Options={})=>guarded(async()=>cam(await evaluate(grid,tokens,options))),
  integratedGradients:(grid:Float32Array,tokens:BigInt64Array,options:Options&{steps?:64|128}={})=>guarded(async()=>{
   const steps=options.steps??64;if(steps!==64&&steps!==128)throw Error('Use 64 or128 integration steps.');
   const input=grid.slice(),fixedTokens=tokens.slice(),scaled=new Float32Array(grid.length),total=new Float64Array(SPATIAL),coarse=new Float64Array(SPATIAL);let baselineScore=0,targetValue=0,last:Record<string,Float32Array>|undefined;
   for(let i=0;i<=steps;i++){for(let k=0;k<input.length;k++)scaled[k]=input[k]*(i/steps);const out=await evaluate(scaled,fixedTokens,options),weight=i===0||i===steps?.5:1;if(i===0)baselineScore=out.screening_scores[1];if(i===steps){targetValue=out.screening_scores[1];last=out;}
    for(let k=0;k<input.length;k++){const v=input[k]*out.input_gradient[k]*weight;total[k%SPATIAL]+=v;if(steps===128&&i%2===0)coarse[k%SPATIAL]+=v;}
    options.onProgress?.((i+1)/(steps+1),`Integrated Gradients · ${i+1}/${steps+1} browser gradient evaluations`);await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
   const values=Float32Array.from(total,v=>v/steps),attributionSum=values.reduce((a,b)=>a+b,0),outputDifference=targetValue-baselineScore;
   return {...spatial(values,24),method:'integrated-gradients',execution:'live-browser',target:'MAO-B screening score',targetValue,baseline:'All-zero grid; original SMILES tokens held fixed',baselineScore,steps,quadrature:'trapezoidal',signed:true,checkpointSha256:CHECKPOINT,attributionSum,outputDifference,completenessResidual:attributionSum-outputDifference,coarse64:steps===128?{attributionSum:coarse.reduce((a,b)=>a+b/64,0),completenessResidual:coarse.reduce((a,b)=>a+b/64,0)-outputDifference}:undefined,gradCam:cam(last!)};
  }),
  async dispose(){if(!disposed){disposed=true;await session.dispose();}}
 };
}
