import {progressText,errorText} from '../lib/research/presentation.mjs';
import {completedRun} from '../lib/research/run-exports.mjs';
import RunDownloads from './RunDownloads';
import {useEffect,useRef,useState} from 'react';
import ResearchMolecule from './ResearchMolecule';
import LiveExplanation from './LiveExplanation';
import GradCamExplanation,{initialCamSelection,type CamSelection} from './GradCamExplanation';
import {explanationMatches,validateCam} from '../lib/research/grad-cam.mjs';
import RepresentationViews,{GridView} from './RepresentationViews';
import {extractComplexLigand,inspectBindingPartners,inspectComplexPdb,selectComplexReceptor,validateBindingPartners,validateLigandPose} from '../lib/research/complex-submission.mjs';
import {validatePreparedComplex} from '../lib/research/prepared-inputs.mjs';
import gninaRaw from '../../public/research/gnina-crossdock/manifest.json';
import {PredictorManifest} from '../lib/research/contracts.mjs';
import {availableScreeningTargets,screeningTarget,screeningTargets} from '../lib/research/screening-targets.mjs';
const gnina=PredictorManifest.parse(gninaRaw);
const fusionManifests=import.meta.glob('../../public/research/fusion-*/manifest.json',{eager:true,import:'default'});
const fusionDerivativeManifests=import.meta.glob('../../public/research/fusion-*/gradients-manifest.json',{eager:true,import:'default'});
const fusionForward=Object.fromEntries(screeningTargets.flatMap(target=>{
 const raw=fusionManifests[`../../public/research/${target.id}/manifest.json`];
 if(import.meta.env.PUBLIC_RELEASE==='true'&&(raw as any)?.validation?.status!=='passed')return [];
 return raw?[[target.id,PredictorManifest.parse(raw)]]:[];
}));
const fusionDerivatives=Object.fromEntries(screeningTargets.flatMap(target=>{
 const raw=fusionDerivativeManifests[`../../public/research/${target.id}/gradients-manifest.json`];
 if(import.meta.env.PUBLIC_RELEASE==='true'&&(raw as any)?.validation?.status!=='passed')return [];
 return raw?[[target.id,PredictorManifest.parse(raw)]]:[];
}));
const availableTargets=availableScreeningTargets(fusionForward,typeof window==='undefined'?'':window.location.hostname);
type Props={initialTab?:'representations'|'screening'|'binding-affinity';embedded?:boolean;interpretation?:boolean;snapshot?:any;suppliedPose?:{receptorPdb:string;ligandSdf:string;context:any}};
type LigandChoice={key:string;name:string;chain:string;sequence:string;insertion:string;atomCount:number;label:string};
type ComplexInspection={chains:string[];ligands:LigandChoice[];proteinAtomCount:number};

export default function ResearchWorkbench({initialTab='representations',embedded=false,interpretation=false,snapshot,suppliedPose}:Props){
 const isRep=initialTab==='representations',isFusion=initialTab==='screening',affinity=initialTab==='binding-affinity';
 const [interactive,setInteractive]=useState(false);
 const [smiles,setSmiles]=useState(snapshot?.smiles||'');
 const [selectedTarget,setSelectedTarget]=useState(snapshot?.modelId&&availableTargets.some(target=>target.id===snapshot.modelId)?snapshot.modelId:'fusion-aofb');
 const fusionManifest=fusionForward[selectedTarget],fusionDerivative=fusionDerivatives[selectedTarget],targetLabel=screeningTarget(selectedTarget)?.label||'Screening target';
 const predictionArtifacts=new Set(fusionManifest?[fusionManifest.artifact,...fusionManifest.externalData.map(e=>e.artifact)].map(a=>a.sha256):[]);
 const explanationBytes=fusionDerivative?[fusionDerivative.artifact,...fusionDerivative.externalData.map(e=>e.artifact)].filter(a=>!predictionArtifacts.has(a.sha256)).reduce((sum,a)=>sum+a.bytes,0):0;
 const [affinitySource,setAffinitySource]=useState<'pdb'|'upload'>('pdb');
 const [pdbId,setPdbId]=useState(''),[loadedId,setLoadedId]=useState(''),[pdbText,setPdbText]=useState(''),[pdbFile,setPdbFile]=useState('');
 const [inspection,setInspection]=useState<ComplexInspection|null>(null),[selectedChains,setSelectedChains]=useState<string[]>([]),[selectedLigand,setSelectedLigand]=useState('');
 const bindingAdvice=pdbText&&selectedLigand?inspectBindingPartners(pdbText,selectedLigand):null;
 const [sdfText,setSdfText]=useState(''),[sdfFile,setSdfFile]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[result,setResult]=useState<any>(null),[explanation,setExplanation]=useState<any>(null),[selectedRegion,setSelectedRegion]=useState(0);
 const [completed,setCompleted]=useState<any>(null);
 const [camSelection,setCamSelection]=useState<CamSelection>(initialCamSelection);
 const worker=useRef<Worker|null>(null),request=useRef(0),previewAbort=useRef<AbortController|null>(null);
 const base=typeof window==='undefined'?'':new URL(import.meta.env.BASE_URL,window.location.origin).href;
 function stop(message='Calculation cancelled.'){request.current++;previewAbort.current?.abort();worker.current?.terminate();worker.current=null;setBusy(false);setStatus(message);}
 function clear(){stop('');setResult(null);setCompleted(null);setExplanation(null);setError('');setSelectedRegion(0);setCamSelection(initialCamSelection);}
 function resetComplex(){clear();setPdbText('');setPdbFile('');setLoadedId('');setInspection(null);setSelectedChains([]);setSelectedLigand('');setSdfText('');setSdfFile('');}
 useEffect(()=>{
  setInteractive(true);
  if(snapshot)void run('restore-prediction',snapshot);
  return()=>{request.current++;previewAbort.current?.abort();worker.current?.terminate();};
 },[]);
 async function loadPdb(){
  resetComplex();const id=pdbId.trim().toUpperCase();
  if(!/^[0-9][A-Z0-9]{3}$/.test(id)){setError('Enter a four-character PDB ID, beginning with a digit.');return;}
  const version=request.current,controller=new AbortController();previewAbort.current=controller;setBusy(true);setStatus('Loading the structure from the Protein Data Bank…');
  try{
   const response=await fetch(`https://files.rcsb.org/download/${id}.pdb`,{signal:controller.signal});
   if(!response.ok)throw Error(response.status===404?'No PDB structure was found for that ID.':'The PDB structure could not be loaded. Try again.');
   if(Number(response.headers.get('content-length'))>5_000_000)throw Error('This PDB structure is too large for this tool.');
   const content=await response.text();if(version!==request.current)return;
   const found=inspectComplexPdb(content);setPdbText(content);setLoadedId(id);setInspection(found);
   setSelectedChains(found.chains.length===1?found.chains:[]);setSelectedLigand(found.ligands.length===1?found.ligands[0].key:'');
  }catch(e){if(version===request.current&&!controller.signal.aborted)setError(errorText(e));}
  finally{if(version===request.current){setBusy(false);setStatus('');}}
 }
 async function uploadComplex(file:File|undefined){
  resetComplex();if(!file)return;
  if(file.size>5_000_000){setError('Choose a PDB complex no larger than 5 MB.');return;}
  const version=request.current;setBusy(true);setStatus('Reading your complex…');
  try{const content=await file.text();if(version!==request.current)return;
   const found=inspectComplexPdb(content);setPdbText(content);setPdbFile(file.name);setInspection(found);
   setSelectedChains(found.chains.length===1?found.chains:[]);setSelectedLigand(found.ligands.length===1?found.ligands[0].key:'');
  }catch(e){if(version===request.current)setError(errorText(e));}
  finally{if(version===request.current){setBusy(false);setStatus('');}}
 }
 async function uploadSdf(file:File|undefined){
  clear();setSdfText('');setSdfFile('');if(!file)return;
  if(file.size>500_000){setError('Choose a ligand SDF no larger than 0.5 MB.');return;}
  const version=request.current;setBusy(true);setStatus('Reading the ligand pose…');
  try{const content=await file.text();if(version!==request.current)return;
   if(selectedLigand)validateLigandPose(content,extractComplexLigand(pdbText,selectedLigand));
   setSdfText(content);setSdfFile(file.name);
  }catch(e){if(version===request.current)setError(errorText(e));}
  finally{if(version===request.current){setBusy(false);setStatus('');}}
 }
 async function run(type:string,saved?:any){
  const explaining=type==='occlusion'||type==='grad-cam';
  setError('');setStatus(saved?'Restoring your prediction…':'Preparing calculation…');setBusy(true);
  if(!explaining){setResult(null);setCompleted(null);}
  {setExplanation(null);setSelectedRegion(0);setCamSelection(initialCamSelection);}
  const id=++request.current;
  try{
   let submittedPdb:string|undefined,submittedSdf:string|undefined,ligandPdb:string|undefined,context:any;
   if((type==='predict'||type==='representations')&&!smiles.trim()&&!affinity)throw Error('Enter a molecule as SMILES.');
   if(type==='predict'&&affinity&&suppliedPose){
    submittedPdb=suppliedPose.receptorPdb;submittedSdf=suppliedPose.ligandSdf;
    validatePreparedComplex(submittedPdb,submittedSdf);context=suppliedPose.context;
   }else if(type==='predict'&&affinity){
   if(!pdbText||!inspection)throw Error(affinitySource==='pdb'?'Load a PDB structure before scoring.':'Upload a PDB complex before scoring.');
   if(affinitySource==='pdb'&&loadedId!==pdbId.trim().toUpperCase())throw Error('Load the PDB structure for the ID shown above.');
    validateBindingPartners(pdbText,selectedChains,selectedLigand);
    ligandPdb=extractComplexLigand(pdbText,selectedLigand);
    submittedPdb=selectComplexReceptor(pdbText,selectedChains);
    const ligand=inspection.ligands.find(item=>item.key===selectedLigand)!;
    if(affinitySource==='pdb'){
     const query=new URLSearchParams({auth_asym_id:ligand.chain,auth_seq_id:ligand.sequence,encoding:'sdf'});
     const controller=new AbortController();previewAbort.current=controller;setStatus('Preparing the selected ligand from the Protein Data Bank…');
     const response=await fetch(`https://models.rcsb.org/v1/${loadedId.toLowerCase()}/ligand?${query}`,{signal:controller.signal});
     if(!response.ok)throw Error('This ligand could not be prepared from the PDB entry. Try a different ligand.');
     submittedSdf=await response.text();if(id!==request.current)return;
     validateLigandPose(submittedSdf,ligandPdb);validatePreparedComplex(submittedPdb,submittedSdf);
    }else if(sdfText){validateLigandPose(sdfText,ligandPdb);submittedSdf=sdfText;validatePreparedComplex(submittedPdb,submittedSdf);}
    context={source:affinitySource==='pdb'?'Protein Data Bank':'uploaded complex',pdbId:loadedId||null,ligand:ligand.label,chains:selectedChains,pdbFile:pdbFile||null,sdfFile:sdfFile||null,pose:'selected bound pose; no docking'};
   }else if(type==='predict'&&isFusion)context={source:'SMILES and generated ligand conformer',target:targetLabel,smiles};
   else if(type==='representations')context={source:'SMILES and generated conformer',smiles};
   const manifest=isFusion?fusionManifest:gnina;
   if(!manifest)throw Error('No complete Fusion checkpoint is available for this target.');
   if(!worker.current)worker.current=new Worker(new URL('../lib/research/research.worker.ts',import.meta.url),{type:'module'});
   worker.current.onmessage=async e=>{
    if(e.data.id!==request.current)return;const data=e.data;
    if(data.type==='progress'){setStatus(progressText(data.message));return;}
    setBusy(false);setStatus('');
    if(data.type==='error')setError(errorText(data.message));
    else if(data.type==='explanation'){
     try{if(!explanationMatches(data.result,result)||data.result.method!==(isFusion?'grad-cam':'grouped-spatial-occlusion'))throw Error('The explanation does not match the current prediction. Please recalculate.');setExplanation({...isFusion?validateCam(data.result):data.result,completedAt:new Date().toISOString()});}
     catch(err){setError(errorText(err));}
    }else if(data.type==='result'){
     const input=context||saved?.result?.runInput||{source:'restored prediction',smiles:saved?.smiles||null};
     setResult(data.result);setCompleted(completedRun(data.result,input,manifest,data.result.completedAt));
    }
   };
   worker.current.onerror=()=>{stop('');setResult(null);setCompleted(null);setExplanation(null);setError('This browser could not complete the calculation. Close other demanding tabs and retry.');};
   worker.current.postMessage({id,type,smiles,base,runInput:context,pdbText:submittedPdb,sdfText:submittedSdf,ligandPdb,manifest,snapshot:saved,explanationFor:explaining?{
    inputIdentity:result.inputIdentity,gridSha256:result.gridSha256,tokensSha256:result.tokensSha256,checkpointSha256:result.checkpointSha256,preprocessingVersion:result.preprocessingVersion
   }:undefined});
  }catch(e){if(id===request.current){setBusy(false);setStatus('');setError(errorText(e));}}
 }
 const shown=result?.kind==='prediction'?result:null;
 const score=(value:number)=>isFusion&&value!==0&&Math.abs(value)<.0001?value.toExponential(3):value.toFixed(isFusion?4:3);
 return <div className={'workbench'+(embedded?' embedded':'')+(interpretation?' interpretation-workbench':'')}>
 <div className="bench-body"><div className="bench-input"><span className="bench-step">01 / Your input</span>
 {affinity&&suppliedPose?<div className="complex-form"><p>Selected docking pose: {suppliedPose.context.poseId}</p><p className="field-help">Protein coordinates, ligand heavy atoms and bonds are preserved. GNINA evaluates this fixed pose with the existing bound-complex scoring model.</p></div>:affinity?<div className="complex-form">
  <div className="input-mode" role="group" aria-label="Structure source"><button type="button" className="secondary" aria-pressed={affinitySource==='pdb'} onClick={()=>{resetComplex();setAffinitySource('pdb');}}>PDB ID</button><button type="button" className="secondary" aria-pressed={affinitySource==='upload'} onClick={()=>{resetComplex();setAffinitySource('upload');}}>Upload a complex</button></div>
  {affinitySource==='pdb'?<div className="source-field"><label htmlFor="complex-pdb-id">PDB ID <span>Required</span></label><div className="load-row"><input id="complex-pdb-id" type="text" inputMode="text" autoCapitalize="characters" maxLength={4} value={pdbId} placeholder="Four-character ID" onChange={e=>{resetComplex();setPdbId(e.target.value.toUpperCase());}}/><button type="button" className="secondary" disabled={!interactive||busy} onClick={()=>void loadPdb()}>Load structure</button></div><p className="field-help">We load the deposited structure and its bound ligand from the Protein Data Bank.</p></div>
  :<div className="source-field"><label htmlFor="complex-upload">Protein–ligand complex PDB <span>Required — up to 5 MB</span></label><input id="complex-upload" type="file" accept=".pdb,.ent,chemical/x-pdb" disabled={!interactive||busy} onChange={e=>{void uploadComplex(e.target.files?.[0]);e.target.value="";}}/><p className="field-help">Choose a PDB containing protein atoms and a bound ligand.</p></div>}
  {inspection&&<div className="complex-choices"><h4>Choose the binding partners</h4><p className="field-help">{loadedId?`PDB ${loadedId}`:pdbFile} — {inspection.chains.length} protein chain{inspection.chains.length===1?'':'s'} — {inspection.ligands.length} ligand{inspection.ligands.length===1?'':'s'}</p>
   {inspection.chains.length>1?<fieldset className="chain-select"><legend>Protein chain(s) <span>Required</span></legend>{inspection.chains.map(chain=><label key={chain}><input type="checkbox" checked={selectedChains.includes(chain)} onChange={e=>{clear();setSelectedChains(old=>e.target.checked?[...old,chain]:old.filter(item=>item!==chain));}}/> {chain===' '?'Unlabelled chain':`Chain ${chain}`}</label>)}</fieldset>:<p className="auto-choice">Protein: {inspection.chains[0]===' '?'unlabelled chain':`chain ${inspection.chains[0]}`}</p>}
   {inspection.ligands.length>1?<><label htmlFor="complex-ligand">Bound ligand <span>Required</span></label><select id="complex-ligand" value={selectedLigand} onChange={e=>{clear();setSelectedLigand(e.target.value);setSdfText('');setSdfFile('');}}><option value="">Choose a ligand</option>{inspection.ligands.map(ligand=><option key={ligand.key} value={ligand.key}>{ligand.label}</option>)}</select></>:<p className="auto-choice">Ligand: {inspection.ligands[0].label}</p>}
   {bindingAdvice&&<p className="field-help">{bindingAdvice.nearbyChains.length?`Nearby protein ${bindingAdvice.nearbyChains.length===1?'chain':'chains'}: ${bindingAdvice.nearbyChains.map(chain=>chain===' '?'unlabelled':chain).join(', ')}. `:'No protein chain is close to this ligand. '}{bindingAdvice.unsupportedReason||'Select a nearby chain for this bound pose.'}</p>}
   {affinitySource==='upload'&&<div className="source-field ligand-upload"><label htmlFor="ligand-sdf">Bound ligand SDF <span>Optional — up to 0.5 MB</span></label><input id="ligand-sdf" type="file" accept=".sdf,.mol,chemical/x-mdl-sdfile" disabled={!interactive||busy} onChange={e=>{void uploadSdf(e.target.files?.[0]);e.target.value="";}}/><p className="field-help">Add this if the PDB does not contain enough bond information for the selected ligand. Its coordinates must match the complex.</p>{sdfFile&&<p className="file-note">Selected: {sdfFile}</p>}</div>}
  </div>}
 </div>:<div className="molecule-form">
  {isFusion&&<div className="source-field"><label htmlFor={availableTargets.length>1?'screening-target':undefined}>Protein target</label>{availableTargets.length>1?<select id="screening-target" value={selectedTarget} disabled={!interactive||busy} onChange={e=>{clear();setSelectedTarget(e.target.value);}}>{availableTargets.map(target=><option key={target.id} value={target.id}>{target.label} — {target.name}</option>)}</select>:<p className="auto-choice">{targetLabel} — {screeningTarget(selectedTarget)?.name}</p>}<p className="field-help">A protein structure is not required.</p></div>}
  <div className="source-field"><label htmlFor="molecule-smiles">Molecule as SMILES <span>Required</span></label><textarea disabled={!interactive} id="molecule-smiles" value={smiles} spellCheck={false} placeholder="Enter one molecule as SMILES" onChange={e=>{clear();setSmiles(e.target.value);}}/><p className="field-help">Use one connected molecule, up to 100 characters.</p></div>
 </div>}
 {isFusion&&<p className="download-notice">The first screening calculation downloads about 900 MB of model data and may take several minutes.</p>}
 <div className="bench-actions"><button type="button" className="primary" disabled={!interactive||busy} onClick={()=>void run(isRep?'representations':'predict')}>{isRep?'Show representations':isFusion?'Calculate screening score':'Score bound pose'} <span aria-hidden="true">→</span></button>{busy&&<button type="button" className="secondary cancel" onClick={()=>{stop();setResult(null);setCompleted(null);setExplanation(null);}}>Cancel</button>}</div>
 </div>
 <div className="bench-output" aria-busy={busy}><span className="bench-step">02 / Result</span>
 {status&&<p className="status" role="status">{status}</p>}{error&&<p className="status error" role="alert">{error}</p>}
 {isRep&&result?.kind==='representation'&&<RepresentationViews key={request.current} result={result} downloads={completed&&<RunDownloads run={completed} explanation={null} selection={camSelection}/>}/>}
 {!result&&!busy&&<div className="empty-state"><div className="empty-icon" aria-hidden="true">{isRep?'◌':isFusion?'↗':'◇'}</div><h3>{isRep?'See your molecule from several angles':isFusion?'Your screening score will appear here':'Your affinity estimate will appear here'}</h3><p>{isRep?'Enter a SMILES to explore the views a model can use.':isFusion?'A larger score ranks a compound higher for the selected target. Compare compounds within one target.':'Load or upload a bound complex, then choose its protein chains and ligand.'}</p></div>}
 {result?.kind==='prediction'&&<><div className="result-title"><h3>{isFusion?completed?.input.target+' screening result':'GNINA bound-pose result'}</h3><span>{isFusion?'Relative screening score':'Supplied pose'}</span></div><div className="result-stats">{result.outputs.map((o:any,i:number)=><div key={o.name} className={i===0?'featured-score':''}><span>{isFusion?'Screening score':o.name==='CNNaffinity'?'Estimated affinity — CNNaffinity':'Pose score — CNNscore'}</span><strong>{score(o.value)}</strong><small>{isFusion?'Higher ranks higher for this target.':o.name==='CNNaffinity'?'pK units — higher suggests stronger binding.':'0–1 — dimensionless — higher suggests a more plausible pose.'}</small></div>)}</div><p className="result-caveat">{isFusion?'Use this score to compare molecules for the same target. It is not a probability of activity or a measured affinity.':'GNINA estimates affinity and pose quality for the selected bound structure. It does not dock a ligand or measure binding experimentally.'}</p></>}
 {shown&&completed&&<RunDownloads run={completed} explanation={explanation} selection={camSelection}/> }
 {shown&&explanation?.method!=='grad-cam'&&<><div className={isFusion?'visuals prediction-visuals':''}><figure><ResearchMolecule molblock={shown.molblock} proteinPdb={shown.proteinPdb} explanation={explanation} selectedRegion={selectedRegion} camSelection={camSelection} center={shown.center} gridKind={isFusion?'fusion':'gnina'}/><figcaption>{isFusion?'Generated 3D shape of your molecule.':'Selected ligand and nearby protein atoms.'}</figcaption></figure>{isFusion&&result?.grid&&<figure><GridView grid={result.grid}/><figcaption>Spatial view of your molecule.</figcaption></figure>}</div>{isFusion&&<div className="sequence-view"><span>Your SMILES</span><p>{completed?.input.smiles}</p></div>}</>}

 {result?.kind==='prediction'&&interpretation&&(!isFusion||fusionDerivative)&&<div className="interpretation-controls">{!explanation&&<><h3>{isFusion?'Grad-CAM':'Spatial occlusion'}</h3><p>{isFusion?'Explore model attribution for this molecule and target. This is not proof of a binding mechanism.':'Measure the change in affinity after masking each grid region.'}</p></>}{isFusion&&<p className="small explanation-download">Grad-CAM first download: approximately {(explanationBytes/1e6).toFixed(2)} MB. Uses the cached model.</p>}<button className="secondary" disabled={busy} onClick={()=>run(isFusion?'grad-cam':'occlusion')}>{isFusion?'Calculate Grad-CAM':'Evaluate spatial occlusion'}</button></div>}
 {interpretation&&explanation?.method==='grad-cam'&&<GradCamExplanation explanation={explanation} selection={camSelection} onChange={setCamSelection} molecule={<figure><ResearchMolecule molblock={shown.molblock} center={shown.center} explanation={explanation} camSelection={camSelection} gridKind="fusion"/><figcaption>The plane marks the selected cross-section of your molecule.</figcaption></figure>}/>}
 {interpretation&&explanation?.method==='grouped-spatial-occlusion'&&<LiveExplanation explanation={explanation} selectedRegion={selectedRegion} onSelect={setSelectedRegion}/>}
 </div></div></div>;
}
