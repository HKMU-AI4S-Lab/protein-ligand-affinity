import {rm,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {releasedModels,privateModels,privateFigures} from './public-release-profile.mjs';
if(process.env.PUBLIC_RELEASE==='true'){
 const root=resolve('dist');
 for(const relative of [...privateModels.map(id=>'research/'+id),...privateFigures.map(id=>'paper-figures/'+id+'.webp')]){
  const target=resolve(root,relative);if(!target.startsWith(root+sep))throw Error('Invalid private artifact path');
  await rm(target,{recursive:true,force:true});
 }
 await writeFile('dist/release-profile.json',JSON.stringify({profile:'public',models:releasedModels,docking:'AutoDock Vina 1.2.3 / Webina 1.0.5',excludedModels:privateModels,excludedFigures:privateFigures},null,2));
 console.log('Public release: approved models only; experimental models and uncleared paper crops excluded.');
}
