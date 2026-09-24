import {lazy,Suspense} from 'react';
import type {ComponentType} from 'react';
import type {PredictionResult} from '../lib/types';
const modules=import.meta.glob<{default:ComponentType<{result:PredictionResult}>}>('../lib/adapters/*.view.tsx');
const views=Object.fromEntries(Object.entries(modules).map(([path,loader])=>[path.split('/').pop()!.replace('.view.tsx',''),lazy(loader)]));
export default function AdapterVisualization({adapter,result}:{adapter:string;result:PredictionResult}) {
  const View=views[adapter];return View?<Suspense fallback={<p>Loading scientific visualization…</p>}><View result={result}/></Suspense>:null;
}
