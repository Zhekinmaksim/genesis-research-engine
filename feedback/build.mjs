// Requires the public repository's pinned esbuild dependency (npm ci at its root).
import {build} from 'esbuild';
import {readFile,readdir,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);
await build({entryPoints:[new URL('entry.ts',root).pathname],outfile:new URL('engine.mjs',root).pathname,bundle:true,platform:'node',target:'node20',format:'esm',packages:'bundle',legalComments:'eof',logLevel:'warning'});
const files={};async function visit(rel=''){for(const name of (await readdir(new URL(rel,root))).sort()){if(['manifest.json','node_modules','.git'].includes(name))continue;const path=rel+name,info=await lstat(new URL(path,root));if(info.isSymbolicLink())throw Error('Symlinks are not part of the public package.');if(info.isDirectory())await visit(path+'/');else files[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');}}await visit();await writeFile(new URL('manifest.json',root),JSON.stringify({format:'genesis-real-loop-package-v2',files},null,2)+'\n');
