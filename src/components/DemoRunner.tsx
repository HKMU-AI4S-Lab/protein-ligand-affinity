import {lazy,Suspense,useEffect,useId,useRef,useState} from 'react';
import type {DemoManifest,PredictionResult} from '../lib/types';
import {clearArtifactCache} from '../lib/artifacts.mjs';
import {validateBrowserResult} from '../lib/contracts.mjs';
import AdapterVisualization from './AdapterVisualization';
const StructureView=lazy(()=>import('./StructureView'));
export default function DemoRunner({manifest}:{manifest:DemoManifest}) {
  const id=useId(),worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [input,setInput]=useState(manifest.examples[0].value),[variantId,setVariant]=useState(manifest.variants[0].id);
  const [result,setResult]=useState<PredictionResult|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('Ready to explore.'),[busy,setBusy]=useState(false),[fraction,setFraction]=useState(0);
  const variant=manifest.variants.find(v=>v.id===variantId)!;
  const control=manifest.control||{type:manifest.inputKind==='complex'?'select':'text',label:manifest.inputKind==='smiles'?'Molecule (SMILES)':'Protein–ligand complex',maxLength:500};
  const stop=()=>{worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>()=>stop(),[]);
  function reset() { stop();setBusy(false);setResult(null);setError('');setStatus('Ready to explore.'); }
  function cancel(){stop();setBusy(false);setResult(null);setStatus('Cancelled. You can change the input and run again.');}
  async function run(event:React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();reset();setBusy(true);setStatus('Starting the local model…');setFraction(0);
    try {
      const w=new Worker(new URL('../lib/inference.worker.ts',import.meta.url),{type:'module'});worker.current=w;
      const fail=(message:string)=>{stop();setBusy(false);setError(message);setStatus('Prediction stopped.');};
      timer.current=setTimeout(()=>fail('The model exceeded the two-minute limit. Retry with a smaller input or reload resources.'),120000);
      w.onmessage=({data})=>{
        if(worker.current!==w)return;
        if(data.type==='progress'){setStatus(data.message);setFraction(Math.min(1,data.fraction||0));}
        if(data.type==='error')fail(data.message);
        if(data.type==='result') {
          try{setResult(validateBrowserResult(data.result));setBusy(false);setStatus('Prediction complete.');stop();}
          catch(e){fail((e as Error).message);}
        }
      };
      w.onerror=()=>fail('The browser could not start this model. Check that WebAssembly is enabled and retry.');
      w.postMessage({manifest,variant:variantId,input});
    } catch(e){stop();setBusy(false);setError((e as Error).message);}
  }
  function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${manifest.id}-${variantId}-prediction.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="demo-runner">
    <div className="learning-intro"><p>{manifest.introduction}</p><p><strong>What you can learn.</strong> {manifest.learn}</p></div>
    <div className="demo-grid"><form onSubmit={run} className="demo-controls">
      <h3>Try a prediction</h3><p>{manifest.instructions}</p>
      <label htmlFor={id+'variant'}>{manifest.variants.length>1?'Assay endpoint':'Model'}</label>
      <select id={id+'variant'} value={variantId} onChange={e=>{reset();setVariant(e.target.value);}}>{manifest.variants.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select>
      <label htmlFor={id+'input'}>{control.label}</label>
      {control.type==='text'?<input id={id+'input'} value={input} maxLength={control.maxLength} spellCheck={false} autoComplete="off" required onChange={e=>{reset();setInput(e.target.value);}} aria-describedby={id+'examples'}/>:<select id={id+'input'} value={input} onChange={e=>{reset();setInput(e.target.value);}}>{manifest.examples.map(e=><option value={e.value} key={e.id}>{e.label} — {e.description}</option>)}</select>}
      <p id={id+'examples'} className="small">{manifest.inputKind==='smiles'?'Start with an example, then change the molecule.':'Contact features have been prepared in advance for these real complexes.'}</p>
      {control.type==='text'&&<div className="example-buttons">{manifest.examples.map(e=><button key={e.id} type="button" onClick={()=>{reset();setInput(e.value);}}>{e.label}</button>)}</div>}
      <div className="run-actions"><button className="button primary" type="submit" disabled={busy||!input.trim()}>Run prediction</button>{busy&&<button className="button outline" type="button" onClick={cancel}>Cancel</button>}</div>
      <p className="small">Runs on your device. Molecular inputs stay in this browser.</p>
      <div role="status" aria-live="polite" className="run-status">{status}{busy&&<progress max="1" value={fraction||undefined} aria-label="Loading progress"/>}</div>
      {error&&<div className="demo-error" role="alert"><p>{error}</p><button type="button" onClick={async()=>{try{await clearArtifactCache();reset();setStatus('Cached model files cleared. Run again to download verified resources.');}catch{setError('Browser storage is unavailable. Reload this page and retry.');}}}>Clear model cache</button></div>}
    </form>
    <section className="demo-results" aria-label="Prediction results" aria-live="polite">
      {!result?<div className="result-empty"><span className="eyebrow">FROM STRUCTURE TO PROPERTY</span><h3>A molecular question.<br/>A model’s estimate.</h3><p>{variant.outputs.map(o=>o.explanation).join(' ')}</p><p>Run a prediction to explore the result and its scientific context.</p></div>:<>
        {result.molecule&&<div className="molecule-depiction"><div dangerouslySetInnerHTML={{__html:result.molecule.svg}}/><div><strong>{result.molecule.formula}</strong><code>{result.molecule.smiles}</code></div></div>}
        {result.complex&&<><h3>{result.complex.id.toUpperCase()}</h3><p>{result.complex.description}</p><Suspense fallback={<p>Loading structure viewer…</p>}><StructureView complex={result.complex}/></Suspense><p className="small">Prepared feature source: ODDT RF-Score v1. {result.complex.membership}. Dataset reference: {result.complex.reference} pK.</p></>}
        <div className="output-grid">{result.outputs.map(o=><article className="output-card" key={o.id}><p>{o.label}</p><p className="output-value">{o.kind==='classification'?(o.value*100).toFixed(1):o.value.toFixed(3)} <span>{o.kind==='classification'?'%':o.unit}</span></p><p>{o.explanation}</p>{o.id==='logs'&&<p>Approximately {(10**o.value).toExponential(2)} mol/L. One log unit represents a tenfold change.</p>}{o.kind==='classification'&&<p>Model activity score, not a calibrated risk probability or a medical safety verdict.</p>}</article>)}</div>
        {result.applicability&&<p className="small">Closest training fingerprint similarity: {result.applicability.nearestTrainingTanimoto.toFixed(3)}. Dataset membership: {result.applicability.datasetMembership}. {result.applicability.outOfRangeDescriptors.length?`Outside training ranges: ${result.applicability.outOfRangeDescriptors.join(', ')}.`:''} {result.applicability.method}</p>}
        <AdapterVisualization adapter={manifest.adapter} result={result}/><button className="button outline" type="button" onClick={download}>Download prediction record</button>
      </>}
    </section></div>
    <div className="demo-notes"><section><h3>How to read this model</h3><ul>{manifest.limitations.map(s=><li key={s}>{s}</li>)}</ul><p>No prediction interval has been validated for this model.</p></section><section><h3>Evidence & provenance</h3><p>{variant.model.trainingDataset} · {variant.model.modelVersion}</p><p>{variant.model.split}</p>
      <dl className="metric-list">{Object.entries((variant.model.metricsByOutput as Record<string,Record<string,number>>)||{overall:variant.model.metrics}).flatMap(([target,metrics])=>Object.entries(metrics).map(([metric,value])=><div key={target+metric}><dt>{target==='overall'?'':target+' · '}{metric.replaceAll('_',' ')}</dt><dd>{value.toFixed(3)}</dd></div>))}</dl>
      <p className="small">Independently measured on the recorded held-out split. Regression errors use the output’s units; assay metrics are dimensionless. These values do not establish accuracy on every new molecule.</p>
      <div className="evidence-links"><a href={variant.model.citation} target="_blank" rel="noreferrer">Dataset / source paper ↗</a><a href={import.meta.env.BASE_URL+variant.model.artifact.path.replace('model.onnx','card.json')}>Full model card</a><a href={import.meta.env.BASE_URL+variant.model.artifact.path.replace('model.onnx','split.json')}>Recorded split</a></div>
    </section></div>
  </div>;
}
