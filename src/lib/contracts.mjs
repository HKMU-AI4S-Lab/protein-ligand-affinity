import { z } from 'zod';
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const localPath = z.string().regex(/^[a-zA-Z0-9_./-]+$/).refine(p => !p.startsWith('/') && !p.split('/').includes('..'), 'Use a safe relative asset path');
export const ArtifactSchema = z.object({path: localPath, sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes:z.number().int().positive().optional()});
export const WorkSchema = z.object({id:slug,title:text,summary:text,category:z.enum(['Lab research','Educational reference']),authors:z.array(text).min(1),tags:z.array(text).min(1),
  links:z.array(z.object({label:text,url:z.url().refine(u=>u.startsWith('https://'),'Use HTTPS')})),
  demo:z.string().regex(/^[a-z0-9-]+$/).optional(),listed:z.boolean().default(true),draft:z.boolean().default(false)}).strict();
export const DemoSchema = z.object({schemaVersion:z.literal(1),id:slug,title:text,adapter:slug,inputKind:slug,domain:z.enum(['organic','qm9']).default('organic'),
  control:z.object({type:z.enum(['text','select']),label:text,maxLength:z.number().int().positive().max(10000).default(500)}).optional(),
  introduction:text,learn:text,instructions:text,limitations:z.array(text).min(1),
  examples:z.array(z.object({id:text,label:text,value:text,description:text.optional()})).min(1),
  complexData:ArtifactSchema.optional(),
  variants:z.array(z.object({id:slug,label:text,preprocessing:text,tensor:z.object({input:z.object({name:z.literal('features'),dtype:z.literal('float32'),shape:z.tuple([z.literal(1),z.number().int().positive()])}),output:z.object({name:z.literal('prediction'),dtype:z.literal('float32'),shape:z.tuple([z.number().int().positive()])})}),model:z.looseObject({modelVersion:text,artifact:ArtifactSchema,features:z.number().int().positive(),trainingDataset:text,metrics:z.record(z.string(),z.number()),citation:z.url(),split:text}),
    outputs:z.array(z.object({id:slug,label:text,unit:text,index:z.number().int().nonnegative(),kind:z.enum(['regression','classification']),explanation:text})).min(1),diagnostics:ArtifactSchema.optional()})).min(1)}).strict();
export function parseDemo(value) {
  const demo=DemoSchema.parse(value);
  if(new Set(demo.variants.map(v=>v.id)).size!==demo.variants.length) throw new Error('Duplicate model variant IDs');
  for(const v of demo.variants) {
    if(new Set(v.outputs.map(o=>o.id)).size!==v.outputs.length) throw new Error('Duplicate output IDs');
    if(v.tensor.input.shape[1]!==v.model.features||v.tensor.output.shape[0]!==v.outputs.length||v.preprocessing!==v.model.featureVersion)throw new Error('Preprocessing and tensor contract do not match the model');
  }
  if(demo.inputKind==='complex'&&!demo.complexData) throw new Error('Complex demonstrations need a verified example artifact');
  return demo;
}
export function validateBrowserResult(result) {
  if(result?.schemaVersion!==2||result?.mode!=='browser-onnx'||!Array.isArray(result.outputs)||!result.outputs.length||
    !result.outputs.every(o=>Number.isFinite(o.value)&&typeof o.unit==='string'&&(o.kind!=='classification'||o.value>=0&&o.value<=1))||
    !/^[a-f0-9]{64}$/.test(result.checkpoint?.sha256)||typeof result.modelVersion!=='string') throw new Error('Unexpected model output. No prediction has been displayed.');
  return result;
}
