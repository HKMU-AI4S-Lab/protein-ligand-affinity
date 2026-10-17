import {spawnSync} from 'node:child_process';
// Use the same build pipeline on Windows and CI; only the release profile differs.
const {default:fs}=await import('node:fs/promises');
const {scripts}=JSON.parse(await fs.readFile('package.json','utf8'));
const build=spawnSync(scripts.build,{shell:true,stdio:'inherit',env:{...process.env,PUBLIC_RELEASE:'true'}});
process.exit(build.status??1);
