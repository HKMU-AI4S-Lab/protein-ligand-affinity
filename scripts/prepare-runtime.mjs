import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const paths=[['node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm','rdkit/RDKit_minimal.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm','ort/ort-wasm-simd-threaded.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs','ort/ort-wasm-simd-threaded.mjs']];
const integrity=[];
for(const [source,name] of paths) { await mkdir('public/runtime/'+name.split('/')[0],{recursive:true}); await copyFile(source,'public/runtime/'+name); const bytes=await readFile(source); integrity.push({path:'runtime/'+name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}); }
// OpenBabel is the pinned Kekule.js 1.0.3 distribution. Keep original source intact.
for(const name of ['openbabel.js','openbabel.wasm','openbabel.data']) {
  await mkdir('public/runtime/openbabel',{recursive:true});
  await copyFile('node_modules/kekule/dist/extra/'+name,'public/runtime/openbabel/'+name);
  const bytes=await readFile('public/runtime/openbabel/'+name);
  integrity.push({path:'runtime/openbabel/'+name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
}
const moduleSource=(await readFile('public/runtime/openbabel/openbabel.js','utf8'))+'\nexport default OpenBabelModule;\n';
await writeFile('public/runtime/openbabel/openbabel.mjs',moduleSource);
integrity.push({path:'runtime/openbabel/openbabel.mjs',sha256:createHash('sha256').update(moduleSource).digest('hex'),bytes:Buffer.byteLength(moduleSource)});
await writeFile('public/runtime/integrity.json',JSON.stringify(integrity,null,2));
await writeFile('src/lib/runtime-assets.json',JSON.stringify(integrity,null,2));
console.log('Self-hosted RDKit and ONNX Runtime assets prepared.');
