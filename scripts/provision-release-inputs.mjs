import {mkdir,readFile,rename,rm,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,sep} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ResearchArtifact} from '../src/lib/research/contracts.mjs';

const root=resolve('.');
const assets=JSON.parse(await readFile('artifacts/hosted-assets.json','utf8'));
async function digest(file){const hash=createHash('sha256');for await(const part of createReadStream(file))hash.update(part);return hash.digest('hex');}
for(const asset of assets){
  if(!asset.buildInput&&!process.argv.includes('--models'))continue;
  ResearchArtifact.parse({url:asset.url,bytes:asset.bytes,sha256:asset.sha256});
  const file=resolve(asset.publicPath);
  if(!file.startsWith(root+sep)||!asset.publicPath.startsWith('public/research/'))throw Error('Invalid release input path');
  try{if((await stat(file)).size===asset.bytes&&await digest(file)===asset.sha256){console.log('Verified '+asset.publicPath);continue;}}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(file),{recursive:true});
  const temporary=file+'.download';
  try{
    const response=await fetch(asset.url,{signal:AbortSignal.timeout(600000)});
    if(!response.ok||!response.body)throw Error('Release input download failed: '+response.status);
    let bytes=0;const hash=createHash('sha256');
    const verify=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;hash.update(chunk);callback(bytes>asset.bytes?Error('Oversized release input'):null,chunk);}});
    await pipeline(Readable.fromWeb(response.body),verify,createWriteStream(temporary));
    if(bytes!==asset.bytes||hash.digest('hex')!==asset.sha256)throw Error('Release input integrity mismatch: '+asset.publicPath);
    await rename(temporary,file);console.log('Downloaded and verified '+asset.publicPath);
  }finally{await rm(temporary,{force:true});}
}
