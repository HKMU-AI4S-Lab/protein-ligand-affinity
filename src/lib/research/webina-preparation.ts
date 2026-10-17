import {chemistry} from './chemistry';
import {browserDockingRegion,pdbqtAtoms} from './webina-formats.mjs';
import {progressText} from './presentation.mjs';
const amino=new Set('ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL'.split(' '));
export async function prepareBrowserDocking(input:any,base:string,progress:(s:string)=>void){
 const bindingRegion=browserDockingRegion(input),{rdkit,ob}=await chemistry(base,s=>progress(progressText(s)));
 let identity:any,ligand:any,receptor:any,conv:any;
 try{
  const text=input.ligand.text;
  if(!text||text.length>500000||!['smiles','sdf'].includes(input.ligand.format))throw Error('Supply one SMILES or SDF ligand.');
  if(input.ligand.format==='sdf'&&text.split('$$$$').filter((s:string)=>s.trim()).length!==1)throw Error('Supply one SDF molecule.');
  identity=rdkit.get_mol(text,JSON.stringify({removeHs:true}));
  if(!identity?.is_valid())throw Error('The ligand could not be parsed. Check its atoms, bonds and stereochemistry.');
  const smiles=identity.get_smiles(),json=JSON.parse(identity.get_json());
  const atoms=json.molecules[0].atoms.map((a:any)=>({...json.defaults.atom,...a}));
  if(smiles.includes('.')||atoms.length<5||atoms.length>80||atoms.some((a:any)=>![6,7,8,9,15,16,17,35,53].includes(a.z)||a.nRad||a.isotope))throw Error('Use one connected ligand with 5–80 heavy atoms, supported organic elements, and no radicals or isotopes.');
  const stereo=JSON.parse(identity.get_stereo_tags());
  if(JSON.stringify(stereo).includes('?'))throw Error('Specify all ligand stereocentres before docking.');
  if(JSON.parse(identity.get_descriptors()).NumRotatableBonds>15)throw Error('Browser docking supports at most 15 rotatable bonds.');
  progress('Generating a fresh ligand conformer…');
  ligand=new ob.OBMol();conv=new ob.ObConversionWrapper();conv.setInFormat('','smi');
  if(!conv.readString(ligand,smiles))throw Error('Open Babel could not read the ligand.');
  ligand.AddHydrogensWithParam(false,false,7.4);
  if(!ob.OBOp.FindType('Gen3D').Do(ligand,'3'))throw Error('Conformer generation failed. Try another ligand.');
  ligand.DeleteHydrogens();conv.setOutFormat('','mol');const template=conv.writeString(ligand,false);
  const check=rdkit.get_mol(template,JSON.stringify({removeHs:true}));
  try{if(!check?.is_valid()||check.get_smiles()!==smiles)throw Error('Conformer generation changed ligand identity or stereochemistry; this ligand is unsupported.');}finally{check?.delete();}
  ligand.AddHydrogensWithParam(false,false,7.4);conv.setOutFormat('','pdbqt');conv.addOption('p',ob.ObConversion_Option_type.OUTOPTIONS,'');
  const ligandPdbqt=conv.writeString(ligand,false),mapped=pdbqtAtoms(ligandPdbqt);
  for(let i=1;i<=atoms.length;i++){const a=ligand.GetAtom(i),found=mapped.find((m:any)=>m.serial===i);if(!found||found.xyz.some((v:number,d:number)=>Math.abs(v-[a.GetX(),a.GetY(),a.GetZ()][d])>0.001))throw Error('Ligand atom mapping could not be preserved.');}
  progress('Preparing the selected protein chains…');
  const rows=input.proteinPdb.split(/\r?\n/).filter((l:string)=>l.startsWith('ATOM  ')&&input.chains.includes(l[21]||' ')&&l.slice(76,78).trim()!=='H');
  if(!rows.length||rows.some((l:string)=>!amino.has(l.slice(17,20).trim())||![30,38,46].every(i=>l.slice(i,i+8).trim()&&Number.isFinite(Number(l.slice(i,i+8))))||!['C','N','O','S'].includes(l.slice(76,78).trim())))throw Error('Use complete standard amino acids with explicit element fields and finite coordinates. Modified residues and metals are unsupported.');
  receptor=new ob.OBMol();conv.delete();conv=new ob.ObConversionWrapper();conv.setInFormat('','pdb');
  if(!conv.readString(receptor,rows.join('\n')+'\nEND\n'))throw Error('Protein preparation failed.');
  // Keep deposited heavy-atom names and coordinates in the export and handoff.
  // Open Babel's generic added-H names are not unique within a residue.
  const receptorPdb=rows.join('\n')+'\nTER\nEND\n';
  receptor.DeleteHydrogens();receptor.AddHydrogensWithParam(false,false,7.4);
  conv.setOutFormat('','pdbqt');for(const option of ['r','c'])conv.addOption(option,ob.ObConversion_Option_type.OUTOPTIONS,'');
  const receptorPdbqt=conv.writeString(receptor,false);pdbqtAtoms(receptorPdbqt);
  return {bindingRegion,template,ligandPdbqt,receptorPdbqt,receptorPdb,mapped,canonicalSmiles:smiles,openBabelVersion:ob.OBReleaseVersion(),rdkitVersion:rdkit.version()};
 }finally{identity?.delete();ligand?.delete();receptor?.delete();conv?.delete();}
}
