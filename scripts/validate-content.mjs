import {readFile,readdir,access,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {PredictorManifest,ResearchArtifact} from '../src/lib/research/contracts.mjs';
const verified=new Set();
async function verify(raw){const a=ResearchArtifact.parse(raw);if(!a.path||verified.has(a.path))return;const file='public/'+a.path;if((await stat(file)).size!==a.bytes)throw Error('Artifact size mismatch: '+a.path);const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==a.sha256)throw Error('Artifact hash mismatch: '+a.path);verified.add(a.path);}
for(const id of await readdir('public/research')){for(const filename of ['manifest.json','gradients-manifest.json']){let raw;try{raw=await readFile(`public/research/${id}/${filename}`,'utf8');}catch{continue;}const m=PredictorManifest.parse(JSON.parse(raw));await verify(m.artifact);for(const e of m.externalData)await verify(e.artifact);for(const e of m.examples){await verify(e.grid);if(e.structure)await verify(e.structure);if(e.protein)await verify(e.protein);if(e.explanation)await verify(e.explanation);}if(m.validation.status==='passed'&&(!m.validation.referenceSha256||m.validation.maxAbsError===undefined))throw Error('Passed status needs reference evidence');}}
for(const a of JSON.parse(await readFile('public/runtime/integrity.json','utf8')))await verify(a);
const chemistry=JSON.parse(await readFile('artifacts/chemistry-source-provenance.json','utf8'));
for(const a of chemistry.sources)await verify(a);
if(createHash('sha256').update(await readFile('public/runtime/openbabel/openbabel.wasm')).digest('hex')!==chemistry.wasmSha256)throw Error('Chemistry source record does not match the distributed runtime');
for(const path of ['public/models','public/images','src/content/works/logs','src/pages/demos/affinity.astro']){try{await access(path);}catch{continue;}throw Error('Legacy public content remains: '+path);}
for(const figure of JSON.parse(await readFile('artifacts/paper-figure-provenance.json','utf8')))await verify(figure.artifact);
for(const figure of JSON.parse(await readFile('artifacts/agima-figure-provenance.json','utf8'))){await verify(figure.artifact);if(createHash('sha256').update(await readFile(figure.source)).digest('hex')!==figure.sourceSha256)throw Error('AGIMA source mismatch: '+figure.source);}
for(const record of ['teaching-panel-provenance','molecular-panel-provenance']){const panels=JSON.parse(await readFile('artifacts/'+record+'.json','utf8'));
for(const asset of [...panels.inputs,...panels.outputs])if(createHash('sha256').update(await readFile(asset.path)).digest('hex')!==asset.sha256)throw Error('Teaching panel provenance mismatch: '+asset.path);}
const research=await readFile('src/data/research.ts','utf8')+await readFile('src/data/citations.mjs','utf8');for(const name of ['Deep learning on the fusion of chemical sequences and molecular grids','UniMolRep','Binding Affinity Prediction Based on Grid Representation and Deep Learning'])if(!research.includes(name))throw Error('Missing research content: '+name);
const workflow=JSON.parse(await readFile('artifacts/bap-workflow-provenance.json','utf8'));for(const asset of [workflow.protein,workflow.ligand,workflow.output]){const digest=createHash('sha256').update(await readFile(asset.path)).digest('hex');if(digest!==asset.sha256)throw Error('Workflow provenance mismatch: '+asset.path);}
for(const illustration of [workflow,...JSON.parse(await readFile('artifacts/method-illustration-provenance.json','utf8'))])for(const asset of [illustration.output,illustration.mobileOutput,...illustration.inputs]){const digest=createHash('sha256').update(await readFile(asset.path)).digest('hex');if(digest!==asset.sha256)throw Error('Illustration provenance mismatch: '+asset.path);}
console.log(`Research content and ${verified.size} artifact hashes validated.`);
