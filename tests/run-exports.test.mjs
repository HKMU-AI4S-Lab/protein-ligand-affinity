import test from 'node:test';
import assert from 'node:assert/strict';
import {completedRun,exportRecord,resultCsv,runSummary,camSvg,occlusionCsv,occlusionSvg} from '../src/lib/research/run-exports.mjs';
import {fusionCamFrame} from '../src/lib/research/grad-cam.mjs';

const completedAt='2026-09-29T10:00:00.000Z';
const prediction={kind:'prediction',modelId:'fusion-egfr',molblock:'test structure\n$$$$\n',outputs:[{name:'EGFR screening score',value:0.125,unit:'score'}],inputIdentity:'input',gridSha256:'grid',tokensSha256:'tokens',checkpointSha256:'checkpoint',preprocessingVersion:'v1'};
test('completed run exports cannot mix later form edits, output mutations or a new download timestamp',()=>{
 const input={smiles:'CCCO',target:'EGFR',chains:['A']},result=structuredClone(prediction);
 const run=completedRun(result,input,{validation:{status:'pending'}},completedAt);
 input.smiles='CCN';input.target='DPP4';input.chains.push('B');result.outputs[0].value=0.9;
 const record=JSON.parse(JSON.stringify(exportRecord(run)));
 assert.equal(record.completedAt,completedAt);assert.equal(record.input.smiles,'CCCO');assert.equal(record.input.target,'EGFR');assert.deepEqual(record.input.chains,['A']);assert.equal(record.outputs[0].value,0.125);
 assert.equal(record.structures.ligandSdf.split('$$$$').length,2);
 assert.match(runSummary(run),/CCCO/);assert.match(resultCsv(run),/EGFR screening score/);assert.match(resultCsv(run),/0.125/);
});
test('attribution downloads require the completed input and checkpoint and preserve all values',()=>{
 const run=completedRun(prediction,{smiles:'CCCO',target:'EGFR'},null,completedAt);
 const explanation={...run.identity,method:'grad-cam',shape:[12,12,12],values:Float32Array.from({length:1728},(_,i)=>i/1728),spatialFrame:fusionCamFrame([0,0,0])};
 assert.deepEqual(exportRecord(run,explanation).attribution.values,Array.from(explanation.values));
 for(const key of Object.keys(run.identity))assert.throws(()=>exportRecord(run,{...explanation,[key]:'changed'}),/does not belong/);
 const svg=camSvg(run,explanation,{axis:'y',index:7});assert.match(svg,/EGFR/);assert.match(svg,/slice 8\/12/);assert.equal((svg.match(/<rect /g)||[]).length,145);
});
test('representation export round-trips sparse float grids and atom indices without JSON typed-array objects',()=>{
 const result={kind:'representation',smiles:'CO',canonicalSmiles:'CO',formula:'CH4O',molblock:'fixture',preprocessingVersion:'v1',atoms:[{symbol:'C',z:6,xyz:[1,2,3]},{symbol:'O',z:8,xyz:[2,3,4]}],graph:{atoms:[{},{}],bonds:[{a:0,b:1,order:1}]},fingerprint:'0101',angles:[],torsions:[],grid:{data:new Float32Array([0,0.2,0,3]),shape:[1,1,1,2,2],channels:['C']}};
 const run=completedRun(result,{smiles:'CO'},null,completedAt),grid=run.representations.grid,reconstructed=new Float32Array(grid.length);
 grid.indices.forEach((at,i)=>{reconstructed[at]=grid.values[i];});assert.deepEqual(reconstructed,result.grid.data);
 assert.match(resultCsv(run),/atom_index_0based/);assert.match(runSummary(run),/no molecular property/);assert.equal(run.references[0].id,'unimolrep');
});
test('GNINA exports retain both output units, selected complex and the distinct research credit',()=>{
 const run=completedRun({...prediction,modelId:'gnina-crossdock',proteinPdb:'ATOM fixture',outputs:[{name:'CNNaffinity',value:8.6,unit:'pK units'},{name:'CNNscore',value:0.7,unit:'pose score'}]},{pdbFile:'own-complex.pdb',ligand:'MK1 — chain A — residue 902',chains:['A','B']},null,completedAt);
 assert.equal(run.references[0].id,'gnina');assert.equal(run.relatedResearch.id,'agima');assert.match(resultCsv(run),/own-complex.pdb/);assert.match(resultCsv(run),/pK units/);assert.match(runSummary(run),/not the live model/);assert.equal(run.structures.receptorPdb,'ATOM fixture');
});

function occlusionFixture(){
 const input={pdbFile:'own-complex.pdb',chains:['A','B'],ligand:'MK1 — chain B — residue 902',sdfFile:'bound.sdf'};
 const result={...prediction,modelId:'gnina-crossdock',center:[1,2,3],outputs:[{name:'CNNaffinity',value:8.5,unit:'pK units'},{name:'CNNscore',value:0.7,unit:'pose score'}]};
 const run=completedRun(result,input,null,completedAt),deltas=[2,-2,0,0.0001,-0.0001,10,-10,12];
 const explanation={...run.identity,method:'grouped-spatial-occlusion',target:'CNNaffinity',completedAt:'2026-09-29T10:01:00.000Z',baseline:8.5,shape:[2,2,2],values:Float32Array.from(deltas),changes:deltas.map((delta,group)=>({group,region:[group>>2,(group>>1)&1,group&1],delta,maskedScore:8.5-delta}))};
 return {run,explanation,input,result};
}
// Parse quoted CSV, including embedded commas, quotes and newlines in uploaded names.
function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===','){row.push(field);field='';}
  else if(!quoted&&c==='\n'){row.push(field);rows.push(row);row=[];field='';}
  else if(quoted||c!=='\r')field+=c;
 }
 const [headers,...values]=rows;return values.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]])));
}
const svgMetadata=svg=>JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));
test('occlusion CSV exports every region with exact scores, bounds, units and frozen run context',()=>{
 const {run,explanation:e,input,result}=occlusionFixture();
 input.pdbFile='edited.pdb';input.chains.push('C');input.ligand='NEW';result.center[0]=999;result.outputs[0].value=1;
 e.changes.reverse(); // Exports have a stable A–H order independent of presentation order.
 const rows=parseCsv(occlusionCsv(run,e));assert.equal(rows.length,8);
 for(const [group,row] of rows.entries()){
  const change=e.changes.find(r=>r.group===group);
  assert.equal(row.region,'ABCDEFGH'[group]);assert.equal(Number(row.group_0based),group);
  assert.equal(Number(row.original_cnnaffinity),8.5);assert.equal(Number(row.masked_cnnaffinity),change.maskedScore);assert.equal(Number(row.original_minus_masked),change.delta);
  assert.equal(row.unit,'pK units');assert.equal(row.input,'own-complex.pdb');assert.equal(row.chains,'A;B');assert.equal(row.ligand,'MK1 — chain B — residue 902');assert.equal(JSON.parse(row.input_record_json).sdfFile,'bound.sdf');
  assert.equal(row.completed_at,completedAt);assert.equal(row.attribution_completed_at,e.completedAt);assert.equal(row.checkpoint_sha256,run.model.checkpointSha256);assert.equal(row.input_identity,run.identity.inputIdentity);assert.equal(row.grid_sha256,run.identity.gridSha256);
  assert.match(row.model_reference,/GNINA 1.0/);assert.match(row.attribution_reference,/Zeiler/);assert.match(row.interpretation,/Original minus masked/);
 }
 assert.deepEqual(['x_min_angstrom','y_min_angstrom','z_min_angstrom','x_max_angstrom','y_max_angstrom','z_max_angstrom'].map(k=>Number(rows[0][k])),[-11,-10,-9,1,2,3]);
 assert.deepEqual(['x_min_angstrom','y_min_angstrom','z_min_angstrom','x_max_angstrom','y_max_angstrom','z_max_angstrom'].map(k=>Number(rows[7][k])),[1,2,3,13,14,15]);
 const summary=runSummary(run,e);assert.match(summary,/Region A: original 8.5; masked 6.5; change \+2/);assert.match(summary,/Region B: original 8.5; masked 10.5; change -2/);assert.match(summary,/Region H:/);assert.match(summary,/Positive: masking lowers/);assert.match(summary,/Bounds \(x, y, z\)/);assert.match(summary,/Zeiler/);assert.doesNotMatch(summary,/edited.pdb/);
});
test('occlusion SVG shows signed bars, all regions and small changes without changing the scientific scale',()=>{
 const {run,explanation:e}=occlusionFixture(),svg=occlusionSvg(run,e),meta=svgMetadata(svg);
 assert.equal((svg.match(/data-region=/g)||[]).length,8);
 const bar=label=>svg.match(new RegExp('<g data-region="'+label+'".*?<rect class="change-bar"([^>]+)>','s'))[1];
 assert.match(bar('A'),/x="280".*width="36".*fill="#345da8"/);assert.match(bar('B'),/x="244".*width="36".*fill="url\(#negative\)"/);
 for(const label of ['C','D','E'])assert.match(bar(label),/width="0".*fill="#aaaaaa"/);
 assert.match(bar('H'),/width="180"/);assert.match(svg,/Bars beyond ±10 are clipped/);assert.match(svg,/>\+12.000</);assert.match(svg,/\+1.00e-4\*/);assert.match(svg,/-1.00e-4\*/);
 assert.equal(meta.chart.extent,10);assert.equal(meta.chart.unit,'pK units');assert.deepEqual(meta.input,run.input);assert.deepEqual(meta.model,run.model);assert.deepEqual(meta.identity,run.identity);assert.equal(meta.attribution.completedAt,e.completedAt);assert.equal(meta.attribution.regions.length,8);
 assert.deepEqual(meta.attribution.regions[0].bounds,{min:[-11,-10,-9],max:[1,2,3]});
 assert.deepEqual(meta.attribution.regions.map(r=>r.delta),e.changes.map(r=>r.delta));assert.equal(meta.attribution.reference.id,'occlusion');
});
test('occlusion exports safely preserve filenames and escape spreadsheet formulas and SVG markup',()=>{
 const {run,explanation:e}=occlusionFixture();run.input.pdbFile='=complex, "test"\n<script>&.pdb';
 const rows=parseCsv(occlusionCsv(run,e));assert.equal(rows[0].input,"'"+run.input.pdbFile);assert.equal(JSON.parse(rows[0].input_record_json).pdbFile,run.input.pdbFile);
 const svg=occlusionSvg(run,e);assert.doesNotMatch(svg,/<script>/);assert.match(svg,/&lt;script&gt;&amp;/);assert.equal(svgMetadata(svg).input.pdbFile,run.input.pdbFile);
 run.input.pdbFile='W'.repeat(240)+'.pdb';const longNameSvg=occlusionSvg(run,e);
 assert.equal(svgMetadata(longNameSvg).input.pdbFile,run.input.pdbFile);assert.doesNotMatch(longNameSvg,/<text[^>]*>[^<]*W{69}/);
});
test('occlusion downloads reject another input or model and incomplete or incompatible attribution',()=>{
 const {run,explanation:e}=occlusionFixture(),exports=[occlusionCsv,occlusionSvg,runSummary];
 for(const key of Object.keys(run.identity))for(const exportFn of exports)assert.throws(()=>exportFn(run,{...e,[key]:'changed'}),/does not belong/);
 for(const patch of [{baseline:9},{target:'EGFR screening score'},{changes:e.changes.slice(1)},{changes:e.changes.map(r=>({...r,group:0}))},{changes:e.changes.map(r=>({...r,delta:NaN}))}])
  for(const exportFn of exports)assert.throws(()=>exportFn(run,{...e,...patch}),/complete GNINA/);
 for(const exportFn of [occlusionCsv,occlusionSvg])assert.throws(()=>exportFn(run,{...e,method:'grad-cam'}),/complete GNINA/);
 assert.throws(()=>occlusionCsv({...run,method:'DL-FSG'},e),/complete GNINA/);
});
