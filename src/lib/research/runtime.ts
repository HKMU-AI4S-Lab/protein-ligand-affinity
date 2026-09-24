import {PredictorManifest,validateTensor} from './contracts.mjs';
import {verifiedArtifact} from './artifacts.mjs';
import runtimeAssets from '../runtime-assets.json';
export type NamedTensor={name:string;dtype:'float32'|'int32'|'int64';shape:number[];data:Float32Array|Int32Array|BigInt64Array};
export interface RuntimeSession {run(inputs:NamedTensor[]):Promise<Record<string,Float32Array>>;dispose():Promise<void>}
export async function openSession(value:unknown,base:string,progress:(s:string)=>void):Promise<RuntimeSession>{
  const manifest=PredictorManifest.parse(value);
  if(manifest.runtime!=='onnxruntime-web'||manifest.format!=='onnx'||manifest.backend!=='wasm')throw Error('This manifest runtime has not been validated in this build.');
  const totalBytes=manifest.artifact.bytes+manifest.externalData.reduce((sum,a)=>sum+a.artifact.bytes,0);
  progress('Loading verified '+(totalBytes/1e6).toFixed(1)+' MB model…');
  const bytes=await verifiedArtifact(manifest.artifact,{base,onProgress:(n:number)=>progress('Downloading model · '+Math.round(n*100)+'%')});
  const externalData:{path:string;data:Uint8Array}[]=[];
  for(const item of manifest.externalData)externalData.push({path:item.path,data:await verifiedArtifact(item.artifact,{base,onProgress:(n:number)=>progress('Loading weights · '+Math.round(n*100)+'% · '+(item.artifact.bytes/1e6).toFixed(1)+' MB')})});
  const ort=await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  const wasm=runtimeAssets.find(a=>a.path.endsWith('ort-wasm-simd-threaded.wasm'))!;
  const wasmBytes=await verifiedArtifact(wasm,{base});ort.env.wasm.wasmBinary=wasmBytes;
  const glue=runtimeAssets.find(a=>a.path.endsWith('ort-wasm-simd-threaded.mjs'))!;
  const glueBytes=await verifiedArtifact(glue,{base});
  const glueURL=URL.createObjectURL(new Blob([glueBytes],{type:'text/javascript'}));
  ort.env.wasm.wasmPaths={mjs:glueURL};
  progress('Creating model session…');
  let session:import('onnxruntime-web').InferenceSession;
  try{session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all',externalData});}finally{URL.revokeObjectURL(glueURL);}
  if(JSON.stringify(session.inputNames)!==JSON.stringify(manifest.inputs.map(i=>i.name))){await session.release();throw Error('Model input names do not match manifest');}
  return {async run(inputs){const feeds:Record<string,import('onnxruntime-web').Tensor>={};let outputs:Record<string,import('onnxruntime-web').Tensor>|undefined;
    try{for(const spec of manifest.inputs){const value=inputs.find(t=>t.name===spec.name);if(!value)throw Error('Missing input '+spec.name);validateTensor(spec,value);feeds[spec.name]=new ort.Tensor(value.dtype,value.data as any,value.shape);}
      outputs=await session.run(feeds);const result:Record<string,Float32Array>={};for(const spec of manifest.outputs){const t=outputs[spec.name];if(!t||JSON.stringify(t.dims)!==JSON.stringify(spec.shape)||t.type!=='float32')throw Error('Unexpected output tensor '+spec.name);const data=Float32Array.from(t.data as Float32Array);if(!data.every(Number.isFinite))throw Error('Nonfinite model output');result[spec.name]=data;}return result;
    }finally{Object.values(feeds).forEach(t=>t.dispose());if(outputs)Object.values(outputs).forEach(t=>t.dispose());}},async dispose(){await session.release();}};
}
