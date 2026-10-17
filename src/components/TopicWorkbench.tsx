import {useEffect,useState} from 'react';
import ResearchWorkbench from './ResearchWorkbench';
import {loadPredictionSnapshot,verifyPredictionSnapshot} from '../lib/research/prediction-snapshot.mjs';
import {screeningTargets} from '../lib/research/screening-targets.mjs';
const fusionManifests=import.meta.glob('../../public/research/fusion-*/manifest.json',{eager:true,import:'default'});
import gnina from '../../public/research/gnina-crossdock/manifest.json';

type Props={initialTab:'representations'|'screening'|'binding-affinity'};
export default function TopicWorkbench({initialTab}:Props){
 const [ready,setReady]=useState(false),[snapshot,setSnapshot]=useState<any>(null),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  if(initialTab!=='representations'&&new URLSearchParams(location.search).get('from')==='prediction'){
   try{const saved=await loadPredictionSnapshot();const target=screeningTargets.find(item=>item.id===saved?.modelId);const manifest=initialTab==='screening'&&target?fusionManifests[`../../public/research/${target.id}/manifest.json`]:gnina;await verifyPredictionSnapshot(saved,manifest);if(active)setSnapshot(saved);}
   catch{if(active)setNotice('Your earlier prediction is no longer available. Enter an input to calculate a new result.');}
  }
  if(active)setReady(true);
 })();return()=>{active=false;};},[initialTab]);
 return <>{notice&&<p className="status" role="status">{notice}</p>}{ready?<ResearchWorkbench initialTab={initialTab} interpretation={initialTab!=='representations'} embedded snapshot={snapshot}/>:<p role="status">Preparing analysis…</p>}</>;
}
