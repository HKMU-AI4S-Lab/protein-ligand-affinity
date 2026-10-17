import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchDockingPdb,inspectDockingPdb,freezeDockingRun,dockingPoseHandoff,verifyDockingRun} from '../src/lib/research/docking-inputs.mjs';
import {validatePreparedComplex} from '../src/lib/research/prepared-inputs.mjs';

test('docking accepts an unbound protein and requires explicit reference selection',async()=>{
 const pdb=await readFile('public/research/gnina-crossdock/1hsg-protein.pdb','utf8');
 const inspected=inspectDockingPdb(pdb);assert.deepEqual(inspected.chains,['A','B']);assert.deepEqual(inspected.references,[]);
 assert.throws(()=>inspectDockingPdb('MODEL        1\nMODEL        2\n'+pdb),/one PDB model/);
 const whole=await readFile('tests/fixtures/1hsg.pdb','utf8');
 const refs=inspectDockingPdb(whole).references;assert.equal(refs.length,1);assert.match(refs[0].label,/MK1/);assert.equal(refs[0].center.length,3);assert.ok(refs[0].size.every(n=>n>=12));
});
test('completed docking exports and scorer handoff preserve exact structures and selected pose',async()=>{
 const pdb=await readFile('public/research/gnina-crossdock/1hsg-protein.pdb','utf8'),sdf=await readFile('public/research/gnina-crossdock/1hsg.sdf','utf8');
 const input={schemaVersion:1,method:'GNINA docking',id:'run-1',input:{chains:['A','B']},identity:{preparedReceptorSha256:'protein-hash'},structures:{receptorPdb:pdb},poses:[{id:'pose-01',sdf,sdfSha256:'pose-hash'}]};
 const run=freezeDockingRun(input);input.poses[0].sdf='altered';input.input.chains.pop();
 assert.equal(run.poses[0].sdf,sdf);assert.deepEqual(run.input.chains,['A','B']);assert.throws(()=>run.poses.pop(),TypeError);
 const handoff=dockingPoseHandoff(run,'pose-01');assert.equal(handoff.receptorPdb,pdb);assert.equal(handoff.ligandSdf,sdf);assert.equal(handoff.context.poseId,'pose-01');assert.equal(handoff.context.ligandSha256,'pose-hash');validatePreparedComplex(handoff.receptorPdb,handoff.ligandSdf);
 assert.throws(()=>dockingPoseHandoff(run,'pose-02'),/Choose a completed/);
});

test('PDB ID loading uses the scoring download endpoint and records the exact downloaded structure',async()=>{
 const text=await readFile('tests/fixtures/1hsg.pdb','utf8');
 const controller=new AbortController();let requested;
 const loaded=await fetchDockingPdb(' 1hsg ',{signal:controller.signal,fetcher:async(url,options)=>{requested={url,signal:options.signal};return new Response(text);}});
 assert.equal(requested.url,'https://files.rcsb.org/download/1HSG.pdb');assert.equal(requested.signal,controller.signal);
 assert.equal(loaded.text,text);assert.deepEqual(loaded.inspection.chains,['A','B']);assert.equal(loaded.source.pdbId,'1HSG');assert.equal(loaded.source.sha256,createHash('sha256').update(text).digest('hex'));assert.ok(Number.isFinite(Date.parse(loaded.source.retrievedAt)));
});

test('PDB ID errors and preparation failures do not produce a loaded structure',async()=>{
 await assert.rejects(fetchDockingPdb('../1HSG',{fetcher:()=>{throw Error('must not fetch');}}),/four-character/);
 await assert.rejects(fetchDockingPdb('1ABC',{fetcher:async()=>new Response('',{status:404})}),/No PDB-format structure/);
 await assert.rejects(fetchDockingPdb('1ABC',{fetcher:async()=>{throw TypeError('Failed to fetch');}}),/connection and try again/);
 await assert.rejects(fetchDockingPdb('1ABC',{fetcher:async()=>new Response('',{headers:{'content-length':'5000001'}})}),/5 MB/);
 const text=await readFile('public/research/gnina-crossdock/1hsg-protein.pdb','utf8');
 await assert.rejects(fetchDockingPdb('1HSG',{fetcher:async()=>new Response('MODEL        1\nMODEL        2\n'+text)}),/one PDB model/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(fetchDockingPdb('1HSG',{signal:controller.signal,fetcher:async()=>new Response(text)}),{name:'AbortError'});
});

test('download provenance is immutable and must match the completed protein hash',async()=>{
 const hash=value=>createHash('sha256').update(value).digest('hex'),receptor='prepared',protein='downloaded',ligand='ligand',sdf='pose';
 const run={schemaVersion:1,method:'GNINA docking',id:'run-1',input:{proteinPdb:protein,proteinSource:{type:'pdb',pdbId:'1HSG',sha256:hash(protein)},ligand:{text:ligand}},structures:{receptorPdb:receptor,ligandPosesSdf:sdf},identity:{preparedReceptorSha256:hash(receptor),posesSha256:hash(sdf),proteinSha256:hash(protein),ligandSha256:hash(ligand)},poses:[{id:'pose-01',sdf,sdfSha256:hash(sdf)}]};
 const verified=await verifyDockingRun(run);run.input.proteinSource.pdbId='3PTB';assert.equal(verified.input.proteinSource.pdbId,'1HSG');assert.ok(Object.isFrozen(verified.input.proteinSource));
 run.input.proteinSource.sha256=hash('another structure');await assert.rejects(verifyDockingRun(run),/structure identity does not match/);
});
