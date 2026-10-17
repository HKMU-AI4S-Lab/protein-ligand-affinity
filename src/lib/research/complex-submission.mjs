/** Inspect a prepared, protein-only receptor before accepting local structure files. */
export function inspectReceptorPdb(text){
 if(!text||text.length>5_000_000)throw Error('Provide a prepared receptor PDB no larger than 5 MB.');
 const lines=text.split(/\r?\n/),atoms=lines.filter(line=>line.startsWith('ATOM  '));
 if(lines.some(line=>line.startsWith('HETATM')))throw Error('Remove ligand, waters and other HETATM records from the receptor PDB; supply the bound ligand separately as SDF.');
 if(lines.filter(line=>line.startsWith('MODEL ')).length>1)throw Error('Choose one PDB model before submission.');
 if(!atoms.length||atoms.length>20_000)throw Error('The receptor must contain 1–20,000 protein atom records.');
 const chains=[...new Set(atoms.map(line=>line[21]||' '))].sort();
 return {chains,atomCount:atoms.length};
}

/** Deliberately retain only the chosen ATOM coordinates; no ligand/cofactor is hidden. */
export function selectReceptorChains(text,selected){
 const {chains}=inspectReceptorPdb(text);
 if(!Array.isArray(selected)||!selected.length||selected.some(chain=>!chains.includes(chain)))throw Error('Select at least one chain present in the receptor PDB.');
 const chosen=new Set(selected),atoms=text.split(/\r?\n/).filter(line=>line.startsWith('ATOM  ')&&chosen.has(line[21]||' '));
 if(!atoms.length)throw Error('The selected receptor chains contain no atoms.');
 return atoms.join('\n')+'\nEND\n';
}

export function validateComplexLabels(pdbId,ligandLabel){
 const id=pdbId.trim().toUpperCase(),ligand=ligandLabel.trim();
 if(id&&!/^[0-9][A-Z0-9]{3}$/.test(id))throw Error('A PDB ID must have four characters and begin with a digit.');
 if(!ligand||ligand.length>40||/[\x00-\x1f<>]/.test(ligand))throw Error('Enter a ligand ID or name (1–40 printable characters).');
 return {pdbId:id||null,ligandLabel:ligand};
}

const water=new Set(['HOH','WAT','DOD']);
const atomLine=line=>line.startsWith('ATOM  ');
const heteroLine=line=>line.startsWith('HETATM');
const selectedLocation=line=>line[16]===' '||line[16]==='A';
const ligandKey=line=>[line.slice(17,20).trim(),line[21]||' ',line.slice(22,26).trim(),line[26]||' '].join('|');
const aminoAcids=new Set(['ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE','LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL']);
function modifiedProteinKeys(lines){
 return new Set(lines.filter(line=>line.startsWith('MODRES')&&aminoAcids.has(line.slice(24,27).trim())).map(line=>[
  line.slice(12,15).trim(),line[16]||' ',line.slice(18,22).trim(),line[22]||' '
 ].join('|')));
}

/** Identify the protein chains and individually placed ligands in a whole PDB complex. */
export function inspectComplexPdb(text){
 if(!text||text.length>5_000_000)throw Error('Choose a PDB complex no larger than 5 MB.');
 const lines=text.split(/\r?\n/);
 if(lines.filter(line=>line.startsWith('MODEL ')).length>1)throw Error('This structure has multiple models. Choose a single-model PDB complex.');
 const modified=modifiedProteinKeys(lines);
 const protein=lines.filter(line=>selectedLocation(line)&&(atomLine(line)||(heteroLine(line)&&modified.has(ligandKey(line)))));
 if(!protein.length||protein.length>20_000)throw Error('The complex needs 1–20,000 protein atoms.');
 const chains=[...new Set(protein.map(line=>line[21]||' '))].sort();
 const groups=new Map();
 for(const line of lines){
  if(!heteroLine(line)||!selectedLocation(line)||water.has(line.slice(17,20).trim())||modified.has(ligandKey(line)))continue;
  const key=ligandKey(line);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(line);
 }
 const ligands=[...groups].filter(([,atoms])=>atoms.filter(line=>line.slice(76,78).trim().toUpperCase()!=='H').length>=5).map(([key,atoms])=>{
  const [name,chain,sequence,insertion]=key.split('|');
  return {key,name,chain,sequence,insertion,atomCount:atoms.length,label:`${name} — chain ${chain===' '?'unlabelled':chain} — residue ${sequence}${insertion===' '?'':insertion}`};
 });
 if(!ligands.length)throw Error('No bound ligand was found. Use a PDB complex with a ligand recorded as HETATM.');
 return {chains,ligands,proteinAtomCount:protein.length};
}

export function selectComplexReceptor(text,selected){
 const {chains}=inspectComplexPdb(text);
 if(!Array.isArray(selected)||!selected.length||selected.some(chain=>!chains.includes(chain)))throw Error('Choose at least one protein chain.');
 const lines=text.split(/\r?\n/),modified=modifiedProteinKeys(lines),chosen=new Set(selected);
 const atoms=lines.filter(line=>selectedLocation(line)&&chosen.has(line[21]||' ')&&(atomLine(line)||(heteroLine(line)&&modified.has(ligandKey(line)))));
 return atoms.map(line=>heteroLine(line)?'ATOM  '+line.slice(6):line).join('\n')+'\nEND\n';
}

export function extractComplexLigand(text,key){
 const {ligands}=inspectComplexPdb(text);
 if(!ligands.some(ligand=>ligand.key===key))throw Error('Choose a ligand found in this complex.');
 const lines=text.split(/\r?\n/),atoms=lines.filter(line=>heteroLine(line)&&selectedLocation(line)&&ligandKey(line)===key);
 const serials=new Set(atoms.map(line=>line.slice(6,11).trim()));
 const bonds=lines.filter(line=>line.startsWith('CONECT')).map(line=>{
  const parts=line.slice(6).match(/.{1,5}/g)?.map(part=>part.trim()).filter(Boolean)||[];
  return serials.has(parts[0])?'CONECT'+parts.filter(part=>serials.has(part)).map(part=>part.padStart(5)).join(''):'';
 }).filter(line=>line.length>11);
 return [...atoms,...bonds,'END'].join('\n')+'\n';
}

/** Check the chosen protein and ligand before downloading or scoring a pose. */
export function inspectBindingPartners(text,key){
 const {chains,ligands}=inspectComplexPdb(text),ligand=ligands.find(item=>item.key===key);
 if(!ligand)throw Error('Choose a ligand found in this complex.');
 const points=text.split(/\r?\n/).filter(line=>heteroLine(line)&&selectedLocation(line)&&ligandKey(line)===key)
  .filter(line=>line.slice(76,78).trim().toUpperCase()!=='H')
  .map(line=>[30,38,46].map(start=>Number(line.slice(start,start+8))));
 const closest=Object.fromEntries(chains.map(chain=>[chain,Infinity]));
 const lines=text.split(/\r?\n/),modified=modifiedProteinKeys(lines);
 for(const line of lines){
  if(!(atomLine(line)||(heteroLine(line)&&modified.has(ligandKey(line))))||!selectedLocation(line)||!((line[21]||' ') in closest)||line.slice(76,78).trim().toUpperCase()==='H')continue;
  const chain=line[21]||' ',xyz=[30,38,46].map(start=>Number(line.slice(start,start+8)));
  for(const point of points){const distance=xyz.reduce((sum,value,i)=>sum+(value-point[i])**2,0);if(distance<closest[chain])closest[chain]=distance;}
 }
 const nearbyChains=chains.filter(chain=>closest[chain]<64).sort((a,b)=>closest[a]-closest[b]);
 const omitted=new Set();
 for(const line of lines){
  if(!heteroLine(line)||!selectedLocation(line)||ligandKey(line)===key||modified.has(ligandKey(line))||water.has(line.slice(17,20).trim())||line.slice(76,78).trim().toUpperCase()==='H')continue;
  const xyz=[30,38,46].map(start=>Number(line.slice(start,start+8)));
  if(points.some(point=>xyz.reduce((sum,value,i)=>sum+(value-point[i])**2,0)<64))omitted.add(`${line.slice(17,20).trim()} ${line[21]}${line.slice(22,26).trim()}`);
 }
 const unsupportedReason=ligand.name==='HEM'?'Heme is a bound cofactor. This tool cannot give a reliable affinity estimate for heme; choose a complex with a bound small-molecule ligand.':omitted.size?`The binding site also contains ${[...omitted].join(', ')} within 8 Å of the ligand. This tool cannot retain these additional binding-site components for scoring. Choose another complex; do not remove them to force a score.`:null;
 return {nearbyChains,unsupportedReason};
}

export function validateBindingPartners(text,selectedChains,key){
 if(!Array.isArray(selectedChains)||!selectedChains.length)throw Error('Choose at least one protein chain.');
 const {chains}=inspectComplexPdb(text);
 if(selectedChains.some(chain=>!chains.includes(chain)))throw Error('Choose protein chains found in this complex.');
 const advice=inspectBindingPartners(text,key);
 if(!selectedChains.some(chain=>advice.nearbyChains.includes(chain))){
  const names=advice.nearbyChains.map(chain=>chain===' '?'unlabelled':chain).join(', ');
  throw Error(names?`The selected protein chains are too far from this ligand. Choose nearby chain ${names}.`:'No protein chain lies within 8 Å of this ligand. Choose another bound ligand or complex.');
 }
 if(advice.unsupportedReason)throw Error(advice.unsupportedReason);
 return advice;
}

/** Ensure an SDF pose belongs to the chosen PDB ligand, not merely to the same component name. */
export function validateLigandPose(sdfText,ligandPdb){
 const lines=sdfText.split(/\r?\n/),count=Number(lines[3]?.slice(0,3));
 if(!Number.isInteger(count)||count<1||count>500||lines.length<4+count)throw Error('The selected ligand could not be read as a bound-pose SDF.');
 const sdfAtoms=lines.slice(4,4+count).filter(line=>line.slice(31,34).trim().toUpperCase()!=='H');
 const pdbAtoms=ligandPdb.split(/\r?\n/).filter(heteroLine).filter(line=>line.slice(76,78).trim().toUpperCase()!=='H');
 const coords=(atom,starts,width)=>starts.map(start=>Number(atom.slice(start,start+width))).map(value=>Math.round(value*100));
 const sdfPoints=sdfAtoms.map(line=>line.slice(31,34).trim().toUpperCase()+':'+coords(line,[0,10,20],10).join(',')).sort();
 const pdbPoints=pdbAtoms.map(line=>(line.slice(76,78).trim()||line.slice(12,16).replace(/[0-9]/g,'').trim().slice(0,1)).toUpperCase()+':'+coords(line,[30,38,46],8).join(',')).sort();
 if(!pdbPoints.length||sdfPoints.length!==pdbPoints.length||sdfPoints.some((point,i)=>point!==pdbPoints[i]))throw Error('The ligand SDF coordinates do not match the selected ligand in the complex.');
 return true;
}
