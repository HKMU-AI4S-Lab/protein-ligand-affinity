import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availableScreeningTargets,screeningTargets} from '../src/lib/research/screening-targets.mjs';

test('local preview offers all complete screening checkpoints while public hosts show approved targets',()=>{
  const manifests=Object.fromEntries(screeningTargets.map(target=>[
    target.id,
    target.id==='fusion-aofb'?JSON.parse(readFileSync(new URL('../public/research/fusion-aofb/manifest.json',import.meta.url),'utf8')):{validation:{status:'pending'}},
  ]));
  assert.deepEqual(availableScreeningTargets(manifests,'127.0.0.1').map(target=>target.label),
    ['MAO-B','EGFR','PARP1','DPP4','HIV-1 protease']);
  assert.equal(availableScreeningTargets(manifests,'localhost').length,5);
  assert.deepEqual(availableScreeningTargets(manifests,'example.org').map(target=>target.label),['MAO-B']);
});
