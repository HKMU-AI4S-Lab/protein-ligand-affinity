import {readFile,stat,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
const root=resolve('dist');
for(const asset of JSON.parse(await readFile('artifacts/hosted-assets.json','utf8'))){
  if(!asset.publicPath.startsWith('public/research/'))throw Error('Invalid hosted artifact path');
  const file=resolve('dist',asset.publicPath.slice(7));
  if(!file.startsWith(root+sep))throw Error('Hosted artifact is outside dist');
  let info;try{info=await stat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);
  if(info.size!==asset.bytes||hash.digest('hex')!==asset.sha256)throw Error('Refusing to omit an unverified artifact: '+file);
  await unlink(file);console.log('External download retained; omitted duplicate '+asset.publicPath);
}
