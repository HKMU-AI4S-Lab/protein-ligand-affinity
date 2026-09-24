import {PredictorManifest} from './contracts.mjs';
import {verifiedArtifact,sha256} from './artifacts.mjs';

/** Resolve geometry and the native grid together; never rebuild an example grid.
 * @param {unknown} raw
 * @param {string} id
 * @param {{base:string,signal?:AbortSignal,includeGrid?:boolean,onProgress?:(message:string)=>void}} options
 */
export async function loadCuratedExample(raw,id,{base,signal,includeGrid=true,onProgress=()=>{}}){
 const manifest=PredictorManifest.parse(raw),example=manifest.examples.find(e=>e.id===id);
 if(manifest.id!=='gnina-crossdock'||!example?.protein||!example.structure||!example.center)throw Error('Select a supported prepared complex.');
 const get=artifact=>verifiedArtifact(artifact,{base,signal,onProgress:n=>onProgress('Loading prepared complex · '+Math.round(n*100)+'%')});
 const [protein,ligand]=await Promise.all([get(example.protein),get(example.structure)]);
 const result={exampleId:id,molblock:new TextDecoder().decode(ligand),proteinPdb:new TextDecoder().decode(protein),center:example.center,coordinateMethod:'Prepared PDB '+id.toUpperCase()+' coordinates; supplied pose unchanged',preprocessingVersion:manifest.preprocessingVersion,inputIdentity:await sha256(new TextEncoder().encode([id,example.protein.sha256,example.structure.sha256,example.grid.sha256,example.center.join(',')].join('|')))};
 if(!includeGrid)return result;
 const bytes=await get(example.grid),grid=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
 if(grid.length!==manifest.inputs[0].shape.reduce((a,b)=>a*b,1)||!grid.every(Number.isFinite))throw Error('Invalid prepared grid. Reconnect and reload the example.');
 return {...result,grid};
}
