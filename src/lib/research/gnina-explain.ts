import {PredictorManifest} from './contracts.mjs';
import {openSession,type RuntimeSession} from './runtime';

const GRID_SHAPE=[1,28,48,48,48],SPATIAL=48**3;
const CHECKPOINT='56990c0a31a7aa0a57c5445de64c3d59002bc23de9947a8d028548d89ca803b4';
type Options={signal?:AbortSignal;onProgress?:(fraction:number,message:string)=>void};
export type SpatialExplanation={shape:number[];values:Float32Array;projectionShape:number[];projection:Float32Array};

function spatial(values:Float32Array,size:number):SpatialExplanation{
  const projection=new Float32Array(size**2);
  for(let x=0;x<size;x++)for(let y=0;y<size;y++){
    let sum=0;for(let z=0;z<size;z++)sum+=values[(x*size+y)*size+z];
    projection[x*size+y]=sum;
  }
  return {shape:[size,size,size],values,projectionShape:[size,size],projection};
}
function checkGrid(grid:Float32Array){
  if(!(grid instanceof Float32Array)||grid.length!==28*SPATIAL||!grid.every(Number.isFinite))
    throw Error('GNINA explanations require a finite FP32 [1,28,48,48,48] native density grid.');
}
function sum(values:ArrayLike<number>){let result=0;for(let i=0;i<values.length;i++)result+=values[i];return result;}

/** One derivative session can explain any prepared GNINA grid. Release the
 * prediction session first. All integrations execute new forward/backward
 * passes locally; no curated attribution file is used by this module. */
export async function openGninaExplainer(manifestValue:unknown,base:string,progress:(message:string)=>void=()=>{}){
  const manifest=PredictorManifest.parse(manifestValue);
  if(manifest.id!=='gnina-crossdock'||manifest.checkpointSha256!==CHECKPOINT||
    !manifest.outputs.some(output=>output.name==='input_gradient'&&JSON.stringify(output.shape)===JSON.stringify(GRID_SHAPE))||
    !manifest.outputs.some(output=>output.name==='grad_cam'&&JSON.stringify(output.shape)==='[1,6,6,6]'))
    throw Error('This is not the verified GNINA derivative manifest.');
  const session:RuntimeSession=await openSession(manifest,base,progress);
  let disposed=false,busy=false;
  const evaluate=async(grid:Float32Array,options:Options)=>{
    options.signal?.throwIfAborted();
    const output=await session.run([{name:'grid',dtype:'float32',shape:GRID_SHAPE,data:grid}]);
    options.signal?.throwIfAborted();return output;
  };
  const guarded=async<T>(work:()=>Promise<T>)=>{
    if(disposed)throw Error('Explanation session is disposed.');
    if(busy)throw Error('An explanation is already running.');
    busy=true;try{return await work();}finally{busy=false;}
  };
  const camResult=(output:Record<string,Float32Array>)=>({
    ...spatial(output.grad_cam,6),method:'grad-cam' as const,execution:'live-browser' as const,
    target:'CNNaffinity',targetValue:output.affinity[0],checkpointSha256:CHECKPOINT,
    layer:'features.unit5_func: final spatial ReLU before flattening',positiveOnly:true,
  });
  return {
    checkpointSha256:CHECKPOINT,
    modelSha256:manifest.artifact.sha256,
    async gradient(grid:Float32Array,options:Options={}){
      return guarded(async()=>{checkGrid(grid);return evaluate(grid,options);});
    },
    async gradCam(grid:Float32Array,options:Options={}){
      return guarded(async()=>{checkGrid(grid);return camResult(await evaluate(grid,options));});
    },
    async integratedGradients(grid:Float32Array,options:Options&{steps?:64|128}={}){
      return guarded(async()=>{
        checkGrid(grid);
        const steps=options.steps??128;
        if(steps!==64&&steps!==128)throw Error('Use 64 or 128 integration steps.');
        // Snapshot fixes the conformer/grid throughout the quadrature even if
        // the caller reuses its input buffer while awaiting progress events.
        const input=grid.slice(),scaled=new Float32Array(input.length);
        const total=new Float64Array(SPATIAL),coarse=new Float64Array(SPATIAL);
        let baselineScore=0,targetValue=0,last:Record<string,Float32Array>|undefined;
        for(let i=0;i<=steps;i++){
          options.signal?.throwIfAborted();
          for(let k=0;k<input.length;k++)scaled[k]=input[k]*(i/steps);
          const output=await evaluate(scaled,options),weight=i===0||i===steps?.5:1;
          if(i===0)baselineScore=output.affinity[0];
          if(i===steps){targetValue=output.affinity[0];last=output;}
          for(let k=0;k<input.length;k++){
            const at=k%SPATIAL,value=input[k]*output.input_gradient[k]*weight;
            total[at]+=value;
            if(steps===128&&i%2===0)coarse[at]+=value;
          }
          options.onProgress?.((i+1)/(steps+1),`Integrated Gradients · ${i+1}/${steps+1} browser gradient evaluations`);
          // Permit worker cancellation messages between evaluations; a worker
          // termination can interrupt the current WASM execution immediately.
          await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
        const values=Float32Array.from(total,value=>value/steps),attributionSum=sum(values);
        const outputDifference=targetValue-baselineScore;
        const coarseValues=steps===128?Float32Array.from(coarse,value=>value/64):undefined;
        let maxRefinementChange=0;
        if(coarseValues)for(let k=0;k<SPATIAL;k++)maxRefinementChange=Math.max(maxRefinementChange,Math.abs(values[k]-coarseValues[k]));
        return {...spatial(values,48),method:'integrated-gradients' as const,execution:'live-browser' as const,
          checkpointSha256:CHECKPOINT,target:'CNNaffinity',targetValue,baseline:'all-zero density grid',baselineScore,
          steps,quadrature:'trapezoidal',signed:true,attributionSum,outputDifference,
          completenessResidual:attributionSum-outputDifference,
          coarse64:coarseValues?{attributionSum:sum(coarseValues),completenessResidual:sum(coarseValues)-outputDifference,maxRefinementChange}:undefined,
          gradCam:camResult(last!),
        };
      });
    },
    async dispose(){if(!disposed){disposed=true;await session.dispose();}},
  };
}
