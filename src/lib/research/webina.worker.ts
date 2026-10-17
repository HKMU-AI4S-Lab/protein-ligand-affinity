/// <reference lib="webworker" />
import {prepareBrowserDocking} from './webina-preparation';
import {vinaPosesToSdf} from './webina-formats.mjs';
import {verifiedArtifact,sha256} from './artifacts.mjs';
import assets from '../runtime-assets.json';
import {chemistry} from './chemistry';
import {validatePreparedComplex} from './prepared-inputs.mjs';
const hash=(text:string)=>sha256(new TextEncoder().encode(text));
self.onmessage=async({data:{input,base}})=>{
 const progress=(message:string)=>self.postMessage({status:'running',message});
 try{
  if(!self.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('Browser docking needs SharedArrayBuffer. Use a current Chrome, Edge or Firefox browser with service workers enabled, then reload.');
  const startedAt=new Date().toISOString(),p=await prepareBrowserDocking(input,base,progress);
  validatePreparedComplex(p.receptorPdb,p.template);
  progress('Loading AutoDock Vina / Webina…');
  const names=['vina.1.0.5.js','vina.worker.js','vina.wasm'];
  const bytes=await Promise.all(names.map(name=>{const a=assets.find(a=>a.path==='runtime/webina/'+name);if(!a)throw Error('Missing Webina runtime');return verifiedArtifact(a,{base});}));
  // Pthread children initialise before receiving locateFile. Give import.meta.url
  // an absolute HTTP base even though the verified module is loaded from a Blob.
  const moduleUrl=new URL('runtime/webina/vina.1.0.5.js',base).href;
  const source=new TextDecoder().decode(bytes[0]).replaceAll('import.meta.url',JSON.stringify(moduleUrl));
  const script=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),thread=URL.createObjectURL(new Blob([bytes[1]],{type:'text/javascript'}));
  let stdout='',stderr='',mod:any;
  try{
   const factory=(await import(/* @vite-ignore */script)).default;
   const output=await new Promise<string>(async(resolve,reject)=>{
    try{
     mod=await factory({noInitialRun:true,wasmBinary:bytes[2],mainScriptUrlOrBlob:script,locateFile:(name:string)=>name.endsWith('.worker.js')?thread:new URL('runtime/webina/'+name,base).href,
      print:(line:string)=>{stdout+=line+'\n';if(line.includes('%')||line.includes('Performing docking'))progress('Searching the binding region… '+line);},printErr:(line:string)=>{stderr+=line+'\n';},
      onAbort:(reason:string)=>reject(Error('Webina stopped: '+reason)),onExit:(code:number)=>{try{if(code!==0)throw Error('Vina could not complete: '+stderr);resolve(mod.FS.readFile('/ligand_out.pdbqt',{encoding:'utf8'}));}catch(e){reject(e);}}
     });
     mod.FS.writeFile('/receptor.pdbqt',p.receptorPdbqt);mod.FS.writeFile('/ligand.pdbqt',p.ligandPdbqt);
     const parameters:any={receptor:'/receptor.pdbqt',ligand:'/ligand.pdbqt',out:'/ligand_out.pdbqt',cpu:1,seed:input.settings.seed,exhaustiveness:input.settings.exhaustiveness,num_modes:input.settings.numModes,energy_range:8};
     for(const [i,axis] of ['x','y','z'].entries()){parameters['center_'+axis]=p.bindingRegion.center[i];parameters['size_'+axis]=p.bindingRegion.size[i];}
     progress('Searching the binding region with AutoDock Vina… This can take several minutes.');
     mod.callMain(Object.entries(parameters).flatMap(([key,value])=>['--'+key,String(value)]));
    }catch(e){reject(e);}
   });
   progress('Checking pose identities and preparing exports…');
   const poses=await Promise.all(vinaPosesToSdf(output,p.template,p.mapped).map(async(pose:any)=>({...pose,sdfSha256:await hash(pose.sdf)})));
   const {rdkit}=await chemistry(base,progress);
   for(const pose of poses){const molecule=rdkit.get_mol(pose.sdf,JSON.stringify({removeHs:true}));try{if(!molecule?.is_valid()||molecule.get_smiles()!==p.canonicalSmiles)throw Error('A predicted pose changed ligand identity or stereochemistry. This result cannot be exported.');}finally{molecule?.delete();}}
   const ligandPosesSdf=poses.map(p=>p.sdf).join('');
   const run:any={schemaVersion:1,method:'AutoDock Vina docking',id:input.id,input,startedAt,completedAt:new Date().toISOString(),
    identity:{proteinSha256:await hash(input.proteinPdb),ligandSha256:await hash(input.ligand.text),preparedReceptorSha256:await hash(p.receptorPdb),preparedLigandSha256:await hash(p.template),posesSha256:await hash(ligandPosesSdf)},
    preparation:{canonicalIsomericSmiles:p.canonicalSmiles,conformer:'Open Babel Gen3D balanced; fresh from connectivity, input coordinates discarded. Gen3D is not seeded; the search seed applies to Vina only.',protonation:'Input ligand protonation retained; Open Babel adds hydrogens without pH optimisation. Protein hydrogens rebuilt with Open Babel defaults for PDBQT. Exported receptor preserves deposited heavy atoms; the scorer rebuilds hydrogens for typing. Waters, cofactors and non-selected chains removed.',atomMapping:'PDBQT original atom indices verified against the prepared molecule; only heavy-atom coordinates replaced in the original SDF connection table.',openBabelVersion:p.openBabelVersion,rdkitVersion:p.rdkitVersion,chains:input.chains},
    bindingRegion:p.bindingRegion,settings:{...input.settings,cpu:1,energyRange:8,ranking:'Vina energy ascending'},
    engine:{name:'AutoDock Vina',version:'1.2.3',runtime:'Webina 1.0.5',sourceCommit:'4230729e7dad197b4c77912dffe30c8bcdd492ba',license:'Apache-2.0',execution:'Visitor browser WebAssembly, one search CPU',loader:'Verified upstream module loaded from Blob; import.meta.url resolved to its absolute same-origin runtime URL for pthread initialisation.',artifacts:assets.filter(a=>a.path.startsWith('runtime/webina/'))},
    scoreUnits:{energy:'kcal/mol',rmsdLower:'Å relative to top predicted pose',rmsdUpper:'Å relative to top predicted pose'},poses,
    structures:{receptorPdb:p.receptorPdb,ligandPosesSdf,preparedLigandSdf:p.template,receptorPdbqt:p.receptorPdbqt,ligandPdbqt:p.ligandPdbqt,ligandPosesPdbqt:output},logs:{stdout,stderr},references:['https://github.com/durrantlab/webina','https://doi.org/10.1093/bioinformatics/btaa579','https://doi.org/10.1002/jcc.21334']};
   run.summary=`AutoDock Vina 1.2.3 / Webina 1.0.5\nRun: ${run.id}\nCompleted: ${run.completedAt}\nExecution: visitor browser, CPU 1\nLigand: ${p.canonicalSmiles}\nChains: ${input.chains.join(', ')}\nBox centre (Å): ${p.bindingRegion.center.join(', ')}\nBox dimensions (Å): ${p.bindingRegion.size.join(', ')}\nSeed: ${input.settings.seed} (Vina search only)\nExhaustiveness: ${input.settings.exhaustiveness}\nRanked by Vina energy ascending, kcal/mol. Predicted poses, not measured affinity. No CNN rescoring.\n`+poses.map(p=>`${p.id}: ${p.scores.energy} kcal/mol`).join('\n')+'\n'+run.preparation.conformer+'\n'+run.preparation.protonation+'\nFull input, preparation, engine hashes and coordinates are in the JSON export.\n';
   self.postMessage({status:'completed',message:'Docking complete. Results saved in this browser.',run});
  }finally{mod?.PThread?.terminateAllThreads();URL.revokeObjectURL(script);URL.revokeObjectURL(thread);}
 }catch(e){self.postMessage({status:'failed',message:e instanceof Error?e.message:String(e)});}
};
