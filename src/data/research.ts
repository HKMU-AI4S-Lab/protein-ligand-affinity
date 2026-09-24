import {citations} from './citations.mjs';
export const siteTitle = 'Protein–Ligand Binding Affinity Prediction';
export const grantTitle = 'Protein-ligand Binding Affinity Prediction Based on Grid Representation and Deep Learning: Paving the Way to Efficient Structure-based Drug Design';
export const teamUrl = 'https://zzulc.github.io/DebbyCV/members.html';
export const researchWorks = [
  {...citations.unimolrep, id:'unimolrep', topic:'representing-molecules', summary:'UniMolRep provides a unified toolkit for molecular fingerprints, graphs, geometric features and spatial grids. It supports individual molecules, protein–ligand complexes and trajectories, bringing complementary structural features into a common framework for learning.'},
  {...citations.fusion, id:'molecular-grid-fusion', topic:'screening-molecules', summary:'DL-FSG combines chemical sequences and three-dimensional ligand grids through cross-attention. The two branches learn complementary molecular features and combine them to prioritise compounds for a protein target.'},
  {...citations.agima, id:'agima', topic:'binding-affinity', summary:'AGIMA-Score investigates which atomic connections a model should learn from when estimating binding strength. Its graphs focus on contacts between the protein and ligand.'}
] as const;
export const topics = [
  {id:'representing-molecules', title:'Molecular and grid representations', summary:'Fingerprints, graphs and three-dimensional grids capture different aspects of molecular structure. Explore how chemical identity, connectivity and geometry become inputs for learning models.', paper:researchWorks[0], demo:'representations', analysisTitle:'Representation analysis', explore:'Explore representations', figure:'unimolrep-taxonomy'},
  {id:'screening-molecules', title:'Deep learning for molecular screening', summary:'Chemical sequences and molecular grids provide complementary information for identifying candidate compounds. Explore how their combination supports target-specific screening.', paper:researchWorks[1], demo:'screening', analysisTitle:'Screening analysis', explore:'Explore screening', figure:'fusion-architecture'},
  {id:'binding-affinity', title:'Binding-affinity prediction', summary:'AGIMA-Score learns from the contacts between protein and ligand atoms. Read the study and explore grid-based scoring in an interactive exercise.', paper:researchWorks[2], demo:'binding-affinity', analysisTitle:'Affinity scoring', explore:'Explore affinity prediction', figure:'agima-adjacency'}
] as const;
