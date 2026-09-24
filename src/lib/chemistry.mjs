import masses from './atomic-masses.json' with {type: 'json'};
export const descriptorNames = ['MolWt', 'MolLogP', 'TPSA', 'NumHDonors', 'NumHAcceptors', 'NumRotatableBonds', 'RingCount', 'FractionCSP3'];
const queries = new WeakMap();
const symbols = {1:'H',5:'B',6:'C',7:'N',8:'O',9:'F',14:'Si',15:'P',16:'S',17:'Cl',35:'Br',53:'I'};

/** Same SMILES-only restrictions as the Python reference; never accept names/CXSMILES. */
export function prepareMolecule(rdkit, input, domain = 'organic') {
  if (typeof input !== 'string' || !input.trim() || input.length > 500) throw new Error('Enter a SMILES string between 1 and 500 characters.');
  const smiles = input.trim();
  if (/\s|\|/.test(smiles)) throw new Error('Enter SMILES only, without a name or CXSMILES annotations.');
  if (smiles.includes('.')) throw new Error('Use one molecule without disconnected salts or mixtures.');
  let mol;
  try {
    mol = rdkit.get_mol(smiles);
    if (!mol || !mol.is_valid()) throw new Error('This SMILES could not be parsed. Check atoms, bonds and ring closures.');
    const json = JSON.parse(mol.get_json());
    const atoms = json.molecules[0].atoms.map(a => ({...json.defaults.atom, ...a}));
    const representation=json.molecules[0].extensions.find(e=>e.name==='rdkitRepresentation');
    if(representation.atomRings?.some(r=>r.length===9&&r.every(i=>representation.aromaticAtoms?.includes(i)))) throw new Error('Nine-member aromatic rings are outside this preprocessing version’s supported domain. Choose a different molecule.');
    if (atoms.some(a => !symbols[a.z] || a.nRad)) throw new Error('Unsupported element or radical. Use a closed-shell organic molecule.');
    const d = JSON.parse(mol.get_descriptors());
    const weight = atoms.reduce((sum,a) => sum + (a.isotope ? masses[a.z].isotopes[a.isotope] : masses[a.z].average) + a.impHs*masses[1].average, 0);
    if (!Number.isFinite(weight)) throw new Error('Unsupported isotope.');
    d.amw = weight;
    // Match native RDKit 2026.03.6 HBA v2.0.2 (aromatic n must have X2).
    if (!queries.has(rdkit)) queries.set(rdkit, rdkit.get_qmol('[$([O,S;H1;v2]-[!$(*=[O,N,P,S])]),$([O,S;H0;v2]),$([O,S;-]),$([N;v3;!$(N-*=!@[O,N,P,S])]),$([nH0X2,o,s;+0])]'));
    const matches = JSON.parse(mol.get_substruct_matches(queries.get(rdkit)));
    const acceptors = Array.isArray(matches) ? matches.length : 0;
    if (d.NumHeavyAtoms < 1 || d.NumHeavyAtoms > 100 || d.amw > 1000) throw new Error('Use a molecule with 1–100 heavy atoms and molecular weight at most 1,000 Da.');
    if (domain === 'qm9' && (d.NumHeavyAtoms > 9 || atoms.some(a => ![1,6,7,8,9].includes(a.z)) || atoms.some(a=>a.chg))) throw new Error('QM9 supports neutral molecules with up to 9 heavy atoms, containing only C, N, O, F and H.');
    // MinimalLib serializes descriptors to five decimals. Recover the exact
    // integer-count ratio and fragment-sum precision before casting to float32.
    const carbons = atoms.filter(a => a.z === 6).length;
    const desc = [d.amw, Number(mol.get_prop('_crippenLogP')), Number(mol.get_prop('_tpsa-0')),
      d.NumHBD, acceptors, d.NumRotatableBonds, d.NumRings,
      carbons ? Math.round(d.FractionCSP3 * carbons) / carbons : 0];
    if (!desc.every(Number.isFinite)) throw new Error('Molecular descriptors could not be calculated.');
    const fingerprint = mol.get_morgan_fp(JSON.stringify({radius: 2, nBits: 2048, useChirality: true}));
    if (!/^[01]{2048}$/.test(fingerprint)) throw new Error('Unexpected fingerprint format.');
    const counts = {};
    for (const a of atoms) { const s = symbols[a.z]; counts[s] = (counts[s] || 0) + 1; counts.H = (counts.H || 0) + a.impHs; }
    const order = counts.C ? ['C','H', ...Object.keys(counts).filter(k => !['C','H'].includes(k)).sort()] : Object.keys(counts).sort();
    const charge = atoms.reduce((n,a) => n+a.chg, 0);
    const formula = order.filter(k => counts[k]).map(k => k + (counts[k] === 1 ? '' : counts[k])).join('') + (charge ? `${Math.abs(charge) === 1 ? '' : Math.abs(charge)}${charge > 0 ? '+' : '−'}` : '');
    return {smiles: mol.get_smiles(), formula, descriptors: desc, fingerprint,
      features: Float32Array.from([...desc, ...fingerprint].map(Number)),
      svg: mol.get_svg(360, 240), rdkitVersion: rdkit.version()};
  } finally { mol?.delete(); }
}

export function applicability(molecule, diagnostics) {
  if (!diagnostics) return null;
  let nearest = 0;
  for (const fp of diagnostics.fingerprints) {
    let intersection = 0, union = 0;
    for (let i=0; i<2048; i++) { if (fp[i] === '1' || molecule.fingerprint[i] === '1') union++; if (fp[i] === '1' && molecule.fingerprint[i] === '1') intersection++; }
    nearest = Math.max(nearest, union ? intersection/union : 1);
  }
  return {nearestTrainingTanimoto: nearest,
    datasetMembership: diagnostics.train.includes(molecule.smiles) ? 'training' : diagnostics.test.includes(molecule.smiles) ? 'held-out test' : 'not in source dataset',
    outOfRangeDescriptors: descriptorNames.filter((_,i) => molecule.descriptors[i] < diagnostics.descriptorMin[i] || molecule.descriptors[i] > diagnostics.descriptorMax[i]),
    method: 'Morgan similarity and descriptor ranges; heuristic, not a validated applicability domain.'};
}
