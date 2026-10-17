import {citations,citationText} from '../../data/citations.mjs';
import {explanationMatches,camSlice,camColor,CAM_MAX} from './grad-cam.mjs';
import {occlusionDisplay,regionBounds,regionLabel} from './occlusion.mjs';

// Freeze a completed run once. No export function accepts the current form state.
const plain=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():ArrayBuffer.isView(v)?Array.from(v):v));
function sparseGrid(grid){
 if(!grid)return undefined;
 const {data,...settings}=grid,indices=[],values=[];
 for(let i=0;i<data.length;i++)if(data[i]!==0){indices.push(i);values.push(data[i]);}
 return {...settings,dtype:'float32',order:'N,C,X,Y,Z; Z varies fastest',encoding:'sparse-flat',length:data.length,defaultValue:0,indices,values};
}
export function completedRun(result,input,manifest,completedAt=new Date().toISOString()){
 if(!['representation','prediction'].includes(result?.kind))throw Error('Complete a calculation before downloading it.');
 const rep=result.kind==='representation',fusion=result.modelId?.startsWith('fusion-');
 const method=rep?'UniMolRep':fusion?'DL-FSG':'GNINA';
 const interpretation=rep?'Structural representations of one generated conformer; no molecular property is predicted.':fusion?'A relative screening score. Higher ranks higher within the same target. Not a calibrated activity probability, measured affinity or a score comparable across targets.':'CNNaffinity is an affinity estimate in pK units (negative log10 molar affinity); higher suggests stronger binding. CNNscore is a dimensionless pose score from 0 to 1; higher suggests a more plausible supplied pose. This is scoring of a fixed bound pose, not docking or an experimental measurement.';
 const references=rep?[citations.unimolrep]:fusion?[citations.fusion]:[citations.gnina];
 const model=rep?{id:'unimolrep-browser',preprocessingVersion:result.preprocessingVersion,rdkitVersion:result.rdkitVersion,coordinateMethod:result.coordinateMethod}:{id:result.modelId,sourceRevision:result.sourceRevision,checkpointSha256:result.checkpointSha256,modelArtifactSha256:result.modelArtifactSha256,preprocessingVersion:result.preprocessingVersion,runtime:result.runtime,backend:result.backend,validationStatus:manifest?.validation.status};
 return plain({schemaVersion:2,completedAt,method,input,model,interpretation,references,relatedResearch:!rep&&!fusion?citations.agima:undefined,
  identity:{inputIdentity:result.inputIdentity,gridSha256:result.gridSha256,tokensSha256:result.tokensSha256,checkpointSha256:result.checkpointSha256,preprocessingVersion:result.preprocessingVersion},
  settings:{coordinateMethod:result.coordinateMethod,center:result.center,coordinateUnit:'angstrom',...(rep?{fingerprint:{type:'Morgan',radius:2,bits:2048,useChirality:true},grid:{spacing:0.5,sigma:0.5,rotation:'none'},atomMapping:'Zero-based atom indices. Graph indices refer to the first graph.atoms.length entries in atoms; additional entries are generated hydrogens. Displayed atom numbers are index + 1.'}:{}),...(!rep&&!fusion?{gridShape:[1,28,48,48,48],spacing:0.5,pose:'supplied coordinates; no docking or minimization',hydrogens:'added for atom typing without moving existing atoms',alternateLocations:'blank or A',receptor:'selected protein chains, including declared modified residues; waters excluded'}:{})},
  outputs:result.outputs,structures:{ligandSdf:result.molblock.replace(/\s*\$\$\$\$\s*$/, '').trimEnd()+'\n$$$$\n',receptorPdb:result.proteinPdb},
  representations:rep?{smiles:result.smiles,canonicalSmiles:result.canonicalSmiles,formula:result.formula,atoms:result.atoms,graph:result.graph,fingerprint:result.fingerprint,angles:result.angles,torsions:result.torsions,grid:sparseGrid(result.grid)}:undefined,
  screeningGrid:fusion?sparseGrid(result.grid):undefined});
}
export function exportRecord(run,explanation){
 if(!explanation)return run;
 if(!explanationMatches(explanation,run.identity))throw Error('Attribution does not belong to this completed run.');
 return {...run,attribution:plain({...explanation,interpretation:'Model attribution for this input and checkpoint; not evidence of a binding mechanism.',reference:explanation.method==='grad-cam'?citations.gradcam:citations.occlusion})};
}
export function runSummary(run,explanation){
 const record=exportRecord(run,explanation),input=run.input;
 return [`${run.method} — completed run`,`Completed: ${run.completedAt}`,...Object.entries(input).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):v}`),`Model: ${run.model.id}`,`Preparation: ${run.model.preprocessingVersion}`,
  ...(run.outputs||[]).map(o=>`${o.name}: ${o.value} ${o.unit}`),...(run.representations?[`Formula: ${run.representations.formula}`,`Canonical SMILES: ${run.representations.canonicalSmiles}`,`${run.representations.graph.atoms.length} graph atoms; ${run.representations.graph.bonds.length} bonds; ${run.representations.atoms.length} atoms including generated hydrogens.`,`Morgan fingerprint: 2048 bits, radius 2, chirality included.`,`Coordinates: Å. Angles and torsions: degrees.`,`Atom numbers in the CSV and view are 1-based; JSON graph and geometry indices are 0-based.`]:[]),run.interpretation,
  ...(record.attribution?[`Attribution: ${record.attribution.method} (${record.attribution.completedAt})`,record.attribution.interpretation]:[]),
  ...(record.attribution?.method==='grouped-spatial-occlusion'?[occlusionSummary(run,record.attribution)]:[]),
  `Research: ${run.references.map(citationText).join('\n')}`,...(record.attribution?[`Attribution reference: ${citationText(record.attribution.reference)}`]:[]),...(run.relatedResearch?[`Related research (not the live model): ${citationText(run.relatedResearch)}`]:[]),`The JSON contains preparation settings, exact structures and model/input identifiers for this completed run.`].join('\n\n')+'\n';
}
function csv(rows){return rows.map(row=>row.map(value=>{let s=String(value??'');if(typeof value==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n')+'\r\n';}
export function resultCsv(run){
 const context=[run.completedAt,run.model.id,run.input.smiles||run.input.pdbId||run.input.pdbFile||'',run.input.target||''];
 if(run.representations)return csv([['completed_at','model','input','target','atom_index_0based','atom_number','element','atomic_number','x_angstrom','y_angstrom','z_angstrom','graph_index_0based'],...run.representations.atoms.map((a,i)=>[...context,i,i+1,a.symbol,a.z,...a.xyz,i<run.representations.graph.atoms.length?i:''])]);
 return csv([['completed_at','model','input','target','chains','ligand','output','value','unit','interpretation'],...run.outputs.map(o=>[...context,run.input.chains?.join(';')||'',run.input.ligand||'',o.name,o.value,o.unit,run.interpretation])]);
}
const occlusionInterpretation='Original minus masked CNNaffinity, in pK units. Positive: masking lowers the score; negative: masking raises it. All grid channels in one region are zeroed; geometry stays fixed. Model attribution, not evidence of a binding mechanism.';
function occlusionRegions(run,explanation){
 const e=exportRecord(run,explanation).attribution;
 if(run.method!=='GNINA'||e?.method!=='grouped-spatial-occlusion'||e.target!=='CNNaffinity'||
   !Number.isFinite(e.baseline)||e.baseline!==run.outputs.find(o=>o.name==='CNNaffinity')?.value||
   e.changes?.length!==8||new Set(e.changes.map(r=>r.group)).size!==8||
   !e.changes.every(r=>Number.isFinite(r.maskedScore)&&Number.isFinite(r.delta)))
  throw Error('A complete GNINA spatial occlusion result is required.');
 return e.changes.slice().sort((a,b)=>a.group-b.group).map(r=>({...r,label:regionLabel(r.group),bounds:regionBounds(r.group,run.settings.center,'gnina')}));
}
function occlusionSummary(run,e){
 const regions=occlusionRegions(run,e);
 return ['Spatial occlusion — all eight regions',occlusionInterpretation,
  'Region bounds are voxel edges in the supplied structure coordinate frame (Å). Scores and changes are in pK units.',
  ...regions.map(r=>`Region ${r.label}: original ${e.baseline}; masked ${r.maskedScore}; change ${r.delta>0?'+':''}${r.delta}\n  Bounds (x, y, z): [${r.bounds.min.join(', ')}] to [${r.bounds.max.join(', ')}] Å.`)].join('\n');
}
export function occlusionCsv(run,explanation){
 const regions=occlusionRegions(run,explanation),e=explanation;
 const context=[run.completedAt,e.completedAt,run.model.id,run.model.checkpointSha256,run.model.preprocessingVersion,run.identity.inputIdentity,run.identity.gridSha256,
  run.input.pdbId||run.input.pdbFile||'',run.input.chains?.join(';')||'',run.input.ligand||'',JSON.stringify(run.input),JSON.stringify(run.settings),run.references.map(citationText).join('\n'),citationText(citations.occlusion)];
 return csv([['completed_at','attribution_completed_at','model','checkpoint_sha256','preprocessing_version','input_identity','grid_sha256','input','chains','ligand','input_record_json','settings_json','model_reference','attribution_reference',
  'region','group_0based','x_min_angstrom','y_min_angstrom','z_min_angstrom','x_max_angstrom','y_max_angstrom','z_max_angstrom','original_cnnaffinity','masked_cnnaffinity','original_minus_masked','unit','interpretation'],
  ...regions.map(r=>[...context,r.label,r.group,...r.bounds.min,...r.bounds.max,e.baseline,r.maskedScore,r.delta,'pK units',occlusionInterpretation])]);
}
const xml=text=>String(text).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function occlusionSvg(run,explanation){
 const regions=occlusionRegions(run,explanation),e=explanation;
 // Wrap even unbroken uploaded filenames; escape only after wrapping raw text.
 const wrap=(text,limit=110)=>{
  const lines=[''];
  for(const word of String(text).trim().split(/\s+/)){
   const chars=Array.from(word);
   for(let i=0;i<chars.length;i+=limit){
    const part=chars.slice(i,i+limit).join(''),last=lines.length-1;
    if(lines[last]&&Array.from(lines[last]+' '+part).length>limit)lines.push(part);
    else lines[last]+=(lines[last]?' ':'')+part;
   }
  }
  return lines;
 };
 const context=[`Input: ${run.input.pdbId||run.input.pdbFile||''}${run.input.sdfFile?' — Ligand file: '+run.input.sdfFile:''}`,
  `Chains: ${run.input.chains?.join(', ')||''} — Ligand: ${run.input.ligand||''}`,
  `Model: ${run.model.id} — Score completed: ${run.completedAt}`,`Occlusion completed: ${e.completedAt}`].flatMap(text=>wrap(text,68));
 const top=92+context.length*21,rowHeight=38,axisX=280,halfWidth=180,chartEnd=top+regions.length*rowHeight;
 const notes=['Positive / right: masking lowers the score. Negative / left (hatched): masking raises the score.',
  'Fixed scale: ±10 pK units. * Change below 0.001 pK units: bar hidden; numeric value retained.',
  ...(regions.some(r=>Math.abs(r.delta)>10)?['Bars beyond ±10 are clipped; numeric labels retain the change.']:[]),
  'All grid channels in one region are zeroed; geometry stays fixed. Model attribution, not a binding mechanism.',
  'Region bounds and full precision values are included in the CSV and SVG metadata.',
  ...run.references.map(r=>`${r.short}: ${r.url}`),`${citations.occlusion.short}: ${citations.occlusion.url}`].flatMap(text=>wrap(text));
 const height=chartEnd+50+notes.length*21;
 const metadata={completedAt:run.completedAt,input:run.input,model:run.model,identity:run.identity,settings:run.settings,references:run.references,
  attribution:{method:e.method,completedAt:e.completedAt,target:e.target,baseline:e.baseline,reference:citations.occlusion,interpretation:occlusionInterpretation,regions},
  chart:{extent:10,unit:'pK units',boundsUnit:'angstrom',belowPrecision:0.001}};
 const number=n=>n.toFixed(3),signed=n=>(n>0?'+':'')+(n!==0&&occlusionDisplay(n,false).negligible?n.toExponential(2)+'*':number(n));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}" role="img" aria-labelledby="title description">
<title id="title">GNINA spatial occlusion — ${xml(run.input.pdbId||run.input.pdbFile||'')}</title><desc id="description">All eight spatial regions, A to H. Signed changes in CNNaffinity: original minus masked, in pK units.</desc><metadata>${xml(JSON.stringify(metadata))}</metadata>
<defs><pattern id="negative" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#a76436"/><path d="M-1 1 1-1 M0 6 6 0 M5 7 7 5" stroke="white" stroke-opacity=".6" stroke-width="1"/></pattern></defs><rect width="960" height="${height}" fill="white"/>
<g font-family="Arial, sans-serif" fill="#252b32"><text x="32" y="34" font-size="22">GNINA — Spatial occlusion</text>
${context.map((line,i)=>`<text x="32" y="${62+i*21}" font-size="13">${xml(line)}</text>`).join('')}
<g font-size="12" fill="#505c67"><text x="32" y="${top-20}">Region</text><text x="100" y="${top-20}" text-anchor="middle">−10</text><text x="280" y="${top-20}" text-anchor="middle">0</text><text x="460" y="${top-20}" text-anchor="middle">+10</text><text x="630" y="${top-20}" text-anchor="end">Original (pK)</text><text x="760" y="${top-20}" text-anchor="end">Masked (pK)</text><text x="928" y="${top-20}" text-anchor="end">Change (pK)</text></g>
${regions.map((r,i)=>{const y=top+i*rowHeight,d=occlusionDisplay(r.delta,false),width=d.negligible?0:Math.min(halfWidth,Math.abs(r.delta)/10*halfWidth);return `<g data-region="${r.label}" font-size="14"><title>Region ${r.label}: ${xml(r.delta)} pK units</title><text x="40" y="${y+16}">${r.label}</text><rect x="100" y="${y+1}" width="360" height="22" fill="#f2f4f6"/><path d="M280 ${y-2}v28" stroke="#83919e"/><rect class="change-bar" x="${r.delta<0?axisX-width:axisX}" y="${y+1}" width="${width}" height="22" fill="${d.negligible?d.color:r.delta<0?'url(#negative)':d.color}"/><text x="630" y="${y+16}" text-anchor="end">${number(e.baseline)}</text><text x="760" y="${y+16}" text-anchor="end">${number(r.maskedScore)}</text><text x="928" y="${y+16}" text-anchor="end">${signed(r.delta)}</text></g>`;}).join('')}
${notes.map((line,i)=>`<text x="32" y="${chartEnd+30+i*21}" font-size="12" fill="#505c67">${xml(line)}</text>`).join('')}</g></svg>`;
}
export function camSvg(run,explanation,selection){
 exportRecord(run,explanation);
 const slice=camSlice(explanation,selection.axis,selection.index),max=Math.max(...explanation.values);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 430"><title>${xml(run.input.target)} Grad-CAM, ${xml(run.input.smiles)}</title><metadata>${xml(JSON.stringify({completedAt:run.completedAt,input:run.input,model:run.model,selection,peak:max,spatialFrame:explanation.spatialFrame}))}</metadata><rect width="520" height="430" fill="white"/><g font-family="Arial" fill="#252b32"><text x="24" y="32" font-size="20">${xml(run.input.target)} — Grad-CAM</text><text x="24" y="58" font-size="13">${xml(selection.axis.toUpperCase())} = ${slice.position.toFixed(2)} Å — slice ${selection.index+1}/12</text>${slice.cells.map(c=>`<rect x="${24+c.col*24}" y="${80+(11-c.row)*24}" width="24" height="24" fill="${camColor(max?c.value/max*CAM_MAX:0)}"/>`).join('')}<text x="330" y="106" font-size="13">2 Å spacing</text><text x="330" y="130" font-size="13">Peak: ${max.toExponential(3)}</text><text x="330" y="154" font-size="12">Scale: 0 → peak</text><text x="24" y="392" font-size="12">Model attribution, not proof of a binding mechanism.</text><text x="24" y="415" font-size="11">Completed ${xml(run.completedAt)}</text></g></svg>`;
}
export function downloadFile(text,name,type){
 const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
