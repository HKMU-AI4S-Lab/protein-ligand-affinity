import {useEffect,useRef,useState} from 'react';
import ResearchMolecule from './ResearchMolecule';
import ResearchWorkbench from './ResearchWorkbench';
import {downloadFile} from '../lib/research/run-exports.mjs';
import {dockingPoseHandoff,fetchDockingPdb,inspectDockingPdb,verifyDockingRun} from '../lib/research/docking-inputs.mjs';
import '../styles/docking.css';
import {prepareBrowserIsolation} from '../lib/research/browser-isolation';

export default function DockingWorkbench(){
 const [engine,setEngine]=useState('webina'),[local,setLocal]=useState(false);
 useEffect(()=>setLocal(['localhost','127.0.0.1','[::1]'].includes(location.hostname)),[]);
 return <>{local&&<div className="source-field"><label htmlFor="docking-engine">Calculation engine</label><select id="docking-engine" value={engine} onChange={e=>setEngine(e.target.value)}><option value="webina">AutoDock Vina — this browser</option><option value="gnina">GNINA — private server</option></select></div>}<DockingTool key={engine} engine={engine}/></>;
}
function DockingTool({engine}:{engine:string}){
 const native=engine==='gnina',engineName=native?'GNINA':'AutoDock Vina',recoveryKey='molecular-affinity-docking-run-v1'+(native?'':'-webina');
 const [interactive,setInteractive]=useState(false),[protein,setProtein]=useState(''),[proteinName,setProteinName]=useState(''),[inspection,setInspection]=useState<any>(null),[chains,setChains]=useState<string[]>([]);
 const [proteinMode,setProteinMode]=useState<'pdb'|'upload'>('pdb'),[pdbId,setPdbId]=useState(''),[loadedId,setLoadedId]=useState(''),[proteinSource,setProteinSource]=useState<any>(null),[loadingProtein,setLoadingProtein]=useState(false);
 const [format,setFormat]=useState('smiles'),[ligand,setLigand]=useState(''),[ligandName,setLigandName]=useState(''),[regionMode,setRegionMode]=useState('box'),[reference,setReference]=useState('');
 const [center,setCenter]=useState(['','','']),[size,setSize]=useState(['20','20','20']),[seed,setSeed]=useState('2026'),[exhaustiveness,setExhaustiveness]=useState('8'),[numModes,setNumModes]=useState('9');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[completed,setCompleted]=useState<any>(null),[poseId,setPoseId]=useState(''),[handoff,setHandoff]=useState<any>(null);
 const revision=useRef(0),pending=useRef<any>(null),pollAbort=useRef<AbortController|null>(null),post=useRef<Promise<any>|null>(null);
 const proteinAbort=useRef<AbortController|null>(null);
 const base=import.meta.env.BASE_URL+'api/docking/';
 const selected=completed?.poses.find((p:any)=>p.id===poseId);
 async function api(path:string,options:RequestInit={}){
  if(!native)return (await import('../lib/research/webina-client')).browserDockingApi(path,options);
  let response:Response;
  try{response=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...options.headers},credentials:'same-origin'});}catch(e){if(options.signal?.aborted)throw e;throw Error('The private docking server could not be reached. Reconnect and retry to resume this run.');}
  if(!response.ok){let message='The private docking server is unavailable. Start the private service and retry.';try{message=(await response.json()).detail||message;}catch{}throw Error(message);}
  return response.json();
 }
 function invalidate(message=''){
  revision.current++;pollAbort.current?.abort();proteinAbort.current?.abort();setLoadingProtein(false);const old=pending.current;pending.current=null;
  if(old){const cancel=()=>api('jobs/'+old.id,{method:'DELETE'}).catch(()=>{});if(post.current)void post.current.then(cancel,cancel);else void cancel();}
  sessionStorage.removeItem(recoveryKey);setCompleted(null);setHandoff(null);setPoseId('');setBusy(false);setError('');setStatus(message);
 }
 function hydrate(data:any){
  const source=data.proteinSource||{type:'upload',fileName:data.proteinName};setProteinSource(source);setProteinMode(source.type==='pdb'?'pdb':'upload');setPdbId(source.pdbId||'');setLoadedId(source.pdbId||'');
  setProtein(data.proteinPdb);setProteinName(data.proteinName);setInspection(inspectDockingPdb(data.proteinPdb));setChains(data.chains);setFormat(data.ligand.format);setLigand(data.ligand.text);setLigandName(data.ligand.name||'');setRegionMode(data.region.mode);setReference(data.region.referenceKey||'');
  if(data.region.center)setCenter(data.region.center.map(String));if(data.region.size)setSize(data.region.size.map(String));setSeed(String(data.settings.seed));setExhaustiveness(String(data.settings.exhaustiveness));setNumModes(String(data.settings.numModes));
 }
 async function follow(id:string,version:number){
  const controller=new AbortController();pollAbort.current=controller;
  for(;;){
   const state=await api('jobs/'+id,{signal:controller.signal});if(version!==revision.current)return;
   setStatus(state.message);
   if(state.status==='completed'){
    const run=await verifyDockingRun(await api('jobs/'+id+'/result',{signal:controller.signal}));if(run.id!==id)throw Error('The returned result belongs to another run. Retry to retrieve your calculation.');if(version!==revision.current)return;
    pending.current=null;setCompleted(run);setPoseId(run.poses[0].id);setBusy(false);return;
   }
   if(state.status==='failed'||state.status==='cancelled'){pending.current=null;sessionStorage.removeItem(recoveryKey);setBusy(false);if(state.status==='failed')setError(state.message);return;}
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},1000);controller.signal.addEventListener('abort',abort,{once:true});});
  }
 }
 useEffect(()=>{
  let unmounted=false;
  if(native)setInteractive(true);else{setStatus('Preparing this browser for docking…');void prepareBrowserIsolation(import.meta.env.BASE_URL).then(()=>{if(!unmounted){sessionStorage.removeItem('webina-isolation-reload');setInteractive(true);setStatus('');}}).catch(e=>{if(!unmounted){setError(e.message);setStatus('');}});}
  const saved=sessionStorage.getItem(recoveryKey);
  if(saved){const version=revision.current;setBusy(true);setStatus('Reconnecting to your docking run…');void (async()=>{
   try{const data=await api('jobs/'+saved+'/submission');if(unmounted||version!==revision.current)return;hydrate(data);pending.current=data;await follow(saved,version);}catch(e){if(!unmounted&&version===revision.current){setBusy(false);setError(e instanceof Error?e.message:'Unable to restore the run. Retry.');}}
  })();}
  return()=>{unmounted=true;revision.current++;pollAbort.current?.abort();proteinAbort.current?.abort();if(!native&&pending.current)void api('jobs/'+pending.current.id,{method:'DELETE'}).catch(()=>{});};
 },[]);
 function resetProtein(){invalidate();setProtein('');setProteinName('');setProteinSource(null);setLoadedId('');setInspection(null);setChains([]);setReference('');}
 async function loadPdb(){
  resetProtein();const version=revision.current,controller=new AbortController();proteinAbort.current=controller;setLoadingProtein(true);setStatus('Loading the structure from the Protein Data Bank…');
  try{const loaded=await fetchDockingPdb(pdbId,{signal:controller.signal});if(version!==revision.current)return;setPdbId(loaded.source.pdbId);setLoadedId(loaded.source.pdbId);setProtein(loaded.text);setProteinName(loaded.source.pdbId+'.pdb');setProteinSource(loaded.source);setInspection(loaded.inspection);setChains(loaded.inspection.chains.length===1?loaded.inspection.chains:[]);}
  catch(e){if(version===revision.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'The PDB structure could not be loaded. Try again.');}
  finally{if(proteinAbort.current===controller)proteinAbort.current=null;if(version===revision.current){setLoadingProtein(false);setStatus('');}}
 }
 async function uploadProtein(file?:File){
  resetProtein();if(!file)return;
  if(file.size>5_000_000){setError('Choose a protein PDB no larger than 5 MB.');return;}
  const version=revision.current;
  try{const text=await file.text(),found=inspectDockingPdb(text);if(version!==revision.current)return;setProtein(text);setProteinName(file.name);setProteinSource({type:'upload',fileName:file.name});setInspection(found);setChains(found.chains.length===1?found.chains:[]);}catch(e){if(version===revision.current)setError(e instanceof Error?e.message:'The PDB could not be read.');}
 }
 async function uploadLigand(file?:File){
  invalidate();setLigand('');setLigandName('');if(!file)return;
  if(file.size>500_000){setError('Choose one ligand SDF no larger than 0.5 MB.');return;}
  const version=revision.current,text=await file.text();if(version===revision.current){setLigand(text);setLigandName(file.name);}
 }
 async function dock(){
  setError('');setCompleted(null);setHandoff(null);setBusy(true);setStatus(native?'Submitting your protein and ligand to the private server…':'Preparing to dock in this browser…');const version=++revision.current;
  try{
   if(!protein||!chains.length)throw Error('Load or upload a protein PDB and choose its binding-site chains.');
   if(proteinMode==='pdb'&&loadedId!==pdbId.trim().toUpperCase())throw Error('Load the PDB structure for the ID shown above.');
   if(!ligand.trim())throw Error('Enter a ligand SMILES or upload one SDF molecule.');
   if(regionMode==='reference'&&!reference)throw Error('Explicitly select the reference ligand that defines the binding region.');
   if(regionMode==='box'&&[...center,...size].some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('Enter all three box centre coordinates and dimensions in Å.');
   const data=pending.current||{id:crypto.randomUUID(),proteinPdb:protein,proteinName,proteinSource,chains:[...chains],ligand:{format,text:ligand,name:ligandName||'SMILES ligand'},region:regionMode==='reference'?{mode:'reference',referenceKey:reference}:{mode:'box',center:center.map(Number),size:size.map(Number)},settings:{seed:Number(seed),exhaustiveness:Number(exhaustiveness),numModes:Number(numModes)}};
   pending.current=data;sessionStorage.setItem(recoveryKey,data.id);
   post.current=api('jobs',{method:'POST',body:JSON.stringify(data)});await post.current;post.current=null;
   if(version!==revision.current){void api('jobs/'+data.id,{method:'DELETE'}).catch(()=>{});return;}
   await follow(data.id,version);
  }catch(e){post.current=null;if(version===revision.current){setBusy(false);setStatus('');setError(e instanceof Error?e.message:'Docking could not complete. Check preparation and retry.');}}
 }
 const changeNumber=(setter:(value:string[])=>void,values:string[],index:number,value:string)=>{invalidate();setter(values.map((v,i)=>i===index?value:v));};
 const filename=(native?'gnina':'vina')+(completed?'-'+completed.id.slice(0,8):'');
 return <div className="docking-tool">
 <div className="workbench embedded"><div className="bench-body"><div className="bench-input"><span className="bench-step">01 / Your input</span>
 <p className="field-help">{native?'Protein and ligand inputs are processed on our private docking server.':'AutoDock Vina runs on your computer through Webina. Your structures stay in this browser; loading a PDB ID contacts RCSB. Keep this tab open while docking.'} Use a prepared protein with resolved alternate locations and complete binding-site atoms. Protein hydrogens are rebuilt using Open Babel defaults without pH optimization. Waters are excluded. Sites requiring cofactors, metals, modified residues or covalent docking are unsupported.</p>
 <div className="input-mode" role="group" aria-label="Protein structure source"><button type="button" className="secondary" aria-pressed={proteinMode==='pdb'} onClick={()=>{resetProtein();setProteinMode('pdb');}}>PDB ID</button><button type="button" className="secondary" aria-pressed={proteinMode==='upload'} onClick={()=>{resetProtein();setProteinMode('upload');}}>Upload a protein</button></div>
 {proteinMode==='pdb'?<div className="source-field"><label htmlFor="docking-pdb-id">PDB ID <span>Required</span></label><div className="load-row"><input id="docking-pdb-id" type="text" inputMode="text" autoCapitalize="characters" maxLength={4} value={pdbId} placeholder="Four-character ID" disabled={!interactive} onChange={e=>{resetProtein();setPdbId(e.target.value.toUpperCase());}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(interactive&&!loadingProtein)void loadPdb();}}}/><button type="button" className="secondary" disabled={!interactive||loadingProtein} onClick={()=>void loadPdb()}>Load structure</button></div><p className="field-help">Load a structure from the Protein Data Bank, then choose protein chains and supply the ligand to dock. The same preparation requirements apply.</p>{loadedId&&<p className="file-note">Loaded: PDB {loadedId}</p>}</div>:<div className="source-field"><label htmlFor="docking-protein">Protein PDB <span>Required — up to 5 MB</span></label><input id="docking-protein" type="file" accept=".pdb,.ent" disabled={!interactive} onChange={e=>{void uploadProtein(e.target.files?.[0]);e.target.value='';}}/>{proteinName&&<p className="file-note">Selected: {proteinName}</p>}</div>}
 {inspection&&<fieldset className="chain-select"><legend>Protein chain(s) <span>Required</span></legend>{inspection.chains.map((chain:string)=><label key={chain}><input type="checkbox" checked={chains.includes(chain)} onChange={e=>{invalidate();setChains(e.target.checked?[...chains,chain]:chains.filter(c=>c!==chain));}}/>Chain {chain.trim()||'unlabelled'}</label>)}</fieldset>}
 <div className="source-field"><label htmlFor="docking-ligand-format">Ligand input</label><select id="docking-ligand-format" value={format} onChange={e=>{invalidate();setFormat(e.target.value);setLigand('');setLigandName('');}}><option value="smiles">SMILES</option><option value="sdf">SDF</option></select>
 {format==='smiles'?<><label htmlFor="docking-smiles">Ligand SMILES <span>Required</span></label><textarea id="docking-smiles" value={ligand} maxLength={500} placeholder="Enter one molecule with specified stereochemistry" spellCheck={false} onChange={e=>{invalidate();setLigand(e.target.value);}}/></>:<><label htmlFor="docking-sdf">Ligand SDF <span>Required — up to 0.5 MB</span></label><input id="docking-sdf" type="file" accept=".sdf,.mol" onChange={e=>{void uploadLigand(e.target.files?.[0]);e.target.value='';}}/>{ligandName&&<p className="file-note">Selected: {ligandName}</p>}</>}
 <p className="field-help">One connected ligand, {native?'5–100 heavy atoms, at most 20 rotatable bonds':'5–80 heavy atoms, at most 15 rotatable bonds'}. Elements: H, C, N, O, F, P, S, Cl, Br and I. Specify stereochemistry and protonation. A fresh conformer is generated from bonds; SDF starting coordinates are not used as a predicted pose.</p></div>
 <div className="source-field"><label htmlFor="docking-region">Binding region</label><select id="docking-region" value={regionMode} onChange={e=>{invalidate();setRegionMode(e.target.value);}}><option value="box">Box centre and dimensions</option><option value="reference">Select a reference ligand</option></select>
 {regionMode==='reference'?<><label htmlFor="docking-reference">Reference ligand <span>Required</span></label><select id="docking-reference" value={reference} onChange={e=>{invalidate();setReference(e.target.value);}}><option value="">Choose a ligand in the loaded PDB</option>{inspection?.references.map((r:any)=><option key={r.key} value={r.key}>{r.label}</option>)}</select><p className="field-help">Defines the search box from this ligand’s extent with 4 Å padding on each side and a minimum dimension of 12 Å. The reference ligand is removed before docking.</p>{reference&&inspection&&<p className="file-note">Centre: {inspection.references.find((r:any)=>r.key===reference)?.center.map((v:number)=>v.toFixed(2)).join(', ')} Å</p>}</>:<><fieldset className="docking-vector"><legend>Box centre (Å)</legend>{['X','Y','Z'].map((axis,i)=><label key={axis} htmlFor={'dock-center-'+axis}>{axis}<input id={'dock-center-'+axis} type="number" step="0.1" value={center[i]} onChange={e=>changeNumber(setCenter,center,i,e.target.value)}/></label>)}</fieldset><fieldset className="docking-vector"><legend>Box dimensions (Å)</legend>{['X','Y','Z'].map((axis,i)=><label key={axis} htmlFor={'dock-size-'+axis}>{axis}<input id={'dock-size-'+axis} type="number" min="8" max="40" step="0.1" value={size[i]} onChange={e=>changeNumber(setSize,size,i,e.target.value)}/></label>)}</fieldset><p className="field-help">Use the protein’s coordinate frame. Each dimension: 8–40 Å, total volume at most 32,000 Å³. Place the box around the intended binding pocket.</p></>}</div>
 <details className="docking-settings"><summary>Search settings</summary><label htmlFor="docking-exhaustiveness">Exhaustiveness</label><select id="docking-exhaustiveness" value={exhaustiveness} onChange={e=>{invalidate();setExhaustiveness(e.target.value);}}>{[1,4,8,16,32].map(n=><option key={n} value={n}>{n}</option>)}</select><p className="field-help">Higher values search more thoroughly and take longer.</p><label htmlFor="docking-modes">Maximum poses</label><input id="docking-modes" type="number" min="1" max="9" value={numModes} onChange={e=>{invalidate();setNumModes(e.target.value);}}/><label htmlFor="docking-seed">Random seed</label><input id="docking-seed" type="number" min="1" max="2147483647" value={seed} onChange={e=>{invalidate();setSeed(e.target.value);}}/></details>
 <div className="bench-actions"><button className="primary" disabled={!interactive||busy||loadingProtein} onClick={()=>void dock()}>Dock ligand <span aria-hidden="true">→</span></button>{(busy||loadingProtein)&&<button className="secondary" onClick={()=>invalidate(loadingProtein?'Structure loading cancelled. Load the structure again to continue.':'Docking cancelled. You can retry with the same inputs.')}>Cancel</button>}</div>
 </div><div className="bench-output" aria-busy={busy||loadingProtein}><span className="bench-step">02 / Result</span>{status&&<p className="status" role="status">{status}</p>}{error&&<p className="status error" role="alert">{error}</p>}
 {!completed&&!busy&&!loadingProtein&&<div className="empty-state"><div className="empty-icon" aria-hidden="true">◇</div><h3>Your predicted poses will appear here</h3><p>Load or upload a protein, supply a ligand and define its binding region. {engineName} searches for poses in the protein’s coordinate frame.</p></div>}
 {completed&&selected&&<><div className="result-title"><h3>{engineName} docking result</h3><span>{completed.poses.length} predicted poses</span></div><label htmlFor="docking-pose">Selected pose — ranked by {native?'CNNscore':'Vina energy'}</label><select id="docking-pose" value={poseId} onChange={e=>{setPoseId(e.target.value);setHandoff(null);}}>{completed.poses.map((p:any)=><option key={p.id} value={p.id}>Rank {p.rank} — {p.id} — {native?'CNNscore '+p.scores.cnnScore.toFixed(3):p.scores.energy.toFixed(2)+' kcal/mol'}</option>)}</select>
 <div className="result-stats">{native&&<><div className="featured-score"><span>Pose score — CNNscore</span><strong>{selected.scores.cnnScore.toFixed(3)}</strong><small>0–1, dimensionless — higher ranks higher.</small></div><div><span>Estimated affinity — CNNaffinity</span><strong>{selected.scores.cnnAffinity.toFixed(3)}</strong><small>pK units — higher suggests stronger binding.</small></div></>}<div><span>Vina energy</span><strong>{selected.scores.energy.toFixed(2)}</strong><small>kcal/mol — lower is more favourable.</small></div></div>
 <p className="result-caveat">{native?'GNINA 1.3.2 searches with Vina and ranks poses using its pretrained CNN ensemble. These are predicted poses and affinity estimates.':'AutoDock Vina 1.2.3 / Webina 1.0.5 ranks predicted poses by Vina energy. These are model estimates, not measured affinities. Preparation is approximate; confirm protonation and binding-site completeness before interpreting results.'}</p>
 <div className="run-downloads" aria-label="Completed docking run downloads"><button className="secondary" onClick={()=>downloadFile(completed.structures.ligandPosesSdf,filename+'-poses.sdf','chemical/x-mdl-sdfile')}>Predicted poses (SDF)</button><button className="secondary" onClick={()=>downloadFile(selected.sdf,filename+'-'+poseId+'.sdf','chemical/x-mdl-sdfile')}>Selected pose (SDF)</button><button className="secondary" onClick={()=>downloadFile(completed.structures.receptorPdb,filename+'-receptor.pdb','chemical/x-pdb')}>Prepared receptor (PDB)</button><button className="secondary" onClick={()=>downloadFile(JSON.stringify(completed,null,2)+'\n',filename+'.json','application/json')}>Run data (JSON)</button><button className="secondary" onClick={()=>downloadFile(completed.summary,filename+'.txt','text/plain')}>Run summary (TXT)</button></div>
 <figure><ResearchMolecule molblock={selected.sdf} proteinPdb={completed.structures.receptorPdb}/><figcaption>{selected.id} in the protein’s coordinate frame, with nearby pocket atoms.</figcaption></figure>
 <button className="secondary" onClick={()=>{try{setError('');setHandoff(dockingPoseHandoff(completed,poseId));}catch(e){setError(e instanceof Error?e.message:'This pose cannot be scored.');}}}>Score this pose</button><p className="field-help">Send these exact coordinates and bonds to the existing bound-pose scorer. {native?'Its single CNN uses different settings from the docking ensemble, so scores can differ.':'The scorer runs a separate GNINA CNN in this browser; its score differs from Vina energy.'}</p>
 </>}
 </div></div></div>
 {handoff&&<section className="docking-handoff" aria-label="Score selected docking pose"><h3>Score {poseId}</h3><ResearchWorkbench key={completed.id+'-'+poseId} initialTab="binding-affinity" embedded suppliedPose={handoff}/></section>}
 </div>;
}
