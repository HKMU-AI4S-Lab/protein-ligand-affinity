function coordinate(field){const value=field.trim();return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)?Number(value):NaN;}
export function validatePreparedComplex(pdbText,sdfText){
  if(!pdbText||!sdfText||pdbText.length>5_000_000||sdfText.length>500_000)throw Error('Provide one prepared receptor PDB (≤5 MB) and one ligand SDF pose (≤0.5 MB).');
  const pdbLines=pdbText.split(/\r?\n/),models=pdbLines.filter(line=>line.startsWith('MODEL '));
  if(models.length>1)throw Error('Multiple PDB models are unsupported; provide one prepared receptor model.');
  const records=pdbLines.filter(line=>/^(ATOM  |HETATM)/.test(line));
  if(!records.length||records.length>20_000)throw Error('The receptor must contain 1–20,000 atom records.');
  const identifiers=new Set();
  for(const line of records){
    if(line.length<54||['HOH','WAT','DOD'].includes(line.slice(17,20).trim()))throw Error('Remove waters and supply a prepared receptor PDB.');
    if(![' ','A'].includes(line[16]))throw Error('Resolve alternate receptor atom locations before uploading.');
    const key=line.slice(12,16)+line.slice(17,27);
    if(identifiers.has(key))throw Error('Duplicate or alternate receptor atom positions are unsupported.');
    identifiers.add(key);
    const xyz=[30,38,46].map(start=>coordinate(line.slice(start,start+8)));
    if(xyz.some(v=>!Number.isFinite(v)||Math.abs(v)>1e5))throw Error('Invalid receptor coordinates.');
  }
  const sections=sdfText.split(/^\$\$\$\$\s*$/m);
  if(sections.length>2||sections.slice(1).some(s=>s.trim()))throw Error('Provide exactly one SDF molecule and one prepared pose.');
  const ligand=sections[0],lines=ligand.split(/\r?\n/),counts=lines[3]||'';
  if(/V3000|M  V30/.test(ligand)||!/^ *[0-9]+$/.test(counts.slice(0,3))||!/^M  END\s*$/m.test(ligand))throw Error('A complete V2000 SDF pose with explicit coordinates and bonds is required.');
  const count=Number(counts.slice(0,3)),bonds=Number(counts.slice(3,6));
  if(!Number.isInteger(bonds)||bonds<0||bonds>2000||lines.length<4+count+bonds+1)throw Error('Incomplete ligand atoms or bonds.');
  if(!Number.isInteger(count)||count<1||count>500)throw Error('The ligand must contain 1–500 atoms.');
  for(const line of lines.slice(4,4+count)){
    const xyz=[0,10,20].map(start=>coordinate(line.slice(start,start+10)));
    if(line.length<34||xyz.some(v=>!Number.isFinite(v)||Math.abs(v)>1e5))throw Error('Invalid ligand coordinates.');
  }
  return {ligand,records,ligandAtomCount:count};
}

