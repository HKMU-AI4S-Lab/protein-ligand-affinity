// Browser plugin unavailable in this environment; use the installed Playwright runtime.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict'),path=require('node:path');
const pdbId=process.env.DOCKING_PDB_ID||'3PTB',stem=pdbId.toLowerCase(),hiv=pdbId==='1HSG';
const smiles=hiv?'CC(C)(C)NC(=O)[C@@H]1CN(Cc2cccnc2)CCN1C[C@@H](O)C[C@@H](Cc1ccccc1)C(=O)N[C@H]1c2ccccc2C[C@H]1O':'N=C(N)c1ccccc1';
(async()=>{
 const output=process.env.QA_OUTPUT_DIR||'artifacts/publication-20261017/browser';await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 page.on('request',r=>{if(r.url().includes('/api/docking'))requests.push(r.url());});
 page.on('worker',w=>console.log('WORKER',w.url()));
 try{
  await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:4321/protein-ligand-affinity/')+'topics/protein-ligand-docking/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.querySelector('#docking-pdb-id')?.disabled,null,{timeout:45000});
  assert(await page.evaluate(()=>crossOriginIsolated));
  await page.locator('#docking-pdb-id').fill(pdbId);await page.getByRole('button',{name:'Load structure',exact:true}).click();
  await page.getByText('Loaded: PDB '+pdbId,{exact:true}).waitFor({timeout:60000});
  if(hiv){await page.getByLabel('Chain A',{exact:true}).check();await page.getByLabel('Chain B',{exact:true}).check();}
  await page.locator('#docking-smiles').fill(smiles);await page.locator('#docking-region').selectOption('reference');await page.locator('#docking-reference').selectOption({label:hiv?'MK1 — chain B — residue 902':'BEN — chain A — residue 1'});
  await page.locator('.docking-settings summary').click();await page.locator('#docking-exhaustiveness').selectOption('1');await page.locator('#docking-modes').fill('3');
  await page.getByRole('button',{name:'Dock ligand'}).click();
  await page.waitForFunction(()=>document.querySelector('.docking-tool .result-title')||document.querySelector('.docking-tool [role="alert"]'),null,{timeout:180000});
  const alert=await page.locator('.docking-tool [role="alert"]').allTextContents();assert.equal(alert.length,0,alert.join('\n'));
  await page.getByRole('heading',{name:'AutoDock Vina docking result',exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Run data (JSON)',exact:true}).click();const download=await downloadPromise;await download.saveAs(path.join(output,stem+'-run.json'));
  const run=JSON.parse(await fs.readFile(path.join(output,stem+'-run.json'),'utf8'));assert.equal(run.method,'AutoDock Vina docking');assert(run.poses.length>0);assert(run.poses.every(p=>Number.isFinite(p.scores.energy)&&!('cnnScore' in p.scores)));assert.equal(requests.length,0);
  await page.locator('.docking-tool .bench-output').screenshot({path:path.join(output,'docking-desktop.png')});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'AutoDock Vina docking result',exact:true}).waitFor({timeout:45000});
  await page.getByRole('button',{name:'Score this pose',exact:true}).click();await page.locator('.docking-handoff').waitFor();
  await page.locator('.docking-handoff').getByRole('button',{name:'Score bound pose',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.docking-handoff .result-title')||document.querySelector('.docking-handoff [role="alert"]'),null,{timeout:180000});
  if(!hiv)assert.match(await page.locator('.docking-handoff [role="alert"]').innerText(),/tryptophan or histidine/);else{
  assert.equal(await page.locator('.docking-handoff [role="alert"]').count(),0,await page.locator('.docking-handoff').innerText());
  const scoringDownload=page.waitForEvent('download');await page.locator('.docking-handoff').getByRole('button',{name:'Result data (JSON)',exact:true}).click();await (await scoringDownload).saveAs(path.join(output,stem+'-scoring.json'));
  const scoring=JSON.parse(await fs.readFile(path.join(output,stem+'-scoring.json'),'utf8'));assert(scoring.outputs.every(o=>Number.isFinite(o.value)));
  const table=s=>s.slice(s.indexOf('\n')+1,s.indexOf('M  END')+6).trimEnd();assert.equal(table(scoring.structures.ligandSdf),table(run.poses[0].sdf));
  await page.screenshot({path:path.join(output,'docking-scoring.png'),fullPage:true});}

  // Upload and explicit box use the same real engine, including cancellation/retry.
  await fs.writeFile(path.join(output,stem+'.pdb'),run.input.proteinPdb);await fs.writeFile(path.join(output,'ligand.sdf'),run.poses[0].sdf);
  await page.getByRole('button',{name:'Upload a protein',exact:true}).click();await page.locator('#docking-protein').setInputFiles(path.join(output,stem+'.pdb'));if(hiv){await page.getByLabel('Chain A',{exact:true}).check();await page.getByLabel('Chain B',{exact:true}).check();}await page.locator('#docking-ligand-format').selectOption('sdf');await page.locator('#docking-sdf').setInputFiles(path.join(output,'ligand.sdf'));await page.locator('#docking-region').selectOption('box');
  for(const [i,axis] of ['X','Y','Z'].entries()){await page.locator('#dock-center-'+axis).fill(String(run.bindingRegion.center[i]));await page.locator('#dock-size-'+axis).fill(String(run.bindingRegion.size[i]));}
  await page.getByRole('button',{name:'Dock ligand'}).click();await page.locator('.docking-tool').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.docking-tool .result-title').count(),0);await page.waitForTimeout(300);assert.equal(page.workers().length,0,'Cancelled worker tree stops');
  await page.getByRole('button',{name:'Dock ligand'}).click();await page.waitForFunction(()=>document.querySelector('.docking-tool .result-title')||document.querySelector('.docking-tool [role="alert"]'),null,{timeout:180000});assert.equal(await page.locator('.docking-tool [role="alert"]').count(),0,await page.locator('.docking-tool').innerText());
  for(const label of ['Predicted poses (SDF)','Selected pose (SDF)','Prepared receptor (PDB)','Run summary (TXT)']){const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();await (await pending).saveAs(path.join(output,label.startsWith('Prepared')?'receptor.pdb':label.startsWith('Run')?'summary.txt':label.startsWith('Selected')?'selected.sdf':'poses.sdf'));}
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.docking-tool .result-title').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'docking-mobile.png')});
  if(!await page.locator('#docking-seed').isVisible())await page.locator('.docking-settings summary').click();
  await page.locator('#docking-seed').fill('2027');assert.equal(await page.locator('.docking-tool .result-title').count(),0);assert.equal(await page.getByRole('button',{name:'Run data (JSON)',exact:true}).count(),0);
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,errors,poses:run.poses.map(p=>({id:p.id,energy:p.scores.energy})),privateRequests:requests},null,2));assert.equal(errors.length,0,errors.join('\n'));console.log('PASS browser docking, JSON export, reload recovery and scoring handoff',run.poses.map(p=>p.scores.energy));
 }catch(e){console.log('STATUS',await page.locator('.docking-tool').innerText().catch(()=>''));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
