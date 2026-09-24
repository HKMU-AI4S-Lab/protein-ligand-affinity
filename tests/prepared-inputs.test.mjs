import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePreparedComplex} from '../src/lib/research/prepared-inputs.mjs';
const pdb=readFileSync('public/research/gnina-crossdock/1hsg-protein.pdb','utf8'),sdf=readFileSync('public/research/gnina-crossdock/1hsg.sdf','utf8');
const changeAtom=(text,fn)=>text.split('\n').map(line=>line.startsWith('ATOM  ')?fn(line):line).join('\n');
test('accepts a prepared V2000 complex without changing input coordinates',()=>{const result=validatePreparedComplex(pdb,sdf);assert.ok(result.records.length>100);assert.equal(result.ligand,sdf.split(/^\$\$\$\$\s*$/m)[0]);});
test('rejects blank, nonfinite, or oversized receptor coordinates',()=>{for(const value of ['        ','     NaN','99999999'])assert.throws(()=>validatePreparedComplex(changeAtom(pdb,line=>line.slice(0,30)+value+line.slice(38)),sdf),/coordinates/);});
test('rejects unresolved alternate conformations and duplicate atoms',()=>{assert.throws(()=>validatePreparedComplex(changeAtom(pdb,line=>line.slice(0,16)+'B'+line.slice(17)),sdf),/alternate/);const first=pdb.split('\n').find(l=>l.startsWith('ATOM  '));assert.throws(()=>validatePreparedComplex(pdb+'\n'+first,sdf),/Duplicate/);});
test('rejects multiple receptor models and multiple ligand poses',()=>{assert.throws(()=>validatePreparedComplex('MODEL 1\n'+pdb+'\nMODEL 2\n'+pdb,sdf),/Multiple/);assert.throws(()=>validatePreparedComplex(pdb,sdf+'\n'+sdf),/exactly one/);});
test('rejects incomplete ligand records and blank ligand coordinates',()=>{const lines=sdf.split('\n');lines[4]='          '+lines[4].slice(10);assert.throws(()=>validatePreparedComplex(pdb,lines.join('\n')),/coordinates/);assert.throws(()=>validatePreparedComplex(pdb,sdf.replace('M  END','')),/complete/);});

