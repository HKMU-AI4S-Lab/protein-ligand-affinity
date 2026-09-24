import test from 'node:test';
import assert from 'node:assert/strict';
import {progressText,errorText} from '../src/lib/research/presentation.mjs';

test('progress names the reader task without exposing runtime files or sessions',()=>{
 assert.equal(progressText('Creating model session…'),'Preparing the model…');
 assert.equal(progressText('Loading chemistry openbabel/openbabel.wasm · 42%'),'Preparing molecular tools · 42%');
 assert.equal(progressText('Loading weights · 17% · 300.1 MB'),'Loading model data · 17% · 300.1 MB');
 assert.equal(progressText('Spatial occlusion 5/8'),'Spatial occlusion 5/8');
 assert.equal(progressText('unknown backend detail /private/path'),'Preparing the calculation…');
});
test('download failures and verification errors give a recovery action without leaking diagnostics',()=>{
 for(const text of ['Artifact download failed: 503','Artifact byte count mismatch','Artifact SHA-256 mismatch','Incomplete artifact download','This artifact is not available offline. Reconnect to download and cache it.','Model input names do not match manifest','Unverified Fusion derivative manifest.']){
  const publicText=errorText(new Error(text));assert.match(publicText,/try|Try|Reconnect/);assert.doesNotMatch(publicText,/503|SHA|artifact|manifest|tensor|session|stack/i);
 }
 assert.match(errorText('Invalid SMILES. Check atoms, bonds and ring closures.'),/^Invalid SMILES/);
 assert.match(errorText('Generated coordinates did not preserve the specified stereochemistry; this molecule is unsupported.'),/stereochemistry/);
 assert.match(errorText('The explanation does not match the current prediction. Please recalculate.'),/recalculate/);
});
