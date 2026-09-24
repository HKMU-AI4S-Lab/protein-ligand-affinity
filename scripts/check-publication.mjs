import {readFile} from 'node:fs/promises';
import {PredictorManifest} from '../src/lib/research/contracts.mjs';
const issues=[];
for(const name of ['fusion-aofb','gnina-crossdock'])for(const filename of ['manifest.json','gradients-manifest.json']){let m;try{m=PredictorManifest.parse(JSON.parse(await readFile(`public/research/${name}/${filename}`,'utf8')));}catch{issues.push(name+'/'+filename+': required validated manifest missing or invalid');continue;}if(!m.redistributionApproved)issues.push(name+'/'+filename+': redistribution approval pending');if(m.validation.status!=='passed')issues.push(name+'/'+filename+': scientific validation pending');const artifacts=[m.artifact,...m.externalData.map(e=>e.artifact),...m.examples.flatMap(e=>[e.grid,e.structure,e.protein,e.explanation].filter(Boolean))];for(const a of artifacts)if(a.bytes>10_000_000&&!a.url)issues.push(name+': large artifact needs an immutable Hugging Face URL: '+a.path);}
try{const figures=JSON.parse(await readFile('artifacts/paper-figure-provenance.json','utf8'));for(const f of figures)if(f.redistributionApproved!==true)issues.push(f.id+': paper figure redistribution review pending');}catch{issues.push('Paper figure provenance and redistribution review are required');}
let release;try{release=JSON.parse(await readFile('docs/release-approval.json','utf8'));}catch{release={};}
if(release.chemistryRuntimeRedistributionApproved!==true)issues.push('OpenBabel WASM licence/source-distribution review pending');
if(release.manualPublicationApproved!==true)issues.push('Manual publication approval is required');
if(issues.length){console.error([...new Set(issues)].join('\n'));process.exit(1);}console.log('Publication gate passed.');
