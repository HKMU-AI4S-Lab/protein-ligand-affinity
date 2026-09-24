import {validatePreparedComplex} from './prepared-inputs.mjs';
export {validatePreparedComplex} from './prepared-inputs.mjs';
import {chemistry} from './chemistry';

export type GninaAtom={xyz:number[];channel:number;radius:number;z?:number};
const f=Math.fround,N=48,RES=.5;
const radii:Record<number,number>={5:1.92,6:1.9,7:1.8,8:1.7,9:1.5,12:1.2,15:2.1,16:2,17:1.8,20:1.2,25:1.2,26:1.2,30:1.2,34:2,35:2,53:2.2};
export const gninaReceptorChannels=['aliphatic C hydrophobe','aliphatic C nonhydrophobe','aromatic C hydrophobe','aromatic C nonhydrophobe','halogen','N non-donor','N donor','O non-donor','O donor','S','P','Ca','Zn','other supported metal / B'];
export const gninaLigandChannels=['aliphatic C hydrophobe','aliphatic C nonhydrophobe','aromatic C hydrophobe','aromatic C nonhydrophobe','Br / I','Cl','F','N non-donor','N donor','O non-donor','O donor','S','P','supported metal / B'];

/** Native CoordinateSet::center uses sequential FP32 accumulation. */
export function gninaCenter(atoms:GninaAtom[]){
  if(!atoms.length)throw Error('The ligand contains no supported heavy atoms.');
  const center=[0,0,0];for(const atom of atoms)for(let d=0;d<3;d++)center[d]=f(center[d]+f(atom.xyz[d]));
  return center.map(value=>f(value/atoms.length));
}

/** libmolgrid 0.5.5 default 0.5 Å, 23.5 Å, radius-scale 1 density.
 * Math.fround preserves source float intermediates and native accumulation.
 * The source Example forward applies an identity quaternion around the center,
 * which still rounds (coordinate-center)+center; synthetic direct calls omit it.
 */
export function rasterizeGnina(atoms:GninaAtom[],center:number[],transformIdentity=true){
  const data=new Float32Array(28*N**3),origin=center.map(value=>f(value-11.75));
  const A=f(Math.exp(-2)*4),B=f(-Math.exp(-2)*12),C=f(Math.exp(-2)*9);
  for(const atom of atoms){
    const radius=f(atom.radius),extent=f(radius*1.5);
    const xyz=atom.xyz.map((v,d)=>transformIdentity?f(f(f(v)-center[d])+center[d]):f(v));
    const bounds=xyz.map((value,d)=>{
      const low=f(f(value-extent)-origin[d]),high=f(f(value+extent)-origin[d]);
      return [low>0?Math.floor(low/RES):0,high>0?Math.min(N,Math.ceil(high/RES)):0];
    });
    if(!Number.isInteger(atom.channel)||atom.channel<0||atom.channel>=28||!Number.isFinite(radius)||radius<=0||xyz.some(v=>!Number.isFinite(v)))throw Error('Invalid typed GNINA atom.');
    for(let x=bounds[0][0];x<bounds[0][1];x++)for(let y=bounds[1][0];y<bounds[1][1];y++)for(let z=bounds[2][0];z<bounds[2][1];z++){
      const dx=f(f(origin[0]+x*RES)-xyz[0]),dy=f(f(origin[1]+y*RES)-xyz[1]),dz=f(f(origin[2]+z*RES)-xyz[2]);
      const squared=f(f(f(dx*dx)+f(dy*dy))+f(dz*dz)),distance=f(Math.sqrt(squared));
      if(distance>extent)continue;
      let density:number;
      if(distance<=radius)density=f(Math.exp(f(-2*distance*distance/f(radius*radius))));
      else{const dr=f(distance/radius);density=Math.max(0,f(f(f(A*dr)+B)*dr+C));}
      const index=((atom.channel*N+x)*N+y)*N+z;data[index]=f(data[index]+density);
    }
  }
  return data;
}

function typeMolecule(mol:any,receptor:boolean):GninaAtom[]{
  const neighbors:number[][]=Array.from({length:mol.NumAtoms()+1},()=>[]);
  for(let i=0;i<mol.NumBonds();i++){
    const bond=mol.GetBond(i),a=bond.GetBeginAtomIdx(),b=bond.GetEndAtomIdx();
    neighbors[a].push(b);neighbors[b].push(a);
  }
  const atoms:GninaAtom[]=[];
  for(let i=1;i<=mol.NumAtoms();i++){
    const a=mol.GetAtom(i),z=a.GetAtomicNum();
    if(a.GetIsotope()||a.GetSpinMultiplicity()>1)throw Error('Isotopes and radical atoms are not supported by this prepared-complex demonstrator.');
    if(z===1)continue;
    if(!(z in radii))throw Error('Unsupported GNINA element (atomic number '+z+').');
    const neighborElements=neighbors[i].map(j=>mol.GetAtom(j).GetAtomicNum());
    const hydrogen=neighborElements.includes(1),hetero=neighborElements.some(z=>z!==1&&z!==6);
    let channel:number;
    if(z===6)channel=(a.IsAromatic()?2:0)+(hetero?1:0);
    else if(z===7)channel=(receptor?5:7)+(hydrogen?1:0);
    else if(z===8)channel=(receptor?7:9)+(hydrogen?1:0);
    else if(z===16||z===34)channel=receptor?9:11;
    else if(z===15)channel=receptor?10:12;
    else if([9,17,35,53].includes(z))channel=receptor?4:z===9?6:z===17?5:4;
    else channel=receptor?(z===20?11:z===30?12:13):13;
    atoms.push({z,channel,radius:f(radii[z]),xyz:[a.GetX(),a.GetY(),a.GetZ()].map(f)});
  }
  return atoms;
}

/** Parse a prepared, already aligned receptor + ligand pose in-browser.
 * Adds native-default hydrogens for typing only; never generates a ligand pose,
 * changes heavy-atom coordinates, docks, minimizes, or translates the inputs.
 */
export async function prepareGninaGrid(pdbText:string,sdfText:string,base:string,progress:(message:string)=>void=()=>{}){
  const {ligand,records,ligandAtomCount}=validatePreparedComplex(pdbText,sdfText);
  const {ob,rdkit}=await chemistry(base,progress);
  const chemical=rdkit.get_mol(ligand);
  try{if(!chemical?.is_valid()||chemical.get_smiles().includes('.'))throw Error('Supply one chemically valid connected ligand with explicit bond orders.');}finally{chemical?.delete();}
  const receptor=new ob.OBMol(),ligandMol=new ob.OBMol(),conversion=new ob.ObConversionWrapper();
  try{
    progress('Reading prepared receptor and ligand coordinates…');
    conversion.setInFormat('','pdb');if(!conversion.readString(receptor,pdbText))throw Error('OpenBabel could not parse the receptor PDB.');
    conversion.setInFormat('','sdf');if(!conversion.readString(ligandMol,ligand))throw Error('OpenBabel could not parse the ligand SDF.');
    if(receptor.NumAtoms()!==records.length)throw Error('Receptor parsing changed the supplied atom count; resolve alternate records first.');
    if(ligandMol.NumAtoms()!==ligandAtomCount)throw Error('Ligand parsing changed the supplied atom count; provide a complete single pose.');
    for(const mol of [receptor,ligandMol]){
      const before=Array.from({length:mol.NumAtoms()},(_,i)=>{const a=mol.GetAtom(i+1);return [a.GetAtomicNum(),a.GetX(),a.GetY(),a.GetZ()];});
      mol.AddHydrogensWithParam(false,false,7.4);
      for(let i=0;i<before.length;i++){const a=mol.GetAtom(i+1),after=[a.GetAtomicNum(),a.GetX(),a.GetY(),a.GetZ()];if(after.some((v,j)=>v!==before[i][j]))throw Error('Hydrogen processing changed existing coordinates; refusing a modified pose.');}
    }
    progress('Assigning native GNINA receptor and ligand channels…');
    const receptorAtoms=typeMolecule(receptor,true),ligandAtoms=typeMolecule(ligandMol,false),center=gninaCenter(ligandAtoms);
    if(!receptorAtoms.length)throw Error('The receptor contains no supported heavy atoms.');
    // Native and WASM OpenBabel disagree for some PDB TRP/HIS aromaticity and
    // donor perception. Never silently score that unvalidated pocket chemistry.
    // 15.05 = grid half-width 11.75 + largest supported radius*1.5 (3.3).
    for(const line of records)if(['TRP','HIS','HID','HIE','HIP'].includes(line.slice(17,20).trim())){
      const xyz=[30,38,46].map(start=>Number(line.slice(start,start+8)));
      if(xyz.every((value,d)=>Math.abs(value-center[d])<=15.05))throw Error('This browser release cannot reliably type receptor tryptophan or histidine within the scoring region. Use the validated examples or a prepared complex whose scoring region excludes these residues.');
    }
    const atoms=[...receptorAtoms,...ligandAtoms.map(atom=>({...atom,channel:atom.channel+14}))];
    // A distance guard catches obviously unaligned files; it cannot establish a
    // physically valid bound pose. Alignment remains the uploader's responsibility.
    if(!receptorAtoms.some(a=>ligandAtoms.some(b=>a.xyz.reduce((s,v,i)=>s+(v-b.xyz[i])**2,0)<64)))throw Error('No receptor atoms lie within 8 Å of the ligand; upload coordinates from the same prepared complex.');
    progress('Rasterizing the 28-channel GNINA density grid locally…');
    const grid=rasterizeGnina(atoms,center);
    return {grid,shape:[1,28,48,48,48],center,molblock:ligand,proteinPdb:pdbText,
      receptorAtoms,ligandAtoms,channels:[...gninaReceptorChannels.map(n=>'receptor:'+n),...gninaLigandChannels.map(n=>'ligand:'+n)],
      preprocessingVersion:'libmolgrid-0.5.5-gnina-default-types-browser-v1',openBabelVersion:ob.OBReleaseVersion(),
      coordinateMethod:'Uploaded prepared PDB/SDF coordinates; no pose generation, docking or minimization',
      warnings:['Inputs must already share one coordinate frame and a prepared bound pose.','Native-default hydrogen addition is used for atom typing, without pH optimization.','Only the declared supported elements and a single V2000 ligand pose are accepted.']};
  }finally{conversion.delete();ligandMol.delete();receptor.delete();}
}
