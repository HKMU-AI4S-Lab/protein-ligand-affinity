import {camSvg,downloadFile,exportRecord,occlusionCsv,occlusionSvg,resultCsv,runSummary} from '../lib/research/run-exports.mjs';
export default function RunDownloads({run,explanation,selection}:{run:any;explanation:any;selection:any}){
 const name=run.model.id+'-'+run.completedAt.replace(/[:.]/g,'-');
 return <section className="run-downloads" aria-label="Download this run"><h4>Download this run</h4><div className="download-actions">
  <button className="secondary" onClick={()=>downloadFile(JSON.stringify(exportRecord(run,explanation),null,2),name+'.json','application/json')}>Result data (JSON)</button>
  <button className="secondary" onClick={()=>downloadFile(runSummary(run,explanation),name+'-summary.txt','text/plain')}>Run summary (TXT)</button>
  <button className="secondary" onClick={()=>downloadFile(resultCsv(run),name+'.csv','text/csv')}>{run.representations?'Atom coordinates':'Scores'} (CSV)</button>
  <button className="secondary" onClick={()=>downloadFile(run.structures.ligandSdf,name+'.sdf','chemical/x-mdl-sdfile')}>{run.representations?'Conformer':'Ligand'} (SDF)</button>
  {run.structures.receptorPdb&&<button className="secondary" onClick={()=>downloadFile(run.structures.receptorPdb,name+'-protein.pdb','chemical/x-pdb')}>Protein (PDB)</button>}
  {explanation?.method==='grad-cam'&&<button className="secondary" onClick={()=>downloadFile(camSvg(run,explanation,selection),name+'-gradcam.svg','image/svg+xml')}>Grad-CAM slice (SVG)</button>}
  {explanation?.method==='grouped-spatial-occlusion'&&<><button className="secondary" onClick={()=>downloadFile(occlusionCsv(run,explanation),name+'-occlusion.csv','text/csv')}>Occlusion regions (CSV)</button><button className="secondary" onClick={()=>downloadFile(occlusionSvg(run,explanation),name+'-occlusion.svg','image/svg+xml')}>Occlusion chart (SVG)</button></>}
 </div><p className="small">{explanation?'Includes the calculated attribution data. ':' '}Saved input and settings from this completed run. <a href="#research">Explore the related research →</a></p></section>;
}
