import {useEffect,useState} from 'react';
import ResearchWorkbench from './ResearchWorkbench';
import {loadPredictionSnapshot,verifyPredictionSnapshot} from '../lib/research/prediction-snapshot.mjs';
import fusion from '../../public/research/fusion-aofb/manifest.json';
import gnina from '../../public/research/gnina-crossdock/manifest.json';

type Props={initialTab:'representations'|'screening'|'binding-affinity'};
export default function TopicWorkbench({initialTab}:Props){
 const [ready,setReady]=useState(false),[snapshot,setSnapshot]=useState<any>(null),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  if(initialTab!=='representations'&&new URLSearchParams(location.search).get('from')==='prediction'){
   try{const saved=await loadPredictionSnapshot();await verifyPredictionSnapshot(saved,initialTab==='screening'?fusion:gnina);if(active)setSnapshot(saved);}
   catch{if(active)setNotice('Your earlier prediction could not be verified or is no longer available. Select an example to calculate a new prediction.');}
  }
  if(active)setReady(true);
 })();return()=>{active=false;};},[initialTab]);
 return <>{notice&&<p className="status" role="status">{notice}</p>}{ready?<ResearchWorkbench initialTab={initialTab} interpretation={initialTab!=='representations'} embedded snapshot={snapshot}/>:<p role="status">Preparing analysis…</p>}</>;
}
