/// <reference lib="webworker" />
import {openSession,type RuntimeSession} from './runtime';
import {sha256} from './artifacts.mjs';
import {PredictorManifest,validateResult} from './contracts.mjs';
import {fusionCamFrame,explanationMatches} from './grad-cam.mjs';
import {createPredictionSnapshot,verifyPredictionSnapshot} from './prediction-snapshot.mjs';
import curatedManifest from '../../../public/research/gnina-crossdock/manifest.json';
import derivativeManifest from '../../../public/research/gnina-crossdock/gradients-manifest.json';
const fusionManifests=import.meta.glob('../../../public/research/fusion-aofb/*manifest.json',{eager:true,import:'default'});
let session:RuntimeSession|undefined,explainer:any,lastGrid:Float32Array|undefined,lastManifest:any,lastScore=0,lastIdentity='',lastPreprocessing='',lastInputIdentity='',lastTokens:BigInt64Array|undefined;
let busy=false;
let lastCenter:number[]|undefined;
let lastResult:any,lastSmiles='';
async function predictor(base:string,progress:(s:string)=>void){await explainer?.dispose();explainer=undefined;if(!session)session=await openSession(lastManifest,base,progress);return session;}
self.onmessage=async(event:MessageEvent)=>{const {id,type,smiles,base,manifest:raw,pdbText,sdfText,exampleId,steps=64,explanationFor,snapshot}=event.data;
 const progress=(message:string)=>self.postMessage({id,type:'progress',message});
 if(busy)return self.postMessage({id,type:'error',message:'A computation is already active.'});busy=true;
 try{
  if(['occlusion','grad-cam','integrated-gradients'].includes(type)&&explanationFor&&!explanationMatches(explanationFor,{inputIdentity:lastInputIdentity,gridSha256:lastIdentity,tokensSha256:lastTokens?await sha256(lastTokens):undefined,checkpointSha256:lastManifest?.checkpointSha256,preprocessingVersion:lastPreprocessing}))throw Error('The input has changed. Calculate a new prediction before explaining it.');
  if(type==='export-prediction'){
   if(!lastGrid||!lastResult||!explanationMatches(explanationFor,lastResult))throw Error('Calculate a prediction before opening its explanation.');
   self.postMessage({id,type:'snapshot',snapshot:await createPredictionSnapshot(lastResult,lastGrid,lastTokens,lastSmiles)});
  }else if(type==='restore-prediction'){
   const manifest=PredictorManifest.parse(raw),saved=await verifyPredictionSnapshot(snapshot,manifest);
   await session?.dispose();await explainer?.dispose();session=undefined;explainer=undefined;
   lastManifest=manifest;lastGrid=saved.grid;lastTokens=saved.tokens;lastResult=saved.result;lastSmiles=saved.smiles;
   lastScore=lastResult.outputs[0].value;lastCenter=lastResult.center;lastIdentity=lastResult.gridSha256;lastInputIdentity=lastResult.inputIdentity;lastPreprocessing=lastResult.preprocessingVersion;
   self.postMessage({id,type:'result',result:lastResult});
  }else if(type==='representations'){const {prepare}=await import('./chemistry');const result=await prepare(smiles,base,progress);self.postMessage({id,type:'result',result});}
  else if(type==='predict'){
   const manifest=PredictorManifest.parse(raw);
   if(manifest.validation.status!=='passed')throw Error('The prediction model is unavailable. Please try again later.');
   const fusion=manifest.id==='fusion-aofb';
   let prepared:any;
   if(fusion){const {prepare}=await import('./chemistry');prepared=await prepare(smiles,base,progress);lastTokens=prepared.tokens;}else if(exampleId){const {loadCuratedExample}=await import('./curated.mjs');prepared=await loadCuratedExample(curatedManifest,exampleId,{base,onProgress:progress});lastTokens=undefined;}else{const {prepareGninaGrid}=await import('./gnina-grid');prepared=await prepareGninaGrid(pdbText,sdfText,base,progress);lastTokens=undefined;}
   if(lastManifest?.id!==manifest.id){await session?.dispose();await explainer?.dispose();session=undefined;explainer=undefined;}
   lastResult=undefined;lastManifest=manifest;const model=await predictor(base,progress);
   progress(fusion?'Running the complete SMILES–grid fusion model…':'Scoring the supplied protein–ligand pose…');const start=performance.now();
   lastGrid=fusion?prepared.fusionGrid.data:prepared.grid;lastCenter=fusion?prepared.fusionGrid.center:prepared.center;
   const inputs:any[]=[{name:'grid',dtype:'float32',shape:manifest.inputs[0].shape,data:lastGrid}];if(fusion)inputs.push({name:'tokens',dtype:'int64',shape:[1,100],data:lastTokens});
   const output=await model.run(inputs);
   lastPreprocessing=fusion?prepared.fusionGrid.version:prepared.preprocessingVersion;lastScore=fusion?output.screening_scores[1]:output.affinity[0];lastIdentity=await sha256(lastGrid!);lastInputIdentity=prepared.inputIdentity||await sha256(new TextEncoder().encode(fusion?smiles:pdbText+'\n'+sdfText));
   const result=validateResult({schemaVersion:3,kind:'prediction',execution:'live-browser',modelId:manifest.id,executionLocation:'browser',sourceRevision:manifest.sourceRevision,modelArtifactSha256:manifest.artifact.sha256,runtime:manifest.runtime,backend:manifest.backend,checkpointSha256:manifest.checkpointSha256,preprocessingVersion:lastPreprocessing,exampleId:prepared.exampleId,coordinateMethod:prepared.coordinateMethod,gridSha256:lastIdentity,inputIdentity:lastInputIdentity,tokensSha256:lastTokens?await sha256(lastTokens):undefined,molblock:prepared.molblock,proteinPdb:prepared.proteinPdb,center:fusion?prepared.fusionGrid.center:prepared.center,grid:fusion?prepared.fusionGrid:undefined,elapsedMs:performance.now()-start,explanationCapabilities:fusion?['grad-cam']:['grouped-spatial-occlusion'],outputs:fusion?[{name:'MAO-B screening score',value:lastScore,unit:'score'}]:[{name:'CNNaffinity',value:output.affinity[0],unit:'pK units'},{name:'CNNscore',value:output.pose_scores[1],unit:'pose score'}]});self.postMessage({id,type:'result',result});
   lastResult=result;lastSmiles=fusion?smiles:'';
  }else if(type==='occlusion'){
   if(!lastGrid)throw Error('Run a prediction before explaining it.');const model=await predictor(base,progress);
   const dims=lastManifest.inputs[0].shape,n=dims[2],block=n/2,changes=[],values=new Float32Array(8);
   for(let group=0;group<8;group++){progress('Spatial occlusion '+(group+1)+'/8');const masked=lastGrid.slice(),gx=(group>>2)&1,gy=(group>>1)&1,gz=group&1;
    for(let c=0;c<dims[1];c++)for(let x=gx*block;x<(gx+1)*block;x++)for(let y=gy*block;y<(gy+1)*block;y++)for(let z=gz*block;z<(gz+1)*block;z++)masked[((c*n+x)*n+y)*n+z]=0;
    const inputs:any[]=[{name:'grid',dtype:'float32',shape:dims,data:masked}];if(lastTokens)inputs.push({name:'tokens',dtype:'int64',shape:[1,100],data:lastTokens});const output=await model.run(inputs);const maskedScore=lastTokens?output.screening_scores[1]:output.affinity[0],delta=lastScore-maskedScore;values[group]=delta;changes.push({group,region:[gx,gy,gz],maskedScore,delta});}
   self.postMessage({id,type:'explanation',result:{kind:'explanation',execution:'live-browser',method:'grouped-spatial-occlusion',target:lastTokens?'MAO-B screening score':'CNNaffinity',baseline:lastScore,inputIdentity:lastInputIdentity,tokensSha256:lastTokens?await sha256(lastTokens):undefined,gridSha256:lastIdentity,checkpointSha256:lastManifest.checkpointSha256,preprocessingVersion:lastPreprocessing,shape:[2,2,2],values,changes}});
  }else if(type==='grad-cam'||type==='integrated-gradients'){
   if(!lastGrid)throw Error('Run a prediction before explaining it.');await session?.dispose();session=undefined;
   if(!explainer){if(lastTokens){const source=fusionManifests['../../../public/research/fusion-aofb/gradients-manifest.json'];if(!source)throw Error('Explanation model could not be loaded.');const {openFusionExplainer}=await import('./fusion-explain');explainer=await openFusionExplainer(PredictorManifest.parse(source),base,progress);}else{const {openGninaExplainer}=await import('./gnina-explain');explainer=await openGninaExplainer(derivativeManifest,base,progress);}}
   progress(type==='grad-cam'?'Computing Grad-CAM…':'Computing Integrated Gradients…');
   const options={steps,onProgress:(_:number,message:string)=>progress(message)};const result=lastTokens?(type==='grad-cam'?await explainer.gradCam(lastGrid,lastTokens):await explainer.integratedGradients(lastGrid,lastTokens,options)):(type==='grad-cam'?await explainer.gradCam(lastGrid):await explainer.integratedGradients(lastGrid,options));
   self.postMessage({id,type:'explanation',result:{...result,kind:'explanation',inputIdentity:lastInputIdentity,tokensSha256:lastTokens?await sha256(lastTokens):undefined,gridSha256:lastIdentity,preprocessingVersion:lastPreprocessing,...(lastTokens&&type==='grad-cam'?{spatialFrame:fusionCamFrame(lastCenter)}:{})}});
  }else if(type==='dispose'){await session?.dispose();await explainer?.dispose();session=undefined;explainer=undefined;lastGrid=undefined;self.postMessage({id,type:'disposed'});}
 }catch(e){self.postMessage({id,type:'error',message:e instanceof Error?e.message:String(e)});}finally{busy=false;}
};
