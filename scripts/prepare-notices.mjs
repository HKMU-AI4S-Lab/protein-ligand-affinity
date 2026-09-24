import {readFile,readdir,mkdir,copyFile,writeFile} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8')),index=[];
await mkdir('public/notices/npm',{recursive:true});
for(const [path,info] of Object.entries(lock.packages)){
  if(!path||info.dev)continue;
  const name=path.replace(/^node_modules\//,'');let files;try{files=await readdir(path);}catch{continue;}
  const licenses=files.filter(n=>/^licen[sc]e(?:\.|$)|^copying(?:\.|$)|^notice(?:\.|$)/i.test(n));
  const entry={name,version:info.version,license:info.license||'See upstream package',files:[]};
  for(const license of licenses){const dest=name.replaceAll('/','__')+'-'+license;try{await copyFile(path+'/'+license,'public/notices/npm/'+dest);entry.files.push(dest);}catch{}}
  index.push(entry);
}
await writeFile('public/notices/npm/index.json',JSON.stringify(index,null,2));
console.log('Packaged dependency notices for '+index.length+' production dependencies.');
