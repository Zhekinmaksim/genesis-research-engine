import {build} from 'esbuild';
import {readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);
await build({entryPoints:[new URL('engine-entry.ts',root).pathname],outfile:new URL('engine.mjs',root).pathname,bundle:true,platform:'node',target:'node20',format:'esm',packages:'bundle',legalComments:'eof',sourcemap:false,define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
if(process.argv.includes('--manifest')){
 const files={};
 async function visit(rel){for(const name of (await readdir(new URL(rel,root))).sort()){
  const path=rel+name;
  if(['.git','node_modules','out','cache','manifest.json'].includes(name))continue;
  const info=await lstat(new URL(path,root));if(info.isSymbolicLink())throw Error('No symlinks in public package');
  if(info.isDirectory())await visit(path+'/');else files[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
 }}
 await visit('');
 await writeFile(new URL('manifest.json',root),JSON.stringify({format:'genesis-review-package-v1',files,scope:'Source snapshot, recorded public research and saved public provenance. See README.md and CONTRACT_ROLE.md for limits.'},null,2)+'\n');
}
