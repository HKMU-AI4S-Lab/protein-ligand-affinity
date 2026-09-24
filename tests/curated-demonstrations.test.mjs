import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCuratedExample} from '../src/lib/research/curated.mjs';
import {regionBounds,occlusionDisplay} from '../src/lib/research/occlusion.mjs';
const manifest=JSON.parse(await readFile('public/research/gnina-crossdock/manifest.json','utf8'));
const fixtures=JSON.parse(await readFile('artifacts/gnina-input-references/fixtures.json','utf8'));
test('curated geometry, centers and scored grids are bound to native reference fixtures',async()=>{
 const original=globalThis.fetch,cache=globalThis.caches;const requested=[];
 globalThis.caches={open:async()=>{throw Error('storage denied')}};
 const hostedGrids=new Map(manifest.examples.filter(e=>e.grid.url).map(e=>[e.grid.url,`research/gnina-crossdock/${e.id}-grid.bin`]));
 globalThis.fetch=async url=>{const path=hostedGrids.get(String(url))||new URL(url).pathname.slice(1);requested.push(path);return new Response(await readFile('public/'+path));};
 try{for(const example of manifest.examples){const native=fixtures.complexes.find(e=>e.id===example.id);assert.deepEqual(example.center,native.center);assert.equal(example.protein.sha256,native.receptor.sha256);assert.equal(example.structure.sha256,native.ligand.sha256);assert.equal(example.grid.sha256,native.grid.sha256);
  const preview=await loadCuratedExample(manifest,example.id,{base:'https://local.test/',includeGrid:false});assert.equal(requested.some(p=>p.endsWith('-grid.bin')),false);
  const full=await loadCuratedExample(manifest,example.id,{base:'https://local.test/'});assert.equal(preview.inputIdentity,full.inputIdentity);assert.equal(full.grid.length,28*48**3);assert.equal(full.molblock,preview.molblock);assert.equal(full.proteinPdb,preview.proteinPdb);requested.length=0;
 }await assert.rejects(loadCuratedExample(manifest,'../../custom',{base:'https://local.test/'}),/supported prepared/);assert.equal(requested.length,0);
 }finally{globalThis.fetch=original;globalThis.caches=cache;}
});
test('eight displayed boxes exactly partition the native voxel edges including Fusion offset',()=>{
 for(const kind of ['gnina','fusion']){const n=kind==='fusion'?24:48,spacing=kind==='fusion'?1:.5,first=kind==='fusion'?-9.5:-11.75,center=[13.1,-2,7];
  for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++){const group=(x>=n/2?4:0)+(y>=n/2?2:0)+(z>=n/2?1:0),bounds=regionBounds(group,center,kind);[x,y,z].forEach((j,i)=>{const coord=center[i]+first+j*spacing;assert.ok(coord>bounds.min[i]&&coord<bounds.max[i]);});}
 }
 assert.throws(()=>regionBounds(8,[0,0,0],'gnina'));
});
test('absolute display precision does not amplify negligible signed changes',()=>{
 for(const fusion of [true,false]){const threshold=fusion?1e-4:1e-3;for(const delta of [0,1e-27,-1e-8,threshold*.999])assert.equal(occlusionDisplay(delta,fusion).negligible,true);for(const delta of [threshold,-threshold])assert.equal(occlusionDisplay(delta,fusion).negligible,false);assert.equal(occlusionDisplay(1e-27,fusion).color,occlusionDisplay(0,fusion).color);}
});
