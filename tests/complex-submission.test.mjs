import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractComplexLigand,inspectBindingPartners,inspectComplexPdb,inspectReceptorPdb,selectComplexReceptor,selectReceptorChains,validateBindingPartners,validateComplexLabels,validateLigandPose} from '../src/lib/research/complex-submission.mjs';
import {canonicalizeSdfElements,validatePreparedComplex} from '../src/lib/research/prepared-inputs.mjs';

const pdb=readFileSync('public/research/gnina-crossdock/1hsg-protein.pdb','utf8');
const sdf=readFileSync('public/research/gnina-crossdock/1hsg.sdf','utf8');
const complex=readFileSync('tests/fixtures/1hsg.pdb','utf8');
const modifiedComplex=readFileSync('tests/fixtures/1hvr.pdb','utf8');
const hemeComplex=readFileSync('tests/fixtures/4hhb-binding-partners.pdb','utf8');

test('explicit chain choice keeps the prepared ligand coordinates usable',()=>{
 const inspection=inspectReceptorPdb(pdb);assert.deepEqual(inspection.chains,['A','B']);
 const selected=selectReceptorChains(pdb,['A','B']);
 assert.equal(validatePreparedComplex(selected,sdf).records.length,inspection.atomCount);
 assert.ok(selected.split('\n').every(line=>!line||line==='END'||line.startsWith('ATOM  ')));
});
test('a missing chain, unseparated ligand and invalid provenance are rejected',()=>{
 assert.throws(()=>selectReceptorChains(pdb,['Z']),/Select at least one/);
 assert.throws(()=>inspectReceptorPdb(pdb+'\nHETATM    1  C1  LIG A   1      13.000  22.000   5.000  1.00  0.00           C\n'),/HETATM/);
 assert.throws(()=>validateComplexLabels('BAD','MK1'),/PDB ID/);
 assert.throws(()=>validateComplexLabels('1HSG',''),/ligand ID/);
 assert.deepEqual(validateComplexLabels('1hsg','MK1'),{pdbId:'1HSG',ligandLabel:'MK1'});
});

test('a whole PDB complex yields explicit chain and bound-ligand choices',()=>{
 const inspection=inspectComplexPdb(complex);
 assert.deepEqual(inspection.chains,['A','B']);
 assert.deepEqual(inspection.ligands.map(item=>item.name),['MK1']);
 const ligand=extractComplexLigand(complex,inspection.ligands[0].key);
 assert.equal(validateLigandPose(sdf,ligand),true);
 assert.equal(validatePreparedComplex(selectComplexReceptor(complex,inspection.chains),sdf).records.length,inspection.proteinAtomCount);
 assert.throws(()=>selectComplexReceptor(complex,[]),/at least one protein chain/);
 assert.throws(()=>extractComplexLigand(complex,'OTHER|A|1| '),/Choose a ligand/);
 const moved=sdf.split('\n');moved[4]='99.0000'.padStart(10)+moved[4].slice(10);
 assert.throws(()=>validateLigandPose(moved.join('\n'),ligand),/coordinates do not match/);
});

test('modified protein residues are retained in the receptor, not offered as ligands',()=>{
 const inspection=inspectComplexPdb(modifiedComplex);
 assert.deepEqual(inspection.ligands.map(item=>item.name),['XK2']);
 const receptor=selectComplexReceptor(modifiedComplex,['A']);
 assert.match(receptor,/ATOM  .* CSO A  67/);
 assert.doesNotMatch(receptor,/HETATM/);
});

test('separate ligand instances require an explicit selection',()=>{
 const clone=complex.split('\n').filter(line=>line.startsWith('HETATM')&&line.slice(17,20)==='MK1').map(line=>
  line.slice(0,6)+String(Number(line.slice(6,11))+10000).padStart(5)+line.slice(11,22)+' 903'+line.slice(26));
 const doubled=complex+'\n'+clone.join('\n');
 const choices=inspectComplexPdb(doubled).ligands;
 assert.equal(choices.length,2);
 assert.deepEqual(choices.map(item=>item.sequence),['902','903']);
 const selected=extractComplexLigand(doubled,choices[1].key);
 assert.equal(selected.split('\n').filter(line=>line.startsWith('HETATM')).length,choices[1].atomCount);
 assert.ok(selected.split('\n').filter(line=>line.startsWith('HETATM')).every(line=>line.slice(22,26).trim()==='903'));
});

test('4HHB heme gives nearby-chain guidance and a clear unsupported-cofactor error',()=>{
 const ligand=inspectComplexPdb(hemeComplex).ligands[0];
 assert.equal(ligand.name,'HEM');
 assert.deepEqual(inspectBindingPartners(hemeComplex,ligand.key).nearbyChains,['B']);
 assert.throws(()=>validateBindingPartners(hemeComplex,['D'],ligand.key),/Choose nearby chain B/);
 assert.throws(()=>validateBindingPartners(hemeComplex,['B'],ligand.key),/Heme is a bound cofactor/);
});

test('uppercase two-letter SDF elements are normalized without moving atoms',()=>{
 const lines=sdf.split(/\r?\n/),count=Number(lines[3].slice(0,3));
 lines[4]=lines[4].slice(0,31)+'FE '+lines[4].slice(34);
 const normalized=canonicalizeSdfElements(lines.join('\n'),count).split('\n');
 assert.equal(normalized[4].slice(0,31),lines[4].slice(0,31));
 assert.equal(normalized[4].slice(31,34),'Fe ');
 assert.equal(normalized[5],lines[5]);
});

test('ligand pose matching rejects different elements at unchanged coordinates',()=>{
 const ligand=extractComplexLigand(complex,inspectComplexPdb(complex).ligands[0].key);
 const lines=sdf.split(/\r?\n/);lines[4]=lines[4].slice(0,31)+'F  '+lines[4].slice(34);
 assert.throws(()=>validateLigandPose(lines.join('\n'),ligand),/do not match/);
});

test('additional binding-site components cannot be silently stripped to obtain a score',()=>{
 const ligand=inspectComplexPdb(complex).ligands[0];
 const atom=complex.split(/\r?\n/).find(line=>line.startsWith('HETATM')&&line.slice(17,20)==='MK1');
 const zinc='HETATM99999 ZN    ZN Z 999'+atom.slice(26,76)+'ZN';
 const withCofactor=complex+'\n'+zinc+'\n';
 assert.throws(()=>validateBindingPartners(withCofactor,['A','B'],ligand.key),/additional binding-site components/);
});
