/// <reference lib="webworker" />
import rdkitModule from '@rdkit/rdkit';
import type {RDKitModule} from '@rdkit/rdkit';
import * as ort from 'onnxruntime-web/wasm';
import {adapters} from './adapters/index.mjs';
import {loadArtifact} from './artifacts.mjs';
import {parseDemo,validateBrowserResult} from './contracts.mjs';
import runtimeAssets from './runtime-assets.json';
const scope=self as unknown as DedicatedWorkerGlobalScope;
const initRDKit=rdkitModule as unknown as (options:{locateFile:()=>string;wasmBinary:ArrayBuffer})=>Promise<RDKitModule>;
scope.onmessage=async ({data})=>{
  let session:ort.InferenceSession|undefined;
  try {
    const manifest=parseDemo(data.manifest),variant=manifest.variants.find(v=>v.id===data.variant);
    if(!variant) throw new Error('Unknown model variant.');
    const adapter=adapters[manifest.adapter];
    if(!adapter||adapter.inputKind!==manifest.inputKind) throw new Error('Unsupported model preprocessing.');
    const progress=(message:string,fraction=0)=>scope.postMessage({type:'progress',message,fraction});
    const base=import.meta.env.BASE_URL;
    progress('Preparing chemistry');
    const rdkit=adapter.requiresRDKit?await initRDKit({locateFile:()=>base+'runtime/rdkit/RDKit_minimal.wasm',wasmBinary:await loadArtifact(runtimeAssets[0],{progress})}):null;
    const loadJSON=async(a:unknown)=>JSON.parse(new TextDecoder().decode(await loadArtifact(a,{progress})));
    const prepared=await adapter.prepare({rdkit,input:data.input,manifest,variant,loadJSON});
    if(prepared.features.length!==variant.model.features) throw new Error('Model and preprocessing tensor dimensions do not match.');
    if(!Array.from(prepared.features).every(Number.isFinite)) throw new Error('Preprocessing returned non-finite input features.');
    const bytes=await loadArtifact(variant.model.artifact,{progress});
    progress('Loading ONNX model');
    ort.env.wasm.numThreads=1;
    ort.env.wasm.wasmBinary=await loadArtifact(runtimeAssets[1],{progress});
    ort.env.wasm.wasmPaths=base+'runtime/ort/';
    session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    if(session.inputNames.join()!=='features'||!session.outputNames.includes('prediction')) throw new Error('Unsupported ONNX tensor names.');
    progress('Running inference');
    const tensor=new ort.Tensor('float32',prepared.features,[1,variant.model.features]);
    let raw;
    try { raw=await session.run({features:tensor}); } finally { tensor.dispose(); }
    if(raw.prediction.dims.join()!==variant.tensor.output.shape.join()||raw.prediction.type!=='float32')throw new Error('Unexpected output tensor dimensions or data type.');
    const values=Array.from(raw.prediction.data,Number);
    const interpreted=adapter.interpret?adapter.interpret(values,{manifest,variant}):values;
    const outputs=variant.outputs.map(o=>({...o,value:interpreted[o.index]}));
    for(const output of Object.values(raw)) output.dispose();
    const result=validateBrowserResult({schemaVersion:2,mode:'browser-onnx',demo:manifest.id,input:data.input,createdAt:new Date().toISOString(),modelVersion:variant.model.modelVersion,
      checkpoint:variant.model.artifact,outputs,molecule:prepared.molecule,complex:prepared.complex,visualization:prepared.visualization,applicability:prepared.applicability||null,
      warnings:manifest.limitations,provenance:variant.model.citation,metrics:variant.model.metrics,metricsByOutput:variant.model.metricsByOutput,
      trainingDataset:variant.model.trainingDataset,split:variant.model.split,uncertainty:null,preprocessing:manifest.adapter});
    scope.postMessage({type:'result',result});
  } catch(error) { scope.postMessage({type:'error',message:error instanceof Error?error.message:'Inference failed. Retry or select another model.'}); }
  finally { await session?.release(); }
};
