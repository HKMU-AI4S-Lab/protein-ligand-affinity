import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {browserDockingRegion,pdbqtAtoms,vinaPosesToSdf} from '../src/lib/research/webina-formats.mjs';
const fixture=JSON.parse(await readFile('tests/fixtures/webina-3ptb.json','utf8'));
test('real Webina output keeps connection table and maps serials rather than output order',()=>{
 const mapped=pdbqtAtoms(fixture.ligandPdbqt),poses=vinaPosesToSdf(fixture.ligandPosesPdbqt,fixture.preparedLigandSdf,mapped);
 assert.equal(poses.length,1);assert.ok(Math.abs(poses[0].scores.energy+6.079)<0.0001);
 const template=fixture.preparedLigandSdf.split('\n'),result=poses[0].sdf.split('\n'),count=Number(template[3].slice(0,3));
 assert.deepEqual(result.slice(4+count,result.indexOf('M  END')+1),template.slice(4+count,template.indexOf('M  END')+1));
 const predicted=new Map(pdbqtAtoms(fixture.ligandPosesPdbqt).map(a=>[a.serial,a]));
 for(let i=0;i<count;i++){assert.equal(result[4+i].slice(30),template[4+i].slice(30));assert.deepEqual([0,10,20].map(n=>Number(result[4+i].slice(n,n+10))),predicted.get(i+1).xyz);}
 assert.throws(()=>vinaPosesToSdf(fixture.ligandPosesPdbqt.replace('REMARK VINA RESULT:','REMARK missing:'),fixture.preparedLigandSdf,mapped),/missing its Vina energy/);
 const changed=structuredClone(mapped);changed[0].type='UNSUPPORTED';assert.throws(()=>vinaPosesToSdf(fixture.ligandPosesPdbqt,fixture.preparedLigandSdf,changed),/atom identities changed/);
 assert.throws(()=>pdbqtAtoms(fixture.ligandPdbqt+'\n'+fixture.ligandPdbqt),/ambiguous/);
});
test('browser docking enforces selected chains, explicit search region and bounded search settings',async()=>{
 const proteinPdb=await readFile('public/research/gnina-crossdock/1hsg-protein.pdb','utf8');
 const input={proteinPdb,chains:['A'],region:{mode:'box',center:[0,0,0],size:[20,20,20]},settings:{seed:2026,exhaustiveness:8,numModes:9}};
 assert.deepEqual(browserDockingRegion(input).size,[20,20,20]);
 assert.throws(()=>browserDockingRegion({...input,chains:['Z']}),/protein chains/);
 assert.throws(()=>browserDockingRegion({...input,region:{mode:'reference',referenceKey:'absent'}}),/reference ligand/);
 for(const size of [[40,40,40],[0,20,20],[NaN,20,20]])assert.throws(()=>browserDockingRegion({...input,region:{...input.region,size}}),/dimensions/);
 assert.throws(()=>browserDockingRegion({...input,settings:{...input.settings,seed:0}}),/search settings/);
});
