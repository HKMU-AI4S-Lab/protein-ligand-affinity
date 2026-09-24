import {progressText,errorText} from '../lib/research/presentation.mjs';
import {citations} from '../data/citations.mjs';
import {useEffect,useRef,useState} from 'react';
import ResearchMolecule from './ResearchMolecule';
import LiveExplanation from './LiveExplanation';
import GradCamExplanation,{initialCamSelection,type CamSelection} from './GradCamExplanation';
import {explanationMatches,validateCam} from '../lib/research/grad-cam.mjs';
import RepresentationViews,{GridView} from './RepresentationViews';
import {loadCuratedExample} from '../lib/research/curated.mjs';
import gninaRaw from '../../public/research/gnina-crossdock/manifest.json';
import {PredictorManifest} from '../lib/research/contracts.mjs';
const gnina=PredictorManifest.parse(gninaRaw);
const fusionManifests=import.meta.glob('../../public/research/fusion-aofb/*manifest.json',{eager:true,import:'default'});
const fusionDerivatives=PredictorManifest.parse(fusionManifests['../../public/research/fusion-aofb/gradients-manifest.json']);
const fusionForward=PredictorManifest.parse(fusionManifests['../../public/research/fusion-aofb/manifest.json']);
const predictionArtifacts=new Set([fusionForward.artifact,...fusionForward.externalData.map(e=>e.artifact)].map(a=>a.sha256));
const explanationBytes=[fusionDerivatives.artifact,...fusionDerivatives.externalData.map(e=>e.artifact)].filter(a=>!predictionArtifacts.has(a.sha256)).reduce((sum,a)=>sum+a.bytes,0);
const molecules=[['Ethanol','CCO'],['Aspirin','CC(=O)Oc1ccccc1C(=O)O'],['Caffeine','Cn1c(=O)c2c(ncn2C)n(C)c1=O']];
type Props={initialTab?:'representations'|'screening'|'binding-affinity';embedded?:boolean;interpretation?:boolean;snapshot?:any};

export default function ResearchWorkbench({initialTab='representations',embedded=false,interpretation=false,snapshot}:Props){
 const isRep=initialTab==='representations',isFusion=initialTab==='screening',affinity=initialTab==='binding-affinity';
 const [interactive,setInteractive]=useState(false);
 const [smiles,setSmiles]=useState(snapshot?.smiles||'CCO'),[name,setName]=useState(snapshot?(molecules.find(m=>m[1]===snapshot.smiles)?.[0]||'Your molecule'):'Ethanol');
 const [exampleId,setExampleId]=useState(snapshot?.result.exampleId||'1hsg'),[preview,setPreview]=useState<any>(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[result,setResult]=useState<any>(null),[explanation,setExplanation]=useState<any>(null),[selectedRegion,setSelectedRegion]=useState(0);
 const [camSelection,setCamSelection]=useState<CamSelection>(initialCamSelection);
 const worker=useRef<Worker|null>(null),request=useRef(0),previewAbort=useRef<AbortController|null>(null);
 const base=typeof window==='undefined'?'':new URL(import.meta.env.BASE_URL,window.location.origin).href;
 function stop(message='Calculation cancelled.'){request.current++;previewAbort.current?.abort();worker.current?.terminate();worker.current=null;setBusy(false);setStatus(message);}
 function clear(){stop('');setResult(null);setExplanation(null);setError('');setSelectedRegion(0);setCamSelection(initialCamSelection);}
 useEffect(()=>{
  setInteractive(true);
  if(snapshot)void run('restore-prediction',snapshot);else if(affinity)void example('1hsg');
  return()=>{request.current++;previewAbort.current?.abort();worker.current?.terminate();};
 },[]);
 async function example(id:string){
  clear();setExampleId(id);setPreview(null);const version=request.current,controller=new AbortController();previewAbort.current=controller;setBusy(true);setStatus('Loading example structures…');
  try{const prepared=await loadCuratedExample(gnina,id,{base,includeGrid:false,signal:controller.signal});if(version!==request.current)return;setPreview(prepared);setStatus('');}
  catch(e){if(version===request.current&&!controller.signal.aborted)setError(errorText(e));}
  finally{if(version===request.current)setBusy(false);}
 }
 function molecule(label:string,s:string){clear();setName(label);setSmiles(s);}
 async function run(type:string,saved?:any){
  const explaining=type==='occlusion'||type==='grad-cam';
  setError('');setStatus(saved?'Restoring your prediction…':'Preparing calculation…');setBusy(true);
  if(!explaining)setResult(null);
  {setExplanation(null);setSelectedRegion(0);setCamSelection(initialCamSelection);}
  const id=++request.current;
  try{
   const manifest=isFusion?fusionForward:gnina;
   if(!worker.current)worker.current=new Worker(new URL('../lib/research/research.worker.ts',import.meta.url),{type:'module'});
   worker.current.onmessage=async e=>{
    if(e.data.id!==request.current)return;const data=e.data;
    if(data.type==='progress'){setStatus(progressText(data.message));return;}
    setBusy(false);setStatus('');
    if(data.type==='error')setError(errorText(data.message));
    else if(data.type==='explanation'){
     try{if(!explanationMatches(data.result,result)||data.result.method!==(isFusion?'grad-cam':'grouped-spatial-occlusion'))throw Error('The explanation does not match the current prediction. Please recalculate.');setExplanation(isFusion?validateCam(data.result):data.result);}
     catch(err){setError(errorText(err));}
    }else if(data.type==='result'){setResult(data.result);if(affinity)setPreview(data.result);}
   };
   worker.current.onerror=()=>{stop('');setResult(null);setExplanation(null);setError('This browser could not complete the calculation. Close other demanding tabs and retry.');};
   worker.current.postMessage({id,type,smiles,base,exampleId:affinity?exampleId:undefined,manifest,snapshot:saved,explanationFor:explaining?{
    inputIdentity:result.inputIdentity,gridSha256:result.gridSha256,tokensSha256:result.tokensSha256,checkpointSha256:result.checkpointSha256,preprocessingVersion:result.preprocessingVersion
   }:undefined});
  }catch(e){if(id===request.current){setBusy(false);setError(errorText(e));}}
 }
 const chosen=(gnina.examples.find(e=>e.id===exampleId)||gnina.examples[0]),shown=result?.kind==='prediction'?result:preview;
 const score=(value:number)=>isFusion&&value!==0&&Math.abs(value)<.0001?value.toExponential(3):value.toFixed(isFusion?4:3);
 return <div className={'workbench'+(embedded?' embedded':'')+(interpretation?' interpretation-workbench':'')}><div className="bench-body">
 <div className="bench-input"><h3>Examples</h3>
 {affinity?<>
  <div className="examples">{gnina.examples.map(e=><button key={e.id} disabled={!interactive} aria-pressed={exampleId===e.id} onClick={()=>example(e.id)}>{e.id.toUpperCase()} / {e.id==='1hsg'?'MK1':'XK2'}</button>)}</div>
  <p>{chosen.description}</p><p className="small"><a href={exampleId==='1hsg'?citations.pdb1hsg.url:citations.pdb1hvr.url}>RCSB PDB {exampleId.toUpperCase()} ↗</a></p>
  {!preview&&!busy&&<button className="secondary" onClick={()=>example(exampleId)}>Reload example</button>}
 </>:<>
  <div className="examples">{molecules.map(([label,s])=><button key={label} disabled={!interactive} aria-pressed={smiles===s} onClick={()=>molecule(label,s)}>{label}</button>)}</div>
  <p className="selected-molecule">Selected molecule: <strong>{name}</strong></p>
  <details className="custom-input"><summary>Enter a different molecule</summary><label htmlFor="molecule-smiles">SMILES</label><textarea disabled={!interactive} id="molecule-smiles" value={smiles} spellCheck={false} onChange={e=>molecule('Custom molecule',e.target.value)}/><p className="small">One connected molecule, up to 100 characters. Example: CCO describes ethanol.</p></details>
 </>}
 <p className="execution-location">Runs on your device. Inputs stay in this browser.</p>
 <p className="download-notice">{isRep?'First chemistry download: about 15 MB.':isFusion?'First model download: approximately 901 MB, plus molecular tools.':'Model download: 1.56 MB; each example grid: 12.39 MB, plus browser tools.'} Downloads are cached for reuse.</p>
 <button className="primary" disabled={!interactive||busy||(affinity&&!preview)} onClick={()=>run(isRep?'representations':'predict')}>{isRep?'Generate representations':isFusion?'Calculate screening score':'Calculate affinity'} →</button>
 {busy&&<button className="secondary cancel" onClick={()=>{stop();setResult(null);setExplanation(null);}}>Cancel calculation</button>}
 </div>
 <div className="bench-output" aria-busy={busy}>
 {status&&<p className="status" role="status">{status}</p>}{error&&<p className="status error" role="alert">{error}</p>}
 {isRep&&result?.kind==='representation'&&<RepresentationViews key={request.current} result={result}/>}
 {!result&&!affinity&&<div className="empty-state"><h3>{isRep?'Molecular structure in complementary views':'Sequence and spatial features'}</h3><p>{isRep?'Select an example, then generate its molecular representations.':'Select an example, then calculate its MAO-B screening score.'}</p></div>}
 {result?.kind==='prediction'&&<><div className="result-title"><h3>{isFusion?'MAO-B screening':exampleId.toUpperCase()+' · GNINA scoring'}</h3><span>Prediction</span></div><div className="result-stats">{result.outputs.map((o:any)=><div key={o.name}><strong>{score(o.value)}</strong><span>{o.name} · {o.unit}</span></div>)}</div></>}
 {shown&&explanation?.method!=='grad-cam'&&<><div className={isFusion?'visuals prediction-visuals':''}><figure><ResearchMolecule molblock={shown.molblock} proteinPdb={shown.proteinPdb} explanation={explanation} selectedRegion={selectedRegion} camSelection={camSelection} center={shown.center} gridKind={isFusion?'fusion':'gnina'}/><figcaption>{isFusion?'Conformer generated with OpenBabel.':'Prepared '+exampleId.toUpperCase()+' complex.'}</figcaption></figure>{isFusion&&result?.grid&&<figure><GridView grid={result.grid}/><figcaption>Spatial input from this conformer.</figcaption></figure>}</div>{isFusion&&<div className="sequence-view"><span>SMILES sequence</span><p>{smiles}</p></div>}</>}

 {result?.kind==='prediction'&&interpretation&&<div className="interpretation-controls">{!explanation&&<><h3>{isFusion?'Grad-CAM':'Spatial occlusion'}</h3><p>{isFusion?'Locate positive spatial evidence for the screening score.':'Measure the change in affinity after masking each grid region.'}</p></>}{isFusion&&<p className="small explanation-download">Grad-CAM first download: approximately {(explanationBytes/1e6).toFixed(2)} MB. Uses the cached model.</p>}<button className="secondary" disabled={busy} onClick={()=>run(isFusion?'grad-cam':'occlusion')}>{isFusion?'Calculate Grad-CAM':'Evaluate spatial occlusion'}</button></div>}
 {interpretation&&explanation?.method==='grad-cam'&&<GradCamExplanation explanation={explanation} selection={camSelection} onChange={setCamSelection} molecule={<figure><ResearchMolecule molblock={shown.molblock} center={shown.center} explanation={explanation} camSelection={camSelection} gridKind="fusion"/><figcaption>Conformer generated with OpenBabel. The plane marks the selected cross-section.</figcaption></figure>}/>}
 {interpretation&&explanation?.method==='grouped-spatial-occlusion'&&<LiveExplanation explanation={explanation} selectedRegion={selectedRegion} onSelect={setSelectedRegion}/>}
 </div></div></div>;
}
