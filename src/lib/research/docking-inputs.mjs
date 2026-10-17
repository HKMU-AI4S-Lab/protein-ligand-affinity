/** @param {string} value @param {{signal?:AbortSignal,fetcher?:typeof globalThis.fetch}} [options] */
export async function fetchDockingPdb(value,{signal,fetcher=globalThis.fetch}={}){
 const pdbId=value.trim().toUpperCase();
 if(!/^[0-9][A-Z0-9]{3}$/.test(pdbId))throw Error('Enter a four-character PDB ID, beginning with a digit.');
 const downloadUrl=`https://files.rcsb.org/download/${pdbId}.pdb`;
 let response;try{response=await fetcher(downloadUrl,{signal});}catch(error){if(signal?.aborted)throw error;throw Error('The PDB structure could not be loaded. Check your connection and try again.');}
 if(!response.ok)throw Error(response.status===404?'No PDB-format structure was found for that ID. Check the ID or upload a compatible protein PDB.':'The PDB structure could not be loaded. Try again.');
 if(Number(response.headers.get('content-length'))>5_000_000)throw Error('Choose a protein PDB no larger than 5 MB.');
 let text;try{text=await response.text();}catch(error){if(signal?.aborted)throw error;throw Error('The PDB structure could not be loaded. Check your connection and try again.');}
 signal?.throwIfAborted();
 const inspection=inspectDockingPdb(text);
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 signal?.throwIfAborted();
 return {text,inspection,source:{type:'pdb',provider:'RCSB Protein Data Bank',pdbId,downloadUrl,retrievedAt:new Date().toISOString(),sha256}};
}
export function inspectDockingPdb(text){
 if(!text||new TextEncoder().encode(text).length>5_000_000)throw Error('Choose a protein PDB no larger than 5 MB.');
 const lines=text.split(/\r?\n/);
 if(lines.filter(line=>line.startsWith('MODEL ')).length>1)throw Error('Choose one PDB model before docking.');
 const atoms=lines.filter(line=>line.startsWith('ATOM  '));
 if(!atoms.length||atoms.length>20_000)throw Error('Supply a PDB with 1–20,000 protein atoms.');
 if(atoms.some(line=>line[16]!==' '))throw Error('Resolve alternate atom locations before docking.');
 const chains=[...new Set(atoms.map(line=>line[21]||' '))].sort(),groups=new Map();
 for(const line of lines.filter(line=>line.startsWith('HETATM')&&!['HOH','WAT','DOD'].includes(line.slice(17,20).trim())&&line.slice(76,78).trim()!=='H')){
  const key=[line.slice(17,20).trim(),line[21]||' ',line.slice(22,26).trim(),line[26]||' '].join('|');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(line);
 }
 const references=[...groups].filter(([,rows])=>rows.length>=5).map(([key,rows])=>{
  const [name,chain,sequence]=key.split('|'),points=rows.map(line=>[30,38,46].map(i=>Number(line.slice(i,i+8))));
  const min=[0,1,2].map(d=>Math.min(...points.map(p=>p[d]))),max=[0,1,2].map(d=>Math.max(...points.map(p=>p[d])));
  return {key,label:`${name} — chain ${chain.trim()||'unlabelled'} — residue ${sequence}`,center:min.map((v,i)=>(v+max[i])/2),size:min.map((v,i)=>Math.max(12,max[i]-v+8))};
 });
 return {chains,references,atomCount:atoms.length};
}
export function freezeDockingRun(run){
 if(run?.schemaVersion!==1||!['GNINA docking','AutoDock Vina docking'].includes(run.method)||!run.poses?.length||!run.structures?.receptorPdb)throw Error('The completed docking result is incomplete. Retry the calculation.');
 const copy=structuredClone(run);
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 return freeze(copy);
}
export async function verifyDockingRun(run){
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 for(const [text,expected] of [[run.structures.receptorPdb,run.identity.preparedReceptorSha256],[run.structures.ligandPosesSdf,run.identity.posesSha256],[run.input.proteinPdb,run.identity.proteinSha256],[run.input.ligand.text,run.identity.ligandSha256],...run.poses.map(p=>[p.sdf,p.sdfSha256])]){
  if(await hash(text)!==expected)throw Error('The result download was incomplete. Retry to retrieve this run.');
 }
 if(run.input.proteinSource?.sha256&&run.input.proteinSource.sha256!==run.identity.proteinSha256)throw Error('The downloaded structure identity does not match this run. Reload the structure and retry.');
 return freezeDockingRun(run);
}
export function dockingPoseHandoff(run,poseId){
 const pose=run?.poses?.find(p=>p.id===poseId);
 if(!pose)throw Error('Choose a completed docking pose before scoring.');
 return {receptorPdb:run.structures.receptorPdb,ligandSdf:pose.sdf,context:{source:run.method+' pose',dockingRunId:run.id,poseId:pose.id,chains:run.input.chains,proteinSha256:run.identity.preparedReceptorSha256,ligandSha256:pose.sdfSha256,pose:'Selected predicted coordinates unchanged; no conformer generation or repositioning'}};
}
