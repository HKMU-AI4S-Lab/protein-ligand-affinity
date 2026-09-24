import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyExplanationDestination as destination} from '../src/lib/research/legacy-route.mjs';
test('legacy explanation methods resolve to the matching scientific article',()=>{
 assert.equal(destination('?method=grad-cam','#experiment'),'/topics/screening-molecules/?method=grad-cam#experiment');
 assert.equal(destination('','#grad-cam'),'/topics/screening-molecules/#grad-cam');
 assert.equal(destination('',''),'/topics/binding-affinity/#occlusion');
 assert.equal(destination('?method=occlusion','#grad-cam'),'/topics/binding-affinity/?method=occlusion#occlusion');
});
test('legacy restoration and shared fragments survive subpath redirects',()=>{
 assert.equal(destination('?method=grad-cam&from=prediction','#references','/project/'),'/project/topics/screening-molecules/?method=grad-cam&from=prediction#experiment');
 for(const hash of ['#concept','#research','#references'])assert.ok(destination('?method=occlusion',hash).endsWith(hash));
 assert.equal(destination('?method=https://evil.example','#unknown'),'/topics/binding-affinity/?method=https%3A%2F%2Fevil.example#occlusion');
});
