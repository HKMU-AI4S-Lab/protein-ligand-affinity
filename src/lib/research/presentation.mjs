// Keep diagnostic messages in the runtime; translate them only at the UI boundary.
export function progressText(message){
 const text=String(message),percent=text.match(/\d+%/)?.[0];
 if(text.startsWith('Loading chemistry '))return 'Preparing molecular tools'+(percent?' — '+percent:'…');
 if(text.startsWith('Loading weights'))return 'Loading model data'+(percent?' — '+percent:'')+(text.match(/ — [\d.]+ MB$/)?.[0]||'');
 if(text.startsWith('Loading verified '))return text.replace('Loading verified ','Loading the ');
 if(text==='Creating model session…')return 'Preparing the model…';
 if(text.startsWith('Running the complete'))return 'Calculating screening score…';
 if(text.includes('OpenBabel WebAssembly'))return 'Generating molecular coordinates with OpenBabel…';
 if(/^(Downloading model|Loading prepared complex|Spatial occlusion |Computing Grad-CAM|Scoring the supplied|Running the complete)/.test(text))return text;
 return 'Preparing the calculation…';
}
export function errorText(error){
 const text=error instanceof Error?error.message:String(error);
 if(/offline|Failed to fetch|NetworkError/i.test(text))return 'The required files are not available. Reconnect to the internet and try again. Downloads are saved for later use when browser storage is available.';
 if(/SHA-256|byte count|declared size|Incomplete.*(?:download|artifact)|Invalid prepared grid/i.test(text))return 'The downloaded data could not be verified. Check your connection and try the calculation again.';
 if(/download failed|Streaming downloads/i.test(text))return 'The download could not be completed. Check your connection and try again.';
 if(/^(Enter a molecule as SMILES|Enter one connected molecule|Invalid SMILES|Select a supported prepared complex|The input has changed|Run a prediction before|The explanation does not match|This prediction|The model has changed)/.test(text))return text;
 if(/^(Enter a four-character PDB|No PDB structure|The PDB structure|This PDB structure|Choose a PDB complex|This structure has multiple models|The complex needs|This complex has|No bound ligand|No protein chain|Choose at least one protein chain|Choose protein chains|Choose a ligand found|The ligand SDF coordinates|The selected ligand|The selected protein|The binding site also contains|The protein structure contains|The bound ligand contains|Heme is a bound cofactor|Load a PDB structure|Upload a PDB complex|Load the PDB structure|This ligand could not|Choose a ligand SDF|This tool cannot score)/.test(text))return text;
 if(/^(Provide a prepared receptor|The receptor|Remove ligand|Choose one PDB|Select at least one chain|The selected receptor|The receptor PDB exceeds|The ligand SDF exceeds|Select a prepared receptor|Confirm the selected chains|A PDB ID must|Enter a ligand ID|Provide one prepared receptor|Multiple PDB models|Remove waters|Resolve alternate|Duplicate or alternate|Invalid receptor coordinates|Provide exactly one SDF|A complete V2000 SDF|Incomplete ligand|The ligand must contain|Invalid ligand coordinates|Supply one chemically valid|Receptor parsing changed|Ligand parsing changed|Hydrogen processing changed|The ligand contains no supported|The receptor contains no supported|This browser release cannot reliably type|No receptor atoms lie within|Receptor and ligand heavy atoms overlap|Unsupported GNINA element|Isotopes and radical atoms)/.test(text))return text;
 if(text.startsWith('This release supports'))return text.replace('This release supports','Supported inputs:');
 if(/stereochemistry/.test(text))return 'Coordinates could not be generated while preserving the specified stereochemistry. Try a different molecule.';
 if(/OpenBabel|Conformer generation|Atom ordering|Molecular diagram coordinates/.test(text))return 'A consistent molecular structure could not be generated for this input. Check the SMILES or select another molecule.';
 if(/unsupported SMILES|token|character/i.test(text))return 'This molecule contains a SMILES symbol the screening model does not support. Try another molecule.';
 if(/memory|allocation|out of bounds/i.test(text))return 'There is not enough available memory to complete this calculation. Close other demanding tabs and try again.';
 return 'The calculation could not be completed. Check your input and try again. If the problem continues, reload the page.';
}
