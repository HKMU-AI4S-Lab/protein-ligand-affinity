// Keep diagnostic messages in the runtime; translate them only at the UI boundary.
export function progressText(message){
 const text=String(message),percent=text.match(/\d+%/)?.[0];
 if(text.startsWith('Loading chemistry '))return 'Preparing molecular tools'+(percent?' · '+percent:'…');
 if(text.startsWith('Loading weights'))return 'Loading model data'+(percent?' · '+percent:'')+(text.match(/ · [\d.]+ MB$/)?.[0]||'');
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
 if(/^(Enter one connected molecule|Invalid SMILES|Select a supported prepared complex|The input has changed|Run a prediction before|The explanation does not match|This prediction|The model has changed)/.test(text))return text;
 if(text.startsWith('This release supports'))return text.replace('This release supports','Supported inputs:');
 if(/stereochemistry/.test(text))return 'Coordinates could not be generated while preserving the specified stereochemistry. Try a different molecule.';
 if(/OpenBabel|Conformer generation|Atom ordering|Molecular diagram coordinates/.test(text))return 'A consistent molecular structure could not be generated for this input. Check the SMILES or select another molecule.';
 if(/unsupported SMILES|token|character/i.test(text))return 'This molecule contains a SMILES symbol the screening model does not support. Try another molecule.';
 if(/memory|allocation|out of bounds/i.test(text))return 'There is not enough available memory to complete this calculation. Close other demanding tabs and try again.';
 return 'The calculation could not be completed. Try again, or select another example. If the problem continues, reload the page.';
}
