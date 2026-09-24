import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

// The prepared examples have positive deltas; exercise negative and unresolved
// deltas separately without introducing artificial results into a live demo.
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../src/components/LiveExplanation.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
 .replaceAll('react/jsx-runtime',pathToFileURL(require.resolve('react/jsx-runtime')).href)
 .replaceAll('../lib/research/occlusion.mjs',new URL('../src/lib/research/occlusion.mjs',import.meta.url).href);
const View=(await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))).default;
const changes=[2,-2,0.0001,-0.0001,0,10,-10,12].map((delta,group)=>({group,delta,maskedScore:8.5-delta}));
test('occlusion bars encode signed changes with direction, pattern and a fixed absolute scale',()=>{
 const html=renderToStaticMarkup(createElement(View,{explanation:{target:'CNNaffinity',baseline:8.5,changes},selectedRegion:1,onSelect:()=>{}}));
 assert.match(html,/class="positive" style="left:50%;width:10%"/);
 assert.match(html,/class="negative" style="left:40%;width:10%"/);
 assert.match(html,/class="negative" style="left:0%;width:50%"/);
 assert.match(html,/class="positive" style="left:50%;width:50%"/);
 assert.match(html,/Fixed scale: ±10 pK units/);
 assert.match(html,/-2\.000/);assert.match(html,/Masking this region increased the prediction/);
 assert.match(html,/hatched bars show negative changes/);
 assert.doesNotMatch(html,/Blue|orange/);
});
test('unresolved occlusion differences retain zero-length bars and neutral wording',()=>{
 const html=renderToStaticMarkup(createElement(View,{explanation:{target:'CNNaffinity',baseline:8.5,changes},selectedRegion:2,onSelect:()=>{}}));
 assert.match(html,/class="positive" style="left:50%;width:0%"/);
 assert.match(html,/Below displayed precision/);
 assert.match(html,/smaller than 0\.001 pK units/);
});
