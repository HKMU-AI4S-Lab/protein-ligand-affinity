import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {siteBase} from '../deployment.config.mjs';
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const analysisTitles={'representing-molecules':'Representation analysis','screening-molecules':'Screening analysis','binding-affinity':'Affinity scoring'};
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
  const sections=['concept','research',...(slug==='screening-molecules'?['grad-cam']:slug==='binding-affinity'?['occlusion']:[]),'experiment','references'];
  const positions=sections.map(id=>text.indexOf('id="'+id+'"'));
  if(positions.some(n=>n<0)||positions.some((n,i)=>i&&n<=positions[i-1]))issues.push(file+': topic sequence');
  if(!text.includes(analysisTitles[slug]))issues.push(file+': analysis title');
  if(/href="[^"]*topics\/explainability/.test(text)||text.includes('Model explainability'))issues.push(file+': fourth topic navigation');
  if(!text.includes('article-takeaway')||!text.includes('article-actions'))issues.push(file+': missing opening takeaway or evidence/analysis links');
  if(slug==='screening-molecules'&&!text.includes('teaching-cam'))issues.push(file+': missing screening Grad-CAM');
  if(slug==='binding-affinity'&&(!text.includes('teaching-occlusion')||!text.includes('representing-molecules/#affinity-findings')))issues.push(file+': missing affinity interpretation or evidence link');
  if(slug==='representing-molecules'&&(!text.includes('teaching-grid')||!text.includes('unimolrep-affinity-benchmarks.webp')))issues.push(file+': missing representation evidence');
  if(slug==='binding-affinity'){
   for(const id of ['agima-adjacency','agima-architecture','agima-scoring-benchmark','agima-feature-importance'])if(!text.includes(id+'.webp'))issues.push(file+': missing '+id);
   if(!text.includes('10.1371/journal.pcbi.1013074')||!text.includes('10.1186/s13321-021-00522-2')||!text.includes('a molecular docking package developed by McNutt and colleagues'))issues.push(file+': missing project evidence or GNINA software credit');
   const articleBody=text.slice(0,text.indexOf('id="references"'));
   if((articleBody.match(/McNutt/g)||[]).length!==1)issues.push(file+': GNINA authorship should be introduced once');
   if(!text.includes('https://creativecommons.org/licenses/by/4.0/'))issues.push(file+': missing paper figure licence credit');
   if(text.indexOf('id="grid-scoring"')<text.indexOf('id="research"'))issues.push(file+': external exercise precedes own research');
  }
  checks.push(file+': '+sections.join(' → '));
 }
}
const home=await readFile('dist/index.html','utf8');if(/class="(?:wordmark|chapter-number)"|Scientific topics|View topic/.test(home))issues.push('Home: retired labels');for(const label of ['Explore representations','Explore screening','Explore affinity prediction'])if(!home.includes(label))issues.push('Home: missing '+label);if((home.match(/class="topic-row(?: [^"]*)?"/g)||[]).length!==3)issues.push('Home: expected exactly three methods');if(/Explore explainability|Model explainability/.test(home))issues.push('Home: retired fourth method');if(!home.includes('agima-interface.webp')||home.includes('illustrations/bap-workflow.svg'))issues.push('Home: BAP must feature project research');
if(home.includes('project-kicker')||home.includes('Molecular representations · Deep learning'))issues.push('Home: retired keyword tagline');
if(!home.includes('This website presents our research')||!home.includes('About the project'))issues.push('Home: missing website introduction or project abstract');
if(home.includes('fds2324_abstract.html'))issues.push('Home: removed official project outline link is still present');
const report={date:new Date().toISOString(),base:siteBase,pages:html.length,localReferences:links,checks,issues};await writeFile(process.env.QA_OUTPUT_DIR?resolve(process.env.QA_OUTPUT_DIR,'editorial-content-audit.json'):'artifacts/editorial-content-audit.json',JSON.stringify(report,null,2));console.log(report);if(issues.length)process.exit(1);

const scoring=await readFile('public/illustrations/bap-workflow.svg','utf8');if(/occlusion|masked/i.test(scoring))throw Error('Occlusion remains inside BAP workflow');
