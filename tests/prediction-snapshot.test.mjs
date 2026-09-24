import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPredictionSnapshot,verifyPredictionSnapshot} from '../src/lib/research/prediction-snapshot.mjs';
import {sha256} from '../src/lib/research/artifacts.mjs';
import {fusionGrid,tokens} from '../src/lib/research/geometry.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const fusion=await json('public/research/fusion-aofb/manifest.json'),gnina=await json('public/research/gnina-crossdock/manifest.json');
const base=m=>({schemaVersion:3,kind:'prediction',execution:'live-browser',modelId:m.id,runtime:m.runtime,backend:m.backend,sourceRevision:m.sourceRevision,checkpointSha256:m.checkpointSha256,preprocessingVersion:m.preprocessingVersion,modelArtifactSha256:m.artifact.sha256});
const fixture=await json('tests/fixtures/fusion-native.json'),grid=fusionGrid(fixture.grids[0].atoms),seq=tokens('CCO');
const result={...base(fusion),molblock:'fixed conformer fixture',center:grid.center,grid,outputs:[{name:'screening',value:.314159}],inputIdentity:await sha256(new TextEncoder().encode('CCO')),gridSha256:await sha256(grid.data),tokensSha256:await sha256(seq)};
test('Fusion handoff retains exact typed tensors, coordinates, identity and score without regenerating chemistry',async()=>{
 const snapshot=structuredClone(await createPredictionSnapshot(result,grid.data,seq,'CCO'));
 assert.deepEqual((await verifyPredictionSnapshot(snapshot,fusion)).result,result);assert.deepEqual(snapshot.grid,grid.data);assert.deepEqual(snapshot.tokens,seq);
});
test('Fusion handoff rejects altered tensors, conformer, score, input or model version',async()=>{
 const original=await createPredictionSnapshot(result,grid.data,seq,'CCO');
 for(const mutate of [s=>{s.grid[0]+=.1;},s=>{s.tokens[0]=99n;},s=>{s.result.molblock+=' changed';},s=>{s.result.center[0]+=1;},s=>{s.result.outputs[0].value+=.1;},s=>{s.smiles='CCCC';},s=>{s.result.grid={...s.result.grid,data:new Float32Array(1)};},s=>{s.result.preprocessingVersion+='-old';},s=>{s.result.modelArtifactSha256='0'.repeat(64);}]){const s=structuredClone(original);mutate(s);await assert.rejects(verifyPredictionSnapshot(s,fusion));}
 await assert.rejects(verifyPredictionSnapshot(original,{...fusion,checkpointSha256:'1'.repeat(64)}));
});
for(const e of gnina.examples)test('Prepared '+e.id+' handoff binds grid, both structures, center and score',async()=>{
 const raw=await readFile(`public/research/gnina-crossdock/${e.id}-grid.bin`),g=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
 const r={...base(gnina),exampleId:e.id,center:e.center,molblock:await readFile('public/'+e.structure.path,'utf8'),proteinPdb:await readFile('public/'+e.protein.path,'utf8'),outputs:[{name:'affinity',value:e.referenceAffinity}],gridSha256:e.grid.sha256,inputIdentity:await sha256(new TextEncoder().encode([e.id,e.protein.sha256,e.structure.sha256,e.grid.sha256,e.center.join(',')].join('|')))};
 const s=await createPredictionSnapshot(r,g,undefined);assert.deepEqual((await verifyPredictionSnapshot(structuredClone(s),gnina)).result,r);
 for(const change of [r=>({...r,exampleId:e.id==='1hsg'?'1hvr':'1hsg'}),r=>({...r,proteinPdb:r.proteinPdb+'\n'}),r=>({...r,center:[0,0,0]}),r=>({...r,inputIdentity:'0'.repeat(64)})])await assert.rejects(verifyPredictionSnapshot(await createPredictionSnapshot(change(r),g,undefined),gnina));
});
