import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {siteBase} from '../deployment.config.mjs';
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const analysisTitles={'representing-molecules':'Explore your molecule','screening-molecules':'Screen a molecule','binding-affinity':'Score a bound complex','protein-ligand-docking':'Predict a binding pose'};
const builtFiles=await walk('dist'),html=builtFiles.filter(p=>p.endsWith('.html')),issues=[],checks=[];let links=0;
if(builtFiles.some(p=>p.startsWith('dist/figure-provenance/')))issues.push('Internal figure-generation records are published');
for(const file of html){const text=await readFile(file,'utf8');if(/Conceptual workflow based on|Method illustration based on|These study results describe|not performance estimates for|educational model outputs|Screenshot from|Explore More|Copy citation|Interactive demonstration|Live demonstration|Creating model session|checkpoint.transfer|publication gate|GridOnly|Molecular Grid Research|personal portfolio|BAPNet|Molecular Representations for Drug Discovery|playground|notebook/i.test(text))issues.push(file+': internal or retired content');for(const [,url] of text.matchAll(/(?:href|src)="([^"#]+)"/g)){if(/^(https?:|data:|blob:|mailto:)/.test(url))continue;const clean=decodeURIComponent(url.split(/[?#]/)[0]);if(!clean)continue;if(clean.startsWith('/')&&!clean.startsWith(siteBase)){issues.push(file+': path outside deployment base '+url);continue;}let p=clean.startsWith('/')?resolve('dist','.'+clean.slice(siteBase.length-1)):resolve(dirname(file),clean);try{const info=await stat(p);if(info.isDirectory())await stat(p+'/index.html');links++;}catch{issues.push(file+': missing '+url);}}
 if(text.includes('class="site-header')){if((text.match(/href="https:\/\/zzulc.github.io\/DebbyCV\/members.html"/g)||[]).length!==1)issues.push(file+': expected exactly one team link');const header=text.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0]||'';if(header.includes('>Methods</a>'))issues.push(file+': removed Methods navigation remains');}
 if(text.includes('class="site-header')&&/Project publications|Figure sources?(?: and reproducibility)?|This paper acknowledges|AGIMA-Score acknowledges|not AGIMA-Score|it is not a project research output|separately (?:credited|attributed)|verified (?:aspirin|ethanol|DL-FSG|native GNINA)|Input hashes, coordinate frames|No generated image supplies|not measurements of binding strength/i.test(text))issues.push(file+': internal editorial commentary remains');
 if(text.includes('class="site-header')&&/class="(?:figure-provenance|provenance-link|acknowledgement)"/.test(text))issues.push(file+': public verification panel remains');
 for(const [,anchor] of text.matchAll(/href="#([^"]+)"/g)){if(!text.includes('id="'+anchor+'"'))issues.push(file+': unresolved reference #'+anchor);}
 if(file.includes('/topics/')&&!file.includes('/explainability/')){
  const slug=Object.keys(analysisTitles).find(slug=>file.includes('/'+slug+'/'));
  if(!slug){issues.push(file+': unknown core method');continue;}
  const sections=slug==='protein-ligand-docking'?['experiment','idea','findings','connections','references']:slug==='binding-affinity'?['experiment','concept','occlusion','research','etdock','references']:['experiment','concept','research',...(slug==='screening-molecules'?['grad-cam']:[]),'references'];
  const positions=sections.map(id=>text.indexOf('id="'+id+'"'));
  if(positions.some(n=>n<0)||positions.some((n,i)=>i&&n<=positions[i-1]))issues.push(file+': topic sequence');
  if(!text.includes(analysisTitles[slug]))issues.push(file+': analysis title');
  if(/href="[^"]*topics\/explainability/.test(text)||text.includes('Model explainability'))issues.push(file+': fourth topic navigation');
  if(!text.includes('article-takeaway')||!text.includes('article-actions'))issues.push(file+': missing opening takeaway or evidence/analysis links');
  if(slug==='screening-molecules'&&!text.includes('teaching-cam'))issues.push(file+': missing screening Grad-CAM');
  if(slug==='binding-affinity'&&(!text.includes('teaching-occlusion')||!text.includes('representing-molecules/#affinity-findings')))issues.push(file+': missing affinity interpretation or evidence link');
  if(slug==='representing-molecules'&&(!text.includes('teaching-grid')||!text.includes('unimolrep-affinity-benchmarks.webp')))issues.push(file+': missing representation evidence');
  if(slug==='binding-affinity'){
   if(!text.includes('id="etdock"')||!text.includes(siteBase+'topics/protein-ligand-docking/')||!text.includes('10.1007/s11704-026-51026-x'))issues.push(file+': missing ETDock connection or source');
   if(text.includes('etdock-architecture.webp'))issues.push(file+': full ETDock article duplicates its dedicated research page');
   for(const id of ['agima-adjacency','agima-architecture','agima-scoring-benchmark','agima-feature-importance'])if(!text.includes(id+'.webp'))issues.push(file+': missing '+id);
   if(!text.includes('10.1371/journal.pcbi.1013074')||!text.includes('10.1186/s13321-021-00522-2')||!text.includes('The live tool uses'))issues.push(file+': missing project evidence or GNINA software credit');
   const articleBody=text.slice(0,text.indexOf('id="references"'));
   if(!articleBody.includes('GNINA'))issues.push(file+': live scoring model is not identified');
   if(!text.includes('https://creativecommons.org/licenses/by/4.0/'))issues.push(file+': missing paper figure licence credit');
   if(text.indexOf('id="grid-scoring"')<0||text.indexOf('id="grid-scoring"')>text.indexOf('id="research"'))issues.push(file+': score interpretation must precede related research');
  }
  checks.push(file+': '+sections.join(' → '));
 }
}
const home=await readFile('dist/index.html','utf8');
for(const label of ['Explore representations','Screen a molecule','Score a complex','Explore docking','From input to insight','Research on molecular structure and binding'])if(!home.includes(label))issues.push('Home: missing '+label);
if((home.match(/class="task-entry"/g)||[]).length!==4)issues.push('Home: expected exactly four method entries');
if(!home.includes('topics/protein-ligand-docking/')||!home.includes('etdock-pose-detail.webp'))issues.push('Home: missing ETDock method entry');
const taskSection=home.slice(home.indexOf('id="topics"'),home.indexOf('id="research"'));
const methodOrder=[...taskSection.matchAll(/data-method="([^"]+)"/g)].map(m=>m[1]);
if(JSON.stringify(methodOrder)!==JSON.stringify(['representations','screening','docking','binding-affinity']))issues.push('Home: original method order was changed');
if(!home.includes('https://journal.hep.com.cn/fcs/EN/10.1007/s11704-026-51026-x'))issues.push('ETDock: working publisher link missing');
const researchQuestions=['Represent molecular structure','Prioritise candidate compounds','Predict a binding pose','Learn from the binding interface'];
const researchSection=home.slice(home.indexOf('id="research"'));
const questionPositions=researchQuestions.map(label=>researchSection.indexOf(label));
if(questionPositions.some(n=>n<0)||questionPositions.some((n,i)=>i&&n<=questionPositions[i-1]))issues.push('Home: research questions are missing or out of order');
const etdockRoute=await readFile('dist/topics/protein-ligand-docking/index.html','utf8');
if(!etdockRoute.includes('docking-tool')||!etdockRoute.includes('GNINA')||/calculations are not yet available/.test(etdockRoute))issues.push('Docking: working tool and calculation-engine attribution required');
for(const value of ['etdock-architecture.webp','10.1007/s11704-026-51026-x',siteBase+'topics/binding-affinity/#research',siteBase+'topics/binding-affinity/#experiment'])if(!etdockRoute.includes(value))issues.push('ETDock: missing evidence or onward connection '+value);
if(/http-equiv="refresh"/.test(etdockRoute))issues.push('ETDock: method route must render its article');
for(const date of ['5 January 2026','15 May 2027'])if(!etdockRoute.includes(date))issues.push('ETDock: missing publication date '+date);
const etdockLegacy=await readFile('dist/works/etdock/index.html','utf8');
if(!etdockLegacy.includes('0;url='+siteBase+'topics/protein-ligand-docking/'))issues.push('ETDock: legacy research route must reach the method');
for(const file of html)if((await readFile(file,'utf8')).includes('·'))issues.push(file+': unwanted middle-dot separator');
if(home.indexOf('id="topics"')>home.indexOf('id="research"'))issues.push('Home: tools must precede research');
if(/Experimental local preview:|Release checklist|publication gate/.test(home))issues.push('Home: internal status in visitor journey');
const report={date:new Date().toISOString(),base:siteBase,pages:html.length,localReferences:links,checks,issues};await writeFile(process.env.QA_OUTPUT_DIR?resolve(process.env.QA_OUTPUT_DIR,'editorial-content-audit.json'):'artifacts/editorial-content-audit.json',JSON.stringify(report,null,2));console.log(report);if(issues.length)process.exit(1);

const scoring=await readFile('public/illustrations/bap-workflow.svg','utf8');if(/occlusion|masked/i.test(scoring))throw Error('Occlusion remains inside BAP workflow');
