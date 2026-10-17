import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availableScreeningTargets,screeningTargets} from '../src/lib/research/screening-targets.mjs';

test('all five released screening checkpoints are available on public hosts',()=>{
  const manifests=Object.fromEntries(screeningTargets.map(target=>[
    target.id,
    JSON.parse(readFileSync(new URL(`../public/research/${target.id}/manifest.json`,import.meta.url),'utf8')),
  ]));
  assert.deepEqual(availableScreeningTargets(manifests,'127.0.0.1').map(target=>target.label),
    ['MAO-B','EGFR','PARP1','DPP4','HIV-1 protease']);
  assert.equal(availableScreeningTargets(manifests,'localhost').length,5);
  assert.deepEqual(availableScreeningTargets(manifests,'example.org').map(target=>target.label),['MAO-B','EGFR','PARP1','DPP4','HIV-1 protease']);
  const pending={...manifests,'fusion-egfr':{validation:{status:'pending'}}};
  assert.equal(availableScreeningTargets(pending,'example.org').some(t=>t.code==='egfr'),false);
  assert.equal(availableScreeningTargets(pending,'localhost').length,5);
});
