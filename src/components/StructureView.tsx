import {useEffect,useRef,useState} from 'react';
import {loadArtifact} from '../lib/artifacts.mjs';
import type {PredictionResult} from '../lib/types';
export default function StructureView({complex}:{complex:NonNullable<PredictionResult['complex']>}) {
  const element=useRef<HTMLDivElement>(null),viewer=useRef<import('3dmol').GLViewer|null>(null);
  const [error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{
    let disposed=false; const abort=new AbortController(); setError('');setReady(false);
    (async()=>{
      const [mol,bytes]=await Promise.all([import('3dmol'),loadArtifact(complex.structure,{signal:abort.signal})]);
      if(disposed||!element.current) return;
      const v=mol.createViewer(element.current,{backgroundColor:'#f0f3ed'});viewer.current=v;
      v.addModel(new TextDecoder().decode(bytes),'pdb');
      v.setStyle({},{cartoon:{color:'spectrum'}});
      v.setStyle({hetflag:true},{stick:{colorscheme:'greenCarbon',radius:.22},sphere:{scale:.25}});
      v.setStyle({resn:'HOH'},{});v.setStyle({resn:'WAT'},{});
      v.zoomTo();v.render();setReady(true);
    })().catch(e=>{if(!disposed)setError(e.message||'Structure view unavailable.');});
    const resize=new ResizeObserver(()=>viewer.current?.resize());if(element.current) resize.observe(element.current);
    return ()=>{disposed=true;abort.abort();resize.disconnect();viewer.current?.clear();viewer.current=null;};
  },[complex.id]);
  return <figure className="structure-view"><div ref={element} className="structure-canvas" role="img" aria-label={`Three-dimensional structure of ${complex.id}; protein cartoon and non-water ligands in sticks.`}/>
    {error&&<p role="alert">{error} <a href={complex.source}>View the structure record</a>.</p>}
    {!ready&&!error&&<p role="status">Loading the local structure…</p>}
    <div className="example-buttons"><button type="button" onClick={()=>{viewer.current?.rotate(25,'y');viewer.current?.render();}} disabled={!ready}>Rotate left</button><button type="button" onClick={()=>{viewer.current?.rotate(-25,'y');viewer.current?.render();}} disabled={!ready}>Rotate right</button><button type="button" onClick={()=>{viewer.current?.zoomTo();viewer.current?.render();}} disabled={!ready}>Reset view</button></div>
    <figcaption><a href={complex.source} target="_blank" rel="noreferrer">{complex.id.toUpperCase()} · RCSB PDB record</a>. Protein cartoon; hetero residues in sticks. Drag to rotate or use the buttons. This deposited structure provides context; scoring uses the separately prepared ODDT contact features.</figcaption></figure>;
}
