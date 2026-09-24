import {sha256} from './artifacts.mjs';
import {validateResult,validateTensor} from './contracts.mjs';

// Two bounded records, independent of the much larger verified model cache.
const DB='research-prediction-handoff-v1', STORE='predictions', POINTER='research-prediction-handoff';
const metadata=s=>JSON.stringify({schemaVersion:s.schemaVersion,modelId:s.modelId,smiles:s.smiles,result:{...s.result,grid:s.result.grid?{...s.result.grid,data:undefined}:undefined}});
export async function createPredictionSnapshot(result,grid,tokens,smiles=''){
 const snapshot={schemaVersion:1,modelId:result.modelId,result,grid,tokens,smiles};
 return {...snapshot,metadataSha256:await sha256(new TextEncoder().encode(metadata(snapshot)))};
}
export async function verifyPredictionSnapshot(snapshot,manifest){
 if(snapshot?.schemaVersion!==1||snapshot.modelId!==manifest.id)throw Error('This prediction is no longer available. Calculate a new prediction.');
 const r=validateResult(snapshot.result);
 for(const key of ['checkpointSha256','preprocessingVersion','sourceRevision','runtime','backend'])if(r[key]!==manifest[key])throw Error('The model has changed. Calculate a new prediction.');
 if(r.modelId!==manifest.id||r.modelArtifactSha256!==manifest.artifact.sha256||!Array.isArray(r.center)||r.center.length!==3||!r.center.every(Number.isFinite)||typeof r.molblock!=='string')throw Error('This prediction could not be restored. Calculate a new prediction.');
 validateTensor(manifest.inputs[0],{...manifest.inputs[0],data:snapshot.grid});
 if(await sha256(snapshot.grid)!==r.gridSha256)throw Error('This prediction could not be restored. Calculate a new prediction.');
 if(manifest.id==='fusion-aofb'){
  validateTensor(manifest.inputs[1],{...manifest.inputs[1],data:snapshot.tokens});
  if(await sha256(snapshot.tokens)!==r.tokensSha256||await sha256(new TextEncoder().encode(snapshot.smiles))!==r.inputIdentity||!r.grid||await sha256(r.grid.data)!==r.gridSha256)throw Error('This prediction could not be restored. Calculate a new prediction.');
 }else{
  const example=manifest.examples.find(e=>e.id===r.exampleId&&e.grid.sha256===r.gridSha256),encode=s=>new TextEncoder().encode(s);
  if(snapshot.tokens!==undefined||!example||JSON.stringify(r.center)!==JSON.stringify(example.center)||await sha256(encode(r.molblock))!==example.structure?.sha256||await sha256(encode(r.proteinPdb))!==example.protein?.sha256||await sha256(encode([example.id,example.protein.sha256,example.structure.sha256,example.grid.sha256,example.center.join(',')].join('|')))!==r.inputIdentity)throw Error('This prediction could not be restored. Calculate a new prediction.');
 }
 if(await sha256(new TextEncoder().encode(metadata(snapshot)))!==snapshot.metadataSha256)throw Error('This prediction could not be restored. Calculate a new prediction.');
 return snapshot;
}
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Local storage is unavailable.'));});}
export async function savePredictionSnapshot(snapshot){
 const db=await database(),token=crypto.randomUUID();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({token,snapshot},snapshot.modelId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});sessionStorage.setItem(POINTER,JSON.stringify({token,modelId:snapshot.modelId}));}
 finally{db.close();}
}
export async function loadPredictionSnapshot(){
 const raw=sessionStorage.getItem(POINTER);if(!raw)return null;const {token,modelId}=JSON.parse(raw);if(!['fusion-aofb','gnina-crossdock'].includes(modelId))return null;
 const db=await database();try{const record=await new Promise((resolve,reject)=>{const req=db.transaction(STORE).objectStore(STORE).get(modelId);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return record?.token===token?record.snapshot:null;}finally{db.close();}
}
