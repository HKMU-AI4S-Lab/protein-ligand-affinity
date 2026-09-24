import initRDKit from '@rdkit/rdkit';
import runtimeAssets from '../runtime-assets.json';
import {verifiedArtifact} from './artifacts.mjs';
import {fusionGrid,geometricFeatures,representationGrid,tokens} from './geometry.mjs';
let ready:Promise<{rdkit:any;ob:any}>|undefined;
const symbols:Record<number,string>={1:'H',5:'B',6:'C',7:'N',8:'O',9:'F',14:'Si',15:'P',16:'S',17:'Cl',35:'Br',53:'I'};
export async function chemistry(base:string,progress:(s:string)=>void){
  if(!ready)ready=(async()=>{
    const artifact=async(name:string)=>{const a=runtimeAssets.find(a=>a.path.endsWith(name));if(!a)throw Error('Missing chemistry runtime: '+name);return verifiedArtifact(a,{base,onProgress:(n:number)=>progress('Loading chemistry '+name+' · '+Math.round(n*100)+'%')});};
    const [rdwasm,obwasm,obdata,objs]=await Promise.all(['rdkit/RDKit_minimal.wasm','openbabel/openbabel.wasm','openbabel/openbabel.data','openbabel/openbabel.mjs'].map(artifact));
    const rdkit=await (initRDKit as unknown as (options:unknown)=>Promise<any>)({wasmBinary:rdwasm});
    const blob=URL.createObjectURL(new Blob([objs],{type:'text/javascript'}));
    try{const module=await import(/* @vite-ignore */blob);const ob=module.default({wasmBinary:obwasm,getPreloadedPackage:()=>obdata.buffer,print:()=>{},printErr:()=>{}});await new Promise<void>(resolve=>ob.then(()=>resolve()));return {rdkit,ob};}finally{URL.revokeObjectURL(blob);}
  })().catch(e=>{ready=undefined;throw e;});
  return ready;
}
export async function prepare(smiles:string,base:string,progress:(s:string)=>void){
  if(!smiles||smiles.length>100||/\s|\||\./.test(smiles))throw Error('Enter one connected molecule, using 1–100 SMILES characters, without names or annotations.');
  const {rdkit,ob}=await chemistry(base,progress);let mol:any,converted:any,conv:any;
  try{
    mol=rdkit.get_mol(smiles);if(!mol?.is_valid())throw Error('Invalid SMILES. Check atoms, bonds and ring closures.');
    const json=JSON.parse(mol.get_json()),graph=json.molecules[0];
    const atoms=graph.atoms.map((a:any)=>({...json.defaults.atom,...a}));
    if(atoms.length>80||atoms.some((a:any)=>!symbols[a.z]||a.nRad||a.isotope))throw Error('This release supports up to 80 organic atoms, without radicals or isotope labels.');
    const fingerprint=mol.get_morgan_fp(JSON.stringify({radius:2,nBits:2048,useChirality:true}));
    progress('Generating a conformer with OpenBabel WebAssembly…');
    converted=new ob.OBMol();conv=new ob.ObConversionWrapper();conv.setInFormat('','smi');
    if(!conv.readString(converted,smiles))throw Error('OpenBabel could not parse the SMILES.');
    converted.AddHydrogensWithParam(false,false,7.4);
    const gen=ob.OBOp.FindType('Gen3D');if(!gen.Do(converted,'3'))throw Error('OpenBabel could not generate coordinates.');
    const generated:{z:number;symbol:string;hyb:number;xyz:number[]}[]=[];for(let i=1;i<=converted.NumAtoms();i++){const a=converted.GetAtom(i);generated.push({z:a.GetAtomicNum(),symbol:symbols[a.GetAtomicNum()]||'?',hyb:a.GetHyb(),xyz:[a.GetX(),a.GetY(),a.GetZ()]});}
    if(generated.some(a=>a.xyz.some(v=>!Number.isFinite(v)))||generated.every(a=>a.xyz.every(v=>v===0)))throw Error('Conformer generation returned invalid coordinates.');
    if(atoms.some((a:any,i:number)=>a.z!==generated[i]?.z))throw Error('Atom ordering changed during coordinate generation; refusing misaligned representations.');
    conv.setOutFormat('','mol');const molblock=conv.writeString(converted,false);
    if(/[@/\\]/.test(smiles)){
      const roundtrip=rdkit.get_mol(molblock,JSON.stringify({removeHs:true}));
      try{if(!roundtrip?.is_valid()||roundtrip.get_smiles()!==mol.get_smiles())throw Error('Generated coordinates did not preserve the specified stereochemistry; this molecule is unsupported.');}finally{roundtrip?.delete();}
    }
    const bonds=graph.bonds.map((b:any)=>({a:b.atoms[0],b:b.atoms[1],order:b.bo??json.defaults.bond.bo,stereo:b.stereo??'unspecified'}));
    const heavyAtoms=generated.slice(0,atoms.length);const geometry=geometricFeatures(heavyAtoms,bonds);
    const grid=representationGrid(generated);
    mol.set_new_coords();const depiction=mol.get_molblock().split(/\r?\n/);
    const positions=atoms.map((_:any,i:number)=>[Number(depiction[i+4].slice(0,10)),Number(depiction[i+4].slice(10,20))]);
    if(positions.some((p:number[])=>p.some(v=>!Number.isFinite(v))))throw Error('Molecular diagram coordinates are invalid.');
    return {kind:'representation',execution:'live-browser',smiles,canonicalSmiles:mol.get_smiles(),formula:converted.GetFormula(),molblock,atoms:generated,graph:{atoms,bonds,positions,edges:geometry.edges},fingerprint,angles:geometry.angles,torsions:geometry.torsions,grid,fusionGrid:fusionGrid(generated),tokens:tokens(smiles),coordinateMethod:'OpenBabel '+ob.OBReleaseVersion()+' Gen3D (balanced)',rdkitVersion:rdkit.version(),preprocessingVersion:'representations-browser-v1',warnings:['The graph records atom identities, bond orders and connectivity.','The grid uses an explicit arithmetic coordinate center, ligand channels, 0.5 Å spacing, Gaussian σ=0.5 Å and no random rotation.']};
  }finally{mol?.delete();conv?.delete();converted?.delete();}
}
