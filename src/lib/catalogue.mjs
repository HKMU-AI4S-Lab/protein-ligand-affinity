import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { marked } from 'marked';
import { WorkSchema, parseDemo } from './contracts.mjs';
export async function loadCatalogue(root = resolve('src/content/works')) {
  const directories=(await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name));
  const works=[]; const ids=new Set(); const demos=new Set();
  for(const directory of directories) {
    const base=resolve(root,directory.name);
    const work=WorkSchema.parse(JSON.parse(await readFile(resolve(base,'work.json'),'utf8')));
    if(work.id!==directory.name||ids.has(work.id)) throw new Error('Work ID must be unique and match folder: '+work.id);
    ids.add(work.id);
    let demonstration=null;
    if(work.demo) {
      demonstration=parseDemo(JSON.parse(await readFile(resolve(base,'demo.json'),'utf8')));
      if(demonstration.id!==work.demo||demos.has(work.demo)) throw new Error('Invalid or duplicate demo reference: '+work.demo);
      demos.add(work.demo);
    }
    const markdown=await readFile(resolve(base,'content.md'),'utf8');
    if(!markdown.trim()) throw new Error('Research explanation is required: '+work.id);
    works.push({...work,html:await marked.parse(markdown),demonstration});
  }
  return works;
}
