export default {
  id:'complex', inputKind:'complex', features:[36],
  async prepare({input,manifest,loadJSON}) {
    const examples=await loadJSON(manifest.complexData);
    const complex=examples.find(e=>e.id===input);
    if(!complex) throw new Error('Choose one of the curated complexes.');
    if(complex.features.length!==36||!complex.features.every(v=>Number.isFinite(v)&&v>=0)) throw new Error('Invalid prepared contact features.');
    return {features:Float32Array.from(complex.features),complex};
  }
};
