import type { z } from 'zod';
import { WorkSchema, DemoSchema } from './contracts.mjs';
export type WorkEntry = z.infer<typeof WorkSchema> & {html:string; demonstration:DemoManifest|null};
export type DemoManifest = z.infer<typeof DemoSchema>;
export interface DemoAdapter {
  id: string;
  inputKind: string;
  features: number[];
  requiresRDKit?: boolean;
  prepare(context: {rdkit:unknown; input:string; manifest:DemoManifest; variant:DemoManifest['variants'][number]; loadJSON:(artifact:unknown)=>Promise<unknown>}): Promise<{features:Float32Array; molecule?:unknown; complex?:unknown; applicability?:unknown; visualization?:unknown}>;
  interpret?(values:number[],context:{manifest:DemoManifest;variant:DemoManifest['variants'][number]}):number[];
}
export interface PredictionResult {
  schemaVersion:2; mode:'browser-onnx'; demo:string; modelVersion:string;
  checkpoint:{sha256:string;path:string}; outputs:Array<{id:string;label:string;unit:string;kind:string;value:number;explanation:string}>;
  molecule?:{smiles:string;formula:string;svg:string;rdkitVersion:string};
  visualization?:unknown;
  complex?:{id:string;description:string;reference:number;membership:string;source:string;structure:{path:string;sha256:string}};
  applicability?:{nearestTrainingTanimoto:number;datasetMembership:string;outOfRangeDescriptors:string[];method:string}|null;
  warnings:string[]; provenance:string; metrics:Record<string,number>; trainingDataset:string; split:string; uncertainty:null;
}
