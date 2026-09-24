import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fusionGrid,fusionChannel,tokens,TOKEN_MAP} from '../src/lib/research/geometry.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/fusion-native.json',import.meta.url),'utf8'));

test('Fusion fixture is bound to original preprocessing source',()=>{
  const bytes=readFileSync(new URL('../'+fixture.source.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.source.sha256);
});

for(const reference of fixture.grids){
  test('native Fusion grid parity: '+reference.name,()=>{
    const actual=fusionGrid(reference.atoms),expected=new Float32Array(28*24**3);
    for(const [index,value] of reference.nonzero)expected[index]=value;
    assert.deepEqual(actual.shape,reference.shape);
    assert.deepEqual(actual.center,reference.center);
    assert.equal(actual.included,reference.included);
    // Check all voxels, including zero protein channels and the four unused
    // positions along each axis. Sparse fixture serialization is not sampling.
    assert.deepEqual(actual.data,expected);
  });
}

test('every native Fusion atom type maps to the same ligand channel',()=>{
  for(const atom of fixture.atomTypes)assert.equal(fusionChannel(atom),atom.channel,JSON.stringify(atom));
});

test('unsupported Fusion types reject before spatial culling',()=>{
  for(const reference of fixture.unsupported){
    assert.throws(()=>fusionGrid(reference.atoms),undefined,JSON.stringify(reference.atoms.at(-1)));
  }
});

test('Fusion token IDs and int64 padding match native exactly',()=>{
  assert.deepEqual(TOKEN_MAP,fixture.tokenMap);
  for(const reference of fixture.tokens){
    const actual=tokens(reference.input);
    assert.ok(actual instanceof BigInt64Array);
    assert.deepEqual(Array.from(actual,Number),reference.expected);
  }
});

test('browser deliberately rejects native empty, truncated or silently zeroed tokens',()=>{
  for(const reference of fixture.intentionalRestrictions)assert.throws(()=>tokens(reference.input));
});
