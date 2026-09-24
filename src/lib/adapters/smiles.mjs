import {prepareMolecule,applicability} from '../chemistry.mjs';
export default {
  id:'smiles', inputKind:'smiles', features:[8,2056], requiresRDKit:true,
  async prepare({rdkit,input,manifest,variant,loadJSON}) {
    const molecule=prepareMolecule(rdkit,input,manifest.domain);
    const diagnostics=variant.diagnostics?await loadJSON(variant.diagnostics):null;
    return {features:molecule.features.slice(0,variant.model.features),molecule,applicability:applicability(molecule,diagnostics)};
  }
};
