import {inspectDockingPdb} from './docking-inputs.mjs';
export function browserDockingRegion(input){
 const found=inspectDockingPdb(input.proteinPdb);
 if(!input.chains?.length||input.chains.some(c=>!found.chains.includes(c)))throw Error('Choose valid protein chains.');
 const region=input.region.mode==='reference'?found.references.find(r=>r.key===input.region.referenceKey):input.region;
 if(!region)throw Error('Choose a reference ligand in this structure.');
 const {center,size}=region;
 if(center?.length!==3||size?.length!==3||[...center,...size].some(x=>!Number.isFinite(x))||center.some(x=>Math.abs(x)>9999)||size.some(x=>x<8||x>40)||size.reduce((a,b)=>a*b,1)>32000)throw Error('Use finite box coordinates, dimensions of 8–40 Å and volume at most 32,000 Å³.');
 const s=input.settings;
 if(!Number.isInteger(s.seed)||s.seed<1||s.seed>2147483647||![1,4,8,16,32].includes(s.exhaustiveness)||!Number.isInteger(s.numModes)||s.numModes<1||s.numModes>9)throw Error('Choose valid search settings.');
 return {mode:input.region.mode,referenceKey:input.region.referenceKey,center:[...center],size:[...size]};
}
export function pdbqtAtoms(text){
 const atoms=text.split(/\r?\n/).filter(l=>/^(ATOM  |HETATM)/.test(l)).map(l=>({serial:Number(l.slice(6,11)),xyz:[30,38,46].map(i=>l.slice(i,i+8).trim()?Number(l.slice(i,i+8)):NaN),type:l.slice(77).trim()}));
 if(!atoms.length||atoms.some(a=>!Number.isInteger(a.serial)||a.xyz.some(x=>!Number.isFinite(x)))||new Set(atoms.map(a=>a.serial)).size!==atoms.length)throw Error('Invalid or ambiguous PDBQT atom mapping.');
 return atoms;
}
// Preserve the original V2000 bond/charge/stereo records; replace coordinates only.
export function vinaPosesToSdf(output,template,preparedAtoms){
 const lines=template.trimEnd().split(/\r?\n/),count=Number(lines[3]?.slice(0,3));
 if(!count||!lines[3].includes('V2000'))throw Error('A mapped V2000 ligand is required.');
 const prepared=new Map(preparedAtoms.map(a=>[a.serial,a]));
 if(Array.from({length:count},(_,i)=>i+1).some(id=>!prepared.has(id)))throw Error('Prepared ligand atom indices changed.');
 const models=output.split(/^MODEL\s+\d+\s*$/m).slice(1);
 if(!models.length)throw Error('AutoDock Vina returned no predicted poses.');
 return models.map((model,i)=>{
  const score=model.match(/REMARK VINA RESULT:\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if(!score||score.slice(1).some(s=>!Number.isFinite(Number(s))))throw Error('A predicted pose is missing its Vina energy.');
  const atoms=pdbqtAtoms(model),map=new Map(atoms.map(a=>[a.serial,a]));
  if(map.size!==prepared.size||atoms.some(a=>a.type!==prepared.get(a.serial)?.type))throw Error('Predicted pose atom identities changed.');
  const out=[...lines];out[0]='AutoDock Vina pose '+(i+1);
  for(let n=0;n<count;n++){const atom=map.get(n+1);if(!atom||atom.xyz.some(v=>Math.abs(v)>=10000))throw Error('Predicted pose has invalid coordinates.');out[n+4]=atom.xyz.map(v=>v.toFixed(4).padStart(10)).join('')+out[n+4].slice(30);}
  const end=out.indexOf('M  END');if(end<0)throw Error('Invalid ligand connection table.');
  const sdf=out.slice(0,end+1).join('\n')+`\n> <VINA_ENERGY_KCAL_MOL>\n${score[1]}\n\n$$$$\n`;
  return {id:'pose-'+String(i+1).padStart(2,'0'),rank:i+1,scores:{energy:Number(score[1]),rmsdLower:Number(score[2]),rmsdUpper:Number(score[3])},sdf};
 });
}
