import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import initRDKit from '@rdkit/rdkit';
import {angle,binAngle,geometricFeatures,representationGrid} from '../src/lib/research/geometry.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/unimolrep-native.json',import.meta.url),'utf8'));
const rdkit=await initRDKit();
const indicesKey=x=>x.indices.join(',');
const ordered=values=>[...values].sort((a,b)=>indicesKey(a).localeCompare(indicesKey(b)));

test('reference fixtures are bound to the exact original UniMolRep source',()=>{
  for(const source of fixture.sources){
    const bytes=readFileSync(new URL('../'+source.path,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,source.path);
  }
});

for(const reference of fixture.molecules){
  test('RDKit WASM fingerprint and topology match native: '+reference.smiles,()=>{
    const mol=rdkit.get_mol(reference.smiles);
    try{
      assert.ok(mol?.is_valid());
      assert.equal(mol.get_morgan_fp(JSON.stringify({radius:2,nBits:2048,useChirality:true})),reference.fingerprint);
      const json=JSON.parse(mol.get_json()),graph=json.molecules[0];
      assert.deepEqual(graph.atoms.map(a=>a.z??json.defaults.atom.z),reference.atoms.map(a=>a.z));
      assert.deepEqual(graph.bonds.flatMap(b=>[b.atoms,[...b.atoms].reverse()]),reference.edges);
      assert.equal(mol.get_smiles(),reference.canonicalSmiles);
    }finally{mol?.delete();}
  });
  test('fixed-coordinate native angles and torsions: '+reference.smiles,()=>{
    const actual=geometricFeatures(reference.atoms,reference.bonds);
    assert.deepEqual(actual.edges,reference.edges);
    for(const name of ['angles','torsions']){
      const expected=ordered(reference[name]),got=ordered(actual[name]);
      assert.equal(got.length,expected.length,name+' count');
      for(let i=0;i<expected.length;i++){
        assert.deepEqual(got[i].indices,expected[i].indices);
        assert.equal(got[i].bin,expected[i].bin,name+' bin '+indicesKey(got[i]));
        const delta=Math.abs(got[i].degrees-expected[i].degrees);
        assert.ok(Math.min(delta,Math.abs(delta-360))<=1e-4,name+' angle error '+delta);
      }
    }
  });
}

for(const reference of fixture.grids){
  test('all native Gaussian grid voxels, channels and boundaries: '+reference.id,()=>{
    const actual=representationGrid(reference.atoms);
    assert.deepEqual(actual.shape,reference.shape);
    assert.deepEqual(actual.center,reference.center);
    assert.deepEqual(actual.origin,reference.origin);
    assert.deepEqual(actual.channels.map(c=>c.replace('protein:','prot:').replace('ligand:','lig:')),reference.nativeChannels);
    const expected=new Map(reference.nonzero);
    let maxError=0,nonzero=0;
    for(let i=0;i<actual.data.length;i++){
      const ref=expected.get(i)??0,value=actual.data[i];
      if(value!==0)nonzero++;
      if(ref===0)assert.equal(value,0,'unexpected occupied voxel '+i);
      maxError=Math.max(maxError,Math.abs(value-ref));
    }
    assert.equal(nonzero,reference.nonzeroCount);
    assert.ok(maxError<=5e-7,'FP32 Gaussian voxel error '+maxError);
  });
}

test('native angle degeneracy and bin boundaries',()=>{
  for(const example of fixture.angleCases)assert.ok(Math.abs(angle(...example.points)-example.degrees)<1e-9,example.id);
  for(const example of fixture.angleBins)assert.equal(binAngle(example.value,[60,120,150,180,360]),example.bin,String(example.value));
});

test('invalid chemistry rejected and enantiomer fingerprints remain distinct',()=>{
  for(const smiles of fixture.invalidSmiles){let mol;try{mol=rdkit.get_mol(smiles);assert.ok(!mol||!mol.is_valid());}finally{mol?.delete();}}
  const enantiomers=fixture.molecules.filter(x=>x.smiles.startsWith('F[C@'));
  assert.equal(enantiomers.length,2);
  assert.notEqual(enantiomers[0].fingerprint,enantiomers[1].fingerprint);
});
