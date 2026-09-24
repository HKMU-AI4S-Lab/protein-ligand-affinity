// Derive illustration inputs from captured browser inputs and native-checked fixtures.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import initRDKit from '@rdkit/rdkit';
import {representationGrid,geometricFeatures} from '../src/lib/research/geometry.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source='artifacts/illustrated-chrome-fusion-outputs.json',bytes=readFileSync(source);
const validation=JSON.parse(readFileSync('artifacts/illustrated-chrome-fusion-outputs-native-validation.json'));
assert.equal(validation.passed,true);assert.equal(validation.sourceSha256,sha(bytes));
const records=JSON.parse(bytes),aspirin=records.find(r=>r.input.smiles==='CC(=O)Oc1ccccc1C(=O)O'),ethanol=records.find(r=>r.input.smiles==='CCO');
const lines=aspirin.result.molblock.split(/\r?\n/),n=Number(lines[3].slice(0,3)),symbols={H:1,C:6,N:7,O:8};
const atoms=lines.slice(4,n+4).map(l=>({symbol:l.slice(31,34).trim(),z:symbols[l.slice(31,34).trim()],xyz:[0,10,20].map(i=>Number(l.slice(i,i+10)))}));
const rdkit=await initRDKit(),mol=rdkit.get_mol(aspirin.input.smiles),json=JSON.parse(mol.get_json()),graph=json.molecules[0];
const bonds=graph.bonds.map(b=>({a:b.atoms[0],b:b.atoms[1],order:b.bo??json.defaults.bond.bo}));
assert.deepEqual(graph.atoms.map(a=>a.z??json.defaults.atom.z),atoms.slice(0,graph.atoms.length).map(a=>a.z));
mol.set_new_coords();const depiction=mol.get_molblock().split(/\r?\n/),positions=graph.atoms.map((_,i)=>[Number(depiction[i+4].slice(0,10)),Number(depiction[i+4].slice(10,20)),0]);
const fingerprint=mol.get_morgan_fp(JSON.stringify({radius:2,nBits:2048,useChirality:true}));
const reference=JSON.parse(readFileSync('tests/fixtures/unimolrep-native.json')).molecules.find(m=>m.smiles===aspirin.input.smiles);assert.equal(fingerprint,reference.fingerprint);mol.delete();
const geometry=geometricFeatures(atoms.slice(0,graph.atoms.length),bonds),grid=representationGrid(atoms);
function slice(g,channel,z){const n=g.shape[2],v=[];for(let y=n-1;y>=0;y--)for(let x=0;x<n;x++)v.push(g.data[((channel*n+x)*n+y)*n+z]);return v;}
const gridSlices={n:48,z:23,carbon:slice(grid,11,23),oxygen:slice(grid,13,23),origin:grid.origin,spacing:.5};
const fusion=aspirin.result.grid,projection=[];for(let y=23;y>=0;y--)for(let x=0;x<24;x++){let v=0;for(let c=14;c<28;c++)for(let z=0;z<24;z++)v+=fusion.data[((c*24+x)*24+y)*24+z];projection.push(v);}
const out={sources:[{path:source,sha256:sha(bytes)},{path:'tests/fixtures/unimolrep-native.json',sha256:sha(readFileSync('tests/fixtures/unimolrep-native.json'))}],aspirin:{smiles:aspirin.input.smiles,coordinateMethod:aspirin.result.coordinateMethod,atoms,bonds,positions,fingerprint,angle:geometry.angles[0],torsion:geometry.torsions[1],gridSlices,fusionProjection:projection},gradcam:{smiles:'CCO',...ethanol.explanation,values:Array.from(ethanol.explanation.values)},nativeValidation:validation};
writeFileSync('artifacts/research-illustration-data.json',JSON.stringify(out));console.log('Prepared verified illustration data.');
